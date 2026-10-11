import Foundation
import Network
import CryptoKit
import Capacitor
import WebKit

private final class OfflineResource: Codable {
    var url: String
    var name: String
    var kind: String
    var headers: [String: String]
    var depth: Int
    var done = false
    var attempts = 0
    var size: Int64 = 0
    init(url: String, name: String, kind: String, headers: [String: String], depth: Int = 0) {
        self.url = url; self.name = name; self.kind = kind; self.headers = headers; self.depth = depth
    }
}

private final class OfflineJob: Codable {
    var episodeId: String
    var url: String
    var animeName: String
    var animeId: String
    var episodeNumber: Int
    var posterUrl: String?
    var headers: [String: String]
    var subtitles: [OfflineSubtitle]
    var folder: String
    var entry = "media.bin"
    var status = "queued"
    var progress = 0
    var createdAt = Date().timeIntervalSince1970 * 1000
    var completedAt: Double?
    var bytes: Int64 = 0
    var error: String?
    var resources: [OfflineResource] = []
    init(input: [String: Any]) throws {
        guard let id = input["episodeId"] as? String, !id.isEmpty,
              let raw = input["url"] as? String, let upstream = URL(string: raw),
              ["http", "https"].contains(upstream.scheme ?? ""),
              !["127.0.0.1", "localhost"].contains(upstream.host ?? "") else {
            throw DownloadError.invalid("Resolve the original episode stream URL before downloading")
        }
        episodeId = id; url = raw; animeName = input["animeName"] as? String ?? "Anime"
        animeId = input["animeId"] as? String ?? id
        episodeNumber = input["episodeNumber"] as? Int ?? 1
        posterUrl = input["posterUrl"] as? String
        headers = input["headers"] as? [String: String] ?? [:]
        folder = HlsPackage.hash(id)
        subtitles = (input["subtitles"] as? [[String: Any]] ?? []).compactMap { sub in
            guard let raw = sub["url"] as? String, let u = URL(string: raw), ["http", "https"].contains(u.scheme ?? "") else { return nil }
            return OfflineSubtitle(url: raw, lang: sub["lang"] as? String ?? "Unknown", label: sub["label"] as? String,
                                   headers: sub["headers"] as? [String: String] ?? [:], file: HlsPackage.name(raw, playlist: false))
        }
        let ext = upstream.pathExtension.lowercased()
        if ["mp4", "mkv", "webm", "m4v"].contains(ext) { entry = "media.\(ext)" }
        resources = [OfflineResource(url: raw, name: entry, kind: "auto", headers: headers)]
        for sub in subtitles { resources.append(OfflineResource(url: sub.url, name: sub.file, kind: "subtitle", headers: sub.headers)) }
    }
}
private struct OfflineSubtitle: Codable {
    var url: String; var lang: String; var label: String?; var headers: [String: String]; var file: String
}
private enum DownloadError: LocalizedError {
    case invalid(String)
    var errorDescription: String? { if case let .invalid(message) = self { return message }; return nil }
}

