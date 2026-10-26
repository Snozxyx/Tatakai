package app.tatakai.me.proxy;

import android.content.Context;
import android.util.Log;

import app.tatakai.me.security.AdHosts;
import app.tatakai.me.security.CloudflareBypass;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.BufferedInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.RandomAccessFile;
import java.net.HttpURLConnection;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URL;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.Set;

/**
 * TatakaiLocalProxy — Android loopback media proxy, native counterpart to
 * {@code desktop/runtime/proxy/local-proxy-server.cjs} ({@code LocalProxyServer}).
 *
 * Desktop registers every header-gated URL (anime HLS/MP4 + subtitle tracks +
 * manga page images + anime/manga download assets) with a loopback HTTP server
 * and hands the renderer {@code http://127.0.0.1:<port>/stream/<token>} URLs.
 * The server replays the exact {@code Referer}/{@code User-Agent} the CDN
 * demands, rewrites {@code .m3u8} child references to fresh tokens, and answers
 * with {@code Access-Control-Allow-Origin: *} so the WebView can load everything
 * with a plain {@code <video>} / {@code <img>} / {@code fetch} — no full-file
 * blob download, no per-segment JS bridge.
 *
 * The previous mobile path ({@code mobileProxy.ts} {@code mobile-proxy://} +
 * {@code CapacitorHttp} per segment) works but pays a JS-bridge hop per HLS
 * segment and must blob-download whole MP4s before {@code video.src} can be
 * set — the "server comes late / video freezes" symptom. This plugin removes
 * both: once {@code ensureStarted} returns a base URL, the JS registry mints
 * the same 32-hex tokens locally and mirrors them here, so playback is a plain
 * HTTP load against loopback with Range + playlist rewrite handled natively.
 *
 * Bound to 127.0.0.1 only (ephemeral port). Only loopback clients are served;
 * non-loopback sockets are closed immediately, same as the torrent
 * {@code LocalStreamServer} in {@code TatakaiTorrentPlugin}.
 */
@CapacitorPlugin(name = "TatakaiLocalProxy")
public class TatakaiLocalProxyPlugin extends Plugin {
    @PluginMethod public void unregisterSource(PluginCall call) {
        String token = call.getString("token", "");
        if (token != null && token.matches("[a-f0-9]{32}")) tokenMap.remove(token);
        call.resolve();
    }
    private static final String TAG = "TatakaiLocalProxy";
    private static final long TOKEN_TTL_MS = 15L * 60L * 1000L;
    private static final String DEFAULT_UA =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
    private static final int UPSTREAM_TIMEOUT_MS = 18_000;
    private static final int TOKEN_REGISTRATION_GRACE_MS = 2_000;
    private static final int STREAM_BUFFER_SIZE = 64 * 1024;

    private static final String CORS_HEADERS =
        "Access-Control-Allow-Origin: *\r\n"
        + "Access-Control-Allow-Methods: GET, HEAD, POST, OPTIONS\r\n"
        + "Access-Control-Allow-Headers: Range, Content-Type, Accept, Origin, Authorization, X-Requested-With\r\n"
        // The WebView document uses the public https://tatakai.me origin while
        // this server is in Chromium's local address space. Newer WebView PNA
        // preflights require this explicit grant before hls.js may issue GETs.
        + "Access-Control-Allow-Private-Network: true\r\n"
        + "Access-Control-Expose-Headers: *\r\n"
        + "Access-Control-Max-Age: 86400\r\n"
        + "Cross-Origin-Resource-Policy: cross-origin\r\n";

    private final Object serverLock = new Object();
    private volatile ProxyServer server;
    private final Map<String, ProxyEntry> tokenMap = new ConcurrentHashMap<>();
    private final Object tokenRegistrationSignal = new Object();
    private final ExecutorService apiExecutor = Executors.newFixedThreadPool(2);
    private final SecureRandom secureRandom = new SecureRandom();
    private final Set<String> peerSources = ConcurrentHashMap.newKeySet();
    private final Map<String, PeerMediaRequest> peerRequests = new ConcurrentHashMap<>();
    private static final int PEER_BLOCK_LIMIT = 1024 * 1024;

    private static final class PeerMediaRequest {
        final String token;
        final ArrayBlockingQueue<PeerMediaReply> replies = new ArrayBlockingQueue<>(1);
        PeerMediaRequest(String token) { this.token = token; }
    }
    private static final class PeerMediaReply {
        final PluginCall acknowledgement;
        final int status;
        final JSObject headers;
        final byte[] body;
        final boolean last;
        PeerMediaReply(PluginCall call, int status, JSObject headers, byte[] body, boolean last) {
            this.acknowledgement = call; this.status = status; this.headers = headers; this.body = body; this.last = last;
        }
    }

    /** Opaque, loopback-only capability; resources are resolved by the room's JS transport. */
    @PluginMethod public void registerPeerSource(PluginCall call) {
        apiExecutor.execute(() -> {
            if (peerSources.size() >= 4) { call.reject("Too many active watchroom media sources"); return; }
            try {
                String token = mintToken();
                String base = requireServer().baseUrl();
                peerSources.add(token);
                call.resolve(new JSObject().put("token", token).put("proxyUrl", base + "/peer/" + token + "/root"));
            } catch (Exception e) { call.reject("Unable to start watchroom media bridge"); }
        });
    }

    @PluginMethod public void unregisterPeerSource(PluginCall call) {
        String token = call.getString("token", "");
        peerSources.remove(token);
        for (Map.Entry<String, PeerMediaRequest> entry : peerRequests.entrySet()) {
            if (entry.getValue().token.equals(token)) {
                peerRequests.remove(entry.getKey());
                PeerMediaReply queued = entry.getValue().replies.poll();
                if (queued != null) queued.acknowledgement.reject("Watchroom media closed");
            }
        }
        call.resolve();
    }

