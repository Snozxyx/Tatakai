package app.tatakai.me.download;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

/** App-private durable queue. No WebView, JS timers, or loopback URLs in transfer execution. */
public final class MobileDownloadStore {
    private static MobileDownloadStore instance;
    public static synchronized MobileDownloadStore get(Context context) {
        if (instance == null) instance = new MobileDownloadStore(context.getApplicationContext());
        return instance;
    }
    public static volatile boolean playbackActive;
    public static volatile boolean dataSaver;
    public static volatile boolean wifiOnly;
    private final Context context;
    public final File root;
    private final File index;
    private JSONArray jobs = new JSONArray();
    public interface Observer { void changed(JSONArray jobs); }
    public volatile Observer observer;
    private final Map<String, HttpURLConnection> connections = new ConcurrentHashMap<>();
    private final Set<String> running = ConcurrentHashMap.newKeySet();

    private MobileDownloadStore(Context context) {
        this.context = context;
        dataSaver = context.getSharedPreferences("tatakai-downloads", 0).getBoolean("dataSaver", false);
        wifiOnly = context.getSharedPreferences("tatakai-downloads", 0).getBoolean("wifiOnly", false);
        boolean autoResume = context.getSharedPreferences("tatakai-downloads", 0).getBoolean("autoResume", true);
        root = new File(context.getFilesDir(), "offline-anime"); root.mkdirs();
        index = new File(root, "jobs.json");
        try { jobs = new JSONArray(read(index)); } catch (Exception ignored) {}
        for (int i = 0; i < jobs.length(); i++) {
            JSONObject job = jobs.optJSONObject(i);
            if (job != null && ("downloading".equals(job.optString("status")) || "queued".equals(job.optString("status")))) {
                put(job, "status", autoResume ? "queued" : "failed");
                if (!autoResume) put(job, "error", "Download interrupted; tap Retry to continue saved progress");
            }
        }
        validateLibrary();
    }
    public synchronized void validateLibrary() {
        for (int i = 0; i < jobs.length(); i++) {
            JSONObject job = jobs.optJSONObject(i); JSONArray resources = job.optJSONArray("resources");
            if (resources == null) continue;
            for (int j = 0; j < resources.length(); j++) {
                JSONObject r = resources.optJSONObject(j); if (!r.optBoolean("done") || r.optBoolean("skipped")) continue;
                File file = new File(new File(root, job.optString("folder")), r.optString("name"));
                if (!file.isFile() || file.length() == 0 || r.optLong("size") > 0 && file.length() != r.optLong("size")) {
                    put(r, "done", false);
                    if ("completed".equals(job.optString("status"))) {
                        put(job, "status", "failed"); put(job, "error", "Offline files are missing or incomplete; retry the download");
                    }
                }
            }
        }
    }
    public synchronized JSONArray snapshot() {
        JSONArray publicJobs = new JSONArray();
        for (int i = 0; i < jobs.length(); i++) {
            JSONObject job = jobs.optJSONObject(i), visible = new JSONObject();
            for (String key : new String[]{"episodeId", "animeId", "animeName", "episodeNumber", "posterUrl", "status", "progress", "error", "folder", "entry", "bytes", "completedAt", "url", "originalUrl", "headers", "subtitleWarnings"})
                if (job.has(key)) put(visible, key, job.opt(key));
            JSONArray subtitles = new JSONArray(), source = job.optJSONArray("subtitles");
            if (source != null) for (int s = 0; s < source.length(); s++) {
                JSONObject sub = source.optJSONObject(s), local = new JSONObject(); if (sub == null) continue;
                for (String key : new String[]{"file", "lang", "language", "label"}) if (sub.has(key)) put(local, key, sub.opt(key));
                subtitles.put(local);
            }
            put(visible, "subtitles", subtitles); publicJobs.put(visible);
        }
        return publicJobs;
    }
    private static class JSONArrayCopy {
        final JSONArray value;
        JSONArrayCopy(JSONArray array) { try { value = new JSONArray(array.toString()); } catch (Exception e) { throw new IllegalStateException(e); } }
    }
    public synchronized JSONObject find(String id) {
        for (int i = 0; i < jobs.length(); i++) if (id.equals(jobs.optJSONObject(i).optString("episodeId"))) return jobs.optJSONObject(i);
        return null;
    }
    public synchronized void enqueue(JSONObject input) throws Exception {
        String id = input.getString("episodeId"), url = input.getString("url");
        URL upstream = new URL(url);
        if (!(upstream.getProtocol().equals("https") || upstream.getProtocol().equals("http")) || upstream.getHost().equals("127.0.0.1") || upstream.getHost().equals("localhost"))
            throw new IOException("Re-resolve the episode's original stream URL before downloading");
        JSONObject old = find(id);
        if (old != null && Arrays.asList("queued", "downloading", "completed").contains(old.optString("status"))) return;
        String folder = HlsOfflinePlan.fileName(id, "binary").substring(0, 64);
        JSONObject job = new JSONObject(input.toString());
        job.put("folder", folder); job.put("status", "queued"); job.put("progress", 0);
        job.put("createdAt", System.currentTimeMillis()); job.put("resources", new JSONArray());
        String suffix = upstream.getPath().matches("(?i).*\\.(mp4|mkv|webm|m4v)$") ? upstream.getPath().substring(upstream.getPath().lastIndexOf('.')) : ".bin";
        job.put("entry", "media" + suffix); job.put("bytes", 0);
        addResource(job, url, "media" + suffix, "auto", input.optJSONObject("headers"), 0);
        JSONArray subs = input.optJSONArray("subtitles");
        if (subs != null) for (int i = 0; i < subs.length(); i++) {
            JSONObject sub = subs.optJSONObject(i); if (sub == null) continue;
            String subUrl = sub.optString("url");
            if (subUrl.startsWith("http") && !subUrl.contains("127.0.0.1")) {
                String name = HlsOfflinePlan.fileName(subUrl, "binary");
                addResource(job, subUrl, name, "subtitle", sub.optJSONObject("headers"), 0);
                sub.put("file", name);
            }
        }
        if (old != null) remove(id, false);
        jobs.put(job); save();
    }
    public synchronized void cancel(String id) {
        JSONObject job = find(id); if (job == null) return;
        put(job, "status", "cancelled"); save();
        for (Map.Entry<String, HttpURLConnection> e : connections.entrySet()) if (e.getKey().startsWith(id + ":")) e.getValue().disconnect();
    }
    /** Import only the old Tatakai Documents folder, never arbitrary external paths. Originals remain untouched. */
    public void importLegacy(JSONObject input) throws Exception {
        String name = input.getString("name");
        if (!name.matches("[a-zA-Z0-9._-]+")) throw new IOException("Invalid legacy download name");
        File legacyRoot = new File(android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DOCUMENTS), "tatakai/anime");
        File source = new File(legacyRoot, name);
        if (!source.getCanonicalPath().startsWith(legacyRoot.getCanonicalPath() + File.separator)) throw new IOException("Invalid legacy path");
        String id = input.getString("episodeId"); if (find(id) != null) return;
        JSONObject job = new JSONObject(input.toString()).put("folder", HlsOfflinePlan.fileName(id, "binary").substring(0, 64));
        job.put("status", "completed").put("progress", 100).put("completedAt", source.lastModified());
        JSONArray resources = new JSONArray(); job.put("resources", resources);
        File dest = new File(root, job.getString("folder")); dest.mkdirs();
        File[] files = source.isDirectory() ? source.listFiles() : new File[]{source};
        if (files == null) throw new IOException("Legacy files are missing");
        String entry = source.isFile() ? name : ""; long size = 0;
        for (File file : files) {
            if (!file.isFile() || file.length() <= 0 || !file.getName().matches("[a-zA-Z0-9._-]+")) continue;
            File target = new File(dest, file.getName());
            if (file.getName().endsWith(".m3u8")) {
                String text = read(file);
                if (!text.contains("#EXT-X-ENDLIST")) throw new IOException("Old episode is incomplete. Download it again from the series page.");
                java.util.regex.Pattern uri = java.util.regex.Pattern.compile("URI=\"([^\"]+)\"");
                StringBuilder local = new StringBuilder();
                for (String raw : text.split("\n")) {
                    String line = raw.trim();
                    if (!line.isEmpty() && !line.startsWith("#")) line = legacyReference(line, source);
                    else {
                        java.util.regex.Matcher m = uri.matcher(line); StringBuffer rewritten = new StringBuffer();
                        while (m.find()) m.appendReplacement(rewritten, java.util.regex.Matcher.quoteReplacement("URI=\"" + legacyReference(m.group(1), source) + "\""));
                        m.appendTail(rewritten); line = rewritten.toString();
                    }
                    local.append(line).append('\n');
                }
                write(target, local.toString()); entry = file.getName();
            } else {
                if (source.isFile() && file.length() < 64 * 1024) throw new IOException("Old video is incomplete. Download it again from the series page.");
                try (InputStream in = new FileInputStream(file); FileOutputStream out = new FileOutputStream(target)) {
                    byte[] b = new byte[64 * 1024]; int n; while ((n = in.read(b)) >= 0) out.write(b, 0, n);
                }
            }
            size += target.length();
            resources.put(new JSONObject().put("url", "").put("name", file.getName()).put("kind", "binary").put("done", true).put("size", target.length()));
        }
        if (entry.isEmpty() || !new File(dest, entry).isFile()) throw new IOException("Old episode has no playable file");
        job.put("entry", entry).put("bytes", size);
        synchronized (this) { if (find(id) == null) jobs.put(job); save(); }
    }
    private String legacyReference(String value, File source) throws IOException {
        String path = value;
        try { path = URI.create(value).getPath(); } catch (Exception ignored) {}
        String name = new File(path == null ? value : path).getName(); File file = new File(source, name);
        if (!file.getCanonicalPath().startsWith(source.getCanonicalPath() + File.separator) || !file.isFile() || file.length() == 0) throw new IOException("Old episode has missing segments. Download it again.");
        return name;
    }
    public synchronized void retry(String id) throws Exception {
        JSONObject job = find(id); if (job == null) throw new IOException("Download not found");
        if (running.contains(id)) throw new IOException("Download is still stopping; retry shortly");
        put(job, "status", "queued"); job.remove("error");
        JSONArray resources = job.getJSONArray("resources");
        for (int i = 0; i < resources.length(); i++) {
            JSONObject r = resources.getJSONObject(i); r.remove("error"); put(r, "attempts", 0);
        }
        save();
    }
    public synchronized void remove(String id, boolean files) throws IOException {
        if (running.contains(id)) throw new IOException("Cancel the active download before deleting it");
        JSONObject job = find(id);
        JSONArray next = new JSONArray();
        for (int i = 0; i < jobs.length(); i++) if (!id.equals(jobs.optJSONObject(i).optString("episodeId"))) next.put(jobs.optJSONObject(i));
        jobs = next;
        if (files && job != null) deleteTree(new File(root, job.optString("folder")));
        save();
    }
    public synchronized boolean hasPending() {
        for (int i = 0; i < jobs.length(); i++) if (Arrays.asList("queued", "downloading").contains(jobs.optJSONObject(i).optString("status"))) return true;
        return false;
    }
    public synchronized JSONObject nextJob() {
        for (int i = 0; i < jobs.length(); i++) {
            JSONObject job = jobs.optJSONObject(i);
            if ("queued".equals(job.optString("status"))) { put(job, "status", "downloading"); running.add(job.optString("episodeId")); save(); return job; }
        }
        return null;
    }
    public boolean networkAllowed() {
        ConnectivityManager cm = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        NetworkCapabilities caps = cm.getNetworkCapabilities(cm.getActiveNetwork());
        return caps != null && caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            && (!wifiOnly || !cm.isActiveNetworkMetered());
    }
    private boolean isWifi() {
        ConnectivityManager manager = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        NetworkCapabilities capabilities = manager.getNetworkCapabilities(manager.getActiveNetwork());
        return capabilities != null && capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI);
    }
    public int concurrency() {
        ConnectivityManager cm = (ConnectivityManager) context.getSystemService(Context.CONNECTIVITY_SERVICE);
        return playbackActive || dataSaver ? 1 : cm.isActiveNetworkMetered() ? 2 : 6;
    }
    public void run(JSONObject job) {
        String id = job.optString("episodeId");
        ExecutorService pool = Executors.newFixedThreadPool(6);
        try {
            File dir = new File(root, job.getString("folder")); dir.mkdirs();
            while (active(job)) {
                if (!networkAllowed() || (job.optBoolean("wifiOnly", false) && !isWifi())) { Thread.sleep(1000); continue; }
                List<JSONObject> batch = new ArrayList<>();
                synchronized (this) {
                    JSONArray resources = job.getJSONArray("resources");
                    for (int i = 0; i < resources.length() && batch.size() < concurrency(); i++) {
                        JSONObject r = resources.getJSONObject(i);
                        if (!r.optBoolean("done")) batch.add(r);
                    }
                }
                if (batch.isEmpty()) {
                    synchronized (this) {
                        if (!active(job)) break;
                        JSONArray resources = job.getJSONArray("resources"); long bytes = 0;
                        for (int i = 0; i < resources.length(); i++) {
                            JSONObject r = resources.getJSONObject(i);
                            if (r.optBoolean("skipped")) continue;
                            File f = new File(dir, r.getString("name"));
                            if (!f.isFile() || f.length() <= 0) throw new IOException("Downloaded episode is incomplete. Retry the download.");
                            bytes += f.length();
                        }
                        job.put("bytes", bytes); job.put("progress", 100); job.put("completedAt", System.currentTimeMillis());
                        job.put("status", "completed"); save();
                    }
                    break;
                }
                List<Future<?>> futures = new ArrayList<>();
                for (JSONObject r : batch) futures.add(pool.submit(() -> {
                    try { transfer(job, r, dir); } catch (Exception e) {
                        if ("subtitle".equals(r.optString("kind"))) {
                            synchronized (this) {
                                if (!active(job)) return;
                                put(r, "skipped", true); put(r, "done", true);
                                String warning = "Subtitle unavailable (" + resourceDescription(r) + "): " + e.getMessage();
                                JSONArray warnings = job.optJSONArray("subtitleWarnings");
                                if (warnings == null) { warnings = new JSONArray(); put(job, "subtitleWarnings", warnings); }
                                warnings.put(warning);
                                JSONArray subtitles = job.optJSONArray("subtitles");
                                if (subtitles != null) for (int i = 0; i < subtitles.length(); i++) {
                                    JSONObject sub = subtitles.optJSONObject(i);
                                    if (sub != null && r.optString("name").equals(sub.optString("file"))) sub.remove("file");
                                }
                                new File(dir, r.optString("name") + ".part").delete();
                                save();
                            }
                            return;
                        }
                        throw new CompletionException(new IOException(resourceDescription(r) + ": " + e.getMessage(), e));
                    }
                }));
                for (Future<?> future : futures) future.get();
            }
        } catch (Exception error) {
            synchronized (this) {
                if (active(job)) {
                    Throwable cause = error;
                    while ((cause instanceof ExecutionException || cause instanceof CompletionException) && cause.getCause() != null) cause = cause.getCause();
                    put(job, "status", "failed"); put(job, "error", cause.getMessage() == null ? "Download failed" : cause.getMessage()); save();
                }
            }
        } finally {
            pool.shutdownNow();
            for (Map.Entry<String, HttpURLConnection> entry : connections.entrySet())
                if (entry.getKey().startsWith(id + ":")) entry.getValue().disconnect();
            try { pool.awaitTermination(35, TimeUnit.SECONDS); }
            catch (InterruptedException e) { Thread.currentThread().interrupt(); }
            running.remove(id);
        }
    }
    private synchronized boolean active(JSONObject job) { return "downloading".equals(job.optString("status")); }
    private static String resourceDescription(JSONObject resource) {
        String host;
        try { host = new URL(resource.optString("url")).getHost(); } catch (Exception ignored) { host = "unknown host"; }
        String kind = resource.optString("kind", "media");
        String label = "auto".equals(kind) ? "Video/manifest" : "playlist".equals(kind) ? "HLS playlist"
            : "binary".equals(kind) ? "HLS segment/key" : "subtitle".equals(kind) ? "Subtitle" : "Media";
        return label + " from " + host;
    }
    private void transfer(JSONObject job, JSONObject r, File dir) throws Exception {
        File destination = new File(dir, r.getString("name")), partial = new File(dir, r.getString("name") + ".part");
        for (int attempt = 0; attempt < 3; attempt++) {
            if (!active(job)) return;
            if (!networkAllowed()) { Thread.sleep(1000); attempt--; continue; }
            String key = job.getString("episodeId") + ":" + r.getString("name");
            HttpURLConnection connection = null;
            boolean permit = false;
            try {
                app.tatakai.me.proxy.MediaRequestBudget.acquire(context, 2); permit = true;
                if (!active(job)) return;
                connection = (HttpURLConnection) new URL(r.getString("url")).openConnection();
                connections.put(key, connection);
                connection.setConnectTimeout(15000); connection.setReadTimeout(30000);
                connection.setRequestProperty("Accept-Encoding", "identity");
                // Match desktop axios/ffmpeg, rather than HttpURLConnection's
                // browser-document Accept default. Provider headers can override.
                connection.setRequestProperty("Accept", "*/*");
                JSONObject headers = r.optJSONObject("headers"); if (headers == null) headers = job.optJSONObject("headers");
                if (headers != null) for (Iterator<String> it = headers.keys(); it.hasNext();) {
                    String name = it.next(); if (!name.equalsIgnoreCase("Range") && !name.equalsIgnoreCase("Host")) connection.setRequestProperty(name, headers.optString(name));
                }
                // Resume only with a validator, and require the exact requested offset.
                long offset = partial.length(); String validator = r.optString("validator");
                if (offset > 0 && !validator.isEmpty()) { connection.setRequestProperty("Range", "bytes=" + offset + "-"); connection.setRequestProperty("If-Range", validator); }
                else offset = 0;
                Map<String, String> replayHeaders = new HashMap<>();
                if (headers != null) for (Iterator<String> it = headers.keys(); it.hasNext();) { String name = it.next(); replayHeaders.put(name, headers.optString(name)); }
                String targetUrl = r.getString("url");
                if (!replayHeaders.keySet().stream().anyMatch(name -> name.equalsIgnoreCase("User-Agent")))
                    replayHeaders.put("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
                String cookies = android.webkit.CookieManager.getInstance().getCookie(targetUrl);
                if (cookies != null && !cookies.isEmpty() && !replayHeaders.keySet().stream().anyMatch(name -> name.equalsIgnoreCase("Cookie")))
                    replayHeaders.put("Cookie", cookies);
                app.tatakai.me.security.CloudflareBypass.prepare(targetUrl, replayHeaders);
                for (Map.Entry<String, String> header : replayHeaders.entrySet()) connection.setRequestProperty(header.getKey(), header.getValue());
                connection = app.tatakai.me.proxy.MediaHttp.follow(connection, replayHeaders); connections.put(key, connection);
                int status = connection.getResponseCode();
                if (status != 200 && status != 206) throw new IOException("HTTP " + status + " — retry or resolve a fresh episode link");
                if (status == 206 && (offset == 0 || !String.valueOf(connection.getHeaderField("Content-Range")).startsWith("bytes " + offset + "-")))
                    throw new IOException("Invalid range response");
                if (status == 200) offset = 0;
                String contentType = String.valueOf(connection.getContentType()).toLowerCase(Locale.US);
                String etag = connection.getHeaderField("ETag");
                if (etag == null || etag.startsWith("W/")) etag = connection.getHeaderField("Last-Modified");
                synchronized (this) { if (etag != null) { r.put("validator", etag); save(); } }
                long expected = connection.getContentLengthLong(), copied = 0, lastProgress = 0;
                try (BufferedInputStream in = new BufferedInputStream(connection.getInputStream()); FileOutputStream out = new FileOutputStream(partial, offset > 0)) {
                    in.mark(512);
                    byte[] prefix = new byte[512];
                    int prefixSize = 0;
                    while (prefixSize < prefix.length) {
                        int n = in.read(prefix, prefixSize, prefix.length - prefixSize);
                        if (n < 0) break;
                        prefixSize += n;
                    }
                    in.reset();
                    MediaPayloadValidator.validate(prefix, prefixSize, contentType);
                    byte[] buffer = new byte[64 * 1024]; int count;
                    while ((count = in.read(buffer)) != -1) {
                        if (!active(job)) return;
                        out.write(buffer, 0, count); copied += count;
                        if (System.currentTimeMillis() - lastProgress > 2500 && expected > 0 && r.optString("kind").equals("auto")) {
                            synchronized (this) { if (active(job)) { job.put("progress", Math.min(99, (offset + copied) * 100 / (offset + expected))); save(); } }
                            lastProgress = System.currentTimeMillis();
                        }
                    }
                    out.getFD().sync();
                }
                if (expected >= 0 && copied != expected || partial.length() <= 0) throw new IOException("Incomplete response — retry the download");
                String kind = r.getString("kind");
                boolean playlist = kind.equals("playlist") || kind.equals("auto") && (contentType.contains("mpegurl") || startsWithPlaylist(partial));
                if (playlist) {
                    if (r.optInt("depth") >= 8) throw new IOException("Too many nested playlists");
                    HlsOfflinePlan plan = HlsOfflinePlan.parse(read(partial), connection.getURL().toString());
                    synchronized (this) {
                        if (!active(job)) return;
                        for (HlsOfflinePlan.Resource ref : plan.resources) addResource(job, ref.url, ref.name, ref.kind, headers, r.optInt("depth") + 1);
                        if (kind.equals("auto")) { r.put("name", "index.m3u8"); job.put("entry", "index.m3u8"); destination = new File(dir, "index.m3u8"); }
                        write(destination, plan.playlist); partial.delete();
                    }
                } else {
                    try (InputStream first = new FileInputStream(partial)) {
                        byte[] bytes = new byte[512]; int n = first.read(bytes);
                        String prefix = new String(bytes, 0, Math.max(0, n), StandardCharsets.UTF_8).trim().toLowerCase(Locale.US);
                        if (prefix.startsWith("<!doctype html") || prefix.startsWith("<html")) throw new IOException("Provider blocked the download");
                    }
                    if (!partial.renameTo(destination)) throw new IOException("Unable to save download; check available storage");
                }
                synchronized (this) {
                    if (!active(job)) return;
                    r.put("done", true); r.put("size", destination.length());
                    JSONArray resources = job.getJSONArray("resources"); int done = 0;
                    for (int i = 0; i < resources.length(); i++) if (resources.getJSONObject(i).optBoolean("done")) done++;
                    job.put("progress", Math.min(99, done * 100 / resources.length())); save();
                }
                return;
            } catch (Exception e) {
                if (!active(job)) return;
                if (attempt == 2) throw e;
                Thread.sleep(500L * (attempt + 1));
            } finally {
                connections.remove(key); if (connection != null) connection.disconnect();
                if (permit) app.tatakai.me.proxy.MediaRequestBudget.release();
            }
        }
    }
    private static boolean startsWithPlaylist(File file) throws IOException {
        try (InputStream in = new FileInputStream(file)) { byte[] b = new byte[32]; int n = in.read(b); return new String(b, 0, Math.max(0, n), StandardCharsets.UTF_8).replaceFirst("^\\uFEFF", "").trim().startsWith("#EXTM3U"); }
    }
    private void addResource(JSONObject job, String url, String name, String kind, JSONObject headers, int depth) throws JSONException {
        JSONArray array = job.getJSONArray("resources");
        for (int i = 0; i < array.length(); i++) if (name.equals(array.getJSONObject(i).optString("name"))) return;
        JSONObject r = new JSONObject().put("url", url).put("name", name).put("kind", kind).put("depth", depth).put("done", false);
        if (headers != null) r.put("headers", headers); array.put(r);
    }
    public synchronized void save() {
        try {
            File tmp = new File(root, "jobs.json.tmp"); write(tmp, jobs.toString());
            if (!tmp.renameTo(index)) throw new IOException("Unable to persist download state");
            if (observer != null) observer.changed(snapshot());
        } catch (IOException e) {
            Set<String> persistedComplete = new HashSet<>();
            try {
                JSONArray previous = new JSONArray(read(index));
                for (int i = 0; i < previous.length(); i++) {
                    JSONObject job = previous.optJSONObject(i);
                    if ("completed".equals(job.optString("status"))) persistedComplete.add(job.optString("episodeId"));
                }
            } catch (Exception ignored) {}
            for (int i = 0; i < jobs.length(); i++) {
                JSONObject job = jobs.optJSONObject(i);
                if (active(job) || "queued".equals(job.optString("status")) || "completed".equals(job.optString("status")) && !persistedComplete.contains(job.optString("episodeId"))) {
                    put(job, "status", "failed"); put(job, "error", "Unable to save download state; free storage and retry");
                }
            }
            for (HttpURLConnection connection : connections.values()) connection.disconnect();
            if (observer != null) observer.changed(snapshot());
        }
    }
    public synchronized void suspend() {
        for (int i = 0; i < jobs.length(); i++) {
            JSONObject job = jobs.optJSONObject(i); if (active(job)) put(job, "status", "queued");
        }
        for (HttpURLConnection conn : connections.values()) conn.disconnect(); save();
    }
    static void put(JSONObject obj, String key, Object value) { try { obj.put(key, value); } catch (JSONException e) { throw new IllegalStateException(e); } }
    static String read(File file) throws IOException {
        if (file.length() > 16 * 1024 * 1024) throw new IOException("Playlist or download index is too large");
        try (InputStream in = new FileInputStream(file); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] b = new byte[8192]; int n; while ((n = in.read(b)) >= 0) out.write(b, 0, n); return out.toString("UTF-8");
        }
    }
    static void write(File file, String text) throws IOException {
        try (FileOutputStream out = new FileOutputStream(file)) { out.write(text.getBytes(StandardCharsets.UTF_8)); out.getFD().sync(); }
    }
    private static void deleteTree(File file) throws IOException {
        File[] children = file.listFiles(); if (children != null) for (File child : children) deleteTree(child);
        if (file.exists() && !file.delete()) throw new IOException("Unable to delete download");
    }
}
