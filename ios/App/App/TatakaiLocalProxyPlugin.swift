import Foundation
import Network
import Security
import Capacitor
import CryptoKit
import WebKit
import UIKit

/// Disk-backed complete-resource cache. Speculation is disposable; saved episodes use a separate directory.
/// Shared foreground request slots across proxy sessions and speculative requests.
private final class MobileMediaBudget {
    static let shared = MobileMediaBudget()
    private let lock = NSLock()
    private var active: [ObjectIdentifier: URLSessionTask] = [:]
    private var waiting: [(URLSessionTask, Int)] = []
    var limit = 2
    func start(_ task: URLSessionTask, priority: Int) {
        lock.lock(); defer { lock.unlock() }
        waiting.append((task, priority)); drain()
    }
    func finish(_ task: URLSessionTask) {
        lock.lock(); defer { lock.unlock() }
        active.removeValue(forKey: ObjectIdentifier(task)); waiting.removeAll { $0.0 === task }; drain()
    }
    func configure(metered: Bool) {
        lock.lock(); defer { lock.unlock() }; limit = metered ? 2 : 6; drain()
    }
    private func drain() {
        waiting.removeAll { $0.0.state == .canceling || $0.0.state == .completed }
        waiting.sort { $0.1 < $1.1 }
        while active.count < limit && !waiting.isEmpty {
            let task = waiting.removeFirst().0; active[ObjectIdentifier(task)] = task; task.resume()
        }
    }
}

private final class MobileStreamCache: NSObject, URLSessionDownloadDelegate {
    static let shared = MobileStreamCache()
    private let root = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent("streaming-media")
    private let lock = NSRecursiveLock()
    private var saver = true
    private var source = ""
    private var epoch = 0
    private var expensive = true
    private var ahead: [String: [URL]] = [:]
    private var tasks: [String: URLSessionDownloadTask] = [:]
    private let monitor = NWPathMonitor()
    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.ephemeral; config.httpMaximumConnectionsPerHost = 6
        config.timeoutIntervalForRequest = 18; config.timeoutIntervalForResource = 60
        return URLSession(configuration: config, delegate: self, delegateQueue: nil)
    }()
    private var specifications: [Int: (String, Int, String?)] = [:]
    private static let objectLimit = 32 * 1024 * 1024
    private static let diskLimit = 256 * 1024 * 1024
    var metered: Bool { lock.lock(); defer { lock.unlock() }; return expensive }
    var enabled: Bool { lock.lock(); defer { lock.unlock() }; return !saver }
    override init() {
        super.init()
        try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        for file in (try? FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)) ?? [] where file.pathExtension == "part" { try? FileManager.default.removeItem(at: file) }
        evict()
        monitor.pathUpdateHandler = { [weak self] path in
            guard let self else { return }; self.lock.lock(); self.expensive = path.isExpensive; self.lock.unlock()
            MobileMediaBudget.shared.configure(metered: path.isExpensive)
        }
        monitor.start(queue: DispatchQueue(label: "app.tatakai.streaming-network"))
    }
    func configure(source: String, saver: Bool) {
        lock.lock(); defer { lock.unlock() }; self.saver = saver
        if self.source != source || saver { self.source = source; ahead.removeAll(); cancel() }
    }
    func cancel() {
        lock.lock(); defer { lock.unlock() }; epoch += 1
        for task in tasks.values { task.cancel() }
    }
    private func key(_ url: URL, headers: [String: String], range: String?) -> String {
        let normalized = headers.filter { $0.key.lowercased() != "range" }.map { ($0.key.lowercased(), $0.value) }.sorted { $0.0 < $1.0 }
        let identity = url.absoluteString + "\n" + (range ?? "") + normalized.map { "\n\($0.0):\($0.1)" }.joined()
        return SHA256.hash(data: Data(identity.utf8)).map { String(format: "%02x", $0) }.joined()
    }
    struct Hit: Codable {
        var file: URL; var type: String; var contentRange: String; var status: Int; var length: Int
    }
    func hit(_ url: URL, headers: [String: String], range: String?) -> Hit? {
        lock.lock(); defer { lock.unlock() }
        let id = key(url, headers: headers, range: range)
        let meta = root.appendingPathComponent(id + ".json"), file = root.appendingPathComponent(id + ".data")
        guard let data = try? Data(contentsOf: meta), var hit = try? JSONDecoder().decode(Hit.self, from: data),
              let size = try? file.resourceValues(forKeys: [.fileSizeKey]), size.fileSize == hit.length,
              let date = try? meta.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate,
              Date().timeIntervalSince(date) < 86400 else { return nil }
        hit.file = file
        try? FileManager.default.setAttributes([.modificationDate: Date()], ofItemAtPath: file.path)
        return hit
    }
    final class Writer {
        private unowned let cache: MobileStreamCache
        private let id: String, temporary: URL, generation: Int, response: HTTPURLResponse
        private var handle: FileHandle?
        private var copied = 0
        init(cache: MobileStreamCache, id: String, response: HTTPURLResponse, generation: Int) throws {
            self.cache = cache; self.id = id; self.response = response; self.generation = generation
            temporary = cache.root.appendingPathComponent(id + "." + UUID().uuidString + ".part")
            guard FileManager.default.createFile(atPath: temporary.path, contents: nil) else { throw CocoaError(.fileWriteUnknown) }
            handle = try FileHandle(forWritingTo: temporary)
        }
        func append(_ data: Data) {
            copied += data.count
            cache.lock.lock(); let valid = generation == cache.epoch; cache.lock.unlock()
            guard copied <= MobileStreamCache.objectLimit && valid && cache.reserve(data.count) else { discard(); return }
            do { try handle?.write(contentsOf: data) } catch { discard() }
        }
        func finish() {
            guard handle != nil, copied > 0, response.expectedContentLength < 0 || Int64(copied) == response.expectedContentLength else { discard(); return }
            try? handle?.close(); handle = nil
            cache.commit(temporary, id: id, response: response, generation: generation)
        }
        func discard() { try? handle?.close(); handle = nil; try? FileManager.default.removeItem(at: temporary) }
        deinit { discard() }
    }
    func writer(_ url: URL, headers: [String: String], range: String?, response: HTTPURLResponse) -> Writer? {
        lock.lock(); defer { lock.unlock() }
        let type = response.mimeType ?? ""
        guard [200, 206].contains(response.statusCode), response.expectedContentLength <= Int64(Self.objectLimit), !type.contains("html"), !type.contains("json") else { return nil }
        return try? Writer(cache: self, id: key(url, headers: headers, range: range), response: response, generation: epoch)
    }
    private func commit(_ temporary: URL, id: String, response: HTTPURLResponse, generation: Int) {
        lock.lock(); defer { lock.unlock() }
        defer { try? FileManager.default.removeItem(at: temporary) }
        guard generation == epoch, let values = try? temporary.resourceValues(forKeys: [.fileSizeKey]), let size = values.fileSize,
              size > 0 && size <= Self.objectLimit, response.expectedContentLength < 0 || Int64(size) == response.expectedContentLength else { return }
        let file = root.appendingPathComponent(id + ".data")
        do {
            if FileManager.default.fileExists(atPath: file.path) { try FileManager.default.removeItem(at: file) }
            try FileManager.default.moveItem(at: temporary, to: file)
            let metadata = Hit(file: file, type: response.mimeType ?? "application/octet-stream", contentRange: response.value(forHTTPHeaderField: "Content-Range") ?? "", status: response.statusCode, length: size)
            try JSONEncoder().encode(metadata).write(to: root.appendingPathComponent(id + ".json"), options: .atomic)
            evict()
        } catch { try? FileManager.default.removeItem(at: file) }
    }
    private func reserve(_ incoming: Int) -> Bool {
        lock.lock(); defer { lock.unlock() }; evict(incoming)
        let files = (try? FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: [.fileSizeKey])) ?? []
        return files.filter { ["data", "part"].contains($0.pathExtension) }.reduce(incoming) { $0 + ((try? $1.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0) } <= Self.diskLimit
    }
    private func evict(_ incoming: Int = 0) {
        let files = (try? FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: [.fileSizeKey, .contentModificationDateKey])) ?? []
        let bodies = files.filter { $0.pathExtension == "data" }.sorted {
            ((try? $0.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast) < ((try? $1.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast)
        }
        var total = files.filter { ["data", "part"].contains($0.pathExtension) }.reduce(incoming) { $0 + ((try? $1.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0) }
        for body in bodies where total > Self.diskLimit {
            total -= (try? body.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
            try? FileManager.default.removeItem(at: body); try? FileManager.default.removeItem(at: body.deletingPathExtension().appendingPathExtension("json"))
        }
    }
    func playlist(_ text: String, base: URL, headers: [String: String]) {
        lock.lock(); defer { lock.unlock() }
        guard !saver && text.contains("#EXT-X-ENDLIST") && !text.contains("BYTERANGE") else { return }
        var refs: [URL] = []; var seconds = 0.0, budget = 0
        let target = expensive ? 10.0 : 30.0
        let regex = try? NSRegularExpression(pattern: "URI=\"([^\"]+)\"")
        for raw in text.components(separatedBy: "\n") {
            let line = raw.trimmingCharacters(in: .whitespacesAndNewlines)
            if line.hasPrefix("#EXTINF:") { seconds += Double(line.dropFirst(8).components(separatedBy: ",")[0]) ?? 0 }
            if !line.isEmpty && !line.hasPrefix("#"), let url = URL(string: line, relativeTo: base)?.absoluteURL {
                refs.append(url); if seconds <= target || budget == 0 { budget = refs.count }
            } else if line.hasPrefix("#EXT-X-KEY:") || line.hasPrefix("#EXT-X-MAP:") {
                if let match = regex?.firstMatch(in: line, range: NSRange(line.startIndex..., in: line)), let range = Range(match.range(at: 1), in: line), let u = URL(string: String(line[range]), relativeTo: base)?.absoluteURL { refs.append(u) }
            }
        }
        for i in refs.indices { ahead[refs[i].absoluteString] = Array(refs.dropFirst(i + 1).prefix(max(1, budget))) }
        for url in refs.prefix(max(1, budget)) { prefetch(url, headers: headers, range: nil) }
    }
    func requested(_ url: URL, headers: [String: String]) {
        lock.lock(); defer { lock.unlock() }; guard !saver else { return }
        for next in ahead[url.absoluteString] ?? [] { prefetch(next, headers: headers, range: nil) }
    }
    func ranges(_ url: URL, headers: [String: String], range: String?, response: HTTPURLResponse) {
        lock.lock(); defer { lock.unlock() }
        guard !saver, response.statusCode == 206, let range, let content = response.value(forHTTPHeaderField: "Content-Range"),
              let regex = try? NSRegularExpression(pattern: "^bytes (\\d+)-(\\d+)/(\\d+)$"), let match = regex.firstMatch(in: content, range: NSRange(content.startIndex..., in: content)) else { return }
        let values = (1...3).compactMap { Range(match.range(at: $0), in: content).flatMap { Int64(content[$0]) } }
        guard values.count == 3, range.hasPrefix("bytes=\(values[0])-") else { return }
        for i in 0..<(expensive ? 1 : 5) {
            let start = values[1] + 1 + Int64(i) * 1024 * 1024; if start >= values[2] { break }
            prefetch(url, headers: headers, range: "bytes=\(start)-\(min(values[2] - 1, start + 1024 * 1024 - 1))")
        }
    }
    private func prefetch(_ url: URL, headers: [String: String], range: String?) {
        guard !saver, tasks.count < (expensive ? 1 : 5), hit(url, headers: headers, range: range) == nil else { return }
        let id = key(url, headers: headers, range: range), generation = epoch
        guard tasks[id] == nil else { return }
        var request = URLRequest(url: url)
        for (name, value) in headers where name.lowercased() != "range" { request.setValue(value, forHTTPHeaderField: name) }
        request.setValue("identity", forHTTPHeaderField: "Accept-Encoding"); if let range { request.setValue(range, forHTTPHeaderField: "Range") }
        let task = session.downloadTask(with: request)
        specifications[task.taskIdentifier] = (id, generation, range)
        tasks[id] = task; MobileMediaBudget.shared.start(task, priority: 1)
    }
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64, totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        if totalBytesWritten > Int64(Self.objectLimit) || totalBytesExpectedToWrite > Int64(Self.objectLimit) { downloadTask.cancel() }
    }
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        lock.lock(); defer { lock.unlock() }
        guard let (id, generation, range) = specifications[downloadTask.taskIdentifier], generation == epoch,
              let response = downloadTask.response as? HTTPURLResponse, [200, 206].contains(response.statusCode),
              !(response.mimeType ?? "").contains("html"), !(response.mimeType ?? "").contains("json"),
              let size = try? location.resourceValues(forKeys: [.fileSizeKey]).fileSize, reserve(size) else { return }
        if let range { guard response.statusCode == 206, let content = response.value(forHTTPHeaderField: "Content-Range"), content.components(separatedBy: "/").first == range.replacingOccurrences(of: "bytes=", with: "bytes ") else { return } }
        commit(location, id: id, response: response, generation: generation)
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        lock.lock()
        if let spec = specifications.removeValue(forKey: task.taskIdentifier) { tasks.removeValue(forKey: spec.0) }
        lock.unlock(); MobileMediaBudget.shared.finish(task)
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        var next = request
        for (name, value) in task.originalRequest?.allHTTPHeaderFields ?? [:] where name.lowercased() != "host" { next.setValue(value, forHTTPHeaderField: name) }
        completionHandler(next)
    }
    func prefetchDirect(_ url: URL, headers: [String: String], position: Int64, end: Int64) {
        lock.lock(); defer { lock.unlock() }
        for index in 1..<(expensive ? 2 : 6) {
            let start = position + Int64(index) * 1024 * 1024; if start > end { break }
            prefetch(url, headers: headers, range: "bytes=\(start)-\(min(end, start + 1024 * 1024 - 1))")
        }
    }
}

