import AVFoundation
import Capacitor

/// iOS HLS → MP4 remux service (mobile parity with desktop's `ffmpeg -c copy`
/// download path, and with Android's TatakaiMux ffmpeg plugin).
///
/// Instead of shipping an ffmpeg static library, iOS remuxes through
/// AVFoundation: the variant playlist URL (resolved in JS, with its replay
/// headers attached to the asset) is exported with the passthrough preset —
/// a pure repackage, no re-encode — into a single `Episode_<n>.mp4` under the
/// app's Documents directory.
///
/// Anything AVFoundation can't passthrough (incompatible tracks, protected
/// streams) resolves `{success:false}` so the JS downloader falls back to the
/// segment-folder path instead of recording a broken file. Output is confined
/// to Documents (path-traversal safe); only http(s) inputs are accepted.
@objc(TatakaiMuxPlugin)
public final class TatakaiMuxPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TatakaiMuxPlugin"
    public let jsName = "TatakaiMux"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "muxHlsToMp4", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelMux", returnType: CAPPluginReturnPromise)
    ]

    private var sessions: [String: AVAssetExportSession] = [:]
    private var progressTimers: [String: Timer] = [:]
    private let lock = NSLock()

    @objc func muxHlsToMp4(_ call: CAPPluginCall) {
        let rawUrl = call.getString("url", "").trimmingCharacters(in: .whitespacesAndNewlines)
        let outPath = call.getString("outPath", "").trimmingCharacters(in: .whitespacesAndNewlines)
        var jobId = call.getString("jobId", "").trimmingCharacters(in: .whitespacesAndNewlines)
        if jobId.isEmpty { jobId = UUID().uuidString }

        guard let url = URL(string: rawUrl),
              url.scheme == "http" || url.scheme == "https" else {
            call.resolve(["success": false, "error": "Only http(s) stream URLs can be remuxed."])
            return
        }
        let destination: URL
        do {
            destination = try confinedOutput(outPath)
        } catch {
            call.resolve(["success": false, "error": (error as NSError).localizedDescription])
            return
        }

        var headers: [String: String] = [:]
        for (name, value) in call.getObject("headers") ?? [:] {
            if let string = value as? String, !string.isEmpty { headers[name] = string }
            else if let number = value as? NSNumber { headers[name] = number.stringValue }
        }
        var options: [String: Any] = [:]
        if !headers.isEmpty { options["AVURLAssetHTTPHeaderFieldsKey"] = headers }
        let asset = AVURLAsset(url: url, options: options.isEmpty ? nil : options)

        guard let session = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetPassthrough) else {
            call.resolve(["success": false, "error": "This stream cannot be repackaged to MP4 on this device."])
            return
        }
        session.outputURL = destination
        session.outputFileType = .mp4
        session.shouldOptimizeForNetworkUse = true
        try? FileManager.default.removeItem(at: destination)

        lock.lock()
        sessions[jobId] = session
        lock.unlock()

        let capturedJob = jobId
        let timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            guard let self = self else { return }
            self.notifyListeners("muxProgress", data: ["jobId": capturedJob, "progress": session.progress * 100])
        }
        lock.lock()
        progressTimers[capturedJob] = timer
        lock.unlock()

        session.exportAsynchronously { [weak self] in
            guard let self = self else { return }
            self.lock.lock()
            self.sessions.removeValue(forKey: capturedJob)
            self.progressTimers.removeValue(forKey: capturedJob)?.invalidate()
            self.lock.unlock()
            switch session.status {
            case .completed:
                let size = (try? FileManager.default.attributesOfItem(atPath: destination.path)[.size] as? NSNumber)?.intValue ?? 0
                call.resolve(["success": true, "jobId": capturedJob, "size": size])
            case .cancelled:
                try? FileManager.default.removeItem(at: destination)
                call.resolve(["success": false, "error": "cancelled"])
            default:
                try? FileManager.default.removeItem(at: destination)
                let message = session.error?.localizedDescription ?? "Export failed."
                call.resolve(["success": false, "error": "Remux failed: \(message)"])
            }
        }
    }

    @objc func cancelMux(_ call: CAPPluginCall) {
        let jobId = call.getString("jobId", "")
        lock.lock()
        let session = sessions.removeValue(forKey: jobId)
        progressTimers.removeValue(forKey: jobId)?.invalidate()
        lock.unlock()
        session?.cancelExport()
        call.resolve(["success": true])
    }

    /// Resolve the requested output inside the app's Documents directory.
    /// Anything escaping it is rejected.
    private func confinedOutput(_ outPath: String) throws -> URL {
        guard !outPath.isEmpty else {
            throw NSError(domain: "TatakaiMux", code: 1, userInfo: [NSLocalizedDescriptionKey: "A destination path is required."])
        }
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
        let resolved: URL
        if outPath.hasPrefix("/") {
            resolved = URL(fileURLWithPath: outPath).standardized
        } else {
            resolved = documents.appendingPathComponent(outPath).standardized
        }
        guard resolved.path.hasPrefix(documents.standardized.path + "/") else {
            throw NSError(domain: "TatakaiMux", code: 2, userInfo: [NSLocalizedDescriptionKey: "Destination must stay inside app storage."])
        }
        guard resolved.pathExtension.lowercased() == "mp4" else {
            throw NSError(domain: "TatakaiMux", code: 3, userInfo: [NSLocalizedDescriptionKey: "Destination must be an .mp4 file."])
        }
        return resolved
    }
}


