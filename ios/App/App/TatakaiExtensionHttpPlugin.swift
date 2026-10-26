import Capacitor
import Foundation
import WebKit

/// Text HTTP for on-device extension interpreters. No code loading, shell or filesystem API.
@objc(TatakaiExtensionHttpPlugin)
public final class TatakaiExtensionHttpPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TatakaiExtensionHttpPlugin"
    public let jsName = "TatakaiExtensionHttp"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "request", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise)
    ]
    private let queue = DispatchQueue(label: "app.tatakai.extension-http")
    private var jobs: [String: ExtensionHTTPTask] = [:]
    private var canceled: [String: Date] = [:]

    @objc func request(_ call: CAPPluginCall) {
        guard let id = call.getString("requestId"), UUID(uuidString: id) != nil,
              let text = call.getString("url"), text.utf8.count <= 16384,
              let url = URL(string: text), Self.accepts(url) else {
            call.reject("Use an HTTP or HTTPS extension URL without embedded credentials"); return
        }
        let method = (call.getString("method") ?? "GET").uppercased()
        guard ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"].contains(method),
              let headers = (call.getObject("headers") ?? [:]) as? [String: String],
              headers.reduce(0, { $0 + $1.key.utf8.count + $1.value.utf8.count }) <= 16384,
              headers.allSatisfy({ !$0.key.contains("\r") && !$0.key.contains("\n") && !$0.value.contains("\r") && !$0.value.contains("\n") }),
              (call.getString("body") ?? "").utf8.count <= 1024 * 1024 else {
            call.reject("Invalid extension HTTP method, headers or request body"); return
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 15
        for (key, value) in headers { request.setValue(value, forHTTPHeaderField: key) }
        if !["GET", "HEAD"].contains(method), let body = call.getString("body") { request.httpBody = Data(body.utf8) }
        queue.async {
            self.canceled = self.canceled.filter { $0.value > Date().addingTimeInterval(-30) }
            guard self.canceled.removeValue(forKey: id) == nil else { call.reject("Extension request canceled"); return }
            guard self.jobs[id] == nil, self.jobs.count < 4 else { call.reject("Too many concurrent iOS extension requests"); return }
            let job = ExtensionHTTPTask(request: request, queue: self.queue) { [weak self] result in
                self?.jobs.removeValue(forKey: id)
                switch result {
                case .failure(let error): call.reject(error.localizedDescription)
                case .success(let value):
                    // WKWebView authentication and native source requests share scoped cookies.
                    if let endpoint = URL(string: value["url"] as? String ?? "") {
                        let cookies = HTTPCookieStorage.shared.cookies(for: endpoint) ?? []
                        DispatchQueue.main.async { [weak self] in
                            let store = self?.webView?.configuration.websiteDataStore.httpCookieStore
                            for cookie in cookies { store?.setCookie(cookie) }
                        }
                    }
                    call.resolve(value)
                }
            }
            self.jobs[id] = job
            DispatchQueue.main.async { [weak self] in
                guard let store = self?.webView?.configuration.websiteDataStore.httpCookieStore else {
                    self?.queue.async { job.start() }; return
                }
                store.getAllCookies { cookies in
                    self?.queue.async {
                        for cookie in cookies where Self.cookie(cookie, matches: url) { HTTPCookieStorage.shared.setCookie(cookie) }
                        job.start()
                    }
                }
            }
        }
    }

    @objc func cancel(_ call: CAPPluginCall) {
        guard let id = call.getString("requestId"), UUID(uuidString: id) != nil else { call.reject("Invalid request ID"); return }
        queue.async {
            if let job = self.jobs[id] { job.cancel() }
            else {
                self.canceled = self.canceled.filter { $0.value > Date().addingTimeInterval(-30) }
                if self.canceled.count < 256 { self.canceled[id] = Date() }
            }
            call.resolve()
        }
    }
    fileprivate static func accepts(_ url: URL) -> Bool {
        ["https", "http"].contains(url.scheme?.lowercased() ?? "") && url.host != nil && url.user == nil && url.password == nil
    }
    private static func cookie(_ cookie: HTTPCookie, matches url: URL) -> Bool {
        let domain = cookie.domain.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "."))
        let host = url.host?.lowercased() ?? ""
        return (host == domain || cookie.domain.hasPrefix(".") && host.hasSuffix("." + domain)) && (!cookie.isSecure || url.scheme == "https")
    }
}

