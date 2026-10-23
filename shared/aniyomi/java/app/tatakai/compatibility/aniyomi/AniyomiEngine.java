package app.tatakai.compatibility.aniyomi;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import org.json.*;

/** Shared desktop/Android package, identity and content contract. No app DB migration. */
public final class AniyomiEngine {
    private final File root;
    private final AniyomiPlatform platform;
    private volatile JSONObject state;
    private volatile boolean loaded;
    private final Set<String> loadedPackages = new HashSet<>();
    private AniyomiImageServer imageServer;
    private final Object storageLock = new Object(), mutations = new Object(), loading = new Object();
    private final Map<String, Boolean> enabled = new ConcurrentHashMap<>();
    private final Map<String, String> errors = new ConcurrentHashMap<>();
    private static final Set<String> MUTATIONS = new HashSet<>(Arrays.asList("addRepository", "removeRepository", "install", "remove", "setPreference"));
    public AniyomiEngine(File root, AniyomiPlatform platform) throws Exception {
        this.root = root.getCanonicalFile(); this.platform = platform;
        Files.createDirectories(this.root.toPath());
        File file = new File(root, "state.json");
        state = file.exists() ? new JSONObject(new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8))
            : new JSONObject().put("version", 1).put("repositories", new JSONArray()).put("packages", new JSONObject()).put("enabled", new JSONObject());
        if (state.optInt("version") != 1 || state.optJSONObject("packages") == null || state.optJSONObject("enabled") == null || state.optJSONArray("repositories") == null) throw new IOException("Aniyomi settings need recovery; existing data was preserved");
        JSONObject flags = state.getJSONObject("enabled");
        for (Iterator<String> it = flags.keys(); it.hasNext();) { String key = it.next(); if (!(flags.get(key) instanceof Boolean)) throw new IOException("Invalid source flags"); enabled.put(key, flags.getBoolean(key)); }
        JSONObject packages = state.getJSONObject("packages");
        for (Iterator<String> it = packages.keys(); it.hasNext();) { String id = it.next(); JSONObject pkg = packages.getJSONObject(id); requireKey(id); if (!id.equals(pkg.getString("id")) || !pkg.getString("digest").matches("[a-f0-9]{64}") || !pkg.getString("signer").matches("[a-f0-9]{64}") || pkg.optJSONArray("sources") == null) throw new IOException("Invalid Aniyomi inventory; existing data was preserved"); }
    }
    public static String hash(byte[] data) throws Exception {
        StringBuilder out = new StringBuilder(); for (byte b : MessageDigest.getInstance("SHA-256").digest(data)) out.append(String.format(Locale.ROOT, "%02x", b & 255)); return out.toString();
    }
    public static String fileHash(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new FileInputStream(file)) { byte[] block = new byte[32768]; int n; while ((n = input.read(block)) >= 0) { interrupted(); digest.update(block, 0, n); } }
        StringBuilder out = new StringBuilder(); for (byte b : digest.digest()) out.append(String.format(Locale.ROOT, "%02x", b & 255)); return out.toString();
    }
    private static void interrupted() throws InterruptedIOException { if (Thread.currentThread().isInterrupted()) throw new InterruptedIOException("Provider request cancelled"); }
    private static void requireKey(String key) { if (!key.matches("[a-f0-9]{64}")) throw new IllegalArgumentException("Invalid package key"); }
    private static String identity(String... values) throws Exception {
        // JSONObject.quote differs between Android and desktop (notably '/').
        // Identity bytes follow JSON.stringify's URL/string representation.
        StringBuilder json = new StringBuilder("[");
        for (int i = 0; i < values.length; i++) { if (i > 0) json.append(','); String value = values[i]; if (value.matches("(?s).*[\\x00-\\x1f].*")) throw new IOException("Invalid identity string"); json.append('"').append(value.replace("\\", "\\\\").replace("\"", "\\\"")).append('"'); }
        return hash(json.append(']').toString().getBytes(StandardCharsets.UTF_8));
    }
    private static URL secure(String value) throws Exception { URL url = new URL(value); if (!url.getProtocol().equals("https") || url.getUserInfo() != null || value.length() > 16000) throw new IOException("Use an HTTPS repository without login credentials"); return url; }
    public static byte[] download(String value, int limit) throws Exception {
        URL url = secure(value);
        for (int redirects = 0; redirects <= 5; redirects++) {
            interrupted(); HttpURLConnection connection = (HttpURLConnection)url.openConnection(); connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(15000); connection.setReadTimeout(30000);
            if (url.getHost().equals("api.github.com") && url.getPath().contains("/releases/assets/")) connection.setRequestProperty("Accept", "application/octet-stream");
            try {
                int status = connection.getResponseCode();
                if (status >= 300 && status <= 399) { String location = connection.getHeaderField("Location"); if (location == null) throw new IOException("Invalid repository redirect"); url = secure(new URL(url, location).toString()); continue; }
                if (status != 200 || connection.getContentLengthLong() > limit) throw new IOException("Repository download failed (HTTP " + status + ")");
                try (InputStream input = connection.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                    byte[] block = new byte[32768]; int n;
                    while ((n = input.read(block)) != -1) { interrupted(); if (output.size() + n > limit) throw new IOException("Response exceeds size limit"); output.write(block, 0, n); }
                    return output.toByteArray();
                }
            } finally { connection.disconnect(); }
        }
        throw new IOException("Too many repository redirects");
    }
    public static void atomic(File target, byte[] bytes) throws Exception {
        Files.createDirectories(target.getParentFile().toPath());
        File candidate = File.createTempFile("tatakai-", ".partial", target.getParentFile());
        try {
            try (FileOutputStream out = new FileOutputStream(candidate)) { out.write(bytes); out.getFD().sync(); }
            interrupted();
            try { Files.move(candidate.toPath(), target.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING); }
            catch (AtomicMoveNotSupportedException e) { Files.move(candidate.toPath(), target.toPath(), StandardCopyOption.REPLACE_EXISTING); }
        } finally { if (candidate.exists()) candidate.delete(); }
    }
    private void commit(JSONObject next) throws Exception { atomic(new File(root, "state.json"), next.toString().getBytes(StandardCharsets.UTF_8)); state = next; }
    private File artifact(JSONObject pkg) throws Exception {
        String key = pkg.getString("id"), digest = pkg.getString("digest"); requireKey(key); if (!digest.matches("[a-f0-9]{64}")) throw new IOException("Invalid package checksum");
        return new File(new File(root, "artifacts"), key + "." + digest + ".apk");
    }
    private JSONObject source(JSONObject pkg, JSONObject upstream) throws Exception {
        String upstreamId = upstream.getString("id");
        if (!upstreamId.matches("-?[0-9]{1,20}")) throw new IOException("Invalid original source ID");
        String id = "compat-aniyomi-" + identity(pkg.getString("repository"), pkg.getString("pkgName"), upstreamId).substring(0, 32);
        return new JSONObject().put("id", id).put("upstreamId", upstreamId).put("packageId", pkg.getString("id")).put("repository", pkg.getString("repository"))
            .put("ecosystem", "aniyomi").put("name", upstream.optString("name", pkg.getString("name"))).put("extensionName", pkg.getString("name"))
            .put("lang", upstream.optString("lang", pkg.optString("lang", "unknown"))).put("kind", pkg.getString("kind")).put("baseUrl", upstream.optString("baseUrl"))
            .put("hasSettings", true).put("enabled", enabled.get(id) == Boolean.TRUE);
    }
    private JSONArray sources() throws Exception {
        JSONArray result = new JSONArray(); JSONObject packages = state.getJSONObject("packages");
        for (Iterator<String> it = packages.keys(); it.hasNext();) { JSONObject pkg = packages.getJSONObject(it.next()); JSONArray actual = pkg.getJSONArray("sources"); for (int i = 0; i < actual.length(); i++) result.put(source(pkg, actual.getJSONObject(i))); }
        return result;
    }
    private JSONArray inventory() throws Exception {
        JSONArray result = new JSONArray(); JSONObject packages = state.getJSONObject("packages");
        for (Iterator<String> it = packages.keys(); it.hasNext();) { String id = it.next(); JSONObject pkg = new JSONObject(packages.getJSONObject(id).toString()).put("installed", true).put("hasUpdate", false); if (errors.containsKey(id)) pkg.put("error", errors.get(id)); result.put(pkg); } return result;
    }
    private String indexUrl(String input) throws Exception {
        String value = secure(input).toString().replaceFirst("#.*$", "");
        return new URL(value).getPath().endsWith(".json") || new URL(value).getPath().endsWith(".pb") ? value : value.replaceAll("/+$", "") + "/index.min.json";
    }
    private JSONArray catalog(String repository) throws Exception {
        JSONArray entries = AniyomiRepository.read(repository);
        if (entries.length() > 20000) throw new IOException("Extension index is too large"); JSONArray result = new JSONArray();
        for (int i = 0; i < entries.length(); i++) {
            JSONObject row = entries.getJSONObject(i); String label = row.optString("name"), kind;
            if (label.startsWith("Aniyomi: ")) { kind = "watch"; label = label.substring(9); }
            else if (label.startsWith("Tachiyomi: ")) { kind = "read"; label = label.substring(11); }
            else if (row.optString("pkg").contains(".animeextension.")) kind = "watch";
            else if (row.optString("pkg").contains(".extension.")) kind = "read";
            else continue;
            String pkgName = row.getString("pkg"), apk = row.optString("apk"), versionCode = String.valueOf(row.get("code"));
            if (!pkgName.matches("[A-Za-z][A-Za-z0-9_.]{2,220}") || !row.has("directUrl") && !apk.matches("[A-Za-z0-9_.-]{1,240}\\.apk") || !versionCode.matches("[0-9]{1,15}") || label.length() > 300) throw new IOException("Invalid repository package metadata");
            String id = identity(repository, pkgName);
            JSONObject installed = state.getJSONObject("packages").optJSONObject(id);
            JSONObject pkg = new JSONObject().put("id", id).put("pkgName", pkgName).put("name", label).put("kind", kind).put("ecosystem", "aniyomi").put("repository", repository)
                .put("version", row.getString("version")).put("versionCode", versionCode).put("lang", row.optString("lang", "unknown"))
                .put("url", secure(row.has("directUrl") ? row.getString("directUrl") : new URL(new URL(repository), "apk/" + apk).toString()).toString()).put("installed", installed != null)
                .put("hasUpdate", installed != null && Long.parseLong(versionCode) > Long.parseLong(installed.getString("versionCode")));
            if (row.has("sha256")) { String sha = row.getString("sha256").toLowerCase(Locale.ROOT); if (!sha.matches("[a-f0-9]{64}")) throw new IOException("Invalid repository checksum"); pkg.put("expectedDigest", sha); }
            if (row.has("signer")) pkg.put("expectedSigner", row.getString("signer"));
            result.put(pkg);
        }
        if (result.length() == 0) throw new IOException("No original Aniyomi anime/manga APKs found in this index"); return result;
    }
    private JSONArray catalog() throws Exception {
        LinkedHashMap<String, JSONObject> all = new LinkedHashMap<>(); JSONArray repositories = state.getJSONArray("repositories"); String failure = null;
        for (int i = 0; i < repositories.length(); i++) {
            try { JSONArray rows = catalog(repositories.getJSONObject(i).getString("url")); for (int j = 0; j < rows.length(); j++) { JSONObject pkg = rows.getJSONObject(j); all.put(pkg.getString("id"), pkg); } }
            catch (Exception error) { interrupted(); failure = error.getMessage(); }
        }
        JSONArray installed = inventory(); for (int i = 0; i < installed.length(); i++) { JSONObject pkg = installed.getJSONObject(i); if (!all.containsKey(pkg.getString("id"))) all.put(pkg.getString("id"), pkg.put("catalogUnavailable", true)); }
        if (all.isEmpty() && failure != null) throw new IOException(failure); return new JSONArray(all.values());
    }
    private void ensureLoaded(JSONObject selected) throws Exception {
        synchronized (loading) {
            if (!loaded) { platform.reset(); loadedPackages.clear(); loaded = true; }
            String id = selected.getString("packageId");
            if (loadedPackages.contains(id)) return;
            JSONObject pkg = state.getJSONObject("packages").getJSONObject(id); File file = artifact(pkg);
            if (!fileHash(file).equals(pkg.getString("digest"))) throw new IOException("Installed original APK checksum mismatch"); platform.verify(file, pkg);
            // A large installed library is metadata, not a request to execute every APK.
            File directory = new File(root, "active/packages/" + id); Files.createDirectories(directory.toPath());
            String name = id + "." + pkg.getString("digest") + ".apk"; File active = new File(directory, name);
            if (!active.isFile() || !fileHash(active).equals(pkg.getString("digest"))) atomic(active, Files.readAllBytes(file.toPath())); active.setReadOnly();
            File[] old = directory.listFiles(); if (old != null) for (File entry : old) if (entry.isFile() && entry.getName().endsWith(".apk") && !entry.getName().equals(name)) { entry.setWritable(true); if (!entry.delete()) throw new IOException("Cannot remove stale active APK"); }
            JSONArray actual = new JSONArray(platform.invoke(pkg.getString("kind").equals("watch") ? "getInstalledAnimeExtensions" : "getInstalledMangaExtensions", new JSONObject().put("path", directory.getAbsolutePath()).put("merge", true)));
            Set<String> found = new HashSet<>(); for (int i = 0; i < actual.length(); i++) { JSONObject row = actual.getJSONObject(i); found.add(row.getString("pkgName") + ":" + String.valueOf(row.get("id"))); }
            JSONArray cached = pkg.getJSONArray("sources"); for (int i = 0; i < cached.length(); i++) if (!found.contains(pkg.getString("pkgName") + ":" + cached.getJSONObject(i).getString("id"))) throw new IOException("Original source loading failed; repair this package");
            loadedPackages.add(id);
        }
    }
    public Object request(JSONObject p) throws Exception {
        interrupted(); String op = p.getString("op"); Object result;
        if (op.equals("setEnabled")) return setEnabled(p);
        if (MUTATIONS.contains(op)) synchronized (mutations) { result = execute(p); } else result = execute(p);
        interrupted();
        if (p.has("sourceId") && !Arrays.asList("preferences", "setPreference").contains(op) && enabled.get(p.getString("sourceId")) != Boolean.TRUE) throw new IOException("Source was disabled or removed");
        return result;
    }
    public Object setEnabled(JSONObject p) throws Exception {
        String id = p.getString("sourceId"); if (!(p.get("enabled") instanceof Boolean)) throw new IOException("Invalid enabled flag");
        boolean exists = false; JSONArray sources = sources(); for (int i = 0; i < sources.length(); i++) if (sources.getJSONObject(i).getString("id").equals(id)) exists = true;
        if (!exists) throw new IOException("Source is not installed");
        synchronized (storageLock) { JSONObject next = new JSONObject(state.toString()); next.getJSONObject("enabled").put(id, p.getBoolean("enabled")); commit(next); enabled.put(id, p.getBoolean("enabled")); } return JSONObject.NULL;
    }
    private Object execute(JSONObject p) throws Exception {
        String op = p.getString("op");
        if (op.equals("installedPackages")) return inventory(); if (op.equals("sources")) return sources(); if (op.equals("repositories")) return new JSONArray(state.getJSONArray("repositories").toString());
        if (op.equals("addRepository") || op.equals("removeRepository")) {
            String url = indexUrl(p.getString("url")); if (op.equals("addRepository")) catalog(url);
            synchronized (storageLock) { JSONObject next = new JSONObject(state.toString()); JSONArray old = next.getJSONArray("repositories"), rows = new JSONArray(); for (int i = 0; i < old.length(); i++) if (!old.getJSONObject(i).getString("url").equals(url)) rows.put(old.get(i)); if (op.equals("addRepository")) rows.put(new JSONObject().put("url", url).put("name", new URL(url).getHost()).put("ecosystem", "aniyomi")); next.put("repositories", rows); commit(next); } return JSONObject.NULL;
        }
        if (op.equals("packages")) return catalog();
        if (op.equals("install")) {
            String id = p.getString("packageId"); requireKey(id); JSONObject candidate = null; JSONArray all = catalog();
            for (int i = 0; i < all.length(); i++) if (all.getJSONObject(i).getString("id").equals(id)) candidate = all.getJSONObject(i);
            if (candidate == null || candidate.optBoolean("catalogUnavailable")) throw new IOException("Refresh the repository before installing");
            JSONObject previous = state.getJSONObject("packages").optJSONObject(id);
            if (previous != null && Long.parseLong(candidate.getString("versionCode")) < Long.parseLong(previous.getString("versionCode"))) throw new IOException("Repository attempted an APK downgrade");
            byte[] bytes = download(candidate.getString("url"), 64 * 1024 * 1024); String digest = hash(bytes);
            if (candidate.has("expectedDigest") && !digest.equals(candidate.getString("expectedDigest"))) throw new IOException("Repository APK checksum mismatch"); candidate.put("digest", digest);
            File artifact = artifact(candidate); if (!artifact.isFile() || !fileHash(artifact).equals(digest)) { if (artifact.exists()) artifact.setWritable(true); atomic(artifact, bytes); } artifact.setReadOnly();
            JSONObject verified = platform.verify(artifact, candidate);
            if (candidate.has("expectedSigner") && !candidate.getString("expectedSigner").equals(verified.getString("signer"))) throw new IOException("APK signer does not match the protobuf repository fingerprint");
            if (previous != null && !previous.getString("signer").equals(verified.getString("signer"))) throw new IOException("APK signing certificate changed; existing extension was preserved");
            candidate.put("signer", verified.getString("signer"));
            File staging = new File(root, "candidate/" + UUID.randomUUID()); Files.createDirectories(staging.toPath());
            JSONArray actual = platform.validate(artifact, candidate, staging), descriptors = new JSONArray();
            for (int i = 0; i < actual.length(); i++) { JSONObject row = actual.getJSONObject(i); if (!row.getString("pkgName").equals(candidate.getString("pkgName"))) throw new IOException("Candidate returned an unrelated source"); JSONObject cached = new JSONObject().put("id", String.valueOf(row.get("id"))).put("name", row.getString("name")).put("lang", row.optString("lang", "unknown")).put("baseUrl", row.optString("baseUrl")); source(candidate, cached); descriptors.put(cached); }
            if (descriptors.length() == 0) throw new IOException("Original APK registered no compatible sources"); candidate.put("sources", descriptors); candidate.remove("catalogUnavailable");
            synchronized (storageLock) { JSONObject next = new JSONObject(state.toString()); next.getJSONObject("packages").put(id, candidate); commit(next); loaded = false; } errors.remove(id); return JSONObject.NULL;
        }
        if (op.equals("remove")) {
            String id = p.getString("packageId"); requireKey(id);
            synchronized (storageLock) {
                JSONObject next = new JSONObject(state.toString()), pkg = next.getJSONObject("packages").optJSONObject(id); if (pkg == null) throw new IOException("Package is not installed");
                JSONArray rows = pkg.getJSONArray("sources"); List<String> keys = new ArrayList<>(); for (int i = 0; i < rows.length(); i++) { String key = source(pkg, rows.getJSONObject(i)).getString("id"); keys.add(key); next.getJSONObject("enabled").remove(key); }
                next.getJSONObject("packages").remove(id); commit(next); for (String key : keys) enabled.remove(key); loaded = false;
            } return JSONObject.NULL;
        }
        JSONObject selected = null; JSONArray rows = sources(); for (int i = 0; i < rows.length(); i++) if (rows.getJSONObject(i).getString("id").equals(p.optString("sourceId"))) selected = rows.getJSONObject(i);
        if (selected == null) throw new IOException("Aniyomi source is not installed");
        if (!Arrays.asList("preferences", "setPreference").contains(op) && enabled.get(selected.getString("id")) != Boolean.TRUE) throw new IOException("Source is disabled");
        ensureLoaded(selected); String owner = selected.getString("id");
        JSONObject args = new JSONObject().put("sourceId", selected.getString("upstreamId")).put("isAnime", selected.getString("kind").equals("watch"));
        if (op.equals("image")) return new JSONObject(platform.invoke("image", args.put("imageKey", p.getString("imageKey"))));
        if (op.equals("preferences") || op.equals("setPreference")) {
            JSONArray prefs = preferenceRows(new JSONArray(platform.invoke("getPreference", args)));
            if (op.equals("preferences")) return prefs;
            int position = p.getInt("position"); if (position < 0 || position >= prefs.length()) throw new IOException("Invalid preference position"); JSONObject pref = prefs.getJSONObject(position);
            validatePreference(pref, p.get("value")); JSONObject change = new JSONObject().put("sourceId", selected.getString("upstreamId")).put("key", pref.getString("key")).put("value", new JSONObject().put("value", p.get("value")).toString());
            if (!Boolean.parseBoolean(platform.invoke("saveSourcePreference", change))) throw new IOException("Original preference callback rejected this value"); return JSONObject.NULL;
        }
        if (op.equals("search") || op.equals("browse")) {
            args.put("page", Math.max(1, Math.min(100, p.optInt("page", 1)))); if (op.equals("search")) args.put("query", p.optString("query").substring(0, Math.min(p.optString("query").length(), 300))).put("filters", "[]");
            JSONObject data = new JSONObject(platform.invoke(op.equals("search") ? "search" : "getPopular", args)); JSONArray items = data.getJSONArray("list"), results = new JSONArray();
            for (int i = 0; i < Math.min(items.length(), 500); i++) { JSONObject item = items.getJSONObject(i); original(item.getString("url")); results.put(new JSONObject().put("id", token(owner, item)).put("title", item.getString("title")).put("image", item.opt("cover"))); }
            return new JSONObject().put("results", results).put("hasNextPage", data.optBoolean("hasNextPage"));
        }
        if (op.equals("info") || op.equals("chapters")) {
            JSONObject media = untoken(owner, p.getString("id")); original(media.getString("url"));
            args.put("media", media.toString()); JSONObject data = new JSONObject(platform.invoke("getDetail", args)), entries = new JSONObject(); JSONArray upstream = data.getJSONArray("episodes"), result = new JSONArray();
            for (int i = 0; i < Math.min(upstream.length(), 10000); i++) {
                JSONObject row = upstream.getJSONObject(i); original(row.getString("url")); row.put("titleUrl", media.getString("url")); JSONObject entry = new JSONObject().put("id", token(owner, row)).put("label", row.optString("name", "Entry"));
                double number = row.optDouble("episode_number", Double.NaN); if (Double.isFinite(number) && number >= 0) entry.put("number", number); result.put(entry);
            }
            return new JSONObject().put("id", p.getString("id")).put("title", data.optString("title", media.getString("title"))).put("description", data.opt("description")).put("image", data.opt("cover")).put("entries", result);
        }
        if (op.equals("pages") || op.equals("resolve")) {
            boolean video = op.equals("resolve"); if (video != selected.getString("kind").equals("watch")) throw new IOException("Wrong content type for this source");
            JSONObject episode = untoken(owner, p.getString(video ? "episodeId" : "chapterId")); original(episode.getString("url"));
            if (video && !episode.getString("titleUrl").equals(untoken(owner, p.getString("id")).getString("url"))) throw new IOException("Episode belongs to another title");
            args.put("episode", episode.toString()); JSONArray resolved = new JSONArray(platform.invoke(video ? "getVideoList" : "getPageList", args)); JSONArray result = new JSONArray();
            for (int i = 0; i < Math.min(resolved.length(), video ? 100 : 2000); i++) {
                JSONObject row = resolved.getJSONObject(i);
                if (!video) {
                    synchronized (loading) { if (imageServer == null) imageServer = new AniyomiImageServer(new File(root, "data/images"), (sourceId, key) -> (JSONObject)request(new JSONObject().put("op", "image").put("sourceId", sourceId).put("imageKey", key))); }
                    result.put(new JSONObject().put("pageNumber", i + 1).put("imageUrl", imageServer.grant(owner, row.getString("imageKey"))).put("headers", new JSONObject())); continue;
                }
                String url = address(row.getString("url"));
                JSONObject stream = new JSONObject().put("url", url).put("forceProxy", true).put("source", row.optString("title", selected.getString("name"))).put("quality", row.opt("quality"))
                    .put("sourceType", url.matches("(?i).*\\.m3u8(?:\\?.*)?$") ? "hls" : url.matches("(?i).*\\.mpd(?:\\?.*)?$") ? "dash" : "mp4").put("headers", row.optJSONObject("headers") == null ? new JSONObject() : row.getJSONObject("headers"));
                JSONArray subtitles = row.optJSONArray("subtitles"), tracks = new JSONArray(); if (subtitles != null) for (int t = 0; t < Math.min(subtitles.length(), 100); t++) { JSONObject track = subtitles.getJSONObject(t); tracks.put(new JSONObject().put("url", address(track.getString("file"))).put("label", track.optString("label")).put("language", track.optString("label")).put("headers", stream.get("headers"))); }
                stream.put("subtitles", tracks); if (row.has("audios")) stream.put("audioTracks", row.get("audios")); result.put(stream);
            }
            if (result.length() == 0) throw new IOException("Original source returned no media"); return new JSONObject().put(video ? "sources" : "pages", result);
        }
        throw new IOException("Unsupported Aniyomi operation");
    }
    private static String address(String value) throws Exception { URL url = new URL(value); if (!Arrays.asList("http", "https").contains(url.getProtocol()) || url.getUserInfo() != null || value.length() > 16000) throw new IOException("Invalid source media URL"); return value; }
    private static void original(String id) throws Exception { if (id.isEmpty() || id.length() > 12000 || id.matches("(?s).*[\\x00-\\x1f].*")) throw new IOException("Invalid original content ID"); }
    private static String token(String owner, JSONObject data) throws Exception { return Base64.getUrlEncoder().withoutPadding().encodeToString(new JSONArray().put(owner).put(data).toString().getBytes(StandardCharsets.UTF_8)); }
    private static JSONObject untoken(String owner, String encoded) throws Exception { if (encoded.length() > 50000) throw new IOException("Content identifier is too long"); JSONArray data = new JSONArray(new String(Base64.getUrlDecoder().decode(encoded), StandardCharsets.UTF_8)); if (!owner.equals(data.getString(0))) throw new IOException("Content belongs to another source"); return data.getJSONObject(1); }
    public static JSONArray preferenceRows(JSONArray raw) throws Exception {
        JSONArray result = new JSONArray();
        for (int i = 0; i < Math.min(raw.length(), 500); i++) {
            JSONObject row = raw.getJSONObject(i); String type = row.optString("type"), kind = Arrays.asList("switch", "checkbox").contains(type) ? "boolean" : type.equals("list") ? "select" : type.equals("multi_select") ? "multiselect" : type.equals("text") ? "text" : "unsupported";
            JSONArray values = row.optJSONArray("entryValues"), labels = row.optJSONArray("entries"), options = new JSONArray(); if (values != null) for (int j = 0; j < Math.min(values.length(), 500); j++) options.put(new JSONObject().put("value", values.getString(j)).put("label", labels != null && j < labels.length() ? labels.getString(j) : values.getString(j)));
            result.put(new JSONObject().put("position", i).put("key", row.optString("key")).put("title", row.optString("title", row.optString("key", "Source setting"))).put("summary", row.opt("summary"))
                .put("kind", kind).put("value", row.has("currentValue") ? row.get("currentValue") : row.opt("value")).put("enabled", row.optBoolean("enabled", true)).put("visible", row.optBoolean("visible", true)).put("options", options)
                .put("secret", (row.optString("key") + row.optString("title")).matches("(?i).*(password|secret|token|api.?key).*")));
        } return result;
    }
    private static void validatePreference(JSONObject pref, Object value) throws Exception {
        if (!pref.getBoolean("enabled") || !pref.getBoolean("visible") || pref.getString("key").isEmpty()) throw new IOException("Preference is unavailable");
        String kind = pref.getString("kind"); Set<String> options = new HashSet<>(); JSONArray rows = pref.getJSONArray("options"); for (int i = 0; i < rows.length(); i++) options.add(rows.getJSONObject(i).getString("value"));
        if (kind.equals("boolean") && value instanceof Boolean || kind.equals("text") && value instanceof String && ((String)value).length() <= 10000 || kind.equals("select") && value instanceof String && options.contains(value)) return;
        if (kind.equals("multiselect") && value instanceof JSONArray) { JSONArray values = (JSONArray)value; if (values.length() > options.size()) throw new IOException("Invalid preference selection"); for (int i = 0; i < values.length(); i++) if (!options.contains(values.getString(i))) throw new IOException("Invalid preference selection"); return; }
        throw new IOException("Invalid preference value");
    }
    public void close() throws Exception { if (imageServer != null) imageServer.close(); platform.close(); }
}
