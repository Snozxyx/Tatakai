package app.tatakai.me.torrent;

import android.os.Build;
import android.util.Log;

import androidx.annotation.Nullable;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.libtorrent4j.FileStorage;
import org.libtorrent4j.InfoHash;
import org.libtorrent4j.Priority;
import org.libtorrent4j.SessionManager;
import org.libtorrent4j.Sha1Hash;
import org.libtorrent4j.TorrentHandle;
import org.libtorrent4j.TorrentInfo;
import org.libtorrent4j.TorrentStatus;
import org.libtorrent4j.swig.add_torrent_params;
import org.libtorrent4j.swig.error_code;
import org.libtorrent4j.swig.libtorrent;

import java.io.BufferedOutputStream;
import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.RandomAccessFile;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Android-only Capacitor torrent service.
 *
 * libtorrent4j currently supports Android API 28+. Its local HTTP server is
 * bound to loopback and accepts only session-tokened paths, so JavaScript never
 * receives an arbitrary local path or a network-reachable file server.
 */
@CapacitorPlugin(name = "TatakaiTorrent")
public class TatakaiTorrentPlugin extends Plugin {
    private static final String TAG = "TatakaiTorrent";
    private static final long METADATA_WAIT_MS = 20_000L;
    // How long a range request at the download frontier waits for its full
    // chunk. Bounds client threads from holding 20s of dead time per byte-range.
    private static final long STREAM_EDGE_WAIT_MS = 6_000L;
    // 2 MB (was 6 MB): playback starts after the first片 instead of waiting
    // for a large window on slow swarms. Sequential prioritization keeps the
    // frontier ahead once playback begins.
    private static final long PREBUFFER_BYTES = 2L * 1024L * 1024L;
    // ExoPlayer streams via many sequential range requests; a 2 MB cap with
    // `Connection: close` forced a reconnect every couple of seconds and made
    // playback stutter on slower swarms. 8 MB is still small enough for the
    // WebView <video> path (which pages the same server) while cutting native
    // reconnects ~4x. Only used near the live edge — ranges fully inside
    // already-downloaded data are served contiguously (see LocalStreamServer).
    private static final long STREAM_CHUNK_BYTES = 8L * 1024L * 1024L;

    // The WebView page runs at https://localhost, which is cross-origin to this
    // loopback server, and the <video crossorigin="anonymous"> element fetches
    // the stream in CORS mode. Without Access-Control-Allow-Origin, Chromium
    // rejects every response and the video never loads (no error toast, no
    // crash) — mirror the streaming proxy's permissive policy so playback works.
    private static final String CORS_HEADERS =
        "Access-Control-Allow-Origin: *\r\n"
        + "Access-Control-Allow-Methods: GET, OPTIONS\r\n"
        + "Access-Control-Allow-Headers: Range\r\n"
        + "Access-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges\r\n";

    // Default public trackers injected when a magnet carries none (mirrors the
    // desktop session-manager EXTRA_TRACKERS). Magnets without `tr=` params
    // depend on DHT-only discovery, which is slow on mobile networks — a
    // tracker boost is the main fix for "torrent is slow on mobile".
    private static final String[] DEFAULT_TRACKERS = {
        "udp://tracker.opentrackr.org:1337/announce",
        "udp://open.stealth.si:80/announce",
        "udp://tracker.torrent.eu.org:451/announce",
        "udp://exodus.desync.com:6969/announce",
        "udp://tracker.moeking.me:6969/announce",
        "udp://tracker.bitsearch.to:1337/announce",
        "udp://explodie.org:6969/announce",
        "udp://open.demonii.com:1337/announce",
        "udp://tracker.cyberia.is:6969/announce",
        "udp://ipv4.tracker.harry.lu:80/announce",
        "http://tracker.gbitt.info:80/announce",
        "http://tracker.ipv6tracker.ru:80/announce",
    };