/// All state and delegate callbacks run on the plugin's serial queue.
private final class ExtensionHTTPTask: NSObject, URLSessionDataDelegate {
    private let request: URLRequest
    private let queue: DispatchQueue
    private let completion: (Result<[String: Any], Error>) -> Void
    private var session: URLSession?
    private var task: URLSessionDataTask?
    private var response: HTTPURLResponse?
    private var body = Data()
    private var finished = false
    private var redirects = 0
    private let limit = 10 * 1024 * 1024
    init(request: URLRequest, queue: DispatchQueue, completion: @escaping (Result<[String: Any], Error>) -> Void) {
        self.request = request; self.queue = queue; self.completion = completion
    }
    func start() {
        guard !finished else { return }
        let configuration = URLSessionConfiguration.default
        configuration.httpCookieStorage = HTTPCookieStorage.shared
        configuration.httpShouldSetCookies = true
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.timeoutIntervalForRequest = 15
        configuration.timeoutIntervalForResource = 20
        let delegates = OperationQueue()
        delegates.maxConcurrentOperationCount = 1
        delegates.underlyingQueue = queue
        let session = URLSession(configuration: configuration, delegate: self, delegateQueue: delegates)
        self.session = session
        task = session.dataTask(with: request)
        task?.resume()
    }
    func cancel() { finish(.failure(URLError(.cancelled))) }
    private func fail(_ message: String) { finish(.failure(NSError(domain: "TatakaiExtensionHTTP", code: 1, userInfo: [NSLocalizedDescriptionKey: message]))) }
    private func finish(_ result: Result<[String: Any], Error>) {
        guard !finished else { return }
        finished = true
        task?.cancel()
        session?.invalidateAndCancel()
        body.removeAll(keepingCapacity: false)
        completion(result)
    }
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse, completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        guard !finished, let http = response as? HTTPURLResponse else { completionHandler(.cancel); return }
        guard response.expectedContentLength <= Int64(limit) else { completionHandler(.cancel); fail("Extension response exceeded 10 MB"); return }
        self.response = http; completionHandler(.allow)
    }
    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        guard !finished else { return }
        guard body.count + data.count <= limit else { fail("Extension response exceeded 10 MB"); return }
        body.append(data)
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        redirects += 1
        guard !finished, redirects <= 12, let target = newRequest.url, TatakaiExtensionHttpPlugin.accepts(target) else {
            completionHandler(nil); if !finished { fail("Unsupported or excessive source redirects") }; return
        }
        var next = newRequest
        let previous = response.url
        let previousPort = previous?.port ?? (previous?.scheme == "https" ? 443 : 80)
        let targetPort = target.port ?? (target.scheme == "https" ? 443 : 80)
        let sameOrigin = previous?.scheme?.lowercased() == target.scheme?.lowercased() && previous?.host?.lowercased() == target.host?.lowercased() && previousPort == targetPort
        if !sameOrigin { next.setValue(nil, forHTTPHeaderField: "Authorization"); next.setValue(nil, forHTTPHeaderField: "Cookie"); next.setValue(nil, forHTTPHeaderField: "Proxy-Authorization") }
        // Replay safe provider headers, while preserving URLSession's redirect method/body semantics.
        for name in ["User-Agent", "Referer", "Accept", "Accept-Language"] {
            if let value = request.value(forHTTPHeaderField: name) { next.setValue(value, forHTTPHeaderField: name) }
        }
        completionHandler(next)
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard !finished else { return }
        if let error { finish(.failure(error)); return }
        guard let response else { fail("The extension request returned no HTTP response"); return }
        var headers: [String: String] = [:]
        for (key, value) in response.allHeaderFields { headers[String(describing: key).lowercased()] = String(describing: value) }
        let encoding: String.Encoding = response.textEncodingName?.lowercased() == "utf-16" ? .utf16 : .utf8
        guard let text = String(data: body, encoding: encoding) ?? String(data: body, encoding: .isoLatin1) else { fail("The extension response is not text"); return }
        let endpoint = response.url ?? request.url!
        let cookies = Dictionary((HTTPCookieStorage.shared.cookies(for: endpoint) ?? []).map { ($0.name, $0.value) }, uniquingKeysWith: { _, latest in latest })
        finish(.success(["status": response.statusCode, "url": endpoint.absoluteString, "headers": headers, "body": text, "cookies": cookies]))
    }
}
