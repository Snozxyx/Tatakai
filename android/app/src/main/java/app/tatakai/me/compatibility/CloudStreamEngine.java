package app.tatakai.me.compatibility;

import android.content.Context;
import android.util.AtomicFile;
import android.util.Base64;
import dalvik.system.DexClassLoader;
import org.json.*;
import java.io.*;
import java.net.*;
import java.lang.reflect.*;
import java.lang.reflect.Proxy;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;
import java.util.zip.ZipFile;

/** Original bytecode compatibility host. Runs only in the app's :compatibility process. */
final class CloudStreamEngine {
    private static final String HOST_URL = "https://github.com/recloudstream/cloudstream/releases/download/v4.8.0/4.8.0.apk";
    private static final String HOST_HASH = "348c3f09551f2dda4fba25ba348928ee7b82a47ce98a6b1eae3295d4c127877c";
    private final Context context;
    private final File root, hostFile;
    private final AtomicFile storage;
    private JSONObject state;
    private ClassLoader hostLoader;
    private final Map<String, Object> providers = new ConcurrentHashMap<>();
    private final Map<String, JSONObject> sources = new ConcurrentHashMap<>();
    private final Map<String, String[]> entries = new ConcurrentHashMap<>();
    private final Map<String, Boolean> enabled = new ConcurrentHashMap<>();
    private final Set<String> loaded = ConcurrentHashMap.newKeySet();
    private final Map<String, Object> plugins = new HashMap<>();
    private final Map<String, File> pluginFiles = new HashMap<>();
    private volatile boolean restartRequired;