@objc(TatakaiLocalProxyPlugin)
public final class TatakaiLocalProxyPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TatakaiLocalProxyPlugin"
    public let jsName = "TatakaiLocalProxy"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "ensureStarted", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getBaseUrl", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "registerSource", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "registerPeerSource", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unregisterPeerSource", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "peerMediaResponse", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setEmbedActive", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setWatchActive", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getStats", returnType: CAPPluginReturnPromise)
        ,CAPPluginMethod(name: "configurePlayback", returnType: CAPPluginReturnPromise)
        ,CAPPluginMethod(name: "cancelPrefetch", returnType: CAPPluginReturnPromise)
        ,CAPPluginMethod(name: "setCloudflareConfig", returnType: CAPPluginReturnPromise)
        ,CAPPluginMethod(name: "prepareRequestHeaders", returnType: CAPPluginReturnPromise)
    ]

    private let proxy = TatakaiLocalProxy.shared
    private lazy var peerMedia = PeerMediaBridge(proxy: proxy) { [weak self] name, data in
        DispatchQueue.main.async { self?.notifyListeners(name, data: data) }
    }

    @objc func registerPeerSource(_ call: CAPPluginCall) {
        proxy.ensureStarted { [weak self] result in
            guard let self else { call.reject("Watchroom media bridge closed"); return }
            switch result {
            case .success(let base):
                self.proxy.peerMediaHandler = { [weak self] connection, method, path, range in
                    self?.peerMedia.serve(connection, method: method, path: path, range: range)
                }
                self.peerMedia.register(base: base, call: call)
            case .failure: call.reject("Unable to start watchroom media bridge")
            }
        }
    }
    @objc func unregisterPeerSource(_ call: CAPPluginCall) { peerMedia.unregister(call) }
    @objc func peerMediaResponse(_ call: CAPPluginCall) { peerMedia.respond(call) }

    @objc func prepareRequestHeaders(_ call: CAPPluginCall) {
        guard let raw = call.getString("url"), let url = URL(string: raw),
              url.scheme == "https" || url.scheme == "http" else {
            call.reject("A valid http(s) URL is required.")
            return
        }
        var headers: [String: String] = [:]
        for (name, value) in call.getObject("headers") ?? [:] { headers[name] = String(describing: value) }
        call.resolve(["headers": CloudflareBypass.prepare(url, headers: headers)])
    }

    @objc func configurePlayback(_ call: CAPPluginCall) {
        MobileStreamCache.shared.configure(source: call.getString("source") ?? "", saver: call.getBool("dataSaver") ?? false)
        call.resolve(["metered": MobileStreamCache.shared.metered])
    }
    @objc func cancelPrefetch(_ call: CAPPluginCall) { MobileStreamCache.shared.cancel(); call.resolve() }

    @objc func ensureStarted(_ call: CAPPluginCall) {
        proxy.ensureStarted { result in
            switch result {
            case .success(let baseUrl):
                call.resolve(["success": true, "baseUrl": baseUrl])
            case .failure(let error):
                call.reject("Unable to start the local proxy: \(error.localizedDescription)")
            }
        }
    }

    @objc func getBaseUrl(_ call: CAPPluginCall) {
        let baseUrl = proxy.baseUrl
        call.resolve(["success": baseUrl != nil, "baseUrl": baseUrl ?? ""])
    }

    @objc func registerSource(_ call: CAPPluginCall) {
        guard let rawUrl = call.getString("url")?.trimmingCharacters(in: .whitespacesAndNewlines),
              let url = URL(string: rawUrl),
              url.scheme == "http" || url.scheme == "https" else {
            call.reject("A valid http(s) URL is required.")
            return
        }

        var headers: [String: String] = [:]
        for (name, value) in call.getObject("headers") ?? [:] {
            if let string = value as? String { headers[name] = string }
            else if let number = value as? NSNumber { headers[name] = number.stringValue }
        }
        let requestedToken = call.getString("token")
        let token = proxy.register(url: url, headers: headers, token: requestedToken)

        proxy.ensureStarted { result in
            switch result {
            case .success(let baseUrl):
                call.resolve([
                    "success": true,
                    "token": token,
                    "proxyUrl": "\(baseUrl)/stream/\(token)"
                ])
            case .failure(let error):
                call.reject("Local proxy unavailable: \(error.localizedDescription)")
            }
        }
    }

    @objc func getStats(_ call: CAPPluginCall) {
        call.resolve([
            "success": true,
            "entries": proxy.entryCount,
            "baseUrl": proxy.baseUrl ?? ""
        ])
    }

    public override func load() {
        // Install the always-on hard blocklist as soon as the bridge exists.
        // (If the web view is not ready yet this is a no-op — the watch/embed
        // setters below retry with the live controller on every state change.)
        AdBlockContentRules.shared.ensureInstalled(on: self.bridge?.webView?.configuration.userContentController)
    }

    @objc func setEmbedActive(_ call: CAPPluginCall) {
        SecurityState.setEmbedActive(call.getBool("active") ?? false)
        AdBlockContentRules.shared.ensureInstalled(on: self.bridge?.webView?.configuration.userContentController)
        call.resolve(["success": true])
    }

    @objc func setWatchActive(_ call: CAPPluginCall) {
        let active = call.getBool("active") ?? false
        SecurityState.setWatchActive(active)
        MobileDownloads.shared.setPlayback(active)
        AdBlockContentRules.shared.ensureInstalled(on: self.bridge?.webView?.configuration.userContentController)
        call.resolve(["success": true])
    }

    /// Cloudflare-bypass settings (settings UI): master toggle + optional
    /// external FlareSolverr server URL. The settings screen always sends both
    /// keys; persisted to UserDefaults and read on every upstream fetch.
    @objc func setCloudflareConfig(_ call: CAPPluginCall) {
        let enabled = call.getBool("enabled") ?? CloudflareBypass.enabled
        let url = (call.getString("flaresolverrUrl") ?? CloudflareBypass.server).trimmingCharacters(in: .whitespacesAndNewlines)
        CloudflareBypass.setConfig(enabled: enabled, flaresolverrUrl: url)
        call.resolve(["success": true])
    }

    /// Capacitor-sanctioned navigation hook (`WebViewDelegationHandler` gives
    /// every plugin first refusal via `shouldOverrideLoad:` before its own
    /// allow-navigation / external-open policy runs). This is the iOS
    /// equivalent of Android's `AntiHijackWebViewClient.shouldOverrideUrlLoading`
    /// + `AntiHijackWebChromeClient.onCreateWindow` half of desktop's
    /// `window.open` guard: top-frame navigations (including popup targets,
    /// whose `targetFrame` is nil) to ad networks are swallowed, and while an
    /// untrusted embed is on screen no top-frame navigation may leave the app
    /// for an unknown third party. Returning nil means "no opinion" — normal
    /// Capacitor handling continues untouched.
    @objc public override func shouldOverrideLoad(_ navigationAction: WKNavigationAction) -> NSNumber? {
        let isTopLevel = navigationAction.targetFrame == nil || navigationAction.targetFrame?.isMainFrame == true
        guard isTopLevel, let url = navigationAction.request.url else { return nil }
        let urlString = url.absoluteString
        let host = AdHosts.hostname(of: urlString)
        let current = bridge?.webView?.url
        let appHosts = ["tatakai.me", "tatakai.app", "tatakai.to", "localhost"]
        let watching = SecurityState.isFilteringActive
            || (appHosts.contains(current?.host?.lowercased() ?? "") && current?.path.hasPrefix("/watch/") == true)
        // A nil target is a popup. Never let it replace the main document.
        if watching && (navigationAction.targetFrame == nil
            || !appHosts.contains(host)
            || !(url.scheme == "https" || url.scheme == "http")) {
            return true
        }
        if AdHosts.isHardBlocked(host: host) {
            return true
        }
        if !AdHosts.isLoopbackHost(host)
            && AdHosts.isEmbedPopunder(url: urlString, embedActive: SecurityState.isEmbedActive) {
            return true
        }
        return nil
    }
}

