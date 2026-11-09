import Capacitor
import Foundation
import UIKit
import WebKit

/// Configuration pages run in a plain WebKit window, without the app's JS bridge.
@objc(TatakaiExtensionConfigPlugin)
public final class TatakaiExtensionConfigPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TatakaiExtensionConfigPlugin"
    public let jsName = "TatakaiExtensionConfig"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise)
    ]
    private var pendingCall: CAPPluginCall?
    private var window: UINavigationController?

    @objc func configure(_ call: CAPPluginCall) {
        guard let requestID = call.getString("requestId"), UUID(uuidString: requestID) != nil,
              let text = call.getString("url"), let url = ExtensionConfigurationURL.page(text) else {
            call.reject("Use a valid request ID and an HTTP or HTTPS configuration URL without embedded credentials.", "INVALID_ARGUMENT"); return
        }
        DispatchQueue.main.async {
            guard self.pendingCall == nil else {
                call.reject("An extension configuration window is already open.", "BUSY"); return
            }
            guard let presenter = self.bridge?.viewController,
                  presenter.viewIfLoaded?.window != nil,
                  presenter.presentedViewController == nil else {
                call.reject("The extension configuration window is unavailable.", "UNAVAILABLE"); return
            }
            let page = ExtensionConfigurationController(url: url) { [weak self] manifestURL in
                self?.finish(requestID: requestID, manifestURL: manifestURL)
            }
            let window = UINavigationController(rootViewController: page)
            window.modalPresentationStyle = .fullScreen
            self.pendingCall = call
            self.window = window
            presenter.present(window, animated: true)
        }
    }

    private func finish(requestID: String, manifestURL: URL?) {
        guard let call = pendingCall, call.getString("requestId") == requestID else { return }
        let window = self.window
        pendingCall = nil
        self.window = nil
        var result: [String: Any] = ["requestId": requestID, "success": manifestURL != nil]
        if let manifestURL { result["manifestUrl"] = manifestURL.absoluteString }
        if let window { window.dismiss(animated: true) { call.resolve(result) } }
        else { call.resolve(result) }
    }
}

/// Changing only the scheme and fragment preserves encoded configuration tokens.
private enum ExtensionConfigurationURL {
    static func page(_ text: String) -> URL? {
        guard let components = components(text), ["http", "https"].contains(components.scheme?.lowercased() ?? "") else { return nil }
        return components.url
    }

    static func manifest(_ url: URL) -> URL? {
        guard var components = components(url.absoluteString),
              ["http", "https", "stremio"].contains(components.scheme?.lowercased() ?? ""),
              components.path.lowercased().hasSuffix("/manifest.json") else { return nil }
        if components.scheme?.lowercased() == "stremio" { components.scheme = "https" }
        return components.url
    }

    private static func components(_ text: String) -> URLComponents? {
        guard text.utf8.count <= 16384,
              !text.unicodeScalars.contains(where: { $0.value < 32 || $0.value == 127 }),
              var components = URLComponents(string: text),
              let host = components.host, !host.isEmpty,
              components.user == nil, components.password == nil else { return nil }
        components.fragment = nil
        return components
    }
}

