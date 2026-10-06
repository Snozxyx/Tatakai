package app.tatakai.me.proxy;

import android.util.Log;

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

    // ── Plugin API ──────────────────────────────────────────────────────

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
        JSObject result = new JSObject();
        result.put("success", true);
        result.put("watchActive", SecurityState.isWatchActive());
        call.resolve(result);
    }

    @Override
    protected void handleOnDestroy() {
        ProxyServer active;
        synchronized (serverLock) {
            active = server;
            server = null;
        }
        if (active != null) active.closeQuietly();
        tokenMap.clear();
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
                    handleExtensionFetch(output, method, path);
                    return;
                }
                if (path.startsWith("/stream/")) {
                    String token = path.substring("/stream/".length()).split("[?#]", 2)[0]
                        .toLowerCase(Locale.US);
                    handleStream(output, method, token, reqHeaders);
                    return;
                }
                writeText(output, 404, "not found");
            } catch (IOException ignored) {
                // Client (seek cancel) went away mid-copy.
            } catch (Exception e) {
                Log.w(TAG, "proxy serve failed: " + e.getMessage());
            }
        }

        private void handleExtensionFetch(OutputStream output, String method, String path) throws IOException {
            String target = queryParam(path, "url");
            if (target == null || target.isEmpty()) {
                writeText(output, 400, "missing target url");
                return;
            }
            if (!target.startsWith("http://") && !target.startsWith("https://")) {
                writeText(output, 400, "unsupported target protocol");
                return;
            }
            try {
                byte[] body = upstreamFetch(target, new HashMap<>(), !"HEAD".equals(method));
                // Extension JSON / manga API payloads are small; forward as-is.
                writeHead(output, 200,
                    "Content-Type: application/octet-stream\r\n"
                    + "Content-Length: " + body.length + "\r\n"
                    + CORS_HEADERS + "Cache-Control: no-store\r\nConnection: close\r\n\r\n",
                    body);
            } catch (UpstreamException e) {
                writeText(output, e.status, e.getMessage());
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

            try (UpstreamResponse upstream = upstreamFetchResponse(entry.url, outbound)) {
                String contentType = upstream.contentType != null ? upstream.contentType : "";
                boolean isPlaylist = entry.url.toLowerCase(Locale.US).contains(".m3u8")
                    || contentType.toLowerCase(Locale.US).contains("mpegurl")
                    || looksLikeHlsPlaylist(upstream.body);
                if (isPlaylist) {
                    // Playlists are the only stream payload we buffer: their child
                    // references must be rewritten before Content-Length is known.
                    byte[] upstreamBody = readAll(upstream.body);
                    upstream.markConsumed();
                    String text = new String(upstreamBody, StandardCharsets.UTF_8);
                    // One cleanup pass per playlist is enough. Doing it from
                    // registerChildUrl made a VOD manifest with N fragments
                    // scan an ever-growing token map N times (quadratic work on
                    // the UI's critical startup path).
                    sweepTokens();
                    String rewritten = rewritePlaylist(text, entry.url, entry.headers);
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
                    copyStream(upstream.body, output);
                    upstream.markConsumed();
                }
                output.flush();
            } catch (UpstreamException e) {
                writeText(output, e.status, e.getMessage());
            }
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
                    int status = conn.getResponseCode();
                    if (status >= 400) {
                        // Relay origin errors as-is (403/404 are real answers, not retries).
                        InputStream err = conn.getErrorStream();
                        if (err != null) {
                            try { err.close(); } catch (IOException ignored) {}
                        }
                        throw new UpstreamException(status >= 500 ? 502 : status,
                            "upstream HTTP " + status);
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

        private byte[] readAll(InputStream in) throws IOException {
            ByteArrayOutputStream bos = new ByteArrayOutputStream(32 * 1024);
            copyStream(in, bos);
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