private struct ProxyEntry {
    let url: URL
    let headers: [String: String]
    let createdAt: Date
}

private enum LocalProxyError: LocalizedError {
    case startFailed(String)

    var errorDescription: String? {
        switch self {
        case .startFailed(let message): return message
        }
    }
}

private final class TatakaiLocalProxy {
    static let shared = TatakaiLocalProxy()

    private static let tokenTTL: TimeInterval = 15 * 60
    private static let defaultUserAgent =
        "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15"

    private let stateQueue = DispatchQueue(label: "app.tatakai.local-proxy.state")
    private let networkQueue = DispatchQueue(
        label: "app.tatakai.local-proxy.network",
        qos: .userInitiated,
        attributes: .concurrent
    )
    private let tokenLock = NSLock()
    private var entries: [String: ProxyEntry] = [:]
    private var listener: NWListener?
    private var readyBaseUrl: String?
    private var startWaiters: [(Result<String, Error>) -> Void] = []
    private let peerHandlerLock = NSLock()
    private var storedPeerMediaHandler: ((NWConnection, String, String, String?) -> Void)?
    var peerMediaHandler: ((NWConnection, String, String, String?) -> Void)? {
        get { peerHandlerLock.lock(); defer { peerHandlerLock.unlock() }; return storedPeerMediaHandler }
        set { peerHandlerLock.lock(); storedPeerMediaHandler = newValue; peerHandlerLock.unlock() }
    }

    var baseUrl: String? { stateQueue.sync { readyBaseUrl } }

    var entryCount: Int {
        tokenLock.lock()
        defer { tokenLock.unlock() }
        return entries.count
    }

    func ensureStarted(completion: @escaping (Result<String, Error>) -> Void) {
        stateQueue.async {
            if let base = self.readyBaseUrl {
                completion(.success(base))
                return
            }
            self.startWaiters.append(completion)
            guard self.listener == nil else { return }

            do {
                let parameters = NWParameters.tcp
                parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
                let listener = try NWListener(using: parameters)
                self.listener = listener
                listener.newConnectionHandler = { [weak self] connection in
                    self?.accept(connection)
                }
                listener.stateUpdateHandler = { [weak self] state in
                    guard let self else { return }
                    switch state {
                    case .ready:
                        guard let port = listener.port else {
                            self.finishStart(.failure(LocalProxyError.startFailed("No listener port")))
                            return
                        }
                        let base = "http://127.0.0.1:\(port.rawValue)"
                        self.readyBaseUrl = base
                        self.finishStart(.success(base))
                    case .failed(let error):
                        self.listener = nil
                        self.readyBaseUrl = nil
                        self.finishStart(.failure(error))
                    case .cancelled:
                        self.listener = nil
                        self.readyBaseUrl = nil
                    default:
                        break
                    }
                }
                listener.start(queue: self.stateQueue)
            } catch {
                self.listener = nil
                self.finishStart(.failure(error))
            }
        }
    }

    private func finishStart(_ result: Result<String, Error>) {
        let waiters = startWaiters
        startWaiters.removeAll()
        for waiter in waiters { waiter(result) }
    }

    @discardableResult
    func register(url: URL, headers: [String: String], token requested: String? = nil) -> String {
        var normalized = headers
        if !normalized.keys.contains(where: { $0.caseInsensitiveCompare("User-Agent") == .orderedSame }) {
            normalized["User-Agent"] = Self.defaultUserAgent
        }
        let candidate = (requested ?? "").lowercased()
        let token = candidate.range(of: "^[a-f0-9]{32}$", options: .regularExpression) != nil
            ? candidate
            : Self.makeToken()

        tokenLock.lock()
        entries[token] = ProxyEntry(url: url, headers: normalized, createdAt: Date())
        sweepLocked()
        tokenLock.unlock()
        if url.pathExtension.lowercased() == "m3u8" { PlaylistWarmer.shared.warm(url, headers: normalized) }
        return token
    }

    func entry(for token: String) -> ProxyEntry? {
        tokenLock.lock()
        defer { tokenLock.unlock() }
        return entries[token.lowercased()]
    }

    private func sweepLocked() {
        let cutoff = Date().addingTimeInterval(-Self.tokenTTL)
        entries = entries.filter { $0.value.createdAt >= cutoff }
    }

    private static func makeToken() -> String {
        var bytes = [UInt8](repeating: 0, count: 16)
        bytes.withUnsafeMutableBytes { buffer in
            if let baseAddress = buffer.baseAddress {
                _ = SecRandomCopyBytes(kSecRandomDefault, buffer.count, baseAddress)
            }
        }
        return bytes.map { String(format: "%02x", $0) }.joined()
    }

    private func accept(_ connection: NWConnection) {
        guard case .hostPort(let host, _) = connection.endpoint,
              host.debugDescription.contains("127.0.0.1") || host.debugDescription.contains("::1") else {
            connection.cancel()
            return
        }
        connection.stateUpdateHandler = { state in
            if case .failed = state { connection.cancel() }
        }
        connection.start(queue: networkQueue)
        receiveRequest(connection, accumulated: Data())
    }