private final class ExtensionConfigurationController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    private let initialURL: URL
    private var completion: ((URL?) -> Void)?
    private var web: WKWebView!
    private var backButton: UIBarButtonItem!
    private var backObservation: NSKeyValueObservation?

    init(url: URL, completion: @escaping (URL?) -> Void) {
        initialURL = url
        self.completion = completion
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError("Use init(url:completion:)") }

    override func viewDidLoad() {
        super.viewDidLoad()
        title = NSLocalizedString("Configure extension", comment: "Extension configuration window")
        view.backgroundColor = .systemBackground
        let configuration = WKWebViewConfiguration()
        // A fresh controller installs neither Capacitor user scripts nor message handlers.
        configuration.userContentController = WKUserContentController()
        configuration.websiteDataStore = .default()
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = true
        web = WKWebView(frame: .zero, configuration: configuration)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.allowsBackForwardNavigationGestures = true
        web.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(web)
        NSLayoutConstraint.activate([
            web.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            web.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            web.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor)
        ])
        navigationItem.leftBarButtonItem = UIBarButtonItem(barButtonSystemItem: .close, target: self, action: #selector(close))
        backButton = UIBarButtonItem(title: NSLocalizedString("Back", comment: "Go back in extension configuration"), style: .plain, target: self, action: #selector(goBack))
        navigationItem.rightBarButtonItems = [
            UIBarButtonItem(barButtonSystemItem: .refresh, target: self, action: #selector(reload)), backButton
        ]
        backObservation = web.observe(\.canGoBack, options: [.initial, .new]) { [weak self] web, _ in
            self?.backButton.isEnabled = web.canGoBack
        }
        web.load(URLRequest(url: initialURL))
    }

    @objc private func close() { complete(nil) }
    @objc private func goBack() { if web.canGoBack { web.goBack() } }
    @objc private func reload() {
        navigationItem.prompt = nil
        if web.url == nil { web.load(URLRequest(url: initialURL)) }
        else { web.reload() }
    }

    private func complete(_ manifestURL: URL?) {
        guard let completion else { return }
        self.completion = nil
        web?.stopLoading()
        web?.navigationDelegate = nil
        web?.uiDelegate = nil
        backObservation = nil
        completion(manifestURL)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard completion != nil, let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        let mainDestination = navigationAction.targetFrame?.isMainFrame == true ||
            (navigationAction.targetFrame == nil && navigationAction.sourceFrame.isMainFrame)
        if mainDestination, let manifestURL = ExtensionConfigurationURL.manifest(url) {
            decisionHandler(.cancel)
            complete(manifestURL)
            return
        }
        guard ExtensionConfigurationURL.page(url.absoluteString) != nil else { decisionHandler(.cancel); return }
        // Popups from embedded pages cannot take over the top-level configuration window.
        if navigationAction.targetFrame == nil {
            decisionHandler(.cancel)
            if navigationAction.sourceFrame.isMainFrame { webView.load(navigationAction.request) }
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationResponse: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        guard completion != nil, let url = navigationResponse.response.url else { decisionHandler(.cancel); return }
        if navigationResponse.isForMainFrame, let manifestURL = ExtensionConfigurationURL.manifest(url) {
            decisionHandler(.cancel)
            complete(manifestURL)
            return
        }
        decisionHandler(ExtensionConfigurationURL.page(url.absoluteString) != nil ? .allow : .cancel)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard navigationAction.targetFrame == nil, navigationAction.sourceFrame.isMainFrame,
              let url = navigationAction.request.url, completion != nil else { return nil }
        if let manifestURL = ExtensionConfigurationURL.manifest(url) { complete(manifestURL) }
        else if ExtensionConfigurationURL.page(url.absoluteString) != nil { webView.load(navigationAction.request) }
        return nil
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) { navigationItem.prompt = nil }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { showLoadFailure(error) }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { showLoadFailure(error) }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        navigationItem.prompt = NSLocalizedString("Page stopped. Try Reload.", comment: "Configuration page crashed")
    }
    private func showLoadFailure(_ error: Error) {
        guard completion != nil, (error as NSError).code != NSURLErrorCancelled else { return }
        navigationItem.prompt = NSLocalizedString("Page could not load. Try Reload.", comment: "Configuration page failed to load")
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        guard completion != nil, presentedViewController == nil else { completionHandler(); return }
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: NSLocalizedString("OK", comment: "Dismiss configuration alert"), style: .default) { _ in completionHandler() })
        present(alert, animated: true)
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        guard completion != nil, presentedViewController == nil else { completionHandler(false); return }
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: NSLocalizedString("Cancel", comment: "Cancel configuration confirmation"), style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: NSLocalizedString("OK", comment: "Accept configuration confirmation"), style: .default) { _ in completionHandler(true) })
        present(alert, animated: true)
    }
    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        guard completion != nil, presentedViewController == nil else { completionHandler(nil); return }
        let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText }
        alert.addAction(UIAlertAction(title: NSLocalizedString("Cancel", comment: "Cancel configuration input"), style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: NSLocalizedString("OK", comment: "Accept configuration input"), style: .default) { [weak alert] _ in completionHandler(alert?.textFields?.first?.text) })
        present(alert, animated: true)
    }
}
