package app.tatakai.me.proxy;

import android.content.Context;
import android.net.ConnectivityManager;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;
import java.util.regex.*;

/** Complete-object cache. Partial writes are never published; cached files are independent of offline downloads. */
final class MobileMediaCache {
    private static final long LIMIT = 256L * 1024 * 1024;
    private static final long OBJECT_LIMIT = 32L * 1024 * 1024;
    private final Context context;
    private final File root;
    private final ExecutorService workers = Executors.newFixedThreadPool(6);
    private final Map<String, HttpURLConnection> pending = new ConcurrentHashMap<>();
    private final Set<String> scheduled = ConcurrentHashMap.newKeySet();
    private final Map<String, List<String>> ahead = new ConcurrentHashMap<>();
    private final Map<String, Integer> readers = new HashMap<>();
    private volatile boolean saver = true;
    private volatile long epoch;
    private String source = "";
    MobileMediaCache(Context context) {
        this.context = context; root = new File(context.getCacheDir(), "streaming-media"); root.mkdirs();
        File[] stale = root.listFiles((dir, name) -> name.endsWith(".part"));
        if (stale != null) for (File file : stale) file.delete();
        evict();
    }
    int concurrency() {
        ConnectivityManager cm = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        return saver ? 1 : cm.isActiveNetworkMetered() ? 2 : 6;
    }
    synchronized void configure(String source, boolean saver) {
        this.saver = saver;
        if (!this.source.equals(source) || saver) { this.source = source; ahead.clear(); cancel(); }
    }
    void cancel() { epoch++; for (HttpURLConnection c : pending.values()) c.disconnect(); }
    void close() { cancel(); workers.shutdownNow(); }
    boolean metered() { return ((ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE)).isActiveNetworkMetered(); }
    static String key(String url, Map<String, String> headers, String range) {
        try {
            StringBuilder identity = new StringBuilder(url).append('\n').append(range == null ? "" : range);
            TreeMap<String, String> sorted = new TreeMap<>(String.CASE_INSENSITIVE_ORDER); sorted.putAll(headers);
            for (Map.Entry<String, String> entry : sorted.entrySet()) if (!entry.getKey().equalsIgnoreCase("Range")) identity.append('\n').append(entry.getKey().toLowerCase(Locale.US)).append(':').append(entry.getValue());
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(identity.toString().getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(); for (byte b : hash) hex.append(String.format(Locale.US, "%02x", b)); return hex.toString();
        } catch (Exception error) { throw new IllegalStateException(error); }
    }
    final class Hit implements Closeable {
        final InputStream body; final String type, contentRange; final int status; final long length;
        final String id; boolean closed;
        Hit(File file, JSONObject meta) throws Exception {
            body = new FileInputStream(file); type = meta.optString("type", "application/octet-stream");
            contentRange = meta.optString("contentRange"); status = meta.optInt("status", 200); length = file.length();
            id = file.getName(); readers.put(id, readers.getOrDefault(id, 0) + 1);
        }
        public void close() throws IOException {
            synchronized (MobileMediaCache.this) {
                if (closed) return; closed = true;
                readers.computeIfPresent(id, (key, count) -> count <= 1 ? null : count - 1);
            }
            body.close();
        }
    }
    synchronized Hit hit(String url, Map<String, String> headers, String range) {
        String key = key(url, headers, range); File body = new File(root, key + ".data"), meta = new File(root, key + ".json");
        try {
            if (!body.isFile() || !meta.isFile()) return null;
            // Signed links and authorization headers remain part of the identity; bound stale cache lifetime.
            if (System.currentTimeMillis() - meta.lastModified() > 24 * 60 * 60 * 1000L) { body.delete(); meta.delete(); return null; }
            JSONObject object;
            try (FileInputStream in = new FileInputStream(meta)) { byte[] b = new byte[(int) meta.length()]; int n = in.read(b); object = new JSONObject(new String(b, 0, n, StandardCharsets.UTF_8)); }
            if (object.optLong("length") != body.length()) return null;
            body.setLastModified(System.currentTimeMillis()); return new Hit(body, object);
        } catch (Exception error) { return null; }
    }
    final class Writer implements Closeable {
        final File partial; final String cacheKey, type, contentRange;
        final int status; final long expected; final long generation;
        FileOutputStream output; long copied; boolean committed;
        Writer(String key, String type, String contentRange, int status, long expected) throws IOException {
            this.cacheKey = key; this.type = type; this.contentRange = contentRange; this.status = status; this.expected = expected; this.generation = epoch;
            partial = new File(root, key + "." + UUID.randomUUID() + ".part"); output = new FileOutputStream(partial);
        }
        void append(byte[] bytes, int count) throws IOException {
            copied += count;
            if (copied > OBJECT_LIMIT || generation != epoch) { close(); return; }
            synchronized (MobileMediaCache.this) {
                evict(count);
                if (diskUsage() + count > LIMIT) { close(); return; }
                if (output != null) output.write(bytes, 0, count);
            }
        }
        void finish() throws IOException {
            if (output == null || copied == 0 || expected >= 0 && copied != expected || generation != epoch) return;
            output.close(); output = null;
            synchronized (MobileMediaCache.this) {
                File destination = new File(root, cacheKey + ".data");
                if (!partial.renameTo(destination)) return;
                try {
                    JSONObject metadata = new JSONObject().put("type", type).put("status", status).put("length", copied).put("contentRange", contentRange == null ? "" : contentRange);
                    try (FileOutputStream out = new FileOutputStream(new File(root, cacheKey + ".json"))) { out.write(metadata.toString().getBytes(StandardCharsets.UTF_8)); }
                    committed = true; evict();
                } catch (Exception e) { destination.delete(); }
            }
        }
        public void close() throws IOException { if (output != null) { output.close(); output = null; } if (!committed) partial.delete(); }
    }
    Writer writer(String url, Map<String, String> headers, String range, String type, String contentRange, int status, long length) {
        if (status != 200 && status != 206 || length > OBJECT_LIMIT || String.valueOf(type).contains("text/html") || String.valueOf(type).contains("json")) return null;
        try { return new Writer(key(url, headers, range), type, contentRange, status, length); } catch (IOException e) { return null; }
    }
    private long diskUsage() {
        File[] files = root.listFiles((dir, name) -> name.endsWith(".data") || name.endsWith(".part"));
        long total = 0; if (files != null) for (File file : files) total += file.length(); return total;
    }
    private void evict() { evict(0); }
    private void evict(long incoming) {
        File[] files = root.listFiles((dir, name) -> name.endsWith(".data")); if (files == null) return;
        Arrays.sort(files, Comparator.comparingLong(File::lastModified)); long total = diskUsage() + incoming;
        for (File file : files) { if (total <= LIMIT) break; if (readers.containsKey(file.getName())) continue; long size = file.length(); if (file.delete()) { total -= size; new File(root, file.getName().replace(".data", ".json")).delete(); } }
    }
    void playlist(String text, String base, Map<String, String> headers) {
        // Byte-range playlists share large objects. Leave those reads to the player's bounded range buffer.
        if (saver || !text.contains("#EXT-X-ENDLIST") || text.contains("BYTERANGE")) return;
        try {
            // Resource order includes keys and maps before dependent segments. Never prefetch unselected variants.
            List<String> refs = new ArrayList<>(); Pattern attrs = Pattern.compile("URI=\"([^\"]+)\"");
            double seconds = 0; int budget = 0; double target = metered() ? 10 : 30;
            for (String raw : text.split("\n")) {
                String line = raw.trim();
                if (line.startsWith("#EXTINF:")) { try { seconds += Double.parseDouble(line.substring(8).split(",")[0]); } catch (Exception ignored) {} }
                if (!line.isEmpty() && !line.startsWith("#")) {
                    refs.add(new URL(new URL(base), line).toString());
                    if (seconds <= target || budget == 0) budget = refs.size();
                } else if (line.startsWith("#EXT-X-KEY:") || line.startsWith("#EXT-X-MAP:")) {
                    Matcher m = attrs.matcher(line); if (m.find()) refs.add(new URL(new URL(base), m.group(1)).toString());
                }
            }
            for (int i = 0; i < refs.size(); i++) ahead.put(refs.get(i), new ArrayList<>(refs.subList(i + 1, Math.min(refs.size(), i + Math.max(1, budget) + 1))));
            for (String url : refs.subList(0, Math.min(refs.size(), Math.max(1, budget)))) prefetch(url, headers, null);
        } catch (Exception ignored) {}
    }
    void requested(String url, Map<String, String> headers) {
        if (saver) return;
        for (String next : ahead.getOrDefault(url, Collections.emptyList())) prefetch(next, headers, null);
    }
    void ranges(String url, Map<String, String> headers, String requestedRange, String contentRange, int status) {
        if (saver || status != 206 || requestedRange == null || contentRange == null) return;
        Matcher parsed = Pattern.compile("bytes (\\d+)-(\\d+)/(\\d+)").matcher(contentRange);
        if (!parsed.matches()) return;
        Matcher requested = Pattern.compile("bytes=(\\d+)-(\\d*)").matcher(requestedRange);
        if (!requested.matches() || !requested.group(1).equals(parsed.group(1))) return;
        long end = Long.parseLong(parsed.group(2)), total = Long.parseLong(parsed.group(3));
        long chunk = 1024 * 1024;
        for (int i = 0; i < concurrency(); i++) {
            long start = end + 1 + i * chunk; if (start >= total) break;
            prefetch(url, headers, "bytes=" + start + "-" + Math.min(total - 1, start + chunk - 1));
        }
    }
    private void prefetch(String url, Map<String, String> headers, String range) {
        String key = key(url, headers, range); long generation = epoch;
        try (Hit cached = hit(url, headers, range)) { if (cached != null) return; } catch (IOException ignored) {}
        if (!scheduled.add(key)) return;
        workers.execute(() -> {
            HttpURLConnection conn = null;
            boolean permit = false;
            try {
                if (generation != epoch || saver || pending.size() >= Math.max(1, concurrency() - 1)) return;
                MediaRequestBudget.acquire(context, 1); permit = true;
                if (generation != epoch || saver) return;
                conn = (HttpURLConnection) new URL(url).openConnection(); pending.put(key, conn);
                conn.setConnectTimeout(12000); conn.setReadTimeout(18000);
                for (Map.Entry<String, String> header : headers.entrySet()) if (!header.getKey().equalsIgnoreCase("Range")) conn.setRequestProperty(header.getKey(), header.getValue());
                conn.setRequestProperty("Accept-Encoding", "identity"); if (range != null) conn.setRequestProperty("Range", range);
                conn = MediaHttp.follow(conn, headers); pending.put(key, conn);
                int status = conn.getResponseCode();
                if (range != null && (status != 206 || !validRange(range, conn.getHeaderField("Content-Range")))) return;
                try (InputStream in = conn.getInputStream(); Writer out = writer(url, headers, range, conn.getContentType(), conn.getHeaderField("Content-Range"), status, conn.getContentLengthLong())) {
                    if (out == null) return;
                    byte[] bytes = new byte[64 * 1024]; int n;
                    while (generation == epoch && out.output != null && (n = in.read(bytes)) >= 0) out.append(bytes, n);
                    out.finish();
                }
            } catch (Exception ignored) {} finally { pending.remove(key); scheduled.remove(key); if (conn != null) conn.disconnect(); if (permit) MediaRequestBudget.release(); }
        });
    }
    /** Stream the first range immediately, then consume prefetched chunks in order. Range-ignorant CDNs keep the ordinary relay. */
    boolean direct(OutputStream output, String method, String url, Map<String, String> headers, String range, String cors) throws IOException {
        if (saver || !"GET".equals(method) || range == null || !new URL(url).getPath().toLowerCase(Locale.US).matches(".*\\.(mp4|m4v|webm|mkv)$")) return false;
        Matcher request = Pattern.compile("bytes=(\\d+)-(\\d*)").matcher(range);
        if (!request.matches()) return false;
        long start, requestedEnd;
        try { start = Long.parseLong(request.group(1)); requestedEnd = request.group(2).isEmpty() ? Long.MAX_VALUE : Long.parseLong(request.group(2)); }
        catch (NumberFormatException e) { return false; }
        long chunk = 1024 * 1024;
        if (requestedEnd < start || requestedEnd - start < chunk) return false;
        HttpURLConnection first = null; boolean permit = false;
        try {
            try { MediaRequestBudget.acquire(context, 0); permit = true; } catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new IOException(e); }
            first = openRange(url, headers, start, Math.min(requestedEnd, start + chunk - 1), null);
            if (first.getResponseCode() != 206) return false;
            String cr = first.getHeaderField("Content-Range");
            Matcher response = Pattern.compile("bytes (\\d+)-(\\d+)/(\\d+)").matcher(cr == null ? "" : cr);
            if (!response.matches()) return false;
            long actualStart = Long.parseLong(response.group(1)), firstEnd = Long.parseLong(response.group(2)), total = Long.parseLong(response.group(3));
            long end = Math.min(requestedEnd, total - 1);
            if (actualStart != start || firstEnd != Math.min(end, start + chunk - 1)) return false;
            String type = first.getContentType();
            if (type != null && (type.contains("html") || type.contains("json") || type.contains("mpegurl"))) return false;
            String validator = first.getHeaderField("ETag"); if (validator == null || validator.startsWith("W/")) validator = first.getHeaderField("Last-Modified");
            // Require a validator so independently fetched chunks cannot silently mix different file versions.
            if (validator == null) return false;
            output.write(("HTTP/1.1 206 Partial Content\r\nContent-Type: " + (type == null ? "video/mp4" : type)
                + "\r\nContent-Length: " + (end - start + 1) + "\r\nContent-Range: bytes " + start + "-" + end + "/" + total
                + "\r\nAccept-Ranges: bytes\r\n" + cors + "Connection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII)); output.flush();
            long generation = epoch;
            Map<String, String> consistentHeaders = new HashMap<>(headers); consistentHeaders.put("If-Range", validator);
            for (long position = start; position <= end; position += chunk) {
                if (generation != epoch) throw new IOException("Playback source changed");
                long last = Math.min(end, position + chunk - 1); String partRange = "bytes=" + position + "-" + last;
                for (int i = 1; i < concurrency(); i++) {
                    long next = position + i * chunk; if (next > end) break;
                    prefetch(url, consistentHeaders, "bytes=" + next + "-" + Math.min(end, next + chunk - 1));
                }
                try (Hit hit = position == start ? null : hit(url, consistentHeaders, partRange)) {
                    if (hit != null) { copyExact(hit.body, output, null, last - position + 1); continue; }
                }
                HttpURLConnection conn = first;
                if (position != start) {
                    try { MediaRequestBudget.acquire(context, 0); permit = true; } catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new IOException(e); }
                    conn = openRange(url, consistentHeaders, position, last, validator);
                }
                try {
                    String currentValidator = conn.getHeaderField("ETag");
                    if (currentValidator == null || currentValidator.startsWith("W/")) currentValidator = conn.getHeaderField("Last-Modified");
                    if (conn.getResponseCode() != 206 || !validRange(partRange, conn.getHeaderField("Content-Range"))
                        || !validator.equals(currentValidator) || !conn.getHeaderField("Content-Range").endsWith("/" + total))
                        throw new IOException("Media changed or server stopped supporting ranges; retry playback");
                    try (InputStream in = conn.getInputStream(); Writer cache = writer(url, consistentHeaders, partRange, type, conn.getHeaderField("Content-Range"), 206, last - position + 1)) {
                        copyExact(in, output, cache, last - position + 1); if (cache != null) cache.finish();
                    }
                } finally { conn.disconnect(); if (permit) { MediaRequestBudget.release(); permit = false; } first = null; }
            }
            output.flush(); return true;
        } finally { if (first != null) first.disconnect(); if (permit) MediaRequestBudget.release(); }
    }
    private HttpURLConnection openRange(String url, Map<String, String> headers, long start, long end, String validator) throws IOException {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setConnectTimeout(15000); conn.setReadTimeout(18000);
        for (Map.Entry<String, String> header : headers.entrySet()) if (!header.getKey().equalsIgnoreCase("Range")) conn.setRequestProperty(header.getKey(), header.getValue());
        conn.setRequestProperty("Accept-Encoding", "identity"); conn.setRequestProperty("Range", "bytes=" + start + "-" + end);
        if (validator != null) conn.setRequestProperty("If-Range", validator); return MediaHttp.follow(conn, headers);
    }
    private void copyExact(InputStream input, OutputStream output, Writer cache, long length) throws IOException {
        byte[] bytes = new byte[64 * 1024]; long copied = 0;
        while (copied < length) {
            int count = input.read(bytes, 0, (int) Math.min(bytes.length, length - copied));
            if (count < 0) throw new IOException("Incomplete media range");
            output.write(bytes, 0, count); output.flush(); if (cache != null) cache.append(bytes, count); copied += count;
        }
    }
    private boolean validRange(String request, String response) {
        if (response == null) return false;
        Matcher a = Pattern.compile("bytes=(\\d+)-(\\d+)").matcher(request), b = Pattern.compile("bytes (\\d+)-(\\d+)/(\\d+)").matcher(response);
        return a.matches() && b.matches() && a.group(1).equals(b.group(1)) && a.group(2).equals(b.group(2));
    }
}