    private func receiveRequest(_ connection: NWConnection, accumulated: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 64 * 1024) {
            [weak self] data, _, complete, error in
            guard let self else { return }
            var buffer = accumulated
            if let data { buffer.append(data) }
            if buffer.range(of: Data("\r\n\r\n".utf8)) != nil {
                self.handleRequest(connection, data: buffer)
            } else if error != nil || complete || buffer.count >= 64 * 1024 {
                self.sendText(connection, status: 400, text: "bad request")
            } else {
                self.receiveRequest(connection, accumulated: buffer)
            }
        }
    }

    private func handleRequest(_ connection: NWConnection, data: Data) {
        guard let request = String(data: data, encoding: .utf8) else {
            sendText(connection, status: 400, text: "bad request")
            return
        }
        let lines = request.components(separatedBy: "\r\n")
        let first = lines.first?.split(separator: " ", maxSplits: 2).map(String.init) ?? []
        guard first.count >= 2 else {
            sendText(connection, status: 400, text: "bad request")
            return
        }
        let method = first[0].uppercased()
        if method == "OPTIONS" {
            send(connection, status: 204, headers: corsHeaders(), body: nil)
            return
        }
        guard method == "GET" || method == "HEAD" else {
            sendText(connection, status: 405, text: "method not allowed")
            return
        }

        var requestHeaders: [String: String] = [:]
        for line in lines.dropFirst() {
            guard let colon = line.firstIndex(of: ":") else { continue }
            requestHeaders[String(line[..<colon]).lowercased()] =
                String(line[line.index(after: colon)...]).trimmingCharacters(in: .whitespaces)
        }

        let path = first[1].components(separatedBy: "?").first ?? first[1]
        if path.hasPrefix("/peer/") {
            guard let handler = peerMediaHandler else { sendText(connection, status: 410, text: "Watchroom media source closed"); return }
            handler(connection, method, path, requestHeaders["range"])
            return
        }
        if path.hasPrefix("/offline/") {
            serveOffline(connection, method: method, path: path, range: requestHeaders["range"])
            return
        }
        guard path.hasPrefix("/stream/") else {
            sendText(connection, status: 404, text: "not found")
            return
        }
        let token = String(path.dropFirst("/stream/".count)).lowercased()
        guard token.range(of: "^[a-f0-9]{32}$", options: .regularExpression) != nil,
              let entry = entry(for: token) else {
            sendText(connection, status: 410, text: "stream token expired")
            return
        }
        UpstreamRelay(
            connection: connection,
            method: method,
            entry: entry,
            requestRange: requestHeaders["range"],
            proxy: self
        ).start()
    }

    func childUrl(_ reference: String, relativeTo playlist: URL, headers: [String: String]) -> String {
        guard let resolved = URL(string: reference.trimmingCharacters(in: .whitespacesAndNewlines),
                                 relativeTo: playlist)?.absoluteURL,
              let base = baseUrl else { return reference }
        let token = register(url: resolved, headers: headers)
        return "\(base)/stream/\(token)"
    }

    private func serveOffline(_ connection: NWConnection, method: String, path: String, range: String?) {
        let relative = String(path.dropFirst("/offline/".count))
        guard relative.range(of: "^[a-f0-9]{64}/[a-zA-Z0-9._-]+$", options: .regularExpression) != nil else { sendText(connection, status: 404, text: "not found"); return }
        let root = MobileDownloads.shared.root.resolvingSymlinksInPath()
        let file = root.appendingPathComponent(relative).resolvingSymlinksInPath()
        guard file.path.hasPrefix(root.path + "/"), let values = try? file.resourceValues(forKeys: [.fileSizeKey]), let size = values.fileSize, size > 0,
              let handle = try? FileHandle(forReadingFrom: file) else { sendText(connection, status: 404, text: "offline file missing"); return }
        var start = 0, end = size - 1
        if let range {
            let bounds = String(range.dropFirst(6)).components(separatedBy: "-")
            guard range.hasPrefix("bytes="), bounds.count == 2 else { try? handle.close(); sendText(connection, status: 416, text: "invalid range"); return }
            if bounds[0].isEmpty, let suffix = Int(bounds[1]), suffix > 0 { start = max(0, size - suffix) }
            else if let offset = Int(bounds[0]), offset >= 0 { start = offset; if let last = Int(bounds[1]) { end = min(end, last) } else if !bounds[1].isEmpty { end = -1 } }
            else { end = -1 }
            guard start <= end && start < size else { try? handle.close(); sendText(connection, status: 416, text: "invalid range"); return }
        }
        var headers = corsHeaders()
        let types = ["m3u8": "application/vnd.apple.mpegurl", "mp4": "video/mp4", "m4s": "video/mp4", "ts": "video/mp2t", "vtt": "text/vtt", "aac": "audio/aac", "webm": "video/webm"]
        headers["Content-Type"] = types[file.pathExtension.lowercased()] ?? "application/octet-stream"
        if headers["Content-Type"] == "application/octet-stream" {
            let prefix = handle.readData(ofLength: 512)
            let bytes = [UInt8](prefix)
            if bytes.count >= 8 && String(bytes: bytes[4..<8], encoding: .ascii) == "ftyp" {
                headers["Content-Type"] = "video/mp4"
            } else if bytes.count >= 4 && Array(bytes[0..<4]) == [0x1a, 0x45, 0xdf, 0xa3] {
                headers["Content-Type"] = prefix.range(of: Data("webm".utf8)) != nil ? "video/webm" : "video/x-matroska"
            } else if bytes.count > 188 && bytes[0] == 0x47 && bytes[188] == 0x47 {
                headers["Content-Type"] = "video/mp2t"
            }
        }
        headers["Content-Length"] = String(end - start + 1); headers["Accept-Ranges"] = "bytes"
        if range != nil { headers["Content-Range"] = "bytes \(start)-\(end)/\(size)" }
        var head = "HTTP/1.1 \(range == nil ? "200 OK" : "206 Partial Content")\r\n"
        for (key, value) in headers { head += "\(key): \(value)\r\n" }; head += "\r\n"
        try? handle.seek(toOffset: UInt64(start))
        let remaining = end - start + 1
        connection.send(content: Data(head.utf8), completion: .contentProcessed { [weak self] error in
            if error != nil || method == "HEAD" { try? handle.close(); connection.cancel(); return }
            self?.sendFile(connection, handle: handle, remaining: remaining)
        })
    }
    func sendFile(_ connection: NWConnection, handle: FileHandle, remaining: Int) {
        guard remaining > 0 else { try? handle.close(); connection.cancel(); return }
        let data = handle.readData(ofLength: min(64 * 1024, remaining))
        guard !data.isEmpty else { try? handle.close(); connection.cancel(); return }
        connection.send(content: data, completion: .contentProcessed { [weak self] error in
            if error != nil { try? handle.close(); connection.cancel(); return }
            self?.sendFile(connection, handle: handle, remaining: remaining - data.count)
        })
    }

    func serveCached(_ connection: NWConnection, method: String, hit: MobileStreamCache.Hit) {
        guard let handle = try? FileHandle(forReadingFrom: hit.file) else { sendText(connection, status: 404, text: "cache missing"); return }
        var headers = corsHeaders(); headers["Content-Type"] = hit.type; headers["Content-Length"] = String(hit.length)
        headers["Accept-Ranges"] = "bytes"
        if !hit.contentRange.isEmpty { headers["Content-Range"] = hit.contentRange }
        var head = "HTTP/1.1 \(hit.status) \(hit.status == 206 ? "Partial Content" : "OK")\r\n"
        for (key, value) in headers { head += "\(key): \(value)\r\n" }; head += "\r\n"
        connection.send(content: Data(head.utf8), completion: .contentProcessed { [weak self] error in
            if error != nil || method == "HEAD" { try? handle.close(); connection.cancel(); return }
            self?.sendFile(connection, handle: handle, remaining: hit.length)
        })
    }

    func rewritePlaylist(_ text: String, entry: ProxyEntry) -> String {
        text.components(separatedBy: "\n").map { rawLine in
            let trimmed = rawLine.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { return rawLine }
            if !trimmed.hasPrefix("#") {
                return childUrl(trimmed, relativeTo: entry.url, headers: entry.headers)
            }
            guard let regex = try? NSRegularExpression(pattern: "URI=\\\"([^\\\"]+)\\\"") else {
                return rawLine
            }
            let mutable = NSMutableString(string: rawLine)
            let matches = regex.matches(in: rawLine, range: NSRange(location: 0, length: mutable.length))
            for match in matches.reversed() where match.numberOfRanges > 1 {
                let uriRange = match.range(at: 1)
                let uri = mutable.substring(with: uriRange)
                mutable.replaceCharacters(
                    in: uriRange,
                    with: childUrl(uri, relativeTo: entry.url, headers: entry.headers)
                )
            }
            return mutable as String
        }.joined(separator: "\n")
    }

    func corsHeaders() -> [String: String] {
        [
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
            "Access-Control-Allow-Headers": "Range, Content-Type, Accept, Origin, Authorization, X-Requested-With",
            "Access-Control-Allow-Private-Network": "true",
            "Access-Control-Expose-Headers": "*",
            "Access-Control-Max-Age": "86400",
            "Cross-Origin-Resource-Policy": "cross-origin",
            "Connection": "close"
        ]
    }

    func sendText(_ connection: NWConnection, status: Int, text: String) {
        let body = Data(text.utf8)
        var headers = corsHeaders()
        headers["Content-Type"] = "text/plain; charset=utf-8"
        headers["Content-Length"] = String(body.count)
        headers["Cache-Control"] = "no-store"
        send(connection, status: status, headers: headers, body: body)
    }

    func send(_ connection: NWConnection, status: Int, headers: [String: String], body: Data?) {
        let reason: String
        switch status {
        case 200: reason = "OK"
        case 204: reason = "No Content"
        case 206: reason = "Partial Content"
        case 400: reason = "Bad Request"
        case 404: reason = "Not Found"
        case 405: reason = "Method Not Allowed"
        case 410: reason = "Gone"
        case 416: reason = "Range Not Satisfiable"
        case 502: reason = "Bad Gateway"
        case 504: reason = "Gateway Timeout"
        default: reason = "HTTP"
        }
        var head = "HTTP/1.1 \(status) \(reason)\r\n"
        for (name, value) in headers {
            let safe = value.replacingOccurrences(of: "\r", with: "").replacingOccurrences(of: "\n", with: "")
            head += "\(name): \(safe)\r\n"
        }
        head += "\r\n"
        var payload = Data(head.utf8)
        if let body { payload.append(body) }
        connection.send(content: payload, completion: .contentProcessed { _ in connection.cancel() })
    }
}

/// Native players consume loopback HTTP while room JS supplies bounded WebRTC bytes.
private final class PeerMediaBridge {
    private final class Request {
        let connection: NWConnection, token: String, event: [String: Any]
        var sentHead = false, inFlight = false, generation = 0
        var acknowledgement: CAPPluginCall?
        init(_ connection: NWConnection, token: String, event: [String: Any]) {
            self.connection = connection; self.token = token; self.event = event
        }
    }
    private let proxy: TatakaiLocalProxy
    private let emit: (String, [String: Any]) -> Void
    private let queue = DispatchQueue(label: "app.tatakai.watchroom-peer-media")
    private var sources = Set<String>()
    private var requests: [String: Request] = [:]
    private static let blockLimit = 1024 * 1024
    init(proxy: TatakaiLocalProxy, emit: @escaping (String, [String: Any]) -> Void) {
        self.proxy = proxy; self.emit = emit
    }
    func register(base: String, call: CAPPluginCall) {
        queue.async {
            guard self.sources.count < 4 else { call.reject("Too many active watchroom media sources"); return }
            let token = UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased()
            self.sources.insert(token)
            call.resolve(["token": token, "proxyUrl": "\(base)/peer/\(token)/root"])
        }
    }
    func unregister(_ call: CAPPluginCall) {
        queue.async {
            let token = call.getString("token") ?? ""
            self.sources.remove(token)
            let cancelled = self.requests.filter { $0.value.token == token }.map { $0.key }
            for id in cancelled { self.cancel(id) }
            call.resolve()
        }
    }
    func serve(_ connection: NWConnection, method: String, path: String, range: String?) {
        queue.async {
            let parts = path.components(separatedBy: "/")
            guard parts.count == 4, parts[2].range(of: "^[a-f0-9]{32}$", options: .regularExpression) != nil,
                parts[3].range(of: "^(root|[a-f0-9]{32})$", options: .regularExpression) != nil,
                self.sources.contains(parts[2]) else {
                self.proxy.sendText(connection, status: 410, text: "Watchroom media source closed"); return
            }
            guard self.requests.count < 8 else { self.proxy.sendText(connection, status: 503, text: "Watchroom media bridge busy"); return }
            let id = UUID().uuidString
            var event: [String: Any] = ["id": id, "token": parts[2], "resourceId": parts[3], "method": method]
            if let range { event["range"] = range }
            let request = Request(connection, token: parts[2], event: event)
            self.requests[id] = request
            connection.stateUpdateHandler = { [weak self] state in
                if case .cancelled = state { self?.queue.async { self?.cancel(id) } }
                if case .failed = state { self?.queue.async { self?.cancel(id) } }
            }
            self.emit("peerMediaRequest", event)
            self.timeout(id, generation: 0)
        }
    }
    func respond(_ call: CAPPluginCall) {
        queue.async {
            let id = call.getString("id") ?? "", token = call.getString("token") ?? ""
            let encoded = call.getString("body") ?? ""
            guard let request = self.requests[id], request.token == token, self.sources.contains(token), !request.inFlight,
                encoded.count <= 4 * ((Self.blockLimit + 2) / 3), let body = Data(base64Encoded: encoded), body.count <= Self.blockLimit else {
                call.reject("Watchroom media request expired or block too large"); return
            }
            var payload = Data()
            if !request.sentHead {
                let status = call.getInt("status") ?? 502
                var headers = self.proxy.corsHeaders()
                let incoming = call.getObject("headers") ?? [:]
                for name in ["Content-Type", "Content-Length", "Content-Range", "Accept-Ranges"] {
                    if let value = incoming[name] as? String {
                        headers[name] = value.replacingOccurrences(of: "\r", with: "").replacingOccurrences(of: "\n", with: "")
                    }
                }
                headers["Connection"] = "close"; headers["Cache-Control"] = "no-store"
                var head = "HTTP/1.1 \((200...599).contains(status) ? status : 502) HTTP\r\n"
                for (name, value) in headers { head += "\(name): \(value)\r\n" }
                head += "\r\n"; payload.append(Data(head.utf8)); request.sentHead = true
            }
            if request.event["method"] as? String != "HEAD" { payload.append(body) }
            let final = (call.getBool("final") ?? true) || (request.event["method"] as? String == "HEAD")
            request.inFlight = true; request.acknowledgement = call
            request.generation += 1
            self.timeout(id, generation: request.generation)
            request.connection.send(content: payload, completion: .contentProcessed { error in
                self.queue.async {
                    guard self.requests[id] === request else { return }
                    request.inFlight = false; request.acknowledgement = nil
                    if error != nil { call.reject("Watchroom media request cancelled"); self.cancel(id); return }
                    call.resolve()
                    if final {
                        self.requests.removeValue(forKey: id)
                        request.connection.cancel()
                    }
                }
            })
        }
    }
    private func timeout(_ id: String, generation: Int) {
        queue.asyncAfter(deadline: .now() + 30) {
            guard let request = self.requests[id], request.generation == generation else { return }
            if !request.sentHead { self.proxy.sendText(request.connection, status: 504, text: "Watchroom media request timed out") }
            self.cancel(id)
        }
    }
    private func cancel(_ id: String) {
        guard let request = requests.removeValue(forKey: id) else { return }
        request.acknowledgement?.reject("Watchroom media request cancelled")
        request.connection.cancel()
        emit("peerMediaCancel", request.event)
    }
}

