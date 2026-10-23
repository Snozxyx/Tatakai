package app.tatakai.compatibility.aniyomi;

import java.io.*;
import java.lang.reflect.*;
import java.net.URLClassLoader;
import java.nio.file.*;
import java.security.cert.Certificate;
import java.util.*;
import org.json.*;

/** Original fat JAR isolated from Tatakai and from other ecosystem JVMs. */
public final class DesktopPlatform implements AniyomiPlatform {
    public interface Callback { Object call(String operation, Object[] arguments) throws Exception; }
    private final File jar, verifier, data;
    private final Callback callback;
    private URLClassLoader loader;
    private Object api;
    private Object manager;
    private Method handle;
    private AniyomiImages images;
    public DesktopPlatform(File jar, File verifier, File data, Callback callback) { this.jar = jar; this.verifier = verifier; this.data = data; this.callback = callback; }
    private synchronized void initialize() throws Exception {
        if (api != null) return;
        synchronized (java.net.CookieHandler.class) {
        java.net.CookieHandler originalCookies = java.net.CookieHandler.getDefault();
        ClassLoader originalContext = Thread.currentThread().getContextClassLoader();
        try {
        Files.createDirectories(data.toPath());
        loader = new URLClassLoader(new java.net.URL[]{jar.toURI().toURL(), verifier.toURI().toURL()}, ClassLoader.getPlatformClassLoader());
        Thread.currentThread().setContextClassLoader(loader);
        Object initialized = loader.loadClass("com.aayush262.dartotsu_extension_bridge.AniyomiExtensionApi").getConstructor().newInstance();
        Class<?> contract = loader.loadClass("com.aayush262.dartotsu_extension_bridge.ExtensionApi");
        handle = loader.loadClass("com.aayush262.dartotsu_extension_bridge.Server").getMethod("handleEmbedded", contract, String.class);
        initialized.getClass().getMethod("initializeDesktop", String.class).invoke(initialized, data.getAbsolutePath());
        Class<?> bridge = loader.loadClass("com.aayush262.dartotsu_extension_bridge.common.BridgeCallbacks");
        Object callbacks = Proxy.newProxyInstance(loader, new Class<?>[]{bridge}, (object, method, args) -> {
            if (method.getDeclaringClass() == Object.class) return method.getName().equals("toString") ? "Tatakai local callbacks" : method.getName().equals("hashCode") ? System.identityHashCode(object) : object == args[0];
            return callback.call(method.getName(), args == null ? new Object[0] : args);
        });
        Object common = loader.loadClass("com.aayush262.dartotsu_extension_bridge.CommonApi").getField("INSTANCE").get(null);
        common.getClass().getMethod("init", bridge).invoke(common, callbacks);
        // The original helper owns an explicit OkHttp cookie jar, but also
        // changes the JVM default. Initialize it now and restore the host's
        // handler before any repository download or candidate loader closes.
        Object scope = loader.loadClass("uy.kohesive.injekt.InjektKt").getMethod("getInjekt").invoke(null);
        scope.getClass().getMethod("getInstance", java.lang.reflect.Type.class).invoke(scope, loader.loadClass("eu.kanade.tachiyomi.network.NetworkHelper"));
        manager = scope.getClass().getMethod("getInstance", java.lang.reflect.Type.class).invoke(scope, loader.loadClass("com.aayush262.dartotsu_extension_bridge.aniyomi.AniyomiExtensionManager"));
        images = new AniyomiImages(loader, new File(data, "images"));
        api = initialized;
        } catch (Exception | LinkageError error) { try { close(); } catch (Exception ignored) { } throw error; }
        finally { java.net.CookieHandler.setDefault(originalCookies); Thread.currentThread().setContextClassLoader(originalContext); }
        }
    }
    public String invoke(String method, JSONObject args) throws Exception {
        initialize(); ClassLoader previous = Thread.currentThread().getContextClassLoader();
        if (method.equals("getPageList")) return images.list(args);
        if (method.equals("image")) return images.image(args);
        try {
            Thread.currentThread().setContextClassLoader(loader);
            String registry = method.equals("getInstalledAnimeExtensions") ? "InstalledAnimeExtensions" : method.equals("getInstalledMangaExtensions") ? "InstalledMangaExtensions" : null;
            Map<Object, Object> previousSources = null;
            if (registry != null && args.optBoolean("merge")) previousSources = new LinkedHashMap<>((Map<?, ?>)manager.getClass().getMethod("get" + registry).invoke(manager));
            JSONObject envelope = new JSONObject((String)handle.invoke(null, api, new JSONObject().put("method", method).put("args", args).toString()));
            if (previousSources != null) {
                if (envelope.optBoolean("success")) previousSources.putAll((Map<?, ?>)manager.getClass().getMethod("get" + registry).invoke(manager));
                manager.getClass().getMethod("set" + registry, Map.class).invoke(manager, previousSources);
            }
            if (!envelope.optBoolean("success")) {
                String trace = envelope.optString("trace");
                if (!trace.isEmpty()) try { String bounded = trace.length() <= 32768 ? trace : trace.substring(0, 8192) + "\n[stack trace middle omitted]\n" + trace.substring(trace.length() - 24000); AniyomiEngine.atomic(new File(data, "last-source-error.log"), bounded.getBytes(java.nio.charset.StandardCharsets.UTF_8)); } catch (Exception ignored) { }
                throw new IOException(envelope.optString("error", "Original Aniyomi runtime failed"));
            }
            return envelope.optString("data", "null");
        } catch (InvocationTargetException error) { throw new IOException(error.getCause().getMessage(), error.getCause()); }
        finally { Thread.currentThread().setContextClassLoader(previous); }
    }
    public void reset() throws Exception { initialize(); images.clear(); for (String kind : Arrays.asList("Anime", "Manga")) manager.getClass().getMethod("setInstalled" + kind + "Extensions", Map.class).invoke(manager, new LinkedHashMap<>()); }
    public JSONObject verify(File artifact, JSONObject expected) throws Exception {
        // Verification happens without initializing extension classes.
        try (URLClassLoader parser = new URLClassLoader(new java.net.URL[]{jar.toURI().toURL(), verifier.toURI().toURL()}, ClassLoader.getPlatformClassLoader())) {
            Class<?> builderClass = parser.loadClass("com.android.apksig.ApkVerifier$Builder");
            Object builder = builderClass.getConstructor(File.class).newInstance(artifact); builderClass.getMethod("setMinCheckedPlatformVersion", int.class).invoke(builder, 26);
            Object result = builderClass.getMethod("build").invoke(builder); result = result.getClass().getMethod("verify").invoke(result);
            List<?> certificates = (List<?>)result.getClass().getMethod("getSignerCertificates").invoke(result);
            if (!Boolean.TRUE.equals(result.getClass().getMethod("isVerified").invoke(result)) || certificates.size() != 1) throw new IOException("Original APK signature verification failed");
            String signer = AniyomiEngine.hash(((Certificate)certificates.get(0)).getEncoded());
            if (expected.has("signer") && !signer.equals(expected.getString("signer"))) throw new IOException("Original APK signing certificate mismatch");
            Object apk = parser.loadClass("net.dongliu.apk.parser.ApkFile").getConstructor(File.class).newInstance(artifact);
            try {
                Object meta = apk.getClass().getMethod("getApkMeta").invoke(apk);
                String name = String.valueOf(meta.getClass().getMethod("getPackageName").invoke(meta)), code = String.valueOf(meta.getClass().getMethod("getVersionCode").invoke(meta));
                if (!name.equals(expected.getString("pkgName")) || !code.equals(expected.getString("versionCode"))) throw new IOException("APK package/version does not match repository metadata");
                return new JSONObject().put("signer", signer).put("pkgName", name).put("versionCode", code);
            } finally { apk.getClass().getMethod("close").invoke(apk); }
        }
    }
    public JSONArray validate(File artifact, JSONObject expected, File directory) throws Exception {
        File apk = new File(directory, expected.getString("digest") + ".apk"); Files.copy(artifact.toPath(), apk.toPath()); apk.setReadOnly();
        DesktopPlatform isolated = new DesktopPlatform(jar, verifier, new File(directory, "data"), (operation, values) -> operation.equals("getCookies") || operation.equals("getUserAgent") ? callback.call(operation, values) : operation.equals("solveCloudflare") ? false : null);
        try { return new JSONArray(isolated.invoke(expected.getString("kind").equals("watch") ? "getInstalledAnimeExtensions" : "getInstalledMangaExtensions", new JSONObject().put("path", directory.getAbsolutePath()))); }
        finally { isolated.close(); }
    }
    public synchronized void close() throws Exception {
        if (loader != null) {
            try { Class<?> looper = loader.loadClass("android.os.Looper"); Object main = looper.getMethod("getMainLooper").invoke(null); if (main != null) looper.getMethod("quit").invoke(main); } catch (ReflectiveOperationException ignored) {}
            // Candidate runtimes own their coroutine pools and must release them
            // before the next APK in a bulk installation is validated.
            try { Class<?> dispatchers = loader.loadClass("kotlinx.coroutines.Dispatchers"); dispatchers.getMethod("shutdown").invoke(dispatchers.getField("INSTANCE").get(null)); } catch (ReflectiveOperationException ignored) {}
            loader.close(); loader = null; api = null; handle = null;
        }
    }
}