/// Keep byte ranges unchanged by saving the full referenced object once. Preserve IVs and timeline tags.
private enum HlsPackage {
    static func hash(_ value: String) -> String { SHA256.hash(data: Data(value.utf8)).map { String(format: "%02x", $0) }.joined() }
    static func name(_ url: String, playlist: Bool) -> String {
        let ext = URL(string: url)?.pathExtension.lowercased() ?? ""
        return hash(url) + (playlist ? ".m3u8" : ["mp4", "mkv", "webm", "m4s", "ts", "aac", "vtt", "srt", "ass", "key"].contains(ext) ? ".\(ext)" : ".bin")
    }
    static func attribute(_ line: String, _ key: String) -> String? {
        guard let re = try? NSRegularExpression(pattern: "(?:[:,])\(key)=(?:\"([^\"]*)\"|([^,]*))"),
              let match = re.firstMatch(in: line, range: NSRange(line.startIndex..., in: line)) else { return nil }
        let group = match.range(at: 1).location == NSNotFound ? 2 : 1
        guard let range = Range(match.range(at: group), in: line) else { return nil }
        return String(line[range])
    }
    static func rewrite(_ text: String, base: URL, headers: [String: String], depth: Int) throws -> (String, [OfflineResource]) {
        guard text.trimmingCharacters(in: .whitespacesAndNewlines).hasPrefix("#EXTM3U") else { throw DownloadError.invalid("Not an HLS playlist") }
        let lines = text.replacingOccurrences(of: "\r", with: "").components(separatedBy: "\n")
        let variants = lines.indices.filter { lines[$0].hasPrefix("#EXT-X-STREAM-INF:") }
        let selected = variants.max { (Int(attribute(lines[$0], "BANDWIDTH") ?? "0") ?? 0) < (Int(attribute(lines[$1], "BANDWIDTH") ?? "0") ?? 0) }
        guard selected != nil || text.contains("#EXT-X-ENDLIST") else { throw DownloadError.invalid("Only completed HLS VOD episodes can be downloaded") }
        var media = Set<Int>()
        if let selected {
            for type in ["AUDIO", "SUBTITLES"] {
                guard let group = attribute(lines[selected], type) else { continue }
                let candidates = lines.indices.filter { lines[$0].hasPrefix("#EXT-X-MEDIA:") && attribute(lines[$0], "TYPE") == type && attribute(lines[$0], "GROUP-ID") == group }
                if let pick = candidates.first(where: { attribute(lines[$0], "DEFAULT") == "YES" }) ?? candidates.first { media.insert(pick) }
            }
        }
        var resources: [OfflineResource] = []; var out: [String] = []; var keepURI = false
        func reference(_ raw: String, playlist: Bool) throws -> String {
            guard let u = URL(string: raw, relativeTo: base)?.absoluteURL, ["http", "https"].contains(u.scheme ?? "") else { throw DownloadError.invalid("Unsupported HLS resource URL") }
            let local = name(u.absoluteString, playlist: playlist)
            if !resources.contains(where: { $0.name == local }) { resources.append(OfflineResource(url: u.absoluteString, name: local, kind: playlist ? "playlist" : "binary", headers: headers, depth: depth + 1)) }
            return local
        }
        let regex = try NSRegularExpression(pattern: "URI=\"([^\"]+)\"")
        for index in lines.indices {
            var line = lines[index].trimmingCharacters(in: .whitespacesAndNewlines)
            if line.hasPrefix("#EXT-X-I-FRAME-STREAM-INF:") { continue }
            if line.hasPrefix("#EXT-X-STREAM-INF:") { keepURI = index == selected; if !keepURI { continue } }
            if selected != nil && line.hasPrefix("#EXT-X-MEDIA:") && !media.contains(index) { continue }
            if line.hasPrefix("#EXT-X-KEY:") || line.hasPrefix("#EXT-X-SESSION-KEY:") {
                let method = attribute(line, "METHOD"), format = attribute(line, "KEYFORMAT")
                guard ["NONE", "AES-128"].contains(method ?? "") && (format == nil || format == "identity") else { throw DownloadError.invalid("Protected HLS streams are not supported for offline downloads") }
            }
            if !line.isEmpty && !line.hasPrefix("#") {
                if selected != nil && !keepURI { continue }
                line = try reference(line, playlist: selected != nil); keepURI = false
            } else {
                let mutable = NSMutableString(string: line)
                let matches = regex.matches(in: line, range: NSRange(location: 0, length: mutable.length))
                for match in matches.reversed() {
                    let raw = mutable.substring(with: match.range(at: 1))
                    mutable.replaceCharacters(in: match.range(at: 1), with: try reference(raw, playlist: line.hasPrefix("#EXT-X-MEDIA:")))
                }
                line = mutable as String
            }
            out.append(line)
        }
        guard !resources.isEmpty else { throw DownloadError.invalid("Playlist has no downloadable resources") }
        return (out.joined(separator: "\n"), resources)
    }
}