/// Reads only one small chunk; registration must never buffer an entire playlist.
private final class PlaylistWarmer: NSObject, URLSessionDataDelegate {
    static let shared = PlaylistWarmer()
    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 5
        config.timeoutIntervalForResource = 5
        return URLSession(configuration: config, delegate: self, delegateQueue: nil)
    }()
    func warm(_ url: URL, headers: [String: String]) {
        var request = URLRequest(url: url)
        for (name, value) in CloudflareBypass.prepare(url, headers: headers) { request.setValue(value, forHTTPHeaderField: name) }
        request.setValue("bytes=0-1023", forHTTPHeaderField: "Range")
        request.setValue("identity", forHTTPHeaderField: "Accept-Encoding")
        session.dataTask(with: request).resume()
    }
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) { dataTask.cancel() }
}

/// State is confined to the main queue; one bounded attempt is shared by each host.
private enum CloudflareBypass {
    struct Clearance {
        let cookie: String
        let ua: String
        let expires: Date
    }
    static var enabled: Bool { UserDefaults.standard.object(forKey: "cf_bypass_enabled") as? Bool ?? true }
    static var server: String { UserDefaults.standard.string(forKey: "flaresolverr_url") ?? "" }
    private static var sessions: [String: Clearance] = [:]
    private static var cooldown: [String: Date] = [:]
    private static var waiting: [String: [(Bool) -> Void]] = [:]
    private static var solvers: [String: ClearanceWebView] = [:]
    private static var attempts: [String: UUID] = [:]
    private static let lock = NSLock()
    // Keep aligned with desktop/runtime/proxy/local-proxy-server.cjs.
    private static let domains: Set<String> = [
        "animepahe.com", "animepahe.ru", "senshi.live", "senshianime.com",
        "aniworld.to", "4anime.gg", "mkissa.com", "anizone.to", "animesalt.com",
        "animeya.cc", "animeya.to", "toonstream.co", "animelok.xyz", "animelok.com",
        "watchanimeworld.com", "desidubbed.in", "hindidubbed.in", "reanime.to", "reanime.net", "anikoto.to",
        "weebcentral.com", "nelomanga.com", "toongod.org", "www.toongod.org",
        "mangadot.net", "www.mangadot.net", "mangaball.net", "www.mangaball.net",
        "bulbasaur.poke-black-and-white.net", "heracross.red-and-blue.net", "api.comick.dev",
        "webnovel.com", "novelfull.com", "royalroad.com", "justlightnovels.com",
        "lightnovel.to", "novelbuddy.me", "novelbuddy.com", "novelfire.net",
        "novelbin.com", "readnovelfull.com", "novelcool.com", "novgo.net",
        "re-library.com", "woopread.com", "wuxiaworld.site", "divinedaolibrary.com",
        "toonily.com", "onisaga.com"
    ]
    static func applies(_ url: URL) -> Bool {
        guard let host = url.host?.lowercased() else { return false }
        return domains.contains(host) || domains.contains(where: { host.hasSuffix("." + $0) })
    }
    static func setConfig(enabled: Bool, flaresolverrUrl: String) {
        let changed = self.enabled != enabled || server != flaresolverrUrl
        UserDefaults.standard.set(enabled, forKey: "cf_bypass_enabled")
        UserDefaults.standard.set(flaresolverrUrl, forKey: "flaresolverr_url")
        if changed {
            lock.lock(); sessions.removeAll(); lock.unlock()
            DispatchQueue.main.async { cooldown.removeAll() }
        }
    }
    static func isChallenge(_ status: Int, body: Data) -> Bool {
        guard [200, 403, 503, 429].contains(status) else { return false }
        let text = String(decoding: body, as: UTF8.self).lowercased()
        let markers = status == 200
            ? ["cf-browser-verification", "cf_chl_", "cf-chl-", "challenge-platform", "just a moment", "__cf_chl_tk"]
            : ["cf-browser-verification", "cf_chl_", "cf-chl-", "challenge-platform", "turnstile", "just a moment", "attention required", "__cf_chl_tk"]
        return markers.contains(where: text.contains)
    }
    static func prepare(_ url: URL, headers: [String: String]) -> [String: String] {
        guard enabled, applies(url), let host = url.host?.lowercased() else { return headers }
        lock.lock(); let cached = sessions[host]; lock.unlock()
        guard let cached, cached.expires > Date() else { return headers }
        var result = headers
        let key = result.keys.first { $0.lowercased() == "cookie" } ?? "Cookie"
        let pairs = (result[key] ?? "").components(separatedBy: ";").map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty && !$0.hasPrefix("cf_clearance=") }
        result[key] = (pairs + [cached.cookie]).joined(separator: "; ")
        let uaKey = result.keys.first { $0.lowercased() == "user-agent" } ?? "User-Agent"
        result[uaKey] = cached.ua
        return result
    }
    static func solve(_ url: URL, completion: @escaping (Bool) -> Void) {
        DispatchQueue.main.async {
            guard enabled, applies(url), let host = url.host?.lowercased() else { completion(false); return }
            if waiting[host] != nil { waiting[host]?.append(completion); return }
            if let until = cooldown[host], until > Date() { completion(false); return }
            lock.lock(); sessions.removeValue(forKey: host); lock.unlock()
            waiting[host] = [completion]
            let attempt = UUID(); attempts[host] = attempt
            let deadline = Date().addingTimeInterval(45)
            let finish: (Clearance?) -> Void = { value in
                guard attempts[host] == attempt else { return }
                attempts.removeValue(forKey: host)
                guard let callbacks = waiting.removeValue(forKey: host) else { return }
                solvers.removeValue(forKey: host)?.stop()
                if enabled, let value { lock.lock(); sessions[host] = value; lock.unlock() }
                else { cooldown[host] = Date().addingTimeInterval(300) }
                for callback in callbacks { callback(enabled && value != nil) }
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 45) { finish(nil) }
            let browser: () -> Void = {
                guard attempts[host] == attempt, deadline > Date() else { finish(nil); return }
                let solver = ClearanceWebView(url: url, deadline: deadline, completion: finish)
                solvers[host] = solver
                solver.start()
            }
            guard !server.isEmpty, var endpoint = URL(string: server), ["http", "https"].contains(endpoint.scheme?.lowercased() ?? "") else { browser(); return }
            if endpoint.lastPathComponent != "v1" { endpoint.appendPathComponent("v1") }
            var request = URLRequest(url: endpoint); request.httpMethod = "POST"; request.timeoutInterval = 25
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try? JSONSerialization.data(withJSONObject: ["cmd": "request.get", "url": url.absoluteString, "maxTimeout": 23000])
            URLSession.shared.dataTask(with: request) { data, response, error in
                var value: Clearance?
                if error == nil, (response as? HTTPURLResponse)?.statusCode == 200, let data,
                   let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any], root["status"] as? String == "ok",
                   let solution = root["solution"] as? [String: Any], let ua = solution["userAgent"] as? String, !ua.isEmpty,
                   let cookies = solution["cookies"] as? [[String: Any]],
                   let cookie = cookies.first(where: {
                       let domain = ($0["domain"] as? String ?? "").trimmingCharacters(in: CharacterSet(charactersIn: ".")).lowercased()
                       return !domain.isEmpty && $0["name"] as? String == "cf_clearance" && (host == domain || host.hasSuffix("." + domain))
                   }), let token = cookie["value"] as? String, !token.isEmpty {
                    let expiry = (cookie["expires"] as? Double).map { Date(timeIntervalSince1970: $0 - 60) } ?? Date().addingTimeInterval(1200)
                    if expiry > Date() { value = Clearance(cookie: "cf_clearance=\(token)", ua: ua, expires: min(expiry, Date().addingTimeInterval(7200))) }
                }
                let solved = value
                DispatchQueue.main.async { if let solved { finish(solved) } else { browser() } }
            }.resume()
        }
    }

    private final class ClearanceWebView: NSObject, WKNavigationDelegate {
        let url: URL, deadline: Date
        let completion: (Clearance?) -> Void
        var view: WKWebView?
        var stopped = false
        init(url: URL, deadline: Date, completion: @escaping (Clearance?) -> Void) {
            self.url = url; self.deadline = deadline; self.completion = completion
        }
        func start() {
            guard let window = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).flatMap({ $0.windows }).first(where: { $0.isKeyWindow }) else { completion(nil); return }
            let configuration = WKWebViewConfiguration()
            configuration.websiteDataStore = .nonPersistent()
            let web = WKWebView(frame: CGRect(x: -2, y: -2, width: 1, height: 1), configuration: configuration)
            web.navigationDelegate = self; web.isUserInteractionEnabled = false
            window.addSubview(web); view = web
            web.load(URLRequest(url: url)); poll()
        }
        func poll() {
            guard !stopped, let web = view else { return }
            guard Date() < deadline else { completion(nil); return }
            web.configuration.websiteDataStore.httpCookieStore.getAllCookies { cookies in
                guard !self.stopped else { return }
                let host = self.url.host?.lowercased() ?? ""
                if let cookie = cookies.first(where: {
                    let domain = $0.domain.trimmingCharacters(in: CharacterSet(charactersIn: ".")).lowercased()
                    return $0.name == "cf_clearance" && !$0.value.isEmpty && (host == domain || host.hasSuffix("." + domain)) && ($0.expiresDate ?? .distantFuture) > Date()
                }) {
                    web.evaluateJavaScript("navigator.userAgent") { value, _ in
                        guard !self.stopped, let ua = value as? String else { return }
                        self.completion(Clearance(cookie: "cf_clearance=\(cookie.value)", ua: ua,
                            expires: min(cookie.expiresDate?.addingTimeInterval(-60) ?? Date().addingTimeInterval(1200), Date().addingTimeInterval(7200))))
                    }
                } else { DispatchQueue.main.asyncAfter(deadline: .now() + 1) { self.poll() } }
            }
        }
        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            decisionHandler(["https", "http"].contains(navigationAction.request.url?.scheme ?? "") ? .allow : .cancel)
        }
        func stop() { stopped = true; view?.stopLoading(); view?.navigationDelegate = nil; view?.removeFromSuperview(); view = nil }
    }
}