// Local library import and media handoff share the existing native bridge.
import UIKit
import UniformTypeIdentifiers
import Network

@objc(TatakaiMediaPlugin)
public final class TatakaiMediaPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TatakaiMediaPlugin"
    public let jsName = "TatakaiMedia"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "openExternalPlayer", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "networkStatus", returnType: CAPPluginReturnPromise)
    ]
    private let network = NWPathMonitor()
    private var wifi = false
    public override func load() {
        network.pathUpdateHandler = { [weak self] path in self?.wifi = path.status == .satisfied && path.usesInterfaceType(.wifi) }
        network.start(queue: DispatchQueue(label: "tatakai.media.network"))
    }
    deinit { network.cancel() }
    @objc func networkStatus(_ call: CAPPluginCall) { call.resolve(["wifi": wifi]) }
    @objc func openExternalPlayer(_ call: CAPPluginCall) {
        guard let value = call.getString("url"), let url = URL(string: value) else { call.reject("Invalid media URL."); return }
        DispatchQueue.main.async {
            guard let controller = self.bridge?.viewController else { call.reject("Player handoff is unavailable."); return }
            if url.scheme == "https" || url.scheme == "http" {
                var components = URLComponents(string: "vlc-x-callback://x-callback-url/stream")!
                components.queryItems = [URLQueryItem(name: "url", value: value)]
                guard let target = components.url, UIApplication.shared.canOpenURL(target) else { call.reject("Install VLC to open streaming URLs."); return }
                UIApplication.shared.open(target, options: [:]) { opened in
                    if opened { call.resolve(["success": true, "progressSupported": false]) }
                    else { call.reject("VLC could not open this stream.") }
                }
            } else {
                let file = URL(fileURLWithPath: value.replacingOccurrences(of: "file://", with: "")).resolvingSymlinksInPath()
                let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].resolvingSymlinksInPath()
                guard file.path.hasPrefix(documents.path + "/"), FileManager.default.fileExists(atPath: file.path) else { call.reject("File is unavailable."); return }
                let share = UIActivityViewController(activityItems: [file], applicationActivities: nil)
                share.popoverPresentationController?.sourceView = controller.view
                share.popoverPresentationController?.sourceRect = CGRect(x: controller.view.bounds.midX, y: controller.view.bounds.midY, width: 1, height: 1)
                controller.present(share, animated: true)
                call.resolve(["success": true, "progressSupported": false])
            }
        }
    }
}