/// All scheduling, discovery, progress, and durable state live on this queue, even with no WebView.
final class MobileDownloads: NSObject, URLSessionDownloadDelegate {
    static let shared = MobileDownloads()
    static let sessionID = "app.tatakai.anime-downloads"
    let root = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("offline-anime", isDirectory: true)
    let queue = DispatchQueue(label: "app.tatakai.downloads")
    private var jobs: [OfflineJob] = []
    private var tasks: [String: URLSessionDownloadTask] = [:]
    private var metered = true
    private var networkReady = false
    private var dataSaver = UserDefaults.standard.bool(forKey: "downloads-data-saver")
    private var wifiOnly = UserDefaults.standard.bool(forKey: "downloads-wifi-only")
    private var playback = false
    private var restored = false
    private var lastProgress: [String: TimeInterval] = [:]
    var changed: (([[String: Any]]) -> Void)?
    var completionHandler: (() -> Void)?
    private let monitor = NWPathMonitor()
    private lazy var session: URLSession = {
        let config = URLSessionConfiguration.background(withIdentifier: Self.sessionID)
        config.isDiscretionary = false; config.sessionSendsLaunchEvents = true
        config.waitsForConnectivity = true; config.httpMaximumConnectionsPerHost = 6
        let delegateQueue = OperationQueue(); delegateQueue.maxConcurrentOperationCount = 1; delegateQueue.underlyingQueue = queue
        return URLSession(configuration: config, delegate: self, delegateQueue: delegateQueue)
    }()
    override init() {
        super.init()
        try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        if let data = try? Data(contentsOf: root.appendingPathComponent("jobs.json")), let saved = try? JSONDecoder().decode([OfflineJob].self, from: data) { jobs = saved }
        monitor.pathUpdateHandler = { [weak self] path in self?.queue.async { [weak self] in
            guard let self else { return }; self.metered = path.isExpensive; self.networkReady = path.status == .satisfied; self.schedule()
        }}
        monitor.start(queue: DispatchQueue(label: "app.tatakai.downloads-network"))
        queue.async { self.restore() }
    }
    private func restore() {
        session.getAllTasks { existing in self.queue.async {
            for task in existing {
                if let download = task as? URLSessionDownloadTask, let key = task.taskDescription { self.tasks[key] = download }
            }
            let autoResume = UserDefaults.standard.object(forKey: "downloads-auto-resume") as? Bool ?? true
            for job in self.jobs where job.status == "downloading" || job.status == "queued" {
                job.status = autoResume ? "queued" : "failed"
                if !autoResume { job.error = "Download interrupted; tap Retry to continue saved progress" }
            }
            if !autoResume { for task in self.tasks.values { task.cancel() }; self.tasks.removeAll() }
            self.validateLibrary(); self.restored = true
            self.persist(); self.schedule()
        }}
    }
    func snapshot() -> [[String: Any]] {
        return jobs.map { job in
            var result: [String: Any] = ["episodeId": job.episodeId, "animeId": job.animeId, "animeName": job.animeName,
                "url": job.url, "headers": job.headers,
                "episodeNumber": job.episodeNumber, "folder": job.folder, "entry": job.entry, "status": job.status,
                "progress": job.progress, "bytes": job.bytes,
                "subtitles": job.subtitles.map { sub -> [String: Any] in
                    var value: [String: Any] = ["file": sub.file, "lang": sub.lang]; value["label"] = sub.label; return value
                }]
            result["error"] = job.error; result["posterUrl"] = job.posterUrl; result["completedAt"] = job.completedAt
            return result
        }
    }
    private func persist() {
        do {
            let data = try JSONEncoder().encode(jobs)
            try data.write(to: root.appendingPathComponent("jobs.json"), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            changed?(snapshot())
            for (key, task) in tasks {
                if let job = jobs.first(where: { key.hasPrefix($0.episodeId + "\t") }), ["failed", "cancelled"].contains(job.status) { task.cancel() }
            }
        } catch {
            for job in jobs where job.status == "downloading" || job.status == "queued" { job.status = "failed"; job.error = "Unable to save download state; check available storage" }
            for task in tasks.values { task.cancel() }
            changed?(snapshot())
        }
    }
    func enqueue(_ input: [String: Any]) throws {
        let job = try OfflineJob(input: input)
        if let old = jobs.first(where: { $0.episodeId == job.episodeId }), ["completed", "queued", "downloading"].contains(old.status) { return }
        guard !tasks.keys.contains(where: { $0.hasPrefix(job.episodeId + "\t") }) else { throw DownloadError.invalid("Download is still stopping; retry shortly") }
        jobs.removeAll { $0.episodeId == job.episodeId }; jobs.append(job)
        try FileManager.default.createDirectory(at: root.appendingPathComponent(job.folder), withIntermediateDirectories: true,
                                              attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
        persist(); schedule()
    }
    func cancel(_ id: String) {
        jobs.first { $0.episodeId == id }?.status = "cancelled"; persist()
        for (key, task) in tasks where key.hasPrefix(id + "\t") { task.cancel() }
    }
    func importLegacy(_ input: [String: Any]) throws {
        guard let name = input["name"] as? String, name.range(of: "^[a-zA-Z0-9._-]+$", options: .regularExpression) != nil,
              let id = input["episodeId"] as? String else { throw DownloadError.invalid("Invalid legacy download name") }
        if jobs.contains(where: { $0.episodeId == id }) { return }
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("tatakai/anime").resolvingSymlinksInPath()
        let source = documents.appendingPathComponent(name).resolvingSymlinksInPath()
        guard source.path.hasPrefix(documents.path + "/") else { throw DownloadError.invalid("Invalid legacy path") }
        let values = try source.resourceValues(forKeys: [.isDirectoryKey, .contentModificationDateKey])
        let directory = values.isDirectory == true
        let files = directory ? try FileManager.default.contentsOfDirectory(at: source, includingPropertiesForKeys: [.fileSizeKey, .isRegularFileKey]) : [source]
        var metadata = input; metadata["url"] = "https://legacy.invalid/"; metadata["subtitles"] = []
        let job = try OfflineJob(input: metadata); job.resources = []; job.url = ""
        let dest = root.appendingPathComponent(job.folder); try FileManager.default.createDirectory(at: dest, withIntermediateDirectories: true)
        var entry = directory ? "" : name
        func reference(_ raw: String) throws -> String {
            let local = URL(string: raw)?.lastPathComponent ?? raw
            let file = source.appendingPathComponent(local).resolvingSymlinksInPath()
            guard local.range(of: "^[a-zA-Z0-9._-]+$", options: .regularExpression) != nil,
                  file.path.hasPrefix(source.path + "/"), (try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0 > 0 else { throw DownloadError.invalid("Old episode has missing segments. Download it again from the series page.") }
            return local
        }
        let regex = try NSRegularExpression(pattern: "URI=\"([^\"]+)\"")
        for file in files {
            let values = try file.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
            guard values.isRegularFile == true, (values.fileSize ?? 0) > 0 else { continue }
            let target = dest.appendingPathComponent(file.lastPathComponent)
            if FileManager.default.fileExists(atPath: target.path) { try FileManager.default.removeItem(at: target) }
            if file.pathExtension == "m3u8" {
                let text = try String(contentsOf: file, encoding: .utf8)
                guard text.contains("#EXT-X-ENDLIST") else { throw DownloadError.invalid("Old episode is incomplete. Download it again from the series page.") }
                let rewritten = try text.components(separatedBy: "\n").map { raw -> String in
                    let line = raw.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !line.isEmpty && !line.hasPrefix("#") { return try reference(line) }
                    let mutable = NSMutableString(string: line)
                    for match in regex.matches(in: line, range: NSRange(location: 0, length: mutable.length)).reversed() {
                        mutable.replaceCharacters(in: match.range(at: 1), with: try reference(mutable.substring(with: match.range(at: 1))))
                    }
                    return mutable as String
                }.joined(separator: "\n")
                try Data(rewritten.utf8).write(to: target, options: .atomic); entry = file.lastPathComponent
            } else {
                guard directory || (values.fileSize ?? 0) >= 64 * 1024 else { throw DownloadError.invalid("Old video is incomplete. Download it again from the series page.") }
                try FileManager.default.copyItem(at: file, to: target)
            }
            let r = OfflineResource(url: "", name: file.lastPathComponent, kind: "binary", headers: [:]); r.done = true; r.size = Int64(values.fileSize ?? 0); job.resources.append(r)
            if ["vtt", "srt", "ass"].contains(file.pathExtension) { job.subtitles.append(OfflineSubtitle(url: "", lang: file.deletingPathExtension().lastPathComponent, headers: [:], file: file.lastPathComponent)) }
        }
        guard !entry.isEmpty && FileManager.default.fileExists(atPath: dest.appendingPathComponent(entry).path) else { throw DownloadError.invalid("Old episode has no playable file") }
        job.entry = entry; job.progress = 100; job.status = "completed"; job.bytes = job.resources.reduce(0) { $0 + $1.size }
        job.completedAt = (values.contentModificationDate ?? Date()).timeIntervalSince1970 * 1000
        jobs.append(job); persist()
    }
    func retry(_ id: String) throws {
        guard let job = jobs.first(where: { $0.episodeId == id }) else { throw DownloadError.invalid("Download not found") }
        guard !tasks.keys.contains(where: { $0.hasPrefix(id + "\t") }) else { throw DownloadError.invalid("Download is still stopping; retry shortly") }
        validateLibrary(); job.status = "queued"; job.error = nil
        for r in job.resources { r.attempts = 0 }
        persist(); schedule()
    }
    func remove(_ id: String) throws {
        guard let job = jobs.first(where: { $0.episodeId == id }) else { return }
        guard !tasks.keys.contains(where: { $0.hasPrefix(id + "\t") }) else { throw DownloadError.invalid("Cancel the active download before deleting it") }
        try FileManager.default.removeItem(at: root.appendingPathComponent(job.folder))
        jobs.removeAll { $0.episodeId == id }; persist()
    }
    func configure(dataSaver: Bool, wifiOnly: Bool, autoResume: Bool) {
        self.dataSaver = dataSaver; self.wifiOnly = wifiOnly
        UserDefaults.standard.set(dataSaver, forKey: "downloads-data-saver")
        UserDefaults.standard.set(autoResume, forKey: "downloads-auto-resume")
        UserDefaults.standard.set(wifiOnly, forKey: "downloads-wifi-only"); schedule()
    }
    func setPlayback(_ active: Bool) { queue.async {
        self.playback = active
        // Background tasks keep their durable identity while playback owns the network slots.
        for task in self.tasks.values {
            if active { task.suspend() } else if task.state == .suspended { task.resume() }
        }
        self.schedule()
    } }
    private func validateLibrary() {
        for job in jobs {
            for r in job.resources where r.done {
                let file = root.appendingPathComponent(job.folder).appendingPathComponent(r.name)
                let size = (try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
                if size == 0 || r.size > 0 && Int64(size) != r.size {
                    r.done = false
                    if job.status == "completed" { job.status = "failed"; job.error = "Offline files are missing or incomplete; retry the download" }
                }
            }
        }
    }
    func reconcile() { validateLibrary(); persist(); schedule() }
    func resolve(_ id: String) throws -> [String: Any] {
        validateLibrary()
        guard let job = jobs.first(where: { $0.episodeId == id && $0.status == "completed" }) else { throw DownloadError.invalid("Episode is not downloaded") }
        let file = root.appendingPathComponent(job.folder).appendingPathComponent(job.entry)
        guard FileManager.default.fileExists(atPath: file.path) else { throw DownloadError.invalid("Offline files are missing; retry the download") }
        return ["path": file.absoluteString, "folder": job.folder, "entry": job.entry]
    }
    private func schedule() {
        guard restored && !playback && networkReady && (!wifiOnly || !metered), let job = jobs.first(where: { ["queued", "downloading"].contains($0.status) }) else { return }
        job.status = "downloading"
        let limit = playback || dataSaver ? 1 : metered ? 2 : 6
        for r in job.resources where !r.done && tasks.count < limit {
            let key = job.episodeId + "\t" + r.name
            guard tasks[key] == nil, let url = URL(string: r.url) else { continue }
            var request = URLRequest(url: url); request.timeoutInterval = 30
            if let cookies = HTTPCookieStorage.shared.cookies(for: url) {
                for (name, value) in HTTPCookie.requestHeaderFields(with: cookies) { request.setValue(value, forHTTPHeaderField: name) }
            }
            for (name, value) in r.headers where !["range", "host"].contains(name.lowercased()) { request.setValue(value, forHTTPHeaderField: name) }
            request.setValue("identity", forHTTPHeaderField: "Accept-Encoding")
            let task = session.downloadTask(with: request); task.taskDescription = key
            tasks[key] = task; task.resume()
        }
        persist()
    }
    private func match(_ task: URLSessionTask) -> (OfflineJob, OfflineResource)? {
        guard let parts = task.taskDescription?.components(separatedBy: "\t"), parts.count == 2,
              let job = jobs.first(where: { $0.episodeId == parts[0] }), let r = job.resources.first(where: { $0.name == parts[1] }) else { return nil }
        return (job, r)
    }
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL) {
        guard let (job, r) = match(downloadTask), ["queued", "downloading"].contains(job.status) else { return }
        do {
            guard let response = downloadTask.response as? HTTPURLResponse, response.statusCode == 200 else { throw DownloadError.invalid("HTTP \((downloadTask.response as? HTTPURLResponse)?.statusCode ?? 0) — retry or resolve a fresh episode link") }
            let ct = response.mimeType?.lowercased() ?? ""
            guard !ct.contains("text/html") && !ct.contains("application/json") else { throw DownloadError.invalid("Provider returned an error page instead of video") }
            let size = (try location.resourceValues(forKeys: [.fileSizeKey])).fileSize ?? 0
            guard size > 0 && (response.expectedContentLength < 0 || Int64(size) == response.expectedContentLength) else { throw DownloadError.invalid("Incomplete response; retry the download") }
            let handle = try FileHandle(forReadingFrom: location); let first = handle.readData(ofLength: 512); try handle.close()
            let prefix = String(data: first, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            guard !prefix.lowercased().hasPrefix("<!doctype html") && !prefix.lowercased().hasPrefix("<html") else { throw DownloadError.invalid("Provider blocked the download") }
            let isPlaylist = r.kind == "playlist" || r.kind == "auto" && (ct.contains("mpegurl") || prefix.hasPrefix("#EXTM3U"))
            let dir = root.appendingPathComponent(job.folder)
            if isPlaylist {
                guard r.depth < 8 && size < 16 * 1024 * 1024, let base = response.url else { throw DownloadError.invalid("Playlist is too large or deeply nested") }
                let text = try String(contentsOf: location, encoding: .utf8)
                let (rewritten, refs) = try HlsPackage.rewrite(text, base: base, headers: r.headers, depth: r.depth)
                for ref in refs where !job.resources.contains(where: { $0.name == ref.name }) { job.resources.append(ref) }
                if r.kind == "auto" { r.name = "index.m3u8"; job.entry = r.name }
                try Data(rewritten.utf8).write(to: dir.appendingPathComponent(r.name), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            } else {
                let target = dir.appendingPathComponent(r.name)
                if FileManager.default.fileExists(atPath: target.path) { try FileManager.default.removeItem(at: target) }
                try FileManager.default.moveItem(at: location, to: target)
                try FileManager.default.setAttributes([.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath: target.path)
            }
            r.done = true; r.size = Int64((try dir.appendingPathComponent(r.name).resourceValues(forKeys: [.fileSizeKey])).fileSize ?? 0)
            job.progress = min(99, job.resources.filter { $0.done }.count * 100 / job.resources.count)
            if job.resources.allSatisfy({ $0.done }) {
                for resource in job.resources {
                    let values = try dir.appendingPathComponent(resource.name).resourceValues(forKeys: [.fileSizeKey])
                    guard (values.fileSize ?? 0) > 0 else { throw DownloadError.invalid("Downloaded episode is incomplete") }
                }
                job.bytes = job.resources.reduce(0) { $0 + $1.size }; job.progress = 100; job.status = "completed"
                job.completedAt = Date().timeIntervalSince1970 * 1000
            }
            persist()
        } catch { job.status = "failed"; job.error = error.localizedDescription; persist() }
    }
    func urlSession(_ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64,
                    totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64) {
        guard let (job, resource) = match(downloadTask), job.status == "downloading", resource.kind == "auto", totalBytesExpectedToWrite > 0,
              Date().timeIntervalSince1970 - (lastProgress[job.episodeId] ?? 0) >= 2.5 else { return }
        job.progress = min(99, Int(totalBytesWritten * 100 / totalBytesExpectedToWrite))
        lastProgress[job.episodeId] = Date().timeIntervalSince1970; persist()
    }
    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        if let key = task.taskDescription { tasks.removeValue(forKey: key) }
        if let (job, r) = match(task), ["queued", "downloading"].contains(job.status), let error {
            r.attempts += 1
            if r.attempts >= 3 { job.status = "failed"; job.error = error.localizedDescription }
            else { job.status = "queued" }
            persist()
        }
        schedule()
    }
    func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        let completion = completionHandler; completionHandler = nil
        DispatchQueue.main.async { completion?() }
    }
}

@objc(TatakaiDownloadsPlugin)
public final class TatakaiDownloadsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TatakaiDownloadsPlugin"
    public let jsName = "TatakaiDownloads"
    public let pluginMethods = ["enqueue", "cancel", "retry", "snapshot", "reconcile", "remove", "configure", "resolvePlayback", "importLegacy"].map { CAPPluginMethod(name: $0, returnType: CAPPluginReturnPromise) }
    private let downloads = MobileDownloads.shared
    public override func load() {
        downloads.queue.async { self.downloads.changed = { [weak self] jobs in self?.notifyListeners("downloadsChanged", data: ["jobs": jobs]) } }
    }
    private func perform(_ call: CAPPluginCall, _ action: @escaping () throws -> [String: Any]) {
        downloads.queue.async { do { call.resolve(try action()) } catch { call.reject(error.localizedDescription) } }
    }
    @objc func enqueue(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let store = self.bridge?.webView?.configuration.websiteDataStore.httpCookieStore else {
                self.perform(call) { try self.downloads.enqueue(call.options as? [String: Any] ?? [:]); return ["success": true] }
                return
            }
            store.getAllCookies { cookies in
                for cookie in cookies { HTTPCookieStorage.shared.setCookie(cookie) }
                self.perform(call) { try self.downloads.enqueue(call.options as? [String: Any] ?? [:]); return ["success": true] }
            }
        }
    }
    @objc func cancel(_ call: CAPPluginCall) { perform(call) { self.downloads.cancel(call.getString("episodeId") ?? ""); return [:] } }
    @objc func importLegacy(_ call: CAPPluginCall) { perform(call) { try self.downloads.importLegacy(call.options as? [String: Any] ?? [:]); return [:] } }
    @objc func retry(_ call: CAPPluginCall) { perform(call) { try self.downloads.retry(call.getString("episodeId") ?? ""); return [:] } }
    @objc func snapshot(_ call: CAPPluginCall) { perform(call) { ["jobs": self.downloads.snapshot()] } }
    @objc func reconcile(_ call: CAPPluginCall) { perform(call) { self.downloads.reconcile(); return ["jobs": self.downloads.snapshot()] } }
    @objc func remove(_ call: CAPPluginCall) { perform(call) { try self.downloads.remove(call.getString("episodeId") ?? ""); return [:] } }
    @objc func configure(_ call: CAPPluginCall) { perform(call) { self.downloads.configure(dataSaver: call.getBool("dataSaver") ?? false, wifiOnly: call.getBool("wifiOnly") ?? false, autoResume: call.getBool("autoResume") ?? true); return [:] } }
    @objc func resolvePlayback(_ call: CAPPluginCall) { perform(call) { try self.downloads.resolve(call.getString("episodeId") ?? "") } }
}