private final class UpstreamRelay: NSObject, URLSessionDataDelegate {
    private let connection: NWConnection
    private let method: String
    private let entry: ProxyEntry
    private let requestRange: String?
    private unowned let proxy: TatakaiLocalProxy
    private var session: URLSession!
    private var cached: MobileStreamCache.Writer?
    private var response: HTTPURLResponse?
    private var playlist = false
    private var sentHead = false
    private var didRetryUpstream = false
    private var didRetryChallenge = false
    private var challengeCandidate = false
    private var body = Data()
    private var activeTaskID = -1
    private var rangeAttempt = false
    private var rangeMode = false
    private var rangePosition: Int64 = 0
    private var rangeEnd = Int64.max
    private var chunkEnd: Int64 = 0
    private var rangeTotal: Int64 = 0
    private var validator: String?
    private var advertisedRange: String?
    private var advertisedLength: Int64?
    private let chunkSize: Int64 = 1024 * 1024

    private var transferHeaders: [String: String] {
        var headers = CloudflareBypass.prepare(entry.url, headers: entry.headers); if let validator { headers["If-Range"] = validator }; return headers
    }
    private var transferRange: String? { rangeAttempt || rangeMode ? "bytes=\(rangePosition)-\(chunkEnd)" : requestRange }

    init(connection: NWConnection, method: String, entry: ProxyEntry,
         requestRange: String?, proxy: TatakaiLocalProxy) {
        self.connection = connection
        self.method = method
        self.entry = entry
        self.requestRange = requestRange
        self.proxy = proxy
    }

