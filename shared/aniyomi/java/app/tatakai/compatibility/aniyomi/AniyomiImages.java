package app.tatakai.compatibility.aniyomi;

import java.io.*;
import java.lang.reflect.*;
import java.nio.file.Files;
import java.util.*;
import java.util.concurrent.*;
import org.json.*;

/** Keeps original Page objects and fetches bytes through the original HttpSource. */
public final class AniyomiImages {
    private final ClassLoader loader;
    private final File directory;
    private final LinkedHashMap<String, Page> pages = new LinkedHashMap<>();
    private final Object cacheLock = new Object();
    private static final class Page { final String owner; final Object source, page; Page(String owner, Object source, Object page) { this.owner = owner; this.source = source; this.page = page; } }
    public AniyomiImages(ClassLoader loader, File directory) { this.loader = loader; this.directory = directory; }
    public void clear() { synchronized (pages) { pages.clear(); } }
    private void store(File file, byte[] bytes) throws Exception {
        synchronized (cacheLock) {
            File[] candidates = directory.listFiles(item -> item.isFile() && item.getName().matches("[a-f0-9-]{36}\\.image")); long total = 0;
            if (candidates != null) { Arrays.sort(candidates, Comparator.comparingLong(File::lastModified)); for (File candidate : candidates) total += candidate.length();
                for (File candidate : candidates) { if (total + bytes.length <= 256L * 1024 * 1024) break; long length = candidate.length(); if (candidate.delete()) total -= length; }
            }
            if (total + bytes.length > 256L * 1024 * 1024) throw new IOException("Local image cache is busy; retry this page");
            AniyomiEngine.atomic(file, bytes);
        }
    }
    private Object call(Object target, String name, Object... args) throws Exception {
        Class<?> continuation = loader.loadClass("kotlin.coroutines.Continuation"); CompletableFuture<Object> future = new CompletableFuture<>();
        Object callback = Proxy.newProxyInstance(loader, new Class<?>[]{continuation}, (object, method, values) -> {
            if (method.getName().equals("getContext")) return loader.loadClass("kotlin.coroutines.EmptyCoroutineContext").getField("INSTANCE").get(null);
            if (method.getName().equals("resumeWith")) { try { loader.loadClass("kotlin.ResultKt").getMethod("throwOnFailure", Object.class).invoke(null, values[0]); future.complete(values[0]); } catch (Throwable error) { future.completeExceptionally(error); } } return null;
        });
        Object[] values = Arrays.copyOf(args, args.length + 1); values[args.length] = callback;
        Method operation = null; for (Method method : target.getClass().getMethods()) if (method.getName().equals(name) && method.getParameterTypes().length == values.length) operation = method;
        if (operation == null) throw new IOException("Original source image method unavailable");
        Method marker = loader.loadClass("kotlin.coroutines.intrinsics.IntrinsicsKt").getMethod("getCOROUTINE_SUSPENDED"); marker.setAccessible(true);
        Object result = operation.invoke(target, values), suspended = marker.invoke(null);
        return result == suspended ? future.get(60, TimeUnit.SECONDS) : result;
    }
    public String list(JSONObject args) throws Exception {
        String id = args.getString("sourceId");
        Object adapter = loader.loadClass("com.aayush262.dartotsu_extension_bridge.aniyomi.MangaSourceMethods").getConstructor(String.class).newInstance(id);
        Field field = adapter.getClass().getDeclaredField("source"); field.setAccessible(true); Object source = field.get(adapter);
        Object companion = loader.loadClass("eu.kanade.tachiyomi.source.model.SChapter").getField("Companion").get(null), chapter = companion.getClass().getMethod("create").invoke(companion);
        JSONObject entry = new JSONObject(args.getString("episode")); chapter.getClass().getMethod("setUrl", String.class).invoke(chapter, entry.getString("url")); chapter.getClass().getMethod("setName", String.class).invoke(chapter, entry.optString("name", "Chapter"));
        List<?> originals = (List<?>)call(adapter, "getPageList", chapter); if (originals.size() > 2000) throw new IOException("Chapter exceeds 2000 pages");
        JSONArray result = new JSONArray(); synchronized (pages) {
            for (Object page : originals) { while (pages.size() >= 4096) pages.remove(pages.keySet().iterator().next()); String key = UUID.randomUUID().toString(); pages.put(key, new Page(id, source, page)); result.put(new JSONObject().put("imageKey", key)); }
        } return result.toString();
    }
    public String image(JSONObject args) throws Exception {
        String key = args.getString("imageKey"); if (!key.matches("[a-f0-9-]{36}")) throw new IOException("Invalid image capability"); Page page; synchronized (pages) { page = pages.get(key); }
        if (page == null || !page.owner.equals(args.getString("sourceId"))) throw new IOException("Image capability expired or belongs to another source");
        synchronized (page) {
            Files.createDirectories(directory.toPath()); File cached = new File(directory, key + ".image");
            if (!cached.isFile()) {
                Method imageUrl = page.page.getClass().getMethod("getImageUrl");
                if (imageUrl.invoke(page.page) == null) { Object url = call(page.source, "getImageUrl", page.page); page.page.getClass().getMethod("setImageUrl", String.class).invoke(page.page, url); }
                Object response = call(page.source, "getImage", page.page);
                try {
                    Object body = loader.loadClass("okhttp3.Response").getMethod("body").invoke(response); if (body == null) throw new IOException("Original source returned an empty image");
                    InputStream input = (InputStream)loader.loadClass("okhttp3.ResponseBody").getMethod("byteStream").invoke(body);
                    try (InputStream stream = input; ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
                        byte[] block = new byte[32768]; int n; while ((n = stream.read(block)) != -1) { if (Thread.currentThread().isInterrupted()) throw new InterruptedIOException(); if (bytes.size() + n > 32 * 1024 * 1024) throw new IOException("Image exceeds 32 MB"); bytes.write(block, 0, n); }
                        if (bytes.size() == 0) throw new IOException("Original source returned an empty image"); store(cached, bytes.toByteArray());
                    }
                } finally { loader.loadClass("okhttp3.Response").getMethod("close").invoke(response); }
            }
            cached.setLastModified(System.currentTimeMillis()); return new JSONObject().put("file", cached.getCanonicalPath()).put("bytes", cached.length()).toString();
        }
    }
}