    @PluginMethod public void peerMediaResponse(PluginCall call) {
        apiExecutor.execute(() -> {
            String id = call.getString("id", ""), token = call.getString("token", "");
            PeerMediaRequest request = peerRequests.get(id);
            String encoded = call.getString("body", "");
            if (request == null || !request.token.equals(token) || !peerSources.contains(token)
                || encoded == null || encoded.length() > 4 * ((PEER_BLOCK_LIMIT + 2) / 3)) {
                call.reject("Watchroom media request expired or block too large"); return;
            }
            try {
                byte[] body = android.util.Base64.decode(encoded, android.util.Base64.DEFAULT);
                if (body.length > PEER_BLOCK_LIMIT) { call.reject("Watchroom media block too large"); return; }
                PeerMediaReply reply = new PeerMediaReply(call, call.getInt("status", 502),
                    call.getObject("headers", new JSObject()), body, call.getBoolean("final", true));
                if (!request.replies.offer(reply, 5, TimeUnit.SECONDS)) call.reject("Watchroom media backpressure timeout");
                // The socket writer resolves this call only after flushing its bounded block.
            } catch (Exception e) { call.reject("Invalid watchroom media block"); }
        });
    }
    private MobileMediaCache mediaCache;
    @Override public void load() { mediaCache = new MobileMediaCache(getContext()); }

    @PluginMethod public void configurePlayback(PluginCall call) {
        mediaCache.configure(call.getString("source", ""), call.getBoolean("dataSaver", false));
        call.resolve(new JSObject().put("metered", mediaCache.metered()));
    }
    @PluginMethod public void cancelPrefetch(PluginCall call) { mediaCache.cancel(); call.resolve(); }

    // ── Plugin API ──────────────────────────────────────────────────────

    @PluginMethod
    public void prepareRequestHeaders(PluginCall call) {
        String target = call.getString("url", "");
        if (target == null || (!target.startsWith("https://") && !target.startsWith("http://"))) {
            call.reject("A valid http(s) URL is required.");
            return;
        }
        JSObject input = call.getObject("headers", new JSObject());
        Map<String, String> headers = new HashMap<>();
        Iterator<String> keys = input.keys();
        while (keys.hasNext()) { String key = keys.next(); headers.put(key, input.getString(key, "")); }
        if (CloudflareBypass.isEnabled(getContext())) CloudflareBypass.prepare(target, headers);
        JSObject output = new JSObject();
        for (Map.Entry<String, String> header : headers.entrySet()) output.put(header.getKey(), header.getValue());
        call.resolve(new JSObject().put("headers", output));
    }