    func start() {
        if let hit = MobileStreamCache.shared.hit(entry.url, headers: entry.headers, range: requestRange) {
            proxy.serveCached(connection, method: method, hit: hit)
            MobileStreamCache.shared.requested(entry.url, headers: entry.headers)
            return
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 18
        // Sequential range fallbacks may stream an entire long episode.
        configuration.timeoutIntervalForResource = 3600
        configuration.httpMaximumConnectionsPerHost = 6
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        session = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
        if method == "GET", MobileStreamCache.shared.enabled, ["mp4", "m4v", "webm", "mkv"].contains(entry.url.pathExtension.lowercased()), let requestRange,
           requestRange.range(of: "^bytes=\\d+-\\d*$", options: .regularExpression) != nil {
            let bounds = String(requestRange.dropFirst(6)).components(separatedBy: "-")
            if let start = Int64(bounds[0]) {
                rangePosition = start; rangeEnd = Int64(bounds[1]) ?? Int64.max
                if rangeEnd > start && rangeEnd - start >= chunkSize {
                    rangeAttempt = true; chunkEnd = min(rangeEnd, start + chunkSize - 1)
                }
            }
        }
        startTask()
    }
    private func startTask() {
        response = nil; body.removeAll(keepingCapacity: true); challengeCandidate = false; playlist = false
        var request = URLRequest(url: entry.url); request.timeoutInterval = 18
        for (name, value) in transferHeaders { request.setValue(value, forHTTPHeaderField: name) }
        request.setValue("identity", forHTTPHeaderField: "Accept-Encoding")
        if let range = transferRange { request.setValue(range, forHTTPHeaderField: "Range") }
        let task = session.dataTask(with: request); activeTaskID = task.taskIdentifier; MobileMediaBudget.shared.start(task, priority: 0)
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        var next = request
        let redirectHeaders = CloudflareBypass.prepare(request.url ?? entry.url, headers: entry.headers)
        for (name, value) in redirectHeaders where name.lowercased() != "host" { next.setValue(value, forHTTPHeaderField: name) }
        if let range = transferRange { next.setValue(range, forHTTPHeaderField: "Range") }
        next.setValue("identity", forHTTPHeaderField: "Accept-Encoding"); completionHandler(next)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask,
                    didReceive response: URLResponse,
                    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        guard dataTask.taskIdentifier == activeTaskID else { completionHandler(.cancel); return }
        self.response = response as? HTTPURLResponse
        if !sentHead, !didRetryChallenge, CloudflareBypass.enabled,
           CloudflareBypass.applies(entry.url),
           ([403, 503, 429].contains(self.response?.statusCode ?? 0)
            || (self.response?.statusCode == 200 && response.mimeType?.lowercased() == "text/html")) {
            challengeCandidate = true
            completionHandler(.allow)
            return
        }
        if rangeAttempt || rangeMode {
            let content = self.response?.value(forHTTPHeaderField: "Content-Range") ?? ""
            let bounds = content.replacingOccurrences(of: "bytes ", with: "").components(separatedBy: CharacterSet(charactersIn: "-/"))
            let values = bounds.compactMap(Int64.init)
            let tag = self.response?.value(forHTTPHeaderField: "ETag").flatMap { $0.hasPrefix("W/") ? nil : $0 } ?? self.response?.value(forHTTPHeaderField: "Last-Modified")
            let valid = self.response?.statusCode == 206 && values.count == 3 && values[0] == rangePosition
                && values[1] == min(chunkEnd, values[2] - 1) && tag != nil
                && (!rangeMode || tag == validator && values[2] == rangeTotal)
            if !valid {
                completionHandler(.cancel)
                if rangeMode { cached?.discard(); connection.cancel(); session.invalidateAndCancel() }
                else { rangeAttempt = false; startTask() }
                return
            }
            if rangeAttempt {
                validator = tag; rangeTotal = values[2]; rangeEnd = min(rangeEnd, rangeTotal - 1)
                advertisedRange = "bytes \(rangePosition)-\(rangeEnd)/\(rangeTotal)"
                advertisedLength = rangeEnd - rangePosition + 1
                rangeMode = true; rangeAttempt = false; chunkEnd = values[1]
            }
            MobileStreamCache.shared.prefetchDirect(entry.url, headers: transferHeaders, position: rangePosition, end: rangeEnd)
        }
        let contentType = response.mimeType?.lowercased() ?? ""
        playlist = (self.response?.statusCode ?? 200) < 400 && (entry.url.absoluteString.lowercased().contains(".m3u8") || contentType.contains("mpegurl"))
        if !playlist && method != "HEAD", let response = self.response {
            cached = MobileStreamCache.shared.writer(entry.url, headers: transferHeaders, range: transferRange, response: response)
        }
        if method == "HEAD" && !playlist { sendHead(contentLength: response.expectedContentLength) }
        completionHandler(.allow)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard dataTask.taskIdentifier == activeTaskID else { return }
        if challengeCandidate {
            let previous = body
            body.append(data.prefix(max(0, 65536 - body.count)))
            if body.count >= 65536 {
                if CloudflareBypass.isChallenge(response?.statusCode ?? 0, body: body) { dataTask.cancel() }
                else {
                    challengeCandidate = false
                    sendHead(contentLength: response?.expectedContentLength ?? -1)
                    if method != "HEAD" {
                        var original = previous; original.append(data)
                        connection.send(content: original, completion: .contentProcessed { error in if error != nil { session.invalidateAndCancel() } })
                    }
                    body.removeAll()
                }
            }
            return
        }
        if playlist {
            if body.count + data.count > 16 * 1024 * 1024 { connection.cancel(); session.invalidateAndCancel(); return }
            body.append(data)
            return
        }
        if !sentHead {
            let prefix = String(data: data.prefix(512), encoding: .utf8)?
                .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if prefix.hasPrefix("#EXTM3U") {
                cached?.discard(); cached = nil
                playlist = true
                body.append(data)
                return
            }
            sendHead(contentLength: response?.expectedContentLength ?? -1)
        }
        guard method != "HEAD" else { return }
        cached?.append(data)
        connection.send(content: data, completion: .contentProcessed { error in
            if error != nil { session.invalidateAndCancel() }
        })
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        MobileMediaBudget.shared.finish(task)
        guard task.taskIdentifier == activeTaskID else { return }
        if challengeCandidate {
            let original = body, originalResponse = response
            if CloudflareBypass.isChallenge(originalResponse?.statusCode ?? 0, body: original) {
                didRetryChallenge = true
                CloudflareBypass.solve(entry.url) { solved in
                    self.session.delegateQueue.addOperation {
                        if solved { self.startTask() }
                        else { self.sendOrigin(original, response: originalResponse) }
                    }
                }
            } else { sendOrigin(original, response: originalResponse) }
            return
        }
        if let error {
            cached?.discard()
            let failure = error as NSError
            if !sentHead, response == nil, !didRetryUpstream, failure.code != NSURLErrorCancelled {
                didRetryUpstream = true
                DispatchQueue.global().asyncAfter(deadline: .now() + 0.25) {
                    self.session.delegateQueue.addOperation { self.startTask() }
                }
                return
            }
            if !sentHead { proxy.sendText(connection, status: failure.code == NSURLErrorTimedOut || failure.code == NSURLErrorCancelled ? 504 : 502, text: "proxy error: \(error.localizedDescription)") }
            else { connection.cancel() }
            self.session.finishTasksAndInvalidate()
            return
        }
        if playlist {
            let text = String(data: body, encoding: .utf8) ?? ""
            MobileStreamCache.shared.playlist(text, base: response?.url ?? entry.url, headers: entry.headers)
            let rewritten = Data(proxy.rewritePlaylist(text, entry: ProxyEntry(url: response?.url ?? entry.url, headers: entry.headers, createdAt: entry.createdAt)).utf8)
            var headers = proxy.corsHeaders()
            headers["Content-Type"] = "application/vnd.apple.mpegurl"
            headers["Content-Length"] = String(rewritten.count)
            headers["Cache-Control"] = "no-cache"
            proxy.send(connection, status: response?.statusCode ?? 200, headers: headers,
                       body: method == "HEAD" ? nil : rewritten)
            self.session.finishTasksAndInvalidate()
            return
        }
        if !sentHead { sendHead(contentLength: response?.expectedContentLength ?? 0) }
        cached?.finish()
        cached = nil
        if rangeMode && chunkEnd < rangeEnd { rangePosition = chunkEnd + 1; advanceRange(); return }
        MobileStreamCache.shared.requested(entry.url, headers: entry.headers)
        if let response { MobileStreamCache.shared.ranges(entry.url, headers: entry.headers, range: requestRange, response: response) }
        connection.send(content: nil, isComplete: true, completion: .contentProcessed { _ in
            self.connection.cancel()
        })
        self.session.finishTasksAndInvalidate()
    }

    private func advanceRange() {
        chunkEnd = min(rangeEnd, rangePosition + chunkSize - 1)
        MobileStreamCache.shared.prefetchDirect(entry.url, headers: transferHeaders, position: rangePosition, end: rangeEnd)
        if let hit = MobileStreamCache.shared.hit(entry.url, headers: transferHeaders, range: transferRange), let handle = try? FileHandle(forReadingFrom: hit.file) {
            sendCachedChunk(handle, remaining: hit.length)
        } else { startTask() }
    }

    private func sendOrigin(_ data: Data, response: HTTPURLResponse?) {
        var headers = proxy.corsHeaders()
        headers["Content-Type"] = response?.value(forHTTPHeaderField: "Content-Type") ?? "text/html"
        headers["Content-Length"] = String(data.count)
        headers["Cache-Control"] = "no-store"
        proxy.send(connection, status: response?.statusCode ?? 502, headers: headers, body: method == "HEAD" ? nil : data)
        session.finishTasksAndInvalidate()
    }
    private func sendCachedChunk(_ handle: FileHandle, remaining: Int) {
        if remaining == 0 {
            try? handle.close()
            if chunkEnd < rangeEnd { rangePosition = chunkEnd + 1; advanceRange() }
            else { connection.send(content: nil, isComplete: true, completion: .contentProcessed { _ in self.connection.cancel() }); session.finishTasksAndInvalidate() }
            return
        }
        let data = handle.readData(ofLength: min(64 * 1024, remaining))
        guard !data.isEmpty else { try? handle.close(); connection.cancel(); session.invalidateAndCancel(); return }
        connection.send(content: data, completion: .contentProcessed { error in
            if error != nil { try? handle.close(); self.connection.cancel(); self.session.invalidateAndCancel(); return }
            self.sendCachedChunk(handle, remaining: remaining - data.count)
        })
    }

    private func sendHead(contentLength: Int64) {
        guard !sentHead else { return }
        sentHead = true
        var headers = proxy.corsHeaders()
        headers["Content-Type"] = response?.value(forHTTPHeaderField: "Content-Type")
            ?? guessContentType(entry.url)
        if let length = advertisedLength { headers["Content-Length"] = String(length) }
        else if contentLength >= 0 { headers["Content-Length"] = String(contentLength) }
        headers["Accept-Ranges"] = response?.value(forHTTPHeaderField: "Accept-Ranges") ?? "bytes"
        if let range = advertisedRange ?? response?.value(forHTTPHeaderField: "Content-Range") { headers["Content-Range"] = range }
        headers["Cache-Control"] = "no-store"

        let status = response?.statusCode ?? 200
        var head = "HTTP/1.1 \(status) \(status == 206 ? "Partial Content" : "OK")\r\n"
        for (name, value) in headers {
            let safe = value.replacingOccurrences(of: "\r", with: "").replacingOccurrences(of: "\n", with: "")
            head += "\(name): \(safe)\r\n"
        }
        head += "\r\n"
        connection.send(content: Data(head.utf8), completion: .contentProcessed { _ in })
    }

    private func guessContentType(_ url: URL) -> String {
        switch url.pathExtension.lowercased() {
        case "m3u8": return "application/vnd.apple.mpegurl"
        case "mp4", "m4v": return "video/mp4"
        case "webm": return "video/webm"
        case "vtt": return "text/vtt; charset=utf-8"
        case "srt": return "text/plain; charset=utf-8"
        case "jpg", "jpeg": return "image/jpeg"
        case "png": return "image/png"
        case "webp": return "image/webp"
        case "avif": return "image/avif"
        default: return "application/octet-stream"
        }
    }
}

// MARK: - Anti-click-hijack / ad-block (iOS parity with Android security/*)
//
// Ported verbatim from Android `AdHosts` (itself ported from desktop
// `desktop/security/ad-blocker.cjs`) so all three shells block the same
// networks. iOS enforcement is split the same way Android splits it:
//   • subresource drops (`AntiHijackWebViewClient.shouldInterceptRequest`)
//     → compiled `WKContentRuleList`s, which cover every subresource;
//   • top-frame redirect-hijack + popup refusal (`shouldOverrideUrlLoading` +
//     `onCreateWindow`) → the `shouldOverrideLoad:` plugin hook above.

/// Shared embed/watch flags for the iOS anti-click-hijack (Android
/// `SecurityState` parity). The web shell sets them via
/// `TatakaiLocalProxyPlugin.setEmbedActive/setWatchActive`, so there is a
/// single native entry-point.
private final class SecurityState {
    private static let lock = NSLock()
    private static var _embedActive = false
    private static var _watchActive = false

    static func setEmbedActive(_ active: Bool) {
        lock.lock(); defer { lock.unlock() }
        _embedActive = active
    }

    static func setWatchActive(_ active: Bool) {
        lock.lock(); defer { lock.unlock() }
        _watchActive = active
        if !active { _embedActive = false }
    }

    static var isEmbedActive: Bool {
        lock.lock(); defer { lock.unlock() }
        return _embedActive
    }

    static var isWatchActive: Bool {
        lock.lock(); defer { lock.unlock() }
        return _watchActive
    }

    /// Desktop `isFilteringActive()`: enabled && (watch || embed).
    static var isFilteringActive: Bool { isWatchActive || isEmbedActive }
}

/// Host-suffix blocklists for the iOS anti-click-hijack. Matching is
/// suffix-based against the lower-cased, `www.`-stripped hostname, so
/// `x.y.popads.net` matches `popads.net` — identical to `matchesSuffix` on
/// desktop and Android.
private enum AdHosts {
    /// Ad / popunder / malvertising networks + mainstream ad exchanges. These
    /// are NEVER a legitimate first-party request, so they are blocked
    /// unconditionally (desktop `BLOCKED_HOST_SUFFIXES`).
    static let blocked: Set<String> = [
        // Popunder / malvertising networks common on streaming embeds
        "popads.net", "popcash.net", "popmyads.com", "poptm.com",
        "propellerads.com", "propu.sh", "propellerclick.com",
        "onclickads.net", "onclckds.com", "onclickalgo.com", "onclasrv.com",
        "adcash.com", "adcashrevenue.com",
        "hilltopads.net", "hilltopads.com",
        "exoclick.com", "exosrv.com", "exdynsrv.com", "realsrv.com",
        "juicyads.com", "juicyads.rocks",
        "trafficjunky.com", "trafficjunky.net",
        "clickadu.com", "clickaine.com",
        "adsterra.com", "terraclicks.com", "bebi.com",
        "admaven.com", "ad-maven.com", "admaven.net",
        "zeropark.com", "voluum.com",
        "mgid.com", "adskeeper.co.uk", "adskeeper.com",
        "revcontent.com", "contentabc.com",
        "popunder.net", "poweredby.jads.co", "jads.co",
        "a-ads.com", "adservme.com", "adsupply.com",
        "galaksion.com", "kissmyads.com", "monetag.com",
        "vidoomy.com", "sekindo.com",
        // Mainstream ad exchanges / video ad servers
        "doubleclick.net", "googlesyndication.com", "googleadservices.com",
        "googletagservices.com", "imasdk.googleapis.com",
        "adnxs.com", "adsrvr.org", "adform.net", "adroll.com",
        "criteo.com", "criteo.net",
        "pubmatic.com", "rubiconproject.com", "openx.net", "casalemedia.com",
        "smartadserver.com", "sharethrough.com", "3lift.com", "bidswitch.net",
        "teads.tv", "indexww.com", "yieldmo.com", "moatads.com",
        "spotxchange.com", "spotx.tv", "stickyadstv.com", "springserve.com",
        "aniview.com", "taboola.com", "outbrain.com",
    ]

