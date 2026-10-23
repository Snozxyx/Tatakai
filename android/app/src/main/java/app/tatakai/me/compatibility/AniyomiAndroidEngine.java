package app.tatakai.me.compatibility;

import android.app.Application;
import android.content.*;
import android.content.pm.*;
import android.os.Build;
import android.webkit.CookieManager;
import app.tatakai.compatibility.aniyomi.*;
import dalvik.system.DexClassLoader;
import java.io.*;
import java.lang.reflect.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.cert.Certificate;
import java.util.*;
import java.util.concurrent.*;
import org.json.*;

/** Same original-APK contract on Android phones and TV, in :compatibility. */
final class AniyomiAndroidEngine {
    private final Context context;
    private final File root, runtime;
    private final JSONObject pins;
    private final AniyomiEngine engine;
    private final boolean runtimeBundled;
    private volatile JSONObject preparation;
    private volatile boolean preparing;
    AniyomiAndroidEngine(Context context) throws Exception {
        this.context = context; root = new File(context.getFilesDir(), "compatibility/aniyomi");
        try (InputStream input = context.getAssets().open("aniyomi-runtime.json")) { pins = new JSONObject(new String(read(input, 65536), StandardCharsets.UTF_8)); }
        runtime = new File(root, "runtime/" + pins.getJSONObject("android").getString("sha256") + ".apk");
        String[] assets = context.getAssets().list("compatibility/aniyomi");
        runtimeBundled = assets != null && Arrays.asList(assets).contains(pins.getJSONObject("android").getString("sha256") + ".apk");
        engine = new AniyomiEngine(root, new AndroidPlatform(new File(root, "data"), false));
    }
    private static byte[] read(InputStream input, int limit) throws Exception { ByteArrayOutputStream result = new ByteArrayOutputStream(); byte[] block = new byte[8192]; int n; while ((n = input.read(block)) >= 0) { if (result.size() + n > limit) throw new IOException("Response too large"); result.write(block, 0, n); } return result.toByteArray(); }
    private byte[] bundled(String name, int limit) throws Exception {
        try (InputStream input = context.getAssets().open("compatibility/aniyomi/" + name)) { return read(input, limit); }
        catch (FileNotFoundException missing) { return null; }
    }
    JSONObject status() throws Exception { return new JSONObject().put("ecosystem", "aniyomi").put("available", Build.VERSION.SDK_INT >= 26).put("ready", ready()).put("preparing", preparing).put("preparation", preparation).put("updates", true).put("authentication", false).put("downloadBytes", runtimeBundled ? 0 : pins.getJSONObject("android").getLong("bytes")).put("message", "Local original Aniyomi APK host; WebView and device validation remain incomplete"); }
    private boolean ready() { return runtime.isFile() && runtime.length() == pins.optJSONObject("android").optLong("bytes"); }
    Object request(JSONObject payload) throws Exception {
        if (Build.VERSION.SDK_INT < 26) throw new IOException("Aniyomi requires Android 8 or newer");
        if (payload.getString("op").equals("prepare")) {
            preparing = true; preparation = new JSONObject().put("stage", "downloading");
            try {
                JSONObject pin = pins.getJSONObject("android");
                if (!ready() || !AniyomiEngine.fileHash(runtime).equals(pin.getString("sha256"))) {
                    byte[] bytes = bundled(pin.getString("sha256") + ".apk", pin.getInt("bytes"));
                    if (bytes == null) bytes = AniyomiEngine.download(pin.getString("url") + "?download=1", pin.getInt("bytes"));
                    if (bytes.length != pin.getInt("bytes") || !AniyomiEngine.hash(bytes).equals(pin.getString("sha256"))) throw new IOException("Original Aniyomi runtime checksum mismatch");
                    AniyomiEngine.atomic(runtime, bytes); runtime.setReadOnly();
                }
                byte[] license = bundled("LICENSE", 32768);
                if (license == null) license = AniyomiEngine.download("https://raw.githubusercontent.com/aayush2622/DartotsuExtensionBridge/" + pins.getString("commit") + "/LICENSE", 32768);
                if (!AniyomiEngine.hash(license).equals(pins.getString("licenseSha256"))) throw new IOException("Runtime license checksum mismatch");
                AniyomiEngine.atomic(new File(root, "runtime/LICENSE"), license);
                AniyomiEngine.atomic(new File(root, "runtime/SOURCE.txt"), (pins.getString("repository") + "/tree/" + pins.getString("commit") + "\nUnabandon Public License incorporating GPLv3; public source required\n").getBytes(StandardCharsets.UTF_8));
                preparation = new JSONObject().put("stage", "ready"); return new JSONObject().put("ready", true);
            } catch (Exception error) { preparation = new JSONObject().put("stage", Thread.currentThread().isInterrupted() ? "cancelled" : "error"); throw error; }
            finally { preparing = false; }
        }
        return engine.request(payload);
    }
    Object setEnabled(JSONObject payload) throws Exception { return engine.setEnabled(payload); }
    void stop() { try { engine.close(); } catch (Exception ignored) {} }