    @PluginMethod
    public void ensureStarted(PluginCall call) {
        apiExecutor.execute(() -> {
            try {
                String base = requireServer().baseUrl();
                JSObject result = new JSObject();
                result.put("success", true);
                result.put("baseUrl", base);
                call.resolve(result);
            } catch (Exception e) {
                Log.e(TAG, "ensureStarted failed", e);
                call.reject("Unable to start the local proxy: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void getBaseUrl(PluginCall call) {
        ProxyServer active = server;
        JSObject result = new JSObject();
        result.put("success", active != null);
        result.put("baseUrl", active != null ? active.baseUrl() : "");
        call.resolve(result);
    }

    /**
     * Mirror one JS-minted token (preferred — keeps {@code registerMobileSource}
     * synchronous) or mint a native token when none is supplied.
     */
    @PluginMethod
    public void registerSource(PluginCall call) {
        apiExecutor.execute(() -> {
            String url = call.getString("url", "");
            if (url == null) url = "";
            url = url.trim();
            if (!url.startsWith("http://") && !url.startsWith("https://")) {
                call.reject("A valid http(s) URL is required.");
                return;
            }
            String token = call.getString("token", "");
            if (token == null) token = "";
            token = token.trim().toLowerCase(Locale.US);
            if (!token.matches("[a-f0-9]{32}")) {
                token = mintToken();
            }
            JSObject headersObj = call.getObject("headers", new JSObject());
            Map<String, String> headers = new HashMap<>();
            Iterator<String> keys = headersObj.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                try {
                    String v = headersObj.getString(key, "");
                    if (v != null) headers.put(key, v);
                } catch (Exception ignored) {}
            }
            if (!hasHeader(headers, "User-Agent")) {
                headers.put("User-Agent", DEFAULT_UA);
            }
            tokenMap.put(token, new ProxyEntry(url, headers, System.currentTimeMillis()));
            synchronized (tokenRegistrationSignal) {
                tokenRegistrationSignal.notifyAll();
            }
            sweepTokens();
            prewarmUpstream(url, headers);
            try {
                String base = requireServer().baseUrl();
                JSObject result = new JSObject();
                result.put("success", true);
                result.put("token", token);
                result.put("proxyUrl", base + "/stream/" + token);
                call.resolve(result);
            } catch (Exception e) {
                Log.e(TAG, "registerSource failed", e);
                call.reject("Local proxy unavailable: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void clearExpired(PluginCall call) {
        sweepTokens();
        JSObject result = new JSObject();
        result.put("success", true);
        result.put("size", tokenMap.size());
        call.resolve(result);
    }

    @PluginMethod
    public void getStats(PluginCall call) {
        ProxyServer active = server;
        JSObject result = new JSObject();
        result.put("success", true);
        result.put("entries", tokenMap.size());
        result.put("baseUrl", active != null ? active.baseUrl() : "");
        result.put("running", active != null);
        call.resolve(result);
    }

    /** JS shell → native anti-hijack flags (desktop {@code security:set-*} parity). */
    @PluginMethod
    public void setEmbedActive(PluginCall call) {
        SecurityState.setEmbedActive(call.getBoolean("active", false));
        JSObject result = new JSObject();
        result.put("success", true);
        result.put("embedActive", SecurityState.isEmbedActive());
        call.resolve(result);
    }

    @PluginMethod
    public void setWatchActive(PluginCall call) {
        SecurityState.setWatchActive(call.getBoolean("active", false));
        app.tatakai.me.download.MobileDownloadStore.playbackActive = call.getBoolean("active", false);
        JSObject result = new JSObject();
        result.put("success", true);
        result.put("watchActive", SecurityState.isWatchActive());
        call.resolve(result);
    }

    /** Cloudflare-bypass settings (settings UI): master toggle + optional
     * external FlareSolverr server URL. Persisted; absent keys keep stored
     * values so callers can update one field at a time. */
    @PluginMethod
    public void setCloudflareConfig(PluginCall call) {
        try {
            Context ctx = getContext();
            android.content.SharedPreferences prefs =
                ctx.getSharedPreferences("tatakai-security", 0);
            boolean enabled = prefs.getBoolean("cf_bypass_enabled", true);
            String url = prefs.getString("flaresolverr_url", "");
            if (url == null) url = "";
            JSObject data = call.getData();
            if (data != null && data.has("enabled")) {
                try {
                    enabled = call.getBoolean("enabled", enabled);
                } catch (Exception ignored) {}
            }
            if (data != null && data.has("flaresolverrUrl")) {
                String next = call.getString("flaresolverrUrl", url);
                url = next != null ? next : url;
            }
            CloudflareBypass.setConfig(ctx, enabled, url);
        } catch (Exception e) {
            call.reject("Failed to save Cloudflare settings: " + e.getMessage());
            return;
        }
        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }

    @Override
    protected void handleOnDestroy() {
        if (mediaCache != null) mediaCache.close();
        ProxyServer active;
        synchronized (serverLock) {
            active = server;
            server = null;
        }
        if (active != null) active.closeQuietly();
        tokenMap.clear();
        peerSources.clear();
        for (PeerMediaRequest request : peerRequests.values()) {
            PeerMediaReply queued = request.replies.poll();
            if (queued != null) queued.acknowledgement.reject("Watchroom media closed");
        }
        peerRequests.clear();
    }

    // ── Internals ───────────────────────────────────────────────────────

    private ProxyServer requireServer() throws IOException {
        ProxyServer active = server;
        if (active != null) return active;
        synchronized (serverLock) {
            if (server == null) {
                server = new ProxyServer();
                server.start();
                Log.i(TAG, "Local proxy started on " + server.baseUrl());
            }
            return server;
        }
    }

    private String mintToken() {
        byte[] bytes = new byte[16];
        secureRandom.nextBytes(bytes);
        StringBuilder sb = new StringBuilder(32);
        for (byte b : bytes) sb.append(String.format(Locale.US, "%02x", b));
        return sb.toString();
    }

    private void sweepTokens() {
        long cutoff = System.currentTimeMillis() - TOKEN_TTL_MS;
        for (Map.Entry<String, ProxyEntry> e : tokenMap.entrySet()) {
            ProxyEntry v = e.getValue();
            if (v == null || v.createdAt < cutoff) tokenMap.remove(e.getKey());
        }
    }

    /**
     * Cold-start warmer: the first on-demand upstream fetch often fails
     * transiently (cold DNS/TLS on mobile data and emulator NAT), surfacing as
     * a 502 on `/stream/<token>` while the player/download waits — then
     * succeeding once warm. Fire a tiny ranged GET at registration so the
     * connection, TLS session and CDN edge are warm before first play.
     * Best-effort and off the resolve path: failures are swallowed.
     */
    private void prewarmUpstream(String url, Map<String, String> headers) {
        if (url == null) return;
        String lower = url.toLowerCase(Locale.US);
        int cut = lower.indexOf('?');
        if (cut < 0) cut = lower.indexOf('#');
        String path = cut >= 0 ? lower.substring(0, cut) : lower;
        // Only playlists benefit: segments resolve relative to a warm entry,
        // and prewarming every segment would multiply upstream traffic.
        if (!path.contains(".m3u8")) return;
        final Map<String, String> warmHeaders = new HashMap<>(headers);
        apiExecutor.execute(() -> {
            HttpURLConnection conn = null;
            try {
                conn = (HttpURLConnection) new URL(url).openConnection();
                conn.setConnectTimeout(UPSTREAM_TIMEOUT_MS);
                conn.setReadTimeout(UPSTREAM_TIMEOUT_MS);
                conn.setInstanceFollowRedirects(true);
                conn.setRequestMethod("GET");
                for (Map.Entry<String, String> h : warmHeaders.entrySet()) {
                    try {
                        if (h.getKey() == null || h.getKey().equalsIgnoreCase("Range")) continue;
                        conn.setRequestProperty(h.getKey(), h.getValue());
                    } catch (Exception ignored) {}
                }
                conn.setRequestProperty("Range", "bytes=0-1023");
                int status = conn.getResponseCode();
                if (status == HttpURLConnection.HTTP_PARTIAL || status == HttpURLConnection.HTTP_OK) {
                    InputStream in = conn.getInputStream();
                    try {
                        // Single small read only: a server that ignores Range
                        // and answers 200 must not trick us into pulling a
                        // whole media file in the background.
                        in.read(new byte[4096]);
                    } finally {
                        try { in.close(); } catch (IOException ignored) {}
                    }
                }
            } catch (Exception ignored) {
                // Best-effort only — the on-demand path retries anyway.
            } finally {
                if (conn != null) conn.disconnect();
            }
        });
    }

    private static boolean hasHeader(Map<String, String> headers, String name) {
        for (String k : headers.keySet()) {
            if (k != null && k.equalsIgnoreCase(name)) return true;
        }
        return false;
    }

    /**
     * JS keeps source normalization synchronous: it returns the loopback URL,
     * then mirrors that token through the Capacitor bridge. A media/image request
     * can therefore beat {@link #registerSource(PluginCall)} by a few ms. Treat
     * that as an in-flight registration, not an expired token; otherwise hls.js
     * sees a 410 and enters its seconds-long retry ladder before playback starts.
     */
    private ProxyEntry awaitProxyEntry(String token) {
        ProxyEntry entry = tokenMap.get(token);
        if (entry != null) return entry;

        final long deadline = System.nanoTime()
            + TOKEN_REGISTRATION_GRACE_MS * 1_000_000L;
        synchronized (tokenRegistrationSignal) {
            while ((entry = tokenMap.get(token)) == null) {
                long remainingNanos = deadline - System.nanoTime();
                if (remainingNanos <= 0L) break;
                long waitMillis = remainingNanos / 1_000_000L;
                int waitNanos = (int) (remainingNanos % 1_000_000L);
                try {
                    tokenRegistrationSignal.wait(waitMillis, waitNanos);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        }
        return entry;
    }

    private static final class ProxyEntry {
        final String url;
        final Map<String, String> headers;
        final long createdAt;

        ProxyEntry(String url, Map<String, String> headers, long createdAt) {
            this.url = url;
            this.headers = headers;
            this.createdAt = createdAt;
        }
    }

    /**
     * Minimal loopback HTTP server. Mirrors the desktop {@code _handleRequest}:
     * CORS preflight, {@code /proxy?url=} extension fetch, {@code /stream/<token>}
     * with upstream header replay + Range passthrough + HLS playlist rewrite.
     */
    private final class ProxyServer {
        private ServerSocket socket;
        private final ExecutorService clients = Executors.newCachedThreadPool();
        private volatile boolean closed = false;

        void start() throws IOException {
            socket = new ServerSocket(0, 32, InetAddress.getByName("127.0.0.1"));
            Thread acceptThread = new Thread(this::acceptLoop, "tatakai-local-proxy");
            acceptThread.setDaemon(true);
            acceptThread.start();
        }

        String baseUrl() {
            ServerSocket active = socket;
            if (active == null) throw new IllegalStateException("proxy not started");
            return "http://127.0.0.1:" + active.getLocalPort();
        }

        void closeQuietly() {
            closed = true;
            try {
                if (socket != null) socket.close();
            } catch (IOException ignored) {}
            clients.shutdownNow();
        }

        private void acceptLoop() {
            while (!closed) {
                try {
                    ServerSocket active = socket;
                    if (active == null || active.isClosed()) return;
                    Socket client = active.accept();
                    if (client.getInetAddress() == null || !client.getInetAddress().isLoopbackAddress()) {
                        try { client.close(); } catch (IOException ignored) {}
                        continue;
                    }
                    clients.execute(() -> serve(client));
                } catch (IOException e) {
                    if (!closed) Log.w(TAG, "accept failed: " + e.getMessage());
                    return;
                }
            }
        }

        private void serve(Socket raw) {
            try (Socket client = raw;
                 BufferedReader reader = new BufferedReader(
                     new InputStreamReader(client.getInputStream(), StandardCharsets.US_ASCII));
                 OutputStream output = client.getOutputStream()) {
                String requestLine = reader.readLine();
                if (requestLine == null || requestLine.isEmpty()) return;
                Map<String, String> reqHeaders = new HashMap<>();
                String line;
                while ((line = reader.readLine()) != null && !line.isEmpty()) {
                    int colon = line.indexOf(':');
                    if (colon > 0) {
                        reqHeaders.put(line.substring(0, colon).trim().toLowerCase(Locale.US),
                            line.substring(colon + 1).trim());
                    }
                }
                String[] parts = requestLine.split(" ");
                if (parts.length < 2) {
                    writeText(output, 400, "bad request");
                    return;
                }
                String method = parts[0].toUpperCase(Locale.US);
                String path = parts[1];
                if ("OPTIONS".equals(method)) {
                    writeHead(output, 204, "Content-Length: 0\r\n" + CORS_HEADERS + "Connection: close\r\n\r\n", null);
                    return;
                }
                if (path.startsWith("/proxy")) {
                    handleExtensionFetch(output, method, reqHeaders, path);
                    return;
                }
                if (path.startsWith("/peer/")) {
                    handlePeerMedia(output, method, path, reqHeaders.get("range"));
                    return;
                }
                if (path.startsWith("/stream/")) {
                    String token = path.substring("/stream/".length()).split("[?#]", 2)[0]
                        .toLowerCase(Locale.US);
                    handleStream(output, method, token, reqHeaders);
                    return;
                }
                if (path.startsWith("/offline/")) {
                    handleOffline(output, method, path, reqHeaders.get("range"));
                    return;
                }
                writeText(output, 404, "not found");
            } catch (IOException ignored) {
                // Client (seek cancel) went away mid-copy.
            } catch (Exception e) {
                Log.w(TAG, "proxy serve failed: " + e.getMessage());
            }
        }

        private void handlePeerMedia(OutputStream output, String method, String path, String range) throws IOException {
            String[] parts = path.split("/", -1);
            if ((!"GET".equals(method) && !"HEAD".equals(method)) || parts.length != 4
                || !parts[2].matches("[a-f0-9]{32}") || !parts[3].matches("root|[a-f0-9]{32}")
                || !peerSources.contains(parts[2])) { writeText(output, 410, "Watchroom media source closed"); return; }
            if (peerRequests.size() >= 8) { writeText(output, 503, "Watchroom media bridge busy"); return; }
            String id = mintToken();
            PeerMediaRequest request = new PeerMediaRequest(parts[2]);
            peerRequests.put(id, request);
            JSObject event = new JSObject().put("id", id).put("token", parts[2])
                .put("resourceId", parts[3]).put("method", method);
            if (range != null) event.put("range", range);
            getActivity().runOnUiThread(() -> notifyListeners("peerMediaRequest", event));
            boolean sentHead = false;
            try {
                while (peerSources.contains(parts[2]) && peerRequests.containsKey(id)) {
                    PeerMediaReply reply = request.replies.poll(30, TimeUnit.SECONDS);
                    if (reply == null) {
                        if (!sentHead) writeText(output, 504, "Watchroom media request timed out");
                        return;
                    }
                    try {
                        if (!sentHead) {
                            StringBuilder headers = new StringBuilder(CORS_HEADERS);
                            for (String name : new String[] { "Content-Type", "Content-Length", "Content-Range", "Accept-Ranges" }) {
                                String value = reply.headers.getString(name, "");
                                if (value != null && !value.isEmpty()) headers.append(name).append(": ")
                                    .append(value.replace("\r", "").replace("\n", "")).append("\r\n");
                            }
                            headers.append("Cache-Control: no-store\r\nConnection: close\r\n\r\n");
                            writeHead(output, reply.status >= 200 && reply.status <= 599 ? reply.status : 502, headers.toString(), null);
                            sentHead = true;
                        }
                        if (!"HEAD".equals(method)) output.write(reply.body);
                        output.flush();
                        reply.acknowledgement.resolve();
                    } catch (IOException failure) {
                        reply.acknowledgement.reject("Watchroom media request cancelled");
                        throw failure;
                    }
                    if (reply.last || "HEAD".equals(method)) return;
                }
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            } finally {
                peerRequests.remove(id);
                PeerMediaReply queued = request.replies.poll();
                if (queued != null) queued.acknowledgement.reject("Watchroom media request cancelled");
                getActivity().runOnUiThread(() -> notifyListeners("peerMediaCancel", event));
            }
        }

        private void handleExtensionFetch(OutputStream output, String method, Map<String, String> reqHeaders, String path) throws IOException {
            String target = queryParam(path, "url");
            if (target == null || target.isEmpty()) {
                writeText(output, 400, "missing target url");
                return;
            }
            if (!target.startsWith("http://") && !target.startsWith("https://")) {
                writeText(output, 400, "unsupported target protocol");
                return;
            }
            // Forward the caller's headers (desktop `_extensionRequestHeaders`
            // parity): WAF-walled novel/manga origins 403 without the bundle's
            // Referer/User-Agent/Cookie. Hop-by-hop + framing headers never
            // survive a proxy hop.
            Map<String, String> outbound = new HashMap<>();
            for (Map.Entry<String, String> h : reqHeaders.entrySet()) {
                String name = h.getKey();
                if (name.equals("host") || name.equals("connection") || name.equals("keep-alive")
                        || name.equals("proxy-authenticate") || name.equals("proxy-authorization")
                        || name.equals("te") || name.equals("trailers") || name.equals("transfer-encoding")
                        || name.equals("upgrade") || name.equals("content-length")) continue;
                if (h.getValue() == null) continue;
                String canonical;
                if (name.equals("cookie")) canonical = "Cookie";
                else if (name.equals("user-agent")) canonical = "User-Agent";
                else if (name.equals("referer")) canonical = "Referer";
                else if (name.equals("origin")) canonical = "Origin";
                else canonical = h.getKey();
                outbound.put(canonical, h.getValue());
            }
            // WebView `fetch()` cannot set forbidden headers (Referer,
            // User-Agent, Cookie are stripped), so the JS shim passes the
            // bundle's scraping headers as query params when the transport
            // cannot carry them — same names the hosted streaming proxy uses.
            String qReferer = queryParam(path, "referer");
            String qAgent = queryParam(path, "userAgent");
            String qCookie = queryParam(path, "cookie");
            if (qReferer != null && !qReferer.isEmpty() && !hasHeader(outbound, "referer")) outbound.put("Referer", qReferer);
            if (qAgent != null && !qAgent.isEmpty() && !hasHeader(outbound, "user-agent")) outbound.put("User-Agent", qAgent);
            if (qCookie != null && !qCookie.isEmpty()) {
                String prev = null;
                for (Map.Entry<String, String> h : outbound.entrySet()) {
                    if (h.getKey().equalsIgnoreCase("cookie")) { prev = h.getValue(); break; }
                }
                outbound.put("Cookie", prev != null && !prev.isEmpty() ? prev + "; " + qCookie : qCookie);
            }
            if (!hasHeader(outbound, "user-agent")) outbound.put("User-Agent", DEFAULT_UA);
            try (UpstreamResponse res = upstreamFetchResponse(target, outbound)) {
                byte[] body = !"HEAD".equals(method) ? readAll(res.body) : new byte[0];
                res.markConsumed();
                // Relay the real upstream status: a 403/404 is a real answer
                // the bundle reports ("access blocked") instead of a 200 with
                // an error page that parses to zero chapters. The CF solver
                // already retried genuine challenges inside upstreamFetchResponse.
                String contentType = res.contentType != null && !res.contentType.isEmpty()
                        ? res.contentType : guessContentType(target);
                writeHead(output, res.status,
                    "Content-Type: " + contentType + "\r\n"
                    + "Content-Length: " + body.length + "\r\n"
                    + CORS_HEADERS + "Cache-Control: no-store\r\nConnection: close\r\n\r\n",
                    body);
            } catch (UpstreamException e) {
                writeText(output, e.status, e.getMessage());
            }
        }

        private void handleOffline(OutputStream output, String method, String path, String range) throws IOException {
            String relative = path.substring("/offline/".length()).split("[?#]", 2)[0];
            if (!relative.matches("[a-f0-9]{64}/[a-zA-Z0-9._-]+")) { writeText(output, 404, "not found"); return; }
            File root = app.tatakai.me.download.MobileDownloadStore.get(getContext()).root;
            File file = new File(root, relative);
            if (!file.getCanonicalPath().startsWith(root.getCanonicalPath() + File.separator) || !file.isFile()) { writeText(output, 404, "offline file missing"); return; }
            long size = file.length(), start = 0, end = size - 1;
            if (range != null) {
                try {
                    if (!range.matches("bytes=\\d*-\\d*")) throw new IllegalArgumentException();
                    String[] bounds = range.substring(6).split("-", -1);
                    if (bounds[0].isEmpty()) start = Math.max(0, size - Long.parseLong(bounds[1]));
                    else { start = Long.parseLong(bounds[0]); if (!bounds[1].isEmpty()) end = Math.min(end, Long.parseLong(bounds[1])); }
                    if (start > end || start >= size || start < 0) throw new IllegalArgumentException();
                } catch (Exception e) { writeHead(output, 416, "Content-Range: bytes */" + size + "\r\nContent-Length: 0\r\n" + CORS_HEADERS + "Connection: close\r\n\r\n", null); return; }
            }
            long length = end - start + 1;
            String offlineType = guessContentType(file.getName());
            if ("application/octet-stream".equals(offlineType)) try (FileInputStream input = new FileInputStream(file)) {
                byte[] prefix = new byte[512]; int count = input.read(prefix);
                offlineType = app.tatakai.me.download.MediaPayloadValidator.contentType(prefix, Math.max(0, count));
            }
            writeHead(output, range == null ? 200 : 206, "Content-Type: " + offlineType + "\r\n"
                + "Content-Length: " + length + "\r\nAccept-Ranges: bytes\r\n"
                + (range == null ? "" : "Content-Range: bytes " + start + "-" + end + "/" + size + "\r\n")
                + CORS_HEADERS + "Connection: close\r\n\r\n", null);
            if (!"HEAD".equals(method)) try (RandomAccessFile in = new RandomAccessFile(file, "r")) {
                in.seek(start); byte[] buffer = new byte[64 * 1024]; long remaining = length;
                while (remaining > 0) { int n = in.read(buffer, 0, (int) Math.min(buffer.length, remaining)); if (n < 0) break; output.write(buffer, 0, n); remaining -= n; }
            }
        }

        private void handleStream(OutputStream output, String method, String token,
                                  Map<String, String> reqHeaders) throws IOException {
            ProxyEntry entry = awaitProxyEntry(token);
            if (entry == null) {
                // Desktop parity: 410 after registry cleanup so the player
                // re-resolves sources. Do not age-reject a live entry here:
                // VOD segment tokens are minted when the playlist first loads,
                // and a per-request 15-minute cutoff would break longer episodes
                // even though desktop keeps those tokens until a later sweep.
                writeText(output, 410, "stream token expired");
                return;
            }
            Map<String, String> outbound = new HashMap<>(entry.headers);
            if (!hasHeader(outbound, "User-Agent")) outbound.put("User-Agent", DEFAULT_UA);
            if (!hasHeader(outbound, "Accept-Encoding")) outbound.put("Accept-Encoding", "identity");
            String range = reqHeaders.get("range");
            if (range != null && !range.isEmpty()) outbound.put("Range", range);
            if (mediaCache.direct(output, method, entry.url, outbound, range, CORS_HEADERS)) return;

            try (MobileMediaCache.Hit hit = mediaCache.hit(entry.url, outbound, range)) {
                if (hit != null) {
                    writeHead(output, hit.status, "Content-Type: " + hit.type + "\r\nContent-Length: " + hit.length + "\r\n"
                        + (hit.contentRange.isEmpty() ? "" : "Content-Range: " + hit.contentRange + "\r\n")
                        + CORS_HEADERS + "Accept-Ranges: bytes\r\nConnection: close\r\n\r\n", null);
                    if (!"HEAD".equals(method)) copyStream(hit.body, output);
                    mediaCache.requested(entry.url, outbound); return;
                }
            }

            boolean permit = false;
            try {
              try { MediaRequestBudget.acquire(getContext(), 0); permit = true; } catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new IOException("Playback cancelled", e); }
              try (UpstreamResponse upstream = upstreamFetchResponse(entry.url, outbound)) {
                String contentType = upstream.contentType != null ? upstream.contentType : "";
                boolean isPlaylist = upstream.status < 400 && (entry.url.toLowerCase(Locale.US).contains(".m3u8")
                    || contentType.toLowerCase(Locale.US).contains("mpegurl")
                    || looksLikeHlsPlaylist(upstream.body));
                if (isPlaylist) {
                    // Playlists are the only stream payload we buffer: their child
                    // references must be rewritten before Content-Length is known.
                    byte[] upstreamBody = readAll(upstream.body);
                    upstream.markConsumed();
                    String text = new String(upstreamBody, StandardCharsets.UTF_8);
                    mediaCache.playlist(text, upstream.connection.getURL().toString(), outbound);
                    // One cleanup pass per playlist is enough. Doing it from
                    // registerChildUrl made a VOD manifest with N fragments
                    // scan an ever-growing token map N times (quadratic work on
                    // the UI's critical startup path).
                    sweepTokens();
                    String rewritten = rewritePlaylist(text, upstream.connection.getURL().toString(), entry.headers);
                    byte[] body = rewritten.getBytes(StandardCharsets.UTF_8);
                    writeHead(output, upstream.status,
                        "Content-Type: application/vnd.apple.mpegurl\r\n"
                        + "Content-Length: " + body.length + "\r\n"
                        + CORS_HEADERS + "Cache-Control: no-cache\r\nConnection: close\r\n\r\n",
                        "HEAD".equals(method) ? null : body);
                    return;
                }

                // Match desktop's _forwardResponse: publish the response head as
                // soon as upstream headers arrive, then relay bytes incrementally.
                // The old byte[] path withheld the first byte until an entire HLS
                // segment had downloaded and doubled peak memory for every parallel
                // fragment, which made mobile startup much slower than desktop.
                StringBuilder head = new StringBuilder();
                head.append("Content-Type: ").append(contentType.isEmpty()
                    ? guessContentType(entry.url) : contentType).append("\r\n");
                if (upstream.contentLength >= 0L) {
                    head.append("Content-Length: ").append(upstream.contentLength).append("\r\n");
                }
                head.append("Accept-Ranges: bytes\r\n");
                if (upstream.contentRange != null) {
                    head.append("Content-Range: ").append(upstream.contentRange).append("\r\n");
                }
                head.append(CORS_HEADERS).append("Cache-Control: no-store\r\nConnection: close\r\n\r\n");
                // HttpURLConnection follows redirects; preserve 206 for Range hits.
                writeHead(output, upstream.status, head.toString(), null);
                if (!"HEAD".equals(method)) {
                    try (MobileMediaCache.Writer cached = mediaCache.writer(entry.url, outbound, range, contentType, upstream.contentRange, upstream.status, upstream.contentLength)) {
                        byte[] buffer = new byte[STREAM_BUFFER_SIZE]; int count;
                        while ((count = upstream.body.read(buffer)) >= 0) {
                            output.write(buffer, 0, count);
                            if (cached != null) cached.append(buffer, count);
                        }
                        if (cached != null) cached.finish();
                    }
                    upstream.markConsumed();
                    mediaCache.requested(entry.url, outbound);
                    mediaCache.ranges(entry.url, outbound, range, upstream.contentRange, upstream.status);
                }
                output.flush();
            } catch (UpstreamException e) {
                writeText(output, e.status, e.getMessage());
              }
            } finally { if (permit) MediaRequestBudget.release(); }
        }

        private String rewritePlaylist(String playlist, String playlistUrl, Map<String, String> headers) {
            String[] lines = playlist.split("\n", -1);
            StringBuilder out = new StringBuilder(playlist.length() + 256);
            for (int i = 0; i < lines.length; i++) {
                String rawLine = lines[i];
                String trimmed = rawLine.trim();
                if (i > 0) out.append('\n');
                if (trimmed.isEmpty()) {
                    out.append(rawLine);
                    continue;
                }
                if (trimmed.startsWith("#")) {
                    out.append(rewriteUriAttributes(rawLine, playlistUrl, headers));
                } else {
                    out.append(registerChildUrl(trimmed, playlistUrl, headers));
                }
            }
            return out.toString();
        }

        private String rewriteUriAttributes(String line, String playlistUrl, Map<String, String> headers) {
            // Rewrite URI="..." (keys, maps, audio/subtitle renditions) only.
            StringBuilder sb = new StringBuilder(line.length() + 64);
            int idx = 0;
            while (true) {
                int found = line.indexOf("URI=\"", idx);
                if (found < 0) {
                    sb.append(line.substring(idx));
                    break;
                }
                sb.append(line, idx, found + 5);
                int end = line.indexOf('"', found + 5);
                if (end < 0) {
                    sb.append(line.substring(found + 5));
                    break;
                }
                sb.append(registerChildUrl(line.substring(found + 5, end), playlistUrl, headers));
                idx = end;
            }
            return sb.toString();
        }

        private String registerChildUrl(String ref, String playlistUrl, Map<String, String> headers) {
            try {
                String resolved = new URL(new URL(playlistUrl), ref.trim()).toString();
                String token = mintToken();
                tokenMap.put(token, new ProxyEntry(resolved, new HashMap<>(headers),
                    System.currentTimeMillis()));
                ProxyServer active = server;
                String base = active != null ? active.baseUrl() : "";
                if (base.isEmpty()) return ref;
                return base + "/stream/" + token;
            } catch (Exception e) {
                return ref;
            }
        }

        // ── Upstream fetch (HttpURLConnection — no extra deps) ──────────

        private byte[] upstreamFetch(String target, Map<String, String> headers,
                                     boolean readBody) throws UpstreamException {
            try (UpstreamResponse res = upstreamFetchResponse(target, headers)) {
                if (!readBody) return new byte[0];
                byte[] body = readAll(res.body);
                res.markConsumed();
                return body;
            } catch (IOException e) {
                throw new UpstreamException(502, "proxy error: " + e.getMessage());
            }
        }

        private UpstreamResponse upstreamFetchResponse(String target,
                                                       Map<String, String> headers) throws UpstreamException {
            // Non-blocking replay of a cached clearance session, if any.
            if (CloudflareBypass.isEnabled(getContext())) CloudflareBypass.prepare(target, headers);
            IOException lastError = null;
            for (int attempt = 0; attempt < 2; attempt++) {
                HttpURLConnection conn = null;
                try {
                    URL url = new URL(target);
                    conn = (HttpURLConnection) url.openConnection();
                    conn.setConnectTimeout(UPSTREAM_TIMEOUT_MS);
                    conn.setReadTimeout(UPSTREAM_TIMEOUT_MS);
                    conn.setInstanceFollowRedirects(true);
                    conn.setRequestMethod("GET");
                    for (Map.Entry<String, String> h : headers.entrySet()) {
                        try {
                            conn.setRequestProperty(h.getKey(), h.getValue());
                        } catch (Exception ignored) {}
                    }
                    conn = MediaHttp.follow(conn, headers);
                    int status = conn.getResponseCode();
                    if (status >= 400) {
                        InputStream errorBody = conn.getErrorStream();
                        BufferedInputStream errorStream = new BufferedInputStream(
                            errorBody != null ? errorBody : new java.io.ByteArrayInputStream(new byte[0]), 65536);
                        // Cloudflare stale-clearance parity (desktop): a
                        // 403/503/429 carrying challenge markers is solved
                        // once and the fetch retried — plain origin errors
                        // still relay as-is below.
                        if ((status == 403 || status == 503 || status == 429)
                            && attempt == 0
                            && tryCloudflareChallenge(conn, errorStream, target, headers)) {
                            errorStream.close();
                            continue;
                        }
                        UpstreamResponse origin = new UpstreamResponse(conn, status, conn.getContentType(),
                            conn.getHeaderField("Content-Range"), conn.getHeaderFieldLong("Content-Length", -1L), errorStream);
                        conn = null;
                        return origin;
                    }
                    String contentType = conn.getContentType();
                    String contentRange = conn.getHeaderField("Content-Range");
                    InputStream in;
                    try {
                        // mark/reset lets handleStream inspect a few leading
                        // bytes for #EXTM3U without consuming them. Some anime
                        // CDNs serve extensionless manifests as octet-stream;
                        // URL/content-type detection alone forwarded those
                        // playlists without rewriting their child URLs.
                        in = new BufferedInputStream(conn.getInputStream(), STREAM_BUFFER_SIZE);
                    } catch (IOException e) {
                        throw new UpstreamException(502, "proxy error: " + e.getMessage());
                    }
                    long contentLength = conn.getHeaderFieldLong("Content-Length", -1L);
                    // Some novel sites serve the challenge with HTTP 200.
                    if (attempt == 0 && contentType != null && contentType.toLowerCase(Locale.US).contains("text/html")
                            && tryCloudflareChallenge(conn, (BufferedInputStream) in, target, headers)) {
                        in.close();
                        conn.disconnect();
                        continue;
                    }
                    // Ownership moves to UpstreamResponse. Its close() releases
                    // both the body and the HttpURLConnection after relay/cancel.
                    UpstreamResponse response = new UpstreamResponse(
                        conn, status, contentType, contentRange, contentLength, in);
                    conn = null;
                    return response;
                } catch (UpstreamException e) {
                    throw e;
                } catch (IOException e) {
                    lastError = e;
                    try { Thread.sleep(250); } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        throw new UpstreamException(504, "proxy error: interrupted");
                    }
                } finally {
                    if (conn != null) conn.disconnect();
                }
            }
            throw new UpstreamException(502,
                "proxy error: " + (lastError != null ? lastError.getMessage() : "fetch failed"));
        }

        /**
         * Challenge verdict + solve for one error response. Bounded-peeks the
         * error body for challenge markers; on a hit, clears the domain
         * session, solves (FlareSolverr first when configured, else the hidden
         * WebView — up to ~45s on a proxy worker thread), merges the solved
         * session into {@code headers} and returns true so the caller retries
         * the fetch once. Anything else returns false (relay as-is).
         */
        private boolean tryCloudflareChallenge(HttpURLConnection conn, BufferedInputStream err, String target,
                                               Map<String, String> headers) {
            try {
                String snippet = "";
                if (!CloudflareBypass.isEnabled(getContext()) || !CloudflareBypass.appliesTo(AdHosts.hostnameOf(target))) return false;
                err.mark(65537);
                if (err != null) {
                    ByteArrayOutputStream bos = new ByteArrayOutputStream(4096);
                    byte[] buf = new byte[4096];
                    int total = 0, n;
                    try {
                        while (total < 65536
                            && (n = err.read(buf, 0, Math.min(buf.length, 65536 - total))) >= 0) {
                            bos.write(buf, 0, n);
                            total += n;
                        }
                    } finally { err.reset(); }
                    try {
                        snippet = bos.toString("UTF-8");
                    } catch (Exception ignored) {}
                }
                int status;
                try {
                    status = conn.getResponseCode();
                } catch (IOException e) {
                    return false;
                }
                if (!CloudflareBypass.isChallengeResponse(status, snippet)) return false;
                Context ctx = null;
                try {
                    ctx = getContext();
                } catch (Exception ignored) {}
                if (ctx == null) return false;
                CloudflareBypass.clearSession(AdHosts.hostnameOf(target));
                if (CloudflareBypass.solveBlocking(getActivity(), target) == null) return false;
                CloudflareBypass.prepare(target, headers);
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        private byte[] readAll(InputStream in) throws IOException {
            ByteArrayOutputStream bos = new ByteArrayOutputStream(32 * 1024);
            byte[] chunk = new byte[STREAM_BUFFER_SIZE]; int count;
            while ((count = in.read(chunk)) >= 0) {
                if (bos.size() + count > 16 * 1024 * 1024) throw new IOException("Playlist or API response is too large");
                bos.write(chunk, 0, count);
            }
            return bos.toByteArray();
        }

        private void copyStream(InputStream in, OutputStream out) throws IOException {
            byte[] buf = new byte[STREAM_BUFFER_SIZE];
            int n;
            while ((n = in.read(buf)) >= 0) {
                if (n > 0) out.write(buf, 0, n);
            }
        }

        /**
         * Identify extensionless / incorrectly-labelled HLS manifests without
         * consuming bytes from the response stream. A surprising number of
         * providers expose a signed endpoint with Content-Type
         * application/octet-stream; forwarding that body unchanged makes all
         * relative segment paths resolve against 127.0.0.1 and fail red in
         * DevTools.
         */
        private boolean looksLikeHlsPlaylist(InputStream in) {
            if (in == null || !in.markSupported()) return false;
            byte[] prefix = new byte[512];
            int count = 0;
            try {
                in.mark(prefix.length);
                while (count < prefix.length) {
                    int n = in.read(prefix, count, prefix.length - count);
                    if (n < 0) break;
                    if (n == 0) continue;
                    count += n;
                    // #EXTM3U is always at the beginning apart from BOM and
                    // whitespace, so there is no reason to wait for 512 bytes.
                    if (count >= 16) break;
                }
                in.reset();
            } catch (IOException e) {
                try { in.reset(); } catch (IOException ignored) {}
                return false;
            }

            int offset = 0;
            if (count >= 3
                && (prefix[0] & 0xff) == 0xef
                && (prefix[1] & 0xff) == 0xbb
                && (prefix[2] & 0xff) == 0xbf) {
                offset = 3;
            }
            while (offset < count) {
                int c = prefix[offset] & 0xff;
                if (c != ' ' && c != '\t' && c != '\r' && c != '\n') break;
                offset++;
            }
            byte[] signature = "#EXTM3U".getBytes(StandardCharsets.US_ASCII);
            if (count - offset < signature.length) return false;
            for (int i = 0; i < signature.length; i++) {
                if (prefix[offset + i] != signature[i]) return false;
            }
            return true;
        }

        private String queryParam(String path, String name) {
            int q = path.indexOf('?');
            if (q < 0) return null;
            String query = path.substring(q + 1);
            for (String pair : query.split("&")) {
                int eq = pair.indexOf('=');
                String k = eq < 0 ? pair : pair.substring(0, eq);
                try {
                    k = URLDecoder.decode(k, "UTF-8");
                } catch (Exception ignored) {}
                if (!name.equals(k)) continue;
                String v = eq < 0 ? "" : pair.substring(eq + 1);
                try {
                    return URLDecoder.decode(v, "UTF-8");
                } catch (Exception ignored) {
                    return v;
                }
            }
            return null;
        }

        private String guessContentType(String url) {
            String clean = url.split("\\?", 2)[0].toLowerCase(Locale.US);
            if (clean.endsWith(".m3u8")) return "application/vnd.apple.mpegurl";
            if (clean.endsWith(".mp4") || clean.endsWith(".m4v")) return "video/mp4";
            if (clean.endsWith(".webm")) return "video/webm";
            if (clean.endsWith(".mkv")) return "video/x-matroska";
            if (clean.endsWith(".vtt")) return "text/vtt; charset=utf-8";
            if (clean.endsWith(".srt")) return "text/plain; charset=utf-8";
            if (clean.endsWith(".png")) return "image/png";
            if (clean.endsWith(".gif")) return "image/gif";
            if (clean.endsWith(".webp")) return "image/webp";
            if (clean.endsWith(".avif")) return "image/avif";
            return "application/octet-stream";
        }

        private void writeText(OutputStream output, int status, String message) throws IOException {
            byte[] body = message.getBytes(StandardCharsets.UTF_8);
            writeHead(output, status,
                "Content-Type: text/plain; charset=utf-8\r\n"
                + "Content-Length: " + body.length + "\r\n"
                + CORS_HEADERS + "Cache-Control: no-store\r\nConnection: close\r\n\r\n",
                body);
        }

        private void writeHead(OutputStream output, int status, String headers, byte[] body)
            throws IOException {
            String reason = reasonFor(status);
            output.write(("HTTP/1.1 " + status + " " + reason + "\r\n" + headers)
                .getBytes(StandardCharsets.US_ASCII));
            if (body != null && body.length > 0) output.write(body);
            output.flush();
        }

        private String reasonFor(int status) {
            switch (status) {
                case 200: return "OK";
                case 204: return "No Content";
                case 206: return "Partial Content";
                case 400: return "Bad Request";
                case 404: return "Not Found";
                case 410: return "Gone";
                case 416: return "Range Not Satisfiable";
                case 502: return "Bad Gateway";
                case 504: return "Gateway Timeout";
                default: return "OK";
            }
        }
    }

    private static final class UpstreamResponse implements AutoCloseable {
        final HttpURLConnection connection;
        final int status;
        final String contentType;
        final String contentRange;
        final long contentLength;
        final InputStream body;
        private boolean consumed;

        UpstreamResponse(HttpURLConnection connection, int status, String contentType,
                         String contentRange, long contentLength, InputStream body) {
            this.connection = connection;
            this.status = status;
            this.contentType = contentType;
            this.contentRange = contentRange;
            this.contentLength = contentLength;
            this.body = body;
        }

        void markConsumed() {
            consumed = true;
        }

        @Override
        public void close() {
            try {
                if (body != null) body.close();
            } catch (IOException ignored) {}
            // A fully-consumed HttpURLConnection response is eligible for
            // Android's connection pool. Calling disconnect() after every HLS
            // fragment forced a new TCP/TLS handshake for the next fragment,
            // which was the main desktop-vs-mobile throughput gap. Still abort
            // cancelled/HEAD/partial reads so a poisoned socket is never reused.
            if (!consumed && connection != null) connection.disconnect();
        }
    }

    private static final class UpstreamException extends Exception {
        final int status;

        UpstreamException(int status, String message) {
            super(message);
            this.status = status;
        }
    }
}