    /// Analytics / fingerprinting beacons. Blocked ONLY when the request did
    /// not originate from the app's own document (desktop
    /// `THIRD_PARTY_ANALYTICS_SUFFIXES`), because the app loads GA/GTM itself
    /// for first-party telemetry — blocking these outright would cancel our
    /// own analytics.
    static let analytics: Set<String> = [
        "google-analytics.com", "googletagmanager.com",
        "scorecardresearch.com", "quantserve.com", "quantcount.com",
        "histats.com", "statcounter.com", "hotjar.com", "hotjar.io",
        "mixpanel.com", "segment.io", "segment.com",
        "mc.yandex.ru",
        "luckyorange.com", "clarity.ms",
    ]

    /// Origins that count as the app's own document (desktop
    /// `FIRST_PARTY_SUFFIXES`).
    static let firstParty: Set<String> = [
        "tatakai.app", "tatakai.to", "tatakai.me",
    ]

    /// Hosts the app's own UI legitimately opens externally (desktop
    /// `TRUSTED_EXTERNAL_SUFFIXES`). While an untrusted embed is on screen,
    /// any top-frame navigation to a host outside this set (+ first-party +
    /// loopback + LAN) is treated as a click-hijack and swallowed.
    static let trustedExternal: Set<String> = [
        "github.com", "githubusercontent.com",
        "anilist.co", "myanimelist.net", "kitsu.io", "simkl.com",
        "mangadex.org", "annas-archive.org",
        "discord.com", "discord.gg", "dsc.gg", "discordapp.com",
        "twitter.com", "x.com", "facebook.com", "reddit.com",
        "tatakai.app", "tatakai.to", "tatakai.me",
        "localhost", "127.0.0.1",
    ]

    /// Lower-cased, `www.`-stripped hostname, or "" when unparseable.
    static func hostname(of urlString: String?) -> String {
        guard let urlString = urlString, !urlString.isEmpty,
              let url = URL(string: urlString),
              var host = url.host, !host.isEmpty else { return "" }
        host = host.lowercased()
        if host.hasPrefix("www.") { host = String(host.dropFirst(4)) }
        return host
    }

    private static func matches(_ host: String, _ suffixes: Set<String>) -> Bool {
        if host.isEmpty { return false }
        if suffixes.contains(host) { return true }
        for suffix in suffixes where host.hasSuffix("." + suffix) { return true }
        return false
    }

    /// True when the host is served by the app itself (loopback or first-party).
    static func isFirstPartyHost(_ host: String) -> Bool {
        if host.isEmpty { return false }
        if isLoopbackHost(host) { return true }
        return matches(host, firstParty)
    }

    /// True for loopback (local proxy / torrent stream server) hosts.
    static func isLoopbackHost(_ host: String) -> Bool {
        let h = host.lowercased()
        return h == "localhost" || h == "127.0.0.1" || h == "::1"
            || h == "0.0.0.0" || h == "[::1]"
    }

    /// Desktop `isTrustedExternal` parity (trusted + first-party + LAN).
    static func isTrustedExternal(url urlString: String) -> Bool {
        let host = hostname(of: urlString)
        if host.isEmpty { return false }
        if isLoopbackHost(host) { return true }
        if host.hasPrefix("10.") || host.hasPrefix("192.168.") { return true }
        if host.hasPrefix("172.") {
            let parts = host.split(separator: ".")
            if parts.count >= 2, let second = Int(parts[1]), (16...31).contains(second) { return true }
        }
        return matches(host, trustedExternal) || matches(host, firstParty)
    }

    /// Desktop `evaluateWindowOpen` embed-popunder verdict: while an embed is
    /// on screen, any unknown (non-trusted) target is refused. Ad-network
    /// targets are always refused.
    static func isEmbedPopunder(url urlString: String, embedActive: Bool) -> Bool {
        if !embedActive { return false }
        let host = hostname(of: urlString)
        if host.isEmpty { return false }
        if isHardBlocked(host: host) { return true }
        return !isTrustedExternal(url: urlString)
    }

    /// Hard ad/popunder host — always blocked, in any frame.
    static func isHardBlocked(host: String) -> Bool {
        matches(host, blocked)
    }

    /// Verdict helper kept for parity (the live iOS path enforces the same
    /// policy through content-rule lists instead of per-request checks).
    static func shouldBlock(url urlString: String?, refererOrOrigin: String?) -> Bool {
        let host = hostname(of: urlString)
        if host.isEmpty { return false }
        if isHardBlocked(host: host) { return true }
        if matches(host, analytics) {
            // Mirror desktop: block analytics only when it did not come from
            // our own document. A missing initiator ("unknown") is left alone.
            let refHost = hostname(of: refererOrOrigin)
            if !refHost.isEmpty && !isFirstPartyHost(refHost) { return true }
        }
        return false
    }
}

/// Compiles the blocklists into `WKContentRuleList`s — the iOS equivalent of
/// Android's `shouldInterceptRequest` subresource drop, which has no WKWebView
/// counterpart (navigation delegates never see subresources).
///
/// The hard ad/popunder list is installed once and stays (it can never false-
/// positive on first-party traffic). The analytics list is installed only
/// while the watch/embed filter is armed (desktop/Android parity: first-party
/// telemetry elsewhere in the app is never cancelled), with `unless-domain`
/// keeping the app's own document exempt — including the `capacitor://`
/// shell, whose host is `localhost`.
private final class AdBlockContentRules {
    static let shared = AdBlockContentRules()

    // NOTE: compiled rule lists persist in the store by identifier. If the
    // blocklists below ever change, these identifiers MUST be bumped or
    // clients keep enforcing the stale compiled lists.
    private static let hardIdentifier = "tatakai-adblock-hard-v1"
    private static let analyticsIdentifier = "tatakai-adblock-analytics-v1"
    /// App-shell + first-party document hosts exempt from analytics blocking.
    private static let analyticsExemptDomains = ["*tatakai.me", "*tatakai.app", "*tatakai.to", "localhost"]

    /// Installed lists by identifier. Touched on the main thread only (every
    /// mutation below hops to main before reading or writing it).
    private var installed: [String: WKContentRuleList] = [:]

    /// Install the always-on hard list and reconcile the analytics list with
    /// the current filter state. Nil-controller safe (no-op — the setters
    /// below retry with the live controller on every state change).
    func ensureInstalled(on controller: WKUserContentController?) {
        guard let controller = controller else { return }
        install(ruleId: Self.hardIdentifier, hosts: AdHosts.blocked, unlessDomains: nil, on: controller)
        applyAnalyticsState(to: controller)
    }

    /// Add or remove the analytics list to match `SecurityState`.
    /// Nil-controller safe (the next state change retries).
    func applyAnalyticsState(to controller: WKUserContentController?) {
        guard let controller = controller else { return }
        if SecurityState.isFilteringActive {
            install(
                ruleId: Self.analyticsIdentifier,
                hosts: AdHosts.analytics,
                unlessDomains: Self.analyticsExemptDomains,
                on: controller,
                onlyIf: { SecurityState.isFilteringActive }
            )
        } else {
            let id = Self.analyticsIdentifier
            DispatchQueue.main.async { [weak controller] in
                guard let controller = controller else { return }
                if let previous = self.installed.removeValue(forKey: id) {
                    controller.remove(previous)
                }
            }
        }
    }

    private func install(
        ruleId: String,
        hosts: Set<String>,
        unlessDomains: [String]?,
        on controller: WKUserContentController,
        onlyIf: (() -> Bool)? = nil
    ) {
        let json = Self.rulesJSON(hosts: hosts, unlessDomains: unlessDomains)
        guard let store = WKContentRuleListStore.default() else { return }
        store.lookUpContentRuleList(forIdentifier: ruleId) { [weak controller] existing, _ in
            let apply: (WKContentRuleList) -> Void = { list in
                DispatchQueue.main.async { [weak controller] in
                    guard let controller = controller else { return }
                    // Gates (e.g. a state flip mid-compile) are re-checked
                    // before anything touches the controller.
                    if let check = onlyIf, !check() { return }
                    if let previous = self.installed[ruleId] {
                        controller.remove(previous)
                    }
                    controller.add(list)
                    self.installed[ruleId] = list
                }
            }
            if let existing = existing {
                apply(existing)
            } else {
                store.compileContentRuleList(forIdentifier: ruleId, encodedContentRuleList: json) { list, error in
                    if let error = error {
                        print("[AdBlock] content-rule compile failed (\(ruleId)): \(error.localizedDescription)")
                        return
                    }
                    guard let list = list else { return }
                    apply(list)
                }
            }
        }
    }

    private static func rulesJSON(hosts: Set<String>, unlessDomains: [String]?) -> String {
        let unless: String
        if let unlessDomains = unlessDomains,
           let data = try? JSONSerialization.data(withJSONObject: unlessDomains),
           let text = String(data: data, encoding: .utf8) {
            unless = ",\"unless-domain\":\(text)"
        } else {
            unless = ""
        }
        let rules = hosts.sorted().map { host -> String in
            // Runtime needs `\\.` (JSON escape for regex `\.`): four source
            // backslashes. A single `\.` is invalid JSON and the whole list
            // fails to compile — the request then loads unblocked.
            let escaped = host.replacingOccurrences(of: ".", with: "\\\\.")
            return "{\"trigger\":{\"url-filter\":\"^https?://([^/]*\\\\.)?" + escaped + "([:/?#]|$)\",\"resource-type\":[\"document\",\"image\",\"style-sheet\",\"script\",\"font\",\"raw\",\"svg-document\",\"media\",\"popup\"]" + unless + "},\"action\":{\"type\":\"block\"}}"
        }
        return "[" + rules.joined(separator: ",") + "]"
    }
}