    private final class SourceApplication extends Application {
        private final File directory;
        private final String prefix;
        SourceApplication(File directory, boolean candidate) throws Exception {
            this.directory = directory; Files.createDirectories(directory.toPath());
            prefix = candidate ? "tatakai_aniyomi_candidate_" + UUID.randomUUID() + "_" : "tatakai_aniyomi_";
            attachBaseContext(context.getApplicationContext());
        }
        @Override public Context getApplicationContext() { return this; }
        @Override public File getFilesDir() { return directory; }
        @Override public File getCacheDir() { File cache = new File(directory, "cache"); cache.mkdirs(); return cache; }
        @Override public SharedPreferences getSharedPreferences(String name, int mode) { return context.getSharedPreferences(prefix + name, mode); }
    }
    private final class AndroidPlatform implements AniyomiPlatform {
        private final File directory;
        private final boolean candidate;
        private DexClassLoader loader;
        private Object api, manager;
        private AniyomiImages images;
        AndroidPlatform(File directory, boolean candidate) { this.directory = directory; this.candidate = candidate; }
        private synchronized void initialize() throws Exception {
            if (api != null) return;
            synchronized (java.net.CookieHandler.class) {
            java.net.CookieHandler originalCookies = java.net.CookieHandler.getDefault();
            try {
            if (!ready() || !AniyomiEngine.fileHash(runtime).equals(pins.getJSONObject("android").getString("sha256"))) throw new IOException("Prepare or repair the original Aniyomi runtime first"); runtime.setReadOnly();
            loader = new DexClassLoader(runtime.getAbsolutePath(), context.getCodeCacheDir().getAbsolutePath(), null, ClassLoader.getSystemClassLoader().getParent());
            Object initialized = loader.loadClass("com.aayush262.dartotsu_extension_bridge.AniyomiExtensionApi").getConstructor().newInstance();
            initialized.getClass().getMethod("initializeAndroid", Object.class).invoke(initialized, new SourceApplication(directory, candidate));
            Class<?> callbacks = loader.loadClass("com.aayush262.dartotsu_extension_bridge.common.BridgeCallbacks");
            Object proxy = java.lang.reflect.Proxy.newProxyInstance(loader, new Class<?>[]{callbacks}, (object, method, arguments) -> {
                switch (method.getName()) {
                    case "getUserAgent": return "Mozilla/5.0 (Linux; Android " + Build.VERSION.RELEASE + ") AppleWebKit/537.36 Chrome/124.0.0.0 Mobile Safari/537.36";
                    case "getCookies": {
                        String url = String.valueOf(arguments[0]), cookie = CookieManager.getInstance().getCookie(url); JSONArray rows = new JSONArray();
                        if (cookie != null) for (String pair : cookie.split(";")) { int at = pair.indexOf('='); if (at > 0) rows.put(new JSONObject().put("name", pair.substring(0, at).trim()).put("value", pair.substring(at + 1).trim()).put("domain", new java.net.URL(url).getHost()).put("hostOnly", true).put("path", "/").put("secure", url.startsWith("https:")).put("httpOnly", false)); }
                        return rows.toString();
                    }
                    case "setCookies": if (!candidate) { for (Object header : (List<?>)arguments[1]) CookieManager.getInstance().setCookie(String.valueOf(arguments[0]), String.valueOf(header)); CookieManager.getInstance().flush(); } return null;
                    case "solveCloudflare": return false;
                    case "webView": case "log": return null;
                    case "toString": return "Tatakai Aniyomi callbacks";
                    case "hashCode": return System.identityHashCode(object);
                    case "equals": return object == arguments[0];
                    default: throw new IOException("Unknown runtime callback");
                }
            });
            Object common = loader.loadClass("com.aayush262.dartotsu_extension_bridge.CommonApi").getField("INSTANCE").get(null); common.getClass().getMethod("init", callbacks).invoke(common, proxy);
            Object scope = loader.loadClass("uy.kohesive.injekt.InjektKt").getMethod("getInjekt").invoke(null);
            scope.getClass().getMethod("getInstance", java.lang.reflect.Type.class).invoke(scope, loader.loadClass("eu.kanade.tachiyomi.network.NetworkHelper"));
            manager = scope.getClass().getMethod("getInstance", java.lang.reflect.Type.class).invoke(scope, loader.loadClass("com.aayush262.dartotsu_extension_bridge.aniyomi.AniyomiExtensionManager"));
            images = new AniyomiImages(loader, new File(directory, "images"));
            api = initialized;
            } catch (Exception | LinkageError error) { close(); throw error; }
            finally { java.net.CookieHandler.setDefault(originalCookies); }
            }
        }
        public void reset() throws Exception { initialize(); images.clear(); for (String kind : Arrays.asList("Anime", "Manga")) manager.getClass().getMethod("setInstalled" + kind + "Extensions", Map.class).invoke(manager, new LinkedHashMap<>()); }
        public JSONObject verify(File artifact, JSONObject expected) throws Exception {
            Class<?> builderClass = Class.forName("com.android.apksig.ApkVerifier$Builder"); Object builder = builderClass.getConstructor(File.class).newInstance(artifact); builderClass.getMethod("setMinCheckedPlatformVersion", int.class).invoke(builder, 26);
            Object verifier = builderClass.getMethod("build").invoke(builder), result = verifier.getClass().getMethod("verify").invoke(verifier);
            List<?> certificates = (List<?>)result.getClass().getMethod("getSignerCertificates").invoke(result);
            if (!Boolean.TRUE.equals(result.getClass().getMethod("isVerified").invoke(result)) || certificates.size() != 1) throw new IOException("Original APK signature verification failed");
            String signer = AniyomiEngine.hash(((Certificate)certificates.get(0)).getEncoded());
            if (expected.has("signer") && !expected.getString("signer").equals(signer)) throw new IOException("Original APK certificate mismatch");
            PackageInfo info = context.getPackageManager().getPackageArchiveInfo(artifact.getPath(), PackageManager.GET_META_DATA);
            if (info == null || !info.packageName.equals(expected.getString("pkgName")) || !String.valueOf(Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : (long)info.versionCode).equals(expected.getString("versionCode"))) throw new IOException("Original APK identity/version mismatch");
            return new JSONObject().put("signer", signer);
        }
        public JSONArray validate(File artifact, JSONObject expected, File staging) throws Exception {
            File copy = new File(staging, expected.getString("digest") + ".apk"); Files.copy(artifact.toPath(), copy.toPath()); copy.setReadOnly();
            AndroidPlatform isolated = new AndroidPlatform(new File(staging, "data"), true);
            try { return new JSONArray(isolated.invoke(expected.getString("kind").equals("watch") ? "getInstalledAnimeExtensions" : "getInstalledMangaExtensions", new JSONObject().put("path", staging.getAbsolutePath()))); }
            finally { isolated.close(); }
        }
        public void close() {
            if (loader != null) try { Class<?> dispatchers = loader.loadClass("kotlinx.coroutines.Dispatchers"); dispatchers.getMethod("shutdown").invoke(dispatchers.getField("INSTANCE").get(null)); } catch (ReflectiveOperationException ignored) { }
            api = null; loader = null;
        }
        private JSONArray enumerate(String path, boolean anime, boolean merge) throws Exception {
            initialize();
            // The upstream Android loader also scans system-installed extensions.
            // Tatakai loads only its own verified private APKs and registers those
            // source objects in the original manager; no unrelated APK executes.
            Map<Object, String> installed = new LinkedHashMap<>(); JSONArray descriptors = new JSONArray();
            if (merge) installed.putAll((Map<Object, String>)manager.getClass().getMethod(anime ? "getInstalledAnimeExtensions" : "getInstalledMangaExtensions").invoke(manager));
            File[] files = new File(path).listFiles(); if (files != null) for (File artifact : files) if (artifact.isFile() && artifact.getName().endsWith(".apk")) {
                PackageInfo info = context.getPackageManager().getPackageArchiveInfo(artifact.getPath(), PackageManager.GET_META_DATA); if (info == null || info.applicationInfo == null || info.applicationInfo.metaData == null) throw new IOException("Missing original extension metadata");
                String version = info.versionName, prefix = anime ? "tachiyomi.animeextension" : "tachiyomi.extension";
                String entry = info.applicationInfo.metaData.getString(prefix + ".class"); if (entry == null) throw new IOException("APK does not implement the selected Aniyomi API");
                double lib = Double.parseDouble(version.substring(0, version.lastIndexOf('.'))); if (lib < (anime ? 12 : 1.2) || lib > (anime ? 17 : 1.6)) throw new IOException("Unsupported original source API version");
                artifact.setReadOnly(); Object child = loader.loadClass("eu.kanade.tachiyomi.util.system.ChildFirstPathClassLoader").getConstructor(String.class, String.class, ClassLoader.class).newInstance(artifact.getPath(), null, loader);
                List<Object> actual = new ArrayList<>(); Class<?> sourceType = loader.loadClass(anime ? "eu.kanade.tachiyomi.animesource.AnimeSource" : "eu.kanade.tachiyomi.source.Source"), factory = loader.loadClass(anime ? "eu.kanade.tachiyomi.animesource.AnimeSourceFactory" : "eu.kanade.tachiyomi.source.SourceFactory");
                for (String name : entry.split(";")) { Object instance = ((ClassLoader)child).loadClass(name.startsWith(".") ? info.packageName + name : name).getConstructor().newInstance(); if (factory.isInstance(instance)) actual.addAll((List<?>)factory.getMethod("createSources").invoke(instance)); else if (sourceType.isInstance(instance)) actual.add(instance); else throw new IOException("Unsupported original source factory"); }
                Class<?> catalogue = loader.loadClass(anime ? "eu.kanade.tachiyomi.animesource.AnimeCatalogueSource" : "eu.kanade.tachiyomi.source.CatalogueSource"); actual.removeIf(source -> !catalogue.isInstance(source));
                String label = info.applicationInfo.loadLabel(context.getPackageManager()).toString();
                Class<?> installedType = loader.loadClass(anime ? "eu.kanade.tachiyomi.extension.anime.model.AnimeExtension$Installed" : "eu.kanade.tachiyomi.extension.manga.model.MangaExtension$Installed");
                Constructor<?> constructor = null; for (Constructor<?> value : installedType.getConstructors()) if (!value.isSynthetic() && value.getParameterTypes().length == (anime ? 17 : 16)) constructor = value;
                if (constructor == null) throw new IOException("Original extension model changed; update the Tatakai host");
                Object[] values = new Object[anime ? 17 : 16]; Arrays.fill(values, Boolean.FALSE); values[0] = label; values[1] = info.packageName; values[2] = version; values[3] = Build.VERSION.SDK_INT >= 28 ? info.getLongVersionCode() : (long)info.versionCode; values[4] = lib; values[5] = "all"; values[6] = info.applicationInfo.metaData.getInt(prefix + ".nsfw") == 1; values[9] = null; values[10] = actual; values[11] = null;
                installed.put(constructor.newInstance(values), artifact.getAbsolutePath());
                for (Object source : actual) { String base = ""; try { base = String.valueOf(source.getClass().getMethod("getBaseUrl").invoke(source)); } catch (ReflectiveOperationException ignored) {}
                    descriptors.put(new JSONObject().put("id", String.valueOf(sourceType.getMethod("getId").invoke(source))).put("name", String.valueOf(sourceType.getMethod("getName").invoke(source))).put("lang", String.valueOf(catalogue.getMethod("getLang").invoke(source))).put("pkgName", info.packageName).put("baseUrl", base)); }
            }
            manager.getClass().getMethod(anime ? "setInstalledAnimeExtensions" : "setInstalledMangaExtensions", Map.class).invoke(manager, installed); return descriptors;
        }
        public String invoke(String method, JSONObject args) throws Exception {
            initialize(); if (method.equals("getInstalledAnimeExtensions") || method.equals("getInstalledMangaExtensions")) return enumerate(args.getString("path"), method.equals("getInstalledAnimeExtensions"), args.optBoolean("merge")).toString();
            if (method.equals("getPageList")) return images.list(args);
            if (method.equals("image")) return images.image(args);
            List<Object> values = new ArrayList<>();
            values.add(args.getString("sourceId"));
            if (!method.equals("saveSourcePreference")) values.add(args.getBoolean("isAnime"));
            switch (method) {
                case "getPopular": values.add(args.getInt("page")); break;
                case "search": values.add(args.getString("query")); values.add(args.getInt("page")); values.add(args.optString("filters", "[]")); break;
                case "getDetail": values.add(args.getString("media")); break;
                case "getVideoList": case "getPageList": values.add(args.getString("episode")); break;
                case "saveSourcePreference": values.add(args.getString("key")); values.add(args.getString("value")); break;
                case "getPreference": break;
                default: throw new IOException("Unsupported original Aniyomi method");
            }
            Class<?> continuation = loader.loadClass("kotlin.coroutines.Continuation"); CompletableFuture<Object> future = new CompletableFuture<>();
            Object callback = java.lang.reflect.Proxy.newProxyInstance(loader, new Class<?>[]{continuation}, (object, target, arguments) -> { if (target.getName().equals("getContext")) return loader.loadClass("kotlin.coroutines.EmptyCoroutineContext").getField("INSTANCE").get(null); if (target.getName().equals("resumeWith")) { try { loader.loadClass("kotlin.ResultKt").getMethod("throwOnFailure", Object.class).invoke(null, arguments[0]); future.complete(arguments[0]); } catch (Throwable error) { future.completeExceptionally(error); } } return null; });
            values.add(callback); Method target = null; for (Method value : api.getClass().getMethods()) if (value.getName().equals(method) && value.getParameterTypes().length == values.size()) target = value;
            if (target == null) throw new IOException("Original runtime method unavailable"); Object result = target.invoke(api, values.toArray());
            Method marker = loader.loadClass("kotlin.coroutines.intrinsics.IntrinsicsKt").getMethod("getCOROUTINE_SUSPENDED"); marker.setAccessible(true); Object suspended = marker.invoke(null);
            if (result == suspended) result = future.get(90, TimeUnit.SECONDS); return String.valueOf(result);
        }
    }
}