    CloudStreamEngine(Context context) throws Exception {
        this.context = context;
        root = new File(context.getFilesDir(), "compatibility/cloudstream");
        if (!root.isDirectory() && !root.mkdirs()) throw new IOException("Cannot create compatibility storage");
        hostFile = new File(root, "host-4.8.0.apk");
        storage = new AtomicFile(new File(root, "state.json"));
        if (storage.getBaseFile().exists()) {
            state = new JSONObject(new String(storage.readFully(), StandardCharsets.UTF_8));
            if (state.optInt("version") != 1) throw new IOException("Unsupported compatibility settings version");
        } else state = new JSONObject().put("version", 1).put("repositories", new JSONArray()).put("packages", new JSONObject()).put("enabled", new JSONObject());
        JSONObject flags = state.getJSONObject("enabled");
        Iterator<String> keys = flags.keys(); while (keys.hasNext()) { String key = keys.next(); enabled.put(key, flags.optBoolean(key)); }
    }
    private synchronized void save() throws Exception {
        JSONObject flags = new JSONObject(); for (Map.Entry<String, Boolean> e : enabled.entrySet()) flags.put(e.getKey(), e.getValue());
        state.put("enabled", flags);
        FileOutputStream out = storage.startWrite();
        try { out.write(state.toString().getBytes(StandardCharsets.UTF_8)); storage.finishWrite(out); }
        catch (Exception e) { storage.failWrite(out); throw e; }
    }
    private static String hash(byte[] bytes) throws Exception {
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
        StringBuilder result = new StringBuilder(); for (byte b : digest) result.append(String.format(Locale.ROOT, "%02x", b & 255)); return result.toString();
    }
    private static String fileHash(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream input = new FileInputStream(file)) { byte[] buffer = new byte[16384]; int n; while ((n = input.read(buffer)) != -1) digest.update(buffer, 0, n); }
        StringBuilder out = new StringBuilder(); for (byte b : digest.digest()) out.append(String.format(Locale.ROOT, "%02x", b & 255)); return out.toString();
    }
    private static URL https(String value) throws Exception {
        URL url = new URL(value);
        if (!url.getProtocol().equals("https") || url.getUserInfo() != null) throw new IOException("Use an HTTPS repository without login credentials");
        return url;
    }
    private static byte[] get(String url, int limit) throws Exception {
        HttpURLConnection connection = (HttpURLConnection)https(url).openConnection();
        connection.setConnectTimeout(15000); connection.setReadTimeout(30000);
        try {
            if (connection.getResponseCode() != 200 || !connection.getURL().getProtocol().equals("https")) throw new IOException("Repository download failed");
            try (InputStream input = connection.getInputStream(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[16384]; int n;
                while ((n = input.read(buffer)) != -1) { if (Thread.currentThread().isInterrupted()) throw new InterruptedIOException(); if (out.size() + n > limit) throw new IOException("Response too large"); out.write(buffer, 0, n); }
                return out.toByteArray();
            }
        } finally { connection.disconnect(); }
    }
    private void download(String url, File file, String digest, int limit) throws Exception {
        // Packages are never loaded before the entire artifact has passed verification.
        byte[] data = get(url, limit);
        if (!hash(data).equalsIgnoreCase(digest)) throw new IOException("Package checksum mismatch");
        File candidate = new File(root, file.getName() + ".candidate");
        try (FileOutputStream out = new FileOutputStream(candidate)) { out.write(data); out.getFD().sync(); }
        candidate.setReadOnly();
        if (!candidate.renameTo(file)) throw new IOException("Could not activate package");
    }
    private synchronized ClassLoader host() throws Exception {
        if (hostLoader == null) {
            if (!hostFile.exists()) throw new IOException("Download the CloudStream runtime in Extensions first");
            if (!fileHash(hostFile).equals(HOST_HASH)) throw new IOException("CloudStream host checksum mismatch; repair the local runtime");
            hostFile.setReadOnly();
            // Host Kotlin/OkHttp versions must not accidentally resolve to the
            // application's unrelated copies. Android's boot types stay shared.
            hostLoader = new DexClassLoader(hostFile.getPath(), context.getCodeCacheDir().getPath(), null, ClassLoader.getSystemClassLoader().getParent());
            // Initialize the original NewPipe downloader just as the host app
            // does, rather than leaving YouTube's downloader singleton null.
            try {
                Class<?> factory = hostLoader.loadClass("com.lagradost.cloudstream3.DownloaderTestImpl");
                Object companion = factory.getField("Companion").get(null);
                Object downloader = companion.getClass().getMethod("getInstance").invoke(companion);
                hostLoader.loadClass("org.schabi.newpipe.extractor.NewPipe").getMethod("init", hostLoader.loadClass("org.schabi.newpipe.extractor.downloader.Downloader")).invoke(null, downloader);
            } catch (ReflectiveOperationException error) { android.util.Log.w("TatakaiCompatibility", "Original NewPipe host initialization is unavailable", error); }
        }
        return hostLoader;
    }
    private Object getValue(Object object, String method) throws Exception { return object.getClass().getMethod(method).invoke(object); }
    private Object invokeSuspend(Object target, String name, Object... arguments) throws Exception {
        ClassLoader loader = host();
        Class<?> continuation = loader.loadClass("kotlin.coroutines.Continuation");
        Class<?> jobType = loader.loadClass("kotlinx.coroutines.Job");
        Object job = loader.loadClass("kotlinx.coroutines.JobKt").getMethod("Job", jobType).invoke(null, new Object[]{null});
        CountDownLatch completed = new CountDownLatch(1); Object[] resumed = new Object[1];
        Object callback = Proxy.newProxyInstance(loader, new Class<?>[]{continuation}, (proxy, method, args) -> {
            if (method.getName().equals("getContext")) return job;
            if (method.getName().equals("resumeWith")) { resumed[0] = args[0]; completed.countDown(); return null; }
            return objectMethod(proxy, method, args);
        });
        Method selected = null;
        for (Method method : target.getClass().getMethods()) {
            Class<?>[] types = method.getParameterTypes();
            if (method.getName().equals(name) && types.length == arguments.length + 1 && types[types.length - 1] == continuation) { selected = method; break; }
        }
        if (selected == null) throw new IOException("Unsupported provider method: " + name);
        Object[] parameters = Arrays.copyOf(arguments, arguments.length + 1); parameters[arguments.length] = callback;
        try {
        Object value = selected.invoke(target, parameters);
        Method marker = loader.loadClass("kotlin.coroutines.intrinsics.IntrinsicsKt").getMethod("getCOROUTINE_SUSPENDED"); marker.setAccessible(true);
        if (value == marker.invoke(null)) {
            if (!completed.await(35, TimeUnit.SECONDS)) throw new IOException("Provider timed out");
            value = resumed[0];
        }
        loader.loadClass("kotlin.ResultKt").getMethod("throwOnFailure", Object.class).invoke(null, value);
        return value;
        } finally {
            jobType.getMethod("cancel", CancellationException.class).invoke(job, new CancellationException("Tatakai provider call ended"));
        }
    }
    private static Object objectMethod(Object proxy, Method method, Object[] args) {
        if (method.getName().equals("toString")) return "TatakaiCompatibilityCallback";
        if (method.getName().equals("hashCode")) return System.identityHashCode(proxy);
        if (method.getName().equals("equals")) return proxy == args[0];
        return null;
    }
    private File packageFile(String packageId, JSONObject pkg) throws Exception {
        String digest = pkg.getString("fileHash").replaceFirst("^sha256-", "").toLowerCase(Locale.ROOT);
        if (!packageId.matches("[a-f0-9]{64}") || !digest.matches("[a-f0-9]{64}")) throw new IOException("Invalid installed package identity");
        File versioned = new File(root, packageId + "." + digest + ".cs3");
        File legacy = new File(root, packageId + ".cs3");
        return !versioned.exists() && legacy.exists() && fileHash(legacy).equals(digest) ? legacy : versioned;
    }
    private synchronized void loadPackage(String packageId, JSONObject pkg) throws Exception {
        if (loaded.contains(packageId)) return;
        File file = packageFile(packageId, pkg); file.setReadOnly();
        if (!fileHash(file).equalsIgnoreCase(pkg.getString("fileHash").replaceFirst("^sha256-", ""))) throw new IOException("Installed extension checksum mismatch");
        ClassLoader loader = new DexClassLoader(file.getPath(), context.getCodeCacheDir().getPath(), null, host());
        Class<?> holderClass = host().loadClass("com.lagradost.cloudstream3.APIHolder");
        Object holder = holderClass.getField("INSTANCE").get(null);
        @SuppressWarnings("unchecked") List<Object> registry = (List<Object>)holderClass.getMethod("getAllProviders").invoke(holder);
        Set<Object> before = Collections.newSetFromMap(new IdentityHashMap<>()); before.addAll(registry);
        JSONObject manifest;
        try (ZipFile zip = new ZipFile(file); InputStream input = zip.getInputStream(zip.getEntry("manifest.json"))) {
            ByteArrayOutputStream out = new ByteArrayOutputStream(); byte[] buffer = new byte[4096]; int n;
            while ((n = input.read(buffer)) != -1) { if (out.size() + n > 65536) throw new IOException("Invalid plugin manifest"); out.write(buffer, 0, n); }
            manifest = new JSONObject(out.toString("UTF-8"));
        }
        if (manifest.optBoolean("requiresResources")) throw new IOException("This extension requires Android resources; that host API is not supported yet");
        Object plugin = loader.loadClass(manifest.getString("pluginClassName")).getConstructor().newInstance();
        plugin.getClass().getMethod("setFilename", String.class).invoke(plugin, file.getPath());
        plugins.put(packageId, plugin);
        pluginFiles.put(packageId, file);
        try {
        try { plugin.getClass().getMethod("load", Context.class).invoke(plugin, context); }
        catch (NoSuchMethodException e) { plugin.getClass().getMethod("load").invoke(plugin); }
        boolean migratedFlags = false;
        for (Object provider : registry) if (!before.contains(provider)) {
            String name = String.valueOf(getValue(provider, "getName"));
            String lang = String.valueOf(getValue(provider, "getLang"));
            String legacyId = "compat-cloudstream-" + hash((pkg.getString("repository") + "\0" + packageId + "\0" + provider.getClass().getName() + "\0" + name + "\0" + lang).getBytes(StandardCharsets.UTF_8)).substring(0, 32);
            String id = "compat-cloudstream-" + hash((pkg.getString("repository") + "\0" + packageId + "\0" + name + "\0" + lang).getBytes(StandardCharsets.UTF_8)).substring(0, 32);
            if (enabled.containsKey(legacyId)) { if (!enabled.containsKey(id)) enabled.put(id, enabled.get(legacyId)); enabled.remove(legacyId); migratedFlags = true; }
            providers.put(id, provider);
            sources.put(id, new JSONObject().put("id", id).put("upstreamId", name + "\0" + lang).put("packageId", packageId).put("repository", pkg.getString("repository"))
                .put("ecosystem", "cloudstream").put("name", name).put("extensionName", pkg.getString("name")).put("lang", lang).put("kind", "watch"));
        }
        loaded.add(packageId);
        if (migratedFlags) save();
        } catch (Throwable error) {
            try { unloadPackage(packageId); } catch (Exception cleanup) { restartRequired = true; }
            if (error instanceof Exception) throw (Exception)error;
            throw new IOException("Extension initialization failed", error);
        }
    }
    @SuppressWarnings("unchecked")
    private synchronized void unloadPackage(String packageId) throws Exception {
        Object plugin = plugins.remove(packageId);
        Throwable failure = null;
        try { if (plugin != null) plugin.getClass().getMethod("beforeUnload").invoke(plugin); }
        catch (Throwable e) { failure = e; }
        File activeFile = pluginFiles.remove(packageId);
        String filename = (activeFile == null ? new File(root, packageId + ".cs3") : activeFile).getPath();
        if (hostLoader != null) {
            try {
                Class<?> holderType = hostLoader.loadClass("com.lagradost.cloudstream3.APIHolder");
                Object holder = holderType.getField("INSTANCE").get(null);
                List<Object> registry = (List<Object>)holderType.getMethod("getAllProviders").invoke(holder);
                for (Object provider : new ArrayList<>(registry)) if (filename.equals(getValue(provider, "getSourcePlugin"))) {
                    registry.remove(provider);
                    holderType.getMethod("removePluginMapping", hostLoader.loadClass("com.lagradost.cloudstream3.MainAPI")).invoke(holder, provider);
                }
                List<Object> extractors = (List<Object>)hostLoader.loadClass("com.lagradost.cloudstream3.utils.ExtractorApiKt").getMethod("getExtractorApis").invoke(null);
                for (Object extractor : new ArrayList<>(extractors)) if (filename.equals(getValue(extractor, "getSourcePlugin"))) extractors.remove(extractor);
                Class<?> actionsType = hostLoader.loadClass("com.lagradost.cloudstream3.actions.VideoClickActionHolder");
                Object actionsHolder = actionsType.getField("INSTANCE").get(null);
                List<Object> actions = (List<Object>)actionsType.getMethod("getAllVideoClickActions").invoke(actionsHolder);
                for (Object action : new ArrayList<>(actions)) if (filename.equals(getValue(action, "getSourcePlugin"))) actions.remove(action);
            } catch (Throwable e) { failure = e; }
        }
        for (String sourceId : new ArrayList<>(sources.keySet())) if (sources.get(sourceId).getString("packageId").equals(packageId)) {
            enabled.remove(sourceId); sources.remove(sourceId); providers.remove(sourceId);
            for (String entryId : new ArrayList<>(entries.keySet())) if (entries.get(entryId)[0].equals(sourceId)) entries.remove(entryId);
        }
        loaded.remove(packageId);
        if (failure != null) { restartRequired = true; throw new IOException("Extension cleanup failed; restart the app before using compatibility sources", failure); }
    }
    private JSONArray allSources() throws Exception {
        JSONObject packages = state.getJSONObject("packages");
        Iterator<String> keys = packages.keys();
        while (keys.hasNext()) { String key = keys.next(); try { loadPackage(key, packages.getJSONObject(key)); packages.getJSONObject(key).remove("error"); } catch (Exception e) { packages.getJSONObject(key).put("error", message(e)); } }
        JSONArray result = new JSONArray();
        for (Map.Entry<String, JSONObject> source : sources.entrySet()) result.put(new JSONObject(source.getValue().toString()).put("enabled", enabled.getOrDefault(source.getKey(), false)));
        return result;
    }
    synchronized Object setEnabled(JSONObject p) throws Exception {
        String id = p.getString("sourceId");
        if (!sources.containsKey(id) || !(p.get("enabled") instanceof Boolean)) throw new IOException("Source is not installed");
        Boolean previous = enabled.get(id);
        enabled.put(id, p.getBoolean("enabled"));
        try { save(); } catch (Exception error) { if (previous == null) enabled.remove(id); else enabled.put(id, previous); throw error; }
        return JSONObject.NULL;
    }
    private JSONArray catalog() throws Exception {
        JSONArray result = new JSONArray(), repositories = state.getJSONArray("repositories");
        Set<String> listed = new HashSet<>();
        for (int i = 0; i < repositories.length(); i++) {
            JSONObject repository = repositories.getJSONObject(i);
            JSONObject repo = new JSONObject(new String(get(repository.getString("url"), 10 * 1024 * 1024), StandardCharsets.UTF_8));
            JSONArray lists = repo.getJSONArray("pluginLists");
            for (int j = 0; j < Math.min(lists.length(), 20); j++) {
                String url = new URL(https(repository.getString("url")), lists.getString(j)).toString();
                JSONArray packages = new JSONArray(new String(get(url, 10 * 1024 * 1024), StandardCharsets.UTF_8));
                for (int k = 0; k < packages.length(); k++) {
                    JSONObject pkg = packages.getJSONObject(k);
                    String id = hash((repository.getString("url") + "\0" + pkg.getString("internalName")).getBytes(StandardCharsets.UTF_8));
                    if (!listed.add(id)) continue;
                    JSONObject installed = state.getJSONObject("packages").optJSONObject(id);
                    result.put(new JSONObject(pkg.toString()).put("id", id).put("repository", repository.getString("url")).put("ecosystem", "cloudstream").put("error", installed == null ? JSONObject.NULL : installed.opt("error"))
                        .put("installed", installed != null).put("hasUpdate", installed != null && installed.optInt("version") < pkg.optInt("version")));
                }
            }
        }
        // Removing a repository must not hide the uninstall control for packages
        // already installed from it.
        JSONObject installed = state.getJSONObject("packages");
        Iterator<String> keys = installed.keys();
        while (keys.hasNext()) { String id = keys.next(); if (!listed.contains(id)) result.put(new JSONObject(installed.getJSONObject(id).toString()).put("id", id).put("installed", true).put("hasUpdate", false)); }
        return result;
    }
    Object request(JSONObject p) throws Exception {
        String op = p.getString("op");
        if (op.equals("status")) return new JSONObject().put("platform", "android").put("runtimes", new JSONArray()
            .put(new JSONObject().put("ecosystem", "cloudstream").put("available", true).put("ready", hostFile.exists() && fileHash(hostFile).equals(HOST_HASH)).put("updates", true).put("downloadBytes", 72089111).put("message", "Local Android CloudStream host; host-dependent APIs vary by extension"))
            .put(new JSONObject().put("ecosystem", "mihon").put("available", false).put("ready", false).put("message", "Android Mihon compatibility host is not implemented yet")));
        if (p.has("ecosystem") && !p.getString("ecosystem").equals("cloudstream")) throw new IOException("This ecosystem has no Android compatibility host yet");
        if (restartRequired) throw new IOException("Restart the app to reset the compatibility host after extension cleanup failed");
        if (op.equals("prepare")) { download(HOST_URL, hostFile, HOST_HASH, 100 * 1024 * 1024); return new JSONObject().put("ready", true); }
        if (op.equals("sources")) return allSources();
        if (op.equals("repositories")) return state.getJSONArray("repositories");
        if (op.equals("addRepository") || op.equals("removeRepository")) {
            String url = https(p.getString("url")).toString(); JSONArray repos = state.getJSONArray("repositories"), next = new JSONArray();
            for (int i = 0; i < repos.length(); i++) if (!repos.getJSONObject(i).getString("url").equals(url)) next.put(repos.getJSONObject(i));
            if (op.equals("addRepository")) {
                JSONObject repo = new JSONObject(new String(get(url, 10 * 1024 * 1024), StandardCharsets.UTF_8)); repo.getJSONArray("pluginLists");
                next.put(new JSONObject().put("url", url).put("name", repo.optString("name", "CloudStream repository")).put("ecosystem", "cloudstream"));
            }
            state.put("repositories", next);
            try { save(); } catch (Exception error) { state.put("repositories", repos); throw error; }
            return JSONObject.NULL;
        }
        if (op.equals("installedPackages")) {
            JSONArray result = new JSONArray(); JSONObject installed = state.getJSONObject("packages");
            Iterator<String> keys = installed.keys();
            while (keys.hasNext()) { String id = keys.next(); JSONObject pkg = installed.getJSONObject(id);
                result.put(new JSONObject().put("id", id).put("name", pkg.optString("name", id)).put("version", String.valueOf(pkg.opt("version"))).put("repository", pkg.optString("repository")).put("ecosystem", "cloudstream").put("installed", true).put("hasUpdate", false).put("error", pkg.opt("error")));
            }
            return result;
        }
        if (op.equals("packages")) return catalog();
        if (op.equals("install")) {
            String id = p.getString("packageId"); JSONArray catalog = catalog(); JSONObject selected = null;
            for (int i = 0; i < catalog.length(); i++) if (catalog.getJSONObject(i).getString("id").equals(id)) selected = catalog.getJSONObject(i);
            if (selected == null) throw new IOException("Package is not in an added repository");
            String expected = selected.optString("fileHash").replaceFirst("^sha256-", "");
            if (!expected.matches("[a-fA-F0-9]{64}")) throw new IOException("This package has no SHA-256 digest; it cannot be installed safely");
            JSONObject packages = state.getJSONObject("packages"), previous = packages.optJSONObject(id);
            File target = new File(root, id + "." + expected.toLowerCase(Locale.ROOT) + ".cs3");
            if (!target.exists() || !fileHash(target).equalsIgnoreCase(expected)) download(selected.getString("url"), target, expected, 50 * 1024 * 1024);
            if (Thread.currentThread().isInterrupted()) throw new InterruptedIOException();
            Map<String, Boolean> flags = new HashMap<>(enabled);
            try {
                unloadPackage(id); loadPackage(id, selected);
                for (String key : sources.keySet()) if (flags.containsKey(key)) enabled.put(key, flags.get(key));
                if (Thread.currentThread().isInterrupted()) throw new InterruptedIOException();
                packages.put(id, selected); save();
            } catch (Exception e) {
                if (previous == null) packages.remove(id); else packages.put(id, previous);
                try {
                    unloadPackage(id);
                    if (previous != null) loadPackage(id, previous);
                    enabled.clear(); enabled.putAll(flags);
                } catch (Exception recovery) { restartRequired = true; e.addSuppressed(recovery); }
                throw e;
            }
            return JSONObject.NULL;
        }
        if (op.equals("remove")) {
            String id = p.getString("packageId"); JSONObject pkg = state.getJSONObject("packages").optJSONObject(id);
            if (pkg == null || !id.matches("[a-f0-9]{64}")) throw new IOException("Unknown installed package");
            Exception cleanupFailure = null;
            try { unloadPackage(id); } catch (Exception e) { cleanupFailure = e; }
            state.getJSONObject("packages").remove(id); save();
            File file = packageFile(id, pkg); if (file.exists() && !file.delete()) throw new IOException("Package removed from dispatch; file cleanup failed");
            if (cleanupFailure != null) throw cleanupFailure;
            return JSONObject.NULL;
        }
        allSources();
        if (op.equals("setEnabled")) return setEnabled(p);
        String sourceId = p.getString("sourceId");
        if (!Boolean.TRUE.equals(enabled.get(sourceId)) || !providers.containsKey(sourceId)) throw new IOException("Source is disabled or removed");
        Object provider = providers.get(sourceId); Object result;
        if (op.equals("search") || op.equals("browse")) {
            String query = p.optString("query", "").trim();
            if (query.length() > 300) throw new IOException("Search query too long");
            int page = Math.max(1, p.optInt("page", 1));
            Object found;
            List<Object> items = new ArrayList<>();
            if (query.isEmpty()) {
                if (!Boolean.TRUE.equals(getValue(provider, "getHasMainPage"))) return new JSONObject().put("results", new JSONArray()).put("hasNextPage", false).put("message", "This source provides search only");
                List<?> categories = (List<?>)getValue(provider, "getMainPage");
                if (categories.isEmpty()) return new JSONObject().put("results", new JSONArray()).put("hasNextPage", false);
                Object category = categories.get(0);
                Object request = host().loadClass("com.lagradost.cloudstream3.MainPageRequest").getConstructor(String.class, String.class, boolean.class)
                    .newInstance(getValue(category, "getName"), getValue(category, "getData"), getValue(category, "getHorizontalImages"));
                found = invokeSuspend(provider, "getMainPage", page, request);
                if (found != null) for (Object section : (List<?>)getValue(found, "getItems")) items.addAll((List<?>)getValue(section, "getList"));
            } else {
                found = invokeSuspend(provider, "search", query, page);
                if (found != null) items.addAll((List<?>)getValue(found, "getItems"));
            }
            JSONArray cards = new JSONArray();
            Set<String> seen = new HashSet<>();
            for (Object item : items) {
                String url = String.valueOf(getValue(item, "getUrl"));
                if ((!url.startsWith("https://") && !url.startsWith("http://")) || !seen.add(url)) continue;
                cards.put(new JSONObject().put("id", Base64.encodeToString(url.getBytes(StandardCharsets.UTF_8), Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING))
                    .put("title", String.valueOf(getValue(item, "getName"))).put("image", getValue(item, "getPosterUrl")));
            }
            result = new JSONObject().put("results", cards).put("hasNextPage", found != null && Boolean.TRUE.equals(getValue(found, "getHasNext")));
        } else if (op.equals("info")) result = info(sourceId, provider, p.getString("id"));
        else if (op.equals("resolve")) {
            String episodeId = p.getString("episodeId");
            if (!entries.containsKey(episodeId) && p.has("id")) info(sourceId, provider, p.getString("id"));
            String[] entry = entries.get(episodeId);
            if (entry == null || !entry[0].equals(sourceId)) throw new IOException("Episode does not belong to this source; reload the title");
            JSONArray subtitles = new JSONArray(), links = new JSONArray();
            Object resolved = invokeSuspend(provider, "loadLinks", entry[1], false, callback(subtitles, true), callback(links, false));
            if (!Boolean.TRUE.equals(resolved)) throw new IOException("No playable sources resolved");
            for (int i = 0; i < links.length(); i++) links.getJSONObject(i).put("subtitles", subtitles).put("providerName", sources.get(sourceId).getString("extensionName")).put("providerKey", sourceId);
            result = new JSONObject().put("sources", links);
        } else throw new IOException("Unsupported compatibility operation");
        if (!Boolean.TRUE.equals(enabled.get(sourceId))) throw new IOException("Source was disabled");
        return result;
    }
    private JSONObject info(String sourceId, Object provider, String id) throws Exception {
        if (id.length() > 16000) throw new IOException("Invalid title ID");
        String url = new String(Base64.decode(id, Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING), StandardCharsets.UTF_8);
        if (!url.startsWith("https://") && !url.startsWith("http://")) throw new IOException("Invalid title URL");
        Object detail = invokeSuspend(provider, "load", url);
        JSONArray episodes = new JSONArray();
        try { addEntry(episodes, sourceId, String.valueOf(getValue(detail, "getDataUrl")), "Play", 1); }
        catch (NoSuchMethodException e) {
            Object raw = getValue(detail, "getEpisodes");
            Collection<?> list;
            if (raw instanceof Map) {
                Map<?, ?> variants = (Map<?, ?>)raw; Object picked = null;
                for (Map.Entry<?, ?> variant : variants.entrySet()) if (String.valueOf(variant.getKey()).toLowerCase(Locale.ROOT).contains("sub")) { picked = variant.getValue(); break; }
                if (picked == null && !variants.isEmpty()) picked = variants.values().iterator().next();
                list = picked instanceof Collection ? (Collection<?>)picked : Collections.emptyList();
            } else list = (Collection<?>)raw;
            int n = 0;
            for (Object episode : list) { Object number = getValue(episode, "getEpisode"); addEntry(episodes, sourceId, String.valueOf(getValue(episode, "getData")), String.valueOf(getValue(episode, "getName")), number instanceof Number ? ((Number)number).doubleValue() : ++n); }
        }
        JSONObject result = new JSONObject().put("id", id).put("title", getValue(detail, "getName")).put("image", getValue(detail, "getPosterUrl")).put("description", getValue(detail, "getPlot")).put("entries", episodes);
        // Export only explicit named upstream IDs. Empty/unknown sync keys are never guessed.
        try {
            Object sync = getValue(detail, "getSyncData");
            if (sync instanceof Map) {
                JSONObject ids = new JSONObject();
                for (String name : new String[]{"anilist", "mal"}) {
                    Object value = ((Map<?, ?>)sync).get(name);
                    if (value != null && String.valueOf(value).matches("[1-9][0-9]*")) ids.put(name, String.valueOf(value));
                }
                if (ids.length() > 0) result.put("catalogIds", ids);
            }
        } catch (NoSuchMethodException ignored) { /* Older hosts require a manual verified catalogue link. */ }
        try { result.put("banner", getValue(detail, "getBackgroundPosterUrl")); } catch (NoSuchMethodException ignored) {}
        return result;
    }
    private void addEntry(JSONArray output, String sourceId, String data, String label, double number) throws Exception {
        String token = hash((sourceId + "\0" + data).getBytes(StandardCharsets.UTF_8));
        if (entries.size() > 5000) entries.clear();
        entries.put(token, new String[]{sourceId, data});
        output.put(new JSONObject().put("id", token).put("label", label.equals("null") ? "Episode " + number : label).put("number", number));
    }
    private Object callback(JSONArray output, boolean subtitle) throws Exception {
        ClassLoader loader = host(); Object unit = loader.loadClass("kotlin.Unit").getField("INSTANCE").get(null);
        return Proxy.newProxyInstance(loader, new Class<?>[]{loader.loadClass("kotlin.jvm.functions.Function1")}, (proxy, method, args) -> {
            if (!method.getName().equals("invoke")) return objectMethod(proxy, method, args);
            Object item = args[0]; String url = String.valueOf(getValue(item, "getUrl"));
            if (!url.startsWith("https://") && !url.startsWith("http://")) return unit;
            JSONObject value = new JSONObject().put("url", url);
            if (subtitle) {
                Object language = getValue(item, "getLang");
                value.put("lang", language).put("language", language).put("label", language);
                try { value.put("headers", new JSONObject((Map<?, ?>)getValue(item, "getHeaders"))); } catch (NoSuchMethodException ignored) {}
            }
            else {
                JSONObject headers = new JSONObject((Map<?, ?>)getValue(item, "getHeaders"));
                String referer = String.valueOf(getValue(item, "getReferer")); if (!referer.isEmpty()) headers.put("Referer", referer);
                String type = String.valueOf(getValue(item, "getType")).toLowerCase(Locale.ROOT);
                if (!type.equals("m3u8") && !type.equals("dash") && !type.equals("video")) throw new IOException("This stream format requires a host adapter: " + type);
                value.put("headers", headers).put("quality", String.valueOf(getValue(item, "getQuality"))).put("sourceType", type.equals("m3u8") ? "hls" : type.equals("dash") ? "dash" : "mp4");
            }
            synchronized (output) { output.put(value); } return unit;
        });
    }
    static String message(Throwable e) { while (e.getCause() != null && e.getCause() != e) e = e.getCause(); return String.valueOf(e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()).replaceAll("https?://\\S+", "[source URL]"); }
}