    private final Object managerLock = new Object();
    private final Map<String, TorrentSession> sessions = new ConcurrentHashMap<>();
    // getStreamUrl/ensurePrebuffer block up to METADATA_WAIT_MS waiting for
    // metadata/pieces. On a single-thread executor that wait head-of-line
    // blocked every other call — stopSession/listSessions/getPeers all stalled
    // behind it, so the UI froze with no feedback whenever metadata was slow
    // (dead trackers, no seeders). A small pool keeps control calls responsive
    // while blocking waits are in flight.
    private final ExecutorService pluginExecutor = Executors.newFixedThreadPool(4);
    private final ScheduledExecutorService progressExecutor = Executors.newSingleThreadScheduledExecutor();

    @Nullable private volatile SessionManager manager;
    @Nullable private volatile LocalStreamServer streamServer;
    private volatile boolean progressPumpStarted = false;

    @PluginMethod
    public void addMagnet(PluginCall call) {
        run(call, () -> {
            String source = call.getString("magnet", "").trim();
            Integer preferredFileIndex = call.getInt("fileIndex");
            if (source.isEmpty()) return failure("A magnet URI or 40-character info hash is required.");

            ParsedMagnet parsed = parseMagnet(source);
            SessionManager active = requireManager();
            for (TorrentSession existing : sessions.values()) {
                if (existing.infoHash.equalsIgnoreCase(parsed.infoHash)) {
                    if (preferredFileIndex != null) existing.preferredFileIndex = preferredFileIndex;
                    return started(existing);
                }
            }

            File store = new File(torrentRoot(), parsed.infoHash);
            if (!store.exists() && !store.mkdirs()) {
                return failure("Unable to create the private torrent storage directory.");
            }
            active.download(parsed.magnet, store, libtorrent.getDefault_flags());

            TorrentSession session = new TorrentSession(
                UUID.randomUUID().toString(), parsed.infoHash, parsed.hash, store, preferredFileIndex
            );
            sessions.put(session.sessionId, session);
            return started(session);
        });
    }

    @PluginMethod
    public void getStreamUrl(PluginCall call) {
        run(call, () -> {
            TorrentSession session = requireSession(call.getString("sessionId", ""));
            SelectedFile file = waitForSelectedFile(session, call.getInt("fileIndex"), METADATA_WAIT_MS);
            if (file == null) return failure("metadata_not_ready");

            JSObject result = success();
            result.put("url", requireStreamServer().urlFor(session.sessionId));
            result.put("name", file.file.getName());
            result.put("length", file.length);
            result.put("fileIndex", file.index);
            result.put("infoHash", session.infoHash);
            return result;
        });
    }

    @PluginMethod
    public void getPeers(PluginCall call) {
        run(call, () -> {
            TorrentStatus status = requireHandle(requireSession(call.getString("sessionId", ""))).status();
            JSObject result = success();
            result.put("seeders", status.numSeeds());
            result.put("leechers", status.numIncomplete());
            result.put("numPeers", status.numPeers());
            return result;
        });
    }

    @PluginMethod
    public void ensurePrebuffer(PluginCall call) {
        run(call, () -> {
            TorrentSession session = requireSession(call.getString("sessionId", ""));
            SelectedFile file = waitForSelectedFile(session, call.getInt("fileIndex"), METADATA_WAIT_MS);
            if (file == null) return failure("metadata_not_ready");

            long required = Math.min(file.length, PREBUFFER_BYTES);
            boolean ready = waitForAvailable(session, required, METADATA_WAIT_MS) >= required;
            JSObject result = success();
            result.put("ready", ready);
            if (!ready) result.put("error", "prebuffer_pending");
            return result;
        });
    }

    @PluginMethod
    public void stopSession(PluginCall call) {
        run(call, () -> {
            TorrentSession session = sessions.remove(call.getString("sessionId", ""));
            if (session == null) return failure("session_not_found");
            removeFromEngine(session);
            if (call.getBoolean("destroyStore", false)) deleteRecursively(session.store);
            return success();
        });
    }

    @PluginMethod
    public void listSessions(PluginCall call) {
        run(call, () -> {
            JSArray list = new JSArray();
            for (TorrentSession session : sessions.values()) {
                JSObject item = new JSObject();
                item.put("sessionId", session.sessionId);
                item.put("infoHash", session.infoHash);
                item.put("name", session.selectedFile == null ? "" : session.selectedFile.file.getName());
                item.put("fileIndex", session.selectedFile == null ? -1 : session.selectedFile.index);
                item.put("progress", currentProgress(session));
                list.put(item);
            }
            JSObject result = success();
            result.put("sessions", list);
            return result;
        });
    }

