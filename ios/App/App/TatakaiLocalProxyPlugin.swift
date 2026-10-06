import Foundation
import Network
import Security
import Capacitor

@objc(TatakaiLocalProxyPlugin)
public final class TatakaiLocalProxyPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TatakaiLocalProxyPlugin"
    public let jsName = "TatakaiLocalProxy"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "ensureStarted", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getBaseUrl", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "registerSource", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setEmbedActive", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setWatchActive", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getStats", returnType: CAPPluginReturnPromise)
    ]

    private let proxy = TatakaiLocalProxy.shared

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

    @objc func setEmbedActive(_ call: CAPPluginCall) {
        call.resolve(["success": true])
    }

    @objc func setWatchActive(_ call: CAPPluginCall) {
        call.resolve(["success": true])
    }

    @objc func getStats(_ call: CAPPluginCall) {
        call.resolve([
            "success": true,
            "entries": proxy.entryCount,
            "baseUrl": proxy.baseUrl ?? ""
        ])
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

private final class UpstreamRelay: NSObject, URLSessionDataDelegate {
    private let connection: NWConnection
    private let method: String
    private let entry: ProxyEntry
    private let requestRange: String?
    private unowned let proxy: TatakaiLocalProxy
    private var session: URLSession!
    private var response: HTTPURLResponse?
    private var playlist = false
    private var sentHead = false
    private var body = Data()

    init(connection: NWConnection, method: String, entry: ProxyEntry,
         requestRange: String?, proxy: TatakaiLocalProxy) {
        self.connection = connection
        self.method = method
        self.entry = entry
        self.requestRange = requestRange
        self.proxy = proxy
    }

    func start() {
        var request = URLRequest(url: entry.url)
        request.httpMethod = "GET"
        request.timeoutInterval = 18
        for (name, value) in entry.headers { request.setValue(value, forHTTPHeaderField: name) }
        request.setValue("identity", forHTTPHeaderField: "Accept-Encoding")
        if let requestRange { request.setValue(requestRange, forHTTPHeaderField: "Range") }

        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = 18
        configuration.timeoutIntervalForResource = 60
        configuration.httpMaximumConnectionsPerHost = 8
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        session = URLSession(configuration: configuration, delegate: self, delegateQueue: nil)
        session.dataTask(with: request).resume()
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask,
                    didReceive response: URLResponse,
                    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        self.response = response as? HTTPURLResponse
        let contentType = response.mimeType?.lowercased() ?? ""
        playlist = entry.url.absoluteString.lowercased().contains(".m3u8") || contentType.contains("mpegurl")
        if method == "HEAD" && !playlist { sendHead(contentLength: response.expectedContentLength) }
        completionHandler(.allow)
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        if playlist {
            body.append(data)
            return
        }
        if !sentHead {
            let prefix = String(data: data.prefix(512), encoding: .utf8)?
                .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if prefix.hasPrefix("#EXTM3U") {
                playlist = true
                body.append(data)
                return
            }
            sendHead(contentLength: response?.expectedContentLength ?? -1)
        }
        guard method != "HEAD" else { return }
        connection.send(content: data, completion: .contentProcessed { _ in })
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        defer { self.session.finishTasksAndInvalidate() }
        if let error {
            if !sentHead { proxy.sendText(connection, status: 502, text: "proxy error: \(error.localizedDescription)") }
            else { connection.cancel() }
            return
        }
        if playlist {
            let text = String(data: body, encoding: .utf8) ?? ""
            let rewritten = Data(proxy.rewritePlaylist(text, entry: entry).utf8)
            var headers = proxy.corsHeaders()
            headers["Content-Type"] = "application/vnd.apple.mpegurl"
            headers["Content-Length"] = String(rewritten.count)
            headers["Cache-Control"] = "no-cache"
            proxy.send(connection, status: response?.statusCode ?? 200, headers: headers,
                       body: method == "HEAD" ? nil : rewritten)
            return
        }
        if !sentHead { sendHead(contentLength: response?.expectedContentLength ?? 0) }
        connection.send(content: nil, isComplete: true, completion: .contentProcessed { _ in
            self.connection.cancel()
        })
    }

    private func sendHead(contentLength: Int64) {
        guard !sentHead else { return }
        sentHead = true
        var headers = proxy.corsHeaders()
        headers["Content-Type"] = response?.value(forHTTPHeaderField: "Content-Type")
            ?? guessContentType(entry.url)
        if contentLength >= 0 { headers["Content-Length"] = String(contentLength) }
        headers["Accept-Ranges"] = response?.value(forHTTPHeaderField: "Accept-Ranges") ?? "bytes"
        if let range = response?.value(forHTTPHeaderField: "Content-Range") { headers["Content-Range"] = range }
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