    @PluginMethod
    public void clearAll(PluginCall call) {
        run(call, () -> {
            for (TorrentSession session : new ArrayList<>(sessions.values())) {
                sessions.remove(session.sessionId);
                removeFromEngine(session);
                // Store is generated from a validated info hash under app-private storage.
                deleteRecursively(session.store);
            }
            return success();
        });
    }

    private void run(PluginCall call, Task task) {
        pluginExecutor.execute(() -> {
            try {
                call.resolve(task.execute());
            } catch (IllegalArgumentException error) {
                call.resolve(failure(error.getMessage()));
            } catch (Throwable error) {
                Log.e(TAG, "Torrent plugin failure", error);
                call.resolve(failure(error.getMessage() == null ? "Torrent service failed." : error.getMessage()));
            }
        });
    }

    private SessionManager requireManager() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) {
            throw new IllegalArgumentException("Android torrent streaming requires Android 9 (API 28) or newer.");
        }
        SessionManager active = manager;
        if (active != null) return active;

        synchronized (managerLock) {
            if (manager == null) {
                SessionManager created = new SessionManager();
                created.start();
                created.startDht();
                manager = created;
                if (!progressPumpStarted) {
                    progressPumpStarted = true;
                    progressExecutor.scheduleWithFixedDelay(this::emitProgress, 1, 1, TimeUnit.SECONDS);
                }
            }
            return manager;
        }
    }

    private File torrentRoot() {
        // Torrent data MUST live on internal storage. libtorrent4j keeps the media
        // file open for the entire streaming session, and Android's vold volume
        // maintenance (fstrim / idle maintenance) kills any process holding an open
        // fd on the emulated/FUSE external volume — observed in logcat as
        //   vold: Found symlink /proc/<pid>/fd/.. referencing /storage/emulated/0/...
        //   vold: Sending Interrupt to pid <pid>
        // followed by the process dying from signal 2 (Interrupt). getExternalFilesDir
        // resolves there, so streaming a torrent reliably crashed the app a few seconds
        // after playback began. getFilesDir() (/data/data/<pkg>/files) is private
        // internal storage that vold never touches, so the open fd survives.
        File root = new File(getContext().getFilesDir(), "torrents");
        if (!root.exists() && !root.mkdirs()) throw new IllegalArgumentException("Unable to initialise torrent storage.");
        return root;
    }

    /**
     * Append default public trackers when a magnet carries none (or when only
     * an info hash was supplied). Idempotent: magnets that already carry
     * `tr=` params are returned unchanged.
     */
    private String withDefaultTrackers(String source) {
        if (source == null) return "";
        String trimmed = source.trim();
        try {
            if (!trimmed.regionMatches(true, 0, "magnet:", 0, 7)) {
                String hash = trimmed;
                if (!hash.matches("(?i)[a-f0-9]{40}")) return trimmed;
                StringBuilder sb = new StringBuilder("magnet:?xt=urn:btih:").append(hash);
                for (String tr : DEFAULT_TRACKERS) {
                    sb.append("&tr=").append(java.net.URLEncoder.encode(tr, "UTF-8"));
                }
                return sb.toString();
            }
            if (trimmed.toLowerCase(Locale.US).contains("&tr=") || trimmed.toLowerCase(Locale.US).contains("?tr=")) {
                return trimmed;
            }
            StringBuilder sb = new StringBuilder(trimmed);
            String sep = trimmed.contains("?") ? "&" : "?";
            // Ensure an xt param exists before appending trackers.
            if (!trimmed.toLowerCase(Locale.US).contains("xt=")) return trimmed;
            for (String tr : DEFAULT_TRACKERS) {
                sb.append(sep).append("tr=").append(java.net.URLEncoder.encode(tr, "UTF-8"));
                sep = "&";
            }
            return sb.toString();
        } catch (Exception e) {
            return trimmed;
        }
    }

    private ParsedMagnet parseMagnet(String source) {
        String magnet = withDefaultTrackers(source);
        if (!source.regionMatches(true, 0, "magnet:", 0, 7)) {
            String hash = source.trim();
            if (!hash.matches("(?i)[a-f0-9]{40}")) throw new IllegalArgumentException("Invalid magnet URI or info hash.");
            magnet = "magnet:?xt=urn:btih:" + hash;
        }

        error_code error = new error_code();
        add_torrent_params params = libtorrent.parse_magnet_uri(magnet, error);
        if (error.failed()) throw new IllegalArgumentException("Invalid magnet: " + error.message());
        InfoHash infoHash = new InfoHash(params.getInfo_hashes());
        Sha1Hash hash = infoHash.getBest();
        if (hash == null || hash.isAllZeros()) throw new IllegalArgumentException("This torrent has no supported v1 info hash.");
        return new ParsedMagnet(magnet, hash, hash.toHex().toLowerCase(Locale.US));
    }

    @Nullable
    private SelectedFile waitForSelectedFile(TorrentSession session, @Nullable Integer requestedIndex, long timeoutMs) {
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (System.currentTimeMillis() < deadline) {
            try {
                TorrentHandle handle = requireHandle(session);
                if (handle.status().hasMetadata()) return selectFile(session, handle, requestedIndex);
            } catch (IllegalArgumentException ignored) {
                // The handle may take a moment to appear after add_torrent.
            }
            sleep(250L);
        }
        return null;
    }

    private SelectedFile selectFile(TorrentSession session, TorrentHandle handle, @Nullable Integer requestedIndex) {
        TorrentInfo info = handle.torrentFile();
        FileStorage files = info.files();
        int count = files.numFiles();
        if (count <= 0) throw new IllegalArgumentException("Torrent metadata has no files.");

        Integer preferred = requestedIndex != null ? requestedIndex : session.preferredFileIndex;
        int chosen = preferred != null && preferred >= 0 && preferred < count ? preferred : findLargestMediaFile(files);
        if (chosen < 0) throw new IllegalArgumentException("No playable file was found in this torrent.");
        if (session.selectedFile != null && session.selectedFile.index == chosen) return session.selectedFile;

        File safeFile = fileInsideStore(session.store, files.filePath(chosen));
        long length = files.fileSize(chosen);
        Priority[] priorities = Priority.array(Priority.IGNORE, count);
        priorities[chosen] = Priority.TOP_PRIORITY;
        handle.prioritizeFiles(priorities);
        handle.setSequentialRange(Math.max(0, files.pieceIndexAtFile(chosen)));

        SelectedFile selected = new SelectedFile(chosen, safeFile, length);
        session.selectedFile = selected;
        session.preferredFileIndex = chosen;
        return selected;
    }

    private int findLargestMediaFile(FileStorage files) {
        int fallback = -1;
        long fallbackSize = -1L;
        int media = -1;
        long mediaSize = -1L;
        for (int index = 0; index < files.numFiles(); index++) {
            long size = files.fileSize(index);
            if (size > fallbackSize) {
                fallback = index;
                fallbackSize = size;
            }
            if (isVideoFile(files.fileName(index)) && size > mediaSize) {
                media = index;
                mediaSize = size;
            }
        }
        return media >= 0 ? media : fallback;
    }

    private boolean isVideoFile(String name) {
        String lower = name.toLowerCase(Locale.US);
        return lower.endsWith(".mkv") || lower.endsWith(".mp4") || lower.endsWith(".m4v")
            || lower.endsWith(".webm") || lower.endsWith(".avi") || lower.endsWith(".mov")
            || lower.endsWith(".ts") || lower.endsWith(".mpeg") || lower.endsWith(".mpg");
    }

    private File fileInsideStore(File store, String relativePath) {
        try {
            File root = store.getCanonicalFile();
            File candidate = new File(root, relativePath).getCanonicalFile();
            if (!candidate.getPath().startsWith(root.getPath() + File.separator)) {
                throw new IllegalArgumentException("Torrent metadata points outside private storage.");
            }
            return candidate;
        } catch (IOException error) {
            throw new IllegalArgumentException("Unable to resolve the torrent file path.");
        }
    }

    private TorrentSession requireSession(String id) {
        TorrentSession session = sessions.get(id);
        if (session == null) throw new IllegalArgumentException("session_not_found");
        return session;
    }

    private TorrentHandle requireHandle(TorrentSession session) {
        TorrentHandle handle = requireManager().find(session.hash);
        if (handle == null || !handle.isValid()) throw new IllegalArgumentException("session_not_found");
        return handle;
    }

    private void removeFromEngine(TorrentSession session) {
        try {
            requireManager().remove(requireHandle(session));
        } catch (Throwable ignored) {
            // Libtorrent may already have removed a stopped session.
        }
    }

    private long availableBytes(TorrentSession session) {
        SelectedFile file = session.selectedFile;
        if (file == null || !file.file.exists()) return 0L;
        try {
            long[] progress = requireHandle(session).fileProgress();
            if (file.index >= 0 && file.index < progress.length) {
                return Math.min(file.length, Math.max(0L, progress[file.index]));
            }
        } catch (Throwable ignored) {
            // Session stopped while a range was being served.
        }
        return 0L;
    }

    private long waitForAvailable(TorrentSession session, long requiredExclusive, long timeoutMs) {
        long deadline = System.currentTimeMillis() + timeoutMs;
        long available = availableBytes(session);
        while (available < requiredExclusive && System.currentTimeMillis() < deadline) {
            sleep(150L);
            available = availableBytes(session);
        }
        return available;
    }

    private double currentProgress(TorrentSession session) {
        try {
            return requireHandle(session).status().progress();
        } catch (Throwable ignored) {
            return 0D;
        }
    }

    private LocalStreamServer requireStreamServer() {
        LocalStreamServer current = streamServer;
        if (current != null) return current;
        synchronized (managerLock) {
            if (streamServer == null) {
                try {
                    streamServer = new LocalStreamServer(this::streamSourceFor);
                    streamServer.start();
                } catch (IOException error) {
                    throw new IllegalArgumentException("Unable to start the local torrent stream server.");
                }
            }
            return streamServer;
        }
    }

    @Nullable
    private StreamSource streamSourceFor(String sessionId) {
        TorrentSession session = sessions.get(sessionId);
        if (session == null || session.selectedFile == null) return null;
        return new StreamSource(session, session.selectedFile);
    }

    private void emitProgress() {
        for (TorrentSession session : sessions.values()) {
            try {
                TorrentStatus status = requireHandle(session).status();
                JSObject event = new JSObject();
                event.put("sessionId", session.sessionId);
                event.put("infoHash", session.infoHash);
                event.put("progress", status.progress());
                event.put("downloadSpeed", status.downloadRate());
                event.put("uploadSpeed", status.uploadRate());
                event.put("numPeers", status.numPeers());
                event.put("seeders", status.numSeeds());
                event.put("done", status.isFinished());
                if (session.selectedFile != null) event.put("name", session.selectedFile.file.getName());
                notifyListeners("torrentProgress", event);
            } catch (Throwable ignored) {
                // A starting or stopped session will be retried on the next tick.
            }
        }
    }

    private JSObject success() {
        JSObject object = new JSObject();
        object.put("success", true);
        return object;
    }

    private JSObject failure(String message) {
        JSObject object = new JSObject();
        object.put("success", false);
        object.put("error", message == null ? "Torrent service failed." : message);
        return object;
    }

    private JSObject started(TorrentSession session) {
        JSObject result = success();
        result.put("sessionId", session.sessionId);
        result.put("infoHash", session.infoHash);
        return result;
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
        }
    }

    private static void deleteRecursively(File target) {
        if (!target.exists()) return;
        File[] children = target.listFiles();
        if (children != null) for (File child : children) deleteRecursively(child);
        if (!target.delete()) Log.w(TAG, "Could not delete " + target.getAbsolutePath());
    }

    private interface Task { JSObject execute(); }

    private interface StreamSourceResolver { @Nullable StreamSource resolve(String sessionId); }

    private static final class ParsedMagnet {
        final String magnet;
        final Sha1Hash hash;
        final String infoHash;

        ParsedMagnet(String magnet, Sha1Hash hash, String infoHash) {
            this.magnet = magnet;
            this.hash = hash;
            this.infoHash = infoHash;
        }
    }

    private static final class TorrentSession {
        final String sessionId;
        final String infoHash;
        final Sha1Hash hash;
        final File store;
        @Nullable volatile Integer preferredFileIndex;
        @Nullable volatile SelectedFile selectedFile;

        TorrentSession(String sessionId, String infoHash, Sha1Hash hash, File store, @Nullable Integer preferredFileIndex) {
            this.sessionId = sessionId;
            this.infoHash = infoHash;
            this.hash = hash;
            this.store = store;
            this.preferredFileIndex = preferredFileIndex;
        }
    }

    private static final class SelectedFile {
        final int index;
        final File file;
        final long length;

        SelectedFile(int index, File file, long length) {
            this.index = index;
            this.file = file;
            this.length = length;
        }
    }

    private static final class StreamSource {
        final TorrentSession session;
        final SelectedFile file;

        StreamSource(TorrentSession session, SelectedFile file) {
            this.session = session;
            this.file = file;
        }
    }

    /** Minimal loopback-only HTTP range server for Android WebView media. */
    private final class LocalStreamServer {
        private final StreamSourceResolver resolver;
        private final ExecutorService clients = Executors.newCachedThreadPool();
        @Nullable private volatile ServerSocket socket;

        LocalStreamServer(StreamSourceResolver resolver) { this.resolver = resolver; }

        void start() throws IOException {
            socket = new ServerSocket(0, 16, InetAddress.getByName("127.0.0.1"));
            Thread acceptThread = new Thread(this::acceptLoop, "tatakai-torrent-http");
            acceptThread.setDaemon(true);
            acceptThread.start();
        }

        String urlFor(String sessionId) {
            ServerSocket active = socket;
            if (active == null) throw new IllegalArgumentException("Local stream server is unavailable.");
            return "http://127.0.0.1:" + active.getLocalPort() + "/stream/" + sessionId;
        }

        private void acceptLoop() {
            while (true) {
                try {
                    ServerSocket active = socket;
                    if (active == null || active.isClosed()) return;
                    Socket client = active.accept();
                    if (!client.getInetAddress().isLoopbackAddress()) {
                        client.close();
                        continue;
                    }
                    clients.execute(() -> serve(client));
                } catch (IOException error) {
                    return;
                }
            }
        }

        private void serve(Socket socket) {
            try (Socket client = socket;
                 BufferedReader reader = new BufferedReader(new InputStreamReader(client.getInputStream(), StandardCharsets.US_ASCII));
                 BufferedOutputStream output = new BufferedOutputStream(client.getOutputStream())) {
                String request = reader.readLine();
                if (request == null) return;
                String range = null;
                String line;
                while ((line = reader.readLine()) != null && !line.isEmpty()) {
                    int colon = line.indexOf(':');
                    if (colon > 0 && "range".equalsIgnoreCase(line.substring(0, colon).trim())) {
                        range = line.substring(colon + 1).trim();
                    }
                }

                String[] parts = request.split(" ");
                if (parts.length >= 1 && "OPTIONS".equals(parts[0])) {
                    writeNoContent(output);
                    return;
                }
                if (parts.length < 2 || !"GET".equals(parts[0]) || !parts[1].startsWith("/stream/")) {
                    writeError(output, 404, "Not Found");
                    return;
                }
                StreamSource source = resolver.resolve(parts[1].substring("/stream/".length()));
                if (source == null) {
                    writeError(output, 404, "Not Found");
                    return;
                }
                long[] requested = parseRange(range, source.file.length);
                if (requested == null) {
                    writeRangeNotSatisfiable(output, source.file.length);
                    return;
                }
                long start = requested[0];
                long available = waitForAvailable(source.session, Math.min(source.file.length, start + 1L), METADATA_WAIT_MS);
                if (available <= start) {
                    writeError(output, 503, "Torrent data is buffering");
                    return;
                }

                // Ranges fully inside downloaded data are served contiguously:
                // the old unconditional 8 MB cap made every backward seek jump
                // 8 MiB early and stall mid-copy. The cap only applies near the
                // live edge, where the requested end is not downloaded yet.
                long end;
                if (requested[1] <= available - 1L) {
                    end = requested[1];
                } else {
                    end = Math.min(requested[1], Math.min(source.file.length - 1L, start + STREAM_CHUNK_BYTES - 1L));
                    // Wait for the (capped) end rather than truncating to
                    // whatever exists now, so the copy never reads sparse zeros
                    // and the client does not have to re-request the same bytes.
                    long reached = waitForAvailable(source.session, Math.min(source.file.length, end + 1L), STREAM_EDGE_WAIT_MS);
                    end = Math.min(end, Math.max(start, reached - 1L));
                }
                if (end < start) {
                    writeError(output, 503, "Torrent data is buffering");
                    return;
                }

                long count = end - start + 1L;
                String headers = "HTTP/1.1 206 Partial Content\r\n"
                    + "Content-Type: " + contentType(source.file.file.getName()) + "\r\n"
                    + "Accept-Ranges: bytes\r\n"
                    + "Content-Length: " + count + "\r\n"
                    + "Content-Range: bytes " + start + "-" + end + "/" + source.file.length + "\r\n"
                    + CORS_HEADERS
                    + "Cache-Control: no-store\r\nConnection: close\r\n\r\n";
                output.write(headers.getBytes(StandardCharsets.US_ASCII));

                try (RandomAccessFile file = new RandomAccessFile(source.file.file, "r")) {
                    file.seek(start);
                    byte[] buffer = new byte[32 * 1024];
                    long remaining = count;
                    while (remaining > 0) {
                        int read = file.read(buffer, 0, (int) Math.min(buffer.length, remaining));
                        if (read < 0) break;
                        output.write(buffer, 0, read);
                        remaining -= read;
                    }
                }
                output.flush();
            } catch (IOException ignored) {
                // Video seeks commonly cancel a pending range request.
            }
        }

        @Nullable
        private long[] parseRange(@Nullable String range, long length) {
            if (length <= 0) return null;
            if (range == null || !range.startsWith("bytes=")) return new long[] { 0L, length - 1L };
            try {
                String value = range.substring("bytes=".length()).split(",")[0].trim();
                String[] bounds = value.split("-", 2);
                long start = bounds[0].isEmpty() ? 0L : Long.parseLong(bounds[0]);
                long end = bounds.length < 2 || bounds[1].isEmpty() ? length - 1L : Long.parseLong(bounds[1]);
                if (start < 0 || start >= length || end < start) return null;
                return new long[] { start, Math.min(end, length - 1L) };
            } catch (NumberFormatException error) {
                return null;
            }
        }

        private void writeError(BufferedOutputStream output, int status, String message) throws IOException {
            String body = message + "\n";
            String headers = "HTTP/1.1 " + status + " " + message + "\r\nContent-Type: text/plain\r\n"
                + "Content-Length: " + body.getBytes(StandardCharsets.US_ASCII).length + "\r\n"
                + CORS_HEADERS
                + "Retry-After: 1\r\nConnection: close\r\n\r\n";
            output.write(headers.getBytes(StandardCharsets.US_ASCII));
            output.write(body.getBytes(StandardCharsets.US_ASCII));
            output.flush();
        }

        private void writeNoContent(BufferedOutputStream output) throws IOException {
            String headers = "HTTP/1.1 204 No Content\r\n"
                + CORS_HEADERS
                + "Content-Length: 0\r\nConnection: close\r\n\r\n";
            output.write(headers.getBytes(StandardCharsets.US_ASCII));
            output.flush();
        }

        private void writeRangeNotSatisfiable(BufferedOutputStream output, long length) throws IOException {
            String headers = "HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */" + length
                + "\r\n" + CORS_HEADERS + "Connection: close\r\n\r\n";
            output.write(headers.getBytes(StandardCharsets.US_ASCII));
            output.flush();
        }

        private String contentType(String name) {
            String lower = name.toLowerCase(Locale.US);
            if (lower.endsWith(".mp4") || lower.endsWith(".m4v")) return "video/mp4";
            if (lower.endsWith(".webm")) return "video/webm";
            if (lower.endsWith(".ts")) return "video/mp2t";
            if (lower.endsWith(".mkv")) return "video/x-matroska";
            return "application/octet-stream";
        }
    }
}
