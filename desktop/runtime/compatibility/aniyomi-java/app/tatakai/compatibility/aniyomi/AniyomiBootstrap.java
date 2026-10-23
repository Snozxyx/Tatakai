package app.tatakai.compatibility.aniyomi;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import org.json.*;

/** Private stdio, fixed operations, bounded queue. Runtime callbacks never use port 4567. */
public final class AniyomiBootstrap {
    private static final Map<String, Future<?>> calls = new ConcurrentHashMap<>();
    private static final Map<Integer, CompletableFuture<Object>> callbacks = new ConcurrentHashMap<>();
    private static final AtomicInteger ids = new AtomicInteger();
    private static final PrintStream protocol = System.out;
    private static void send(JSONObject value) { synchronized (protocol) { protocol.println(value); protocol.flush(); } }
    public static void main(String[] args) throws Exception {
        if (args.length != 3) throw new IllegalArgumentException("Expected runtime, verifier and private data directory");
        // Provider logging cannot be mistaken for protocol replies or fill stdout.
        System.setOut(new PrintStream(OutputStream.nullOutputStream()));
        DesktopPlatform platform = new DesktopPlatform(new File(args[0]), new File(args[1]), new File(args[2], "data"), (operation, values) -> {
            if (operation.equals("log")) return null;
            if (!Arrays.asList("getCookies", "setCookies", "getUserAgent", "solveCloudflare", "webView").contains(operation)) throw new IOException("Unknown runtime callback");
            int id = ids.incrementAndGet(); if (callbacks.size() >= 16) throw new IOException("Too many runtime callbacks");
            CompletableFuture<Object> future = new CompletableFuture<>(); callbacks.put(id, future);
            try { send(new JSONObject().put("event", operation).put("callbackId", id).put("arguments", new JSONArray(Arrays.asList(values)))); Object result = future.get(30, TimeUnit.SECONDS); return result == JSONObject.NULL ? null : result; }
            finally { callbacks.remove(id); }
        });
        AniyomiEngine engine = new AniyomiEngine(new File(args[2]), platform);
        ExecutorService work = new ThreadPoolExecutor(1, 1, 30, TimeUnit.SECONDS, new ArrayBlockingQueue<>(24));
        Runtime.getRuntime().addShutdownHook(new Thread(() -> { work.shutdownNow(); try { engine.close(); } catch (Exception ignored) {} }));
        BufferedReader reader = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8)); String line;
        while ((line = reader.readLine()) != null) {
            if (line.length() > 1024 * 1024) break;
            JSONObject request;
            try { request = new JSONObject(line); } catch (JSONException ignored) { continue; }
            if (request.has("callbackId")) { CompletableFuture<Object> target = callbacks.get(request.getInt("callbackId")); if (target != null) target.complete(request.opt("result")); continue; }
            String id = request.optString("requestId"), op = request.optString("op");
            if (id.isEmpty() || id.length() > 100 || calls.containsKey(id)) { send(new JSONObject().put("requestId", id).put("ok", false).put("error", "Invalid request ID")); continue; }
            if (op.equals("cancel")) { Future<?> pending = calls.remove(request.optString("target")); if (pending != null) pending.cancel(true); send(new JSONObject().put("requestId", id).put("ok", true)); continue; }
            if (op.equals("setEnabled")) {
                try { engine.setEnabled(request); send(new JSONObject().put("requestId", id).put("ok", true)); }
                catch (Exception error) { send(new JSONObject().put("requestId", id).put("ok", false).put("error", error.getMessage())); }
                continue;
            }
            FutureTask<Void> task = new FutureTask<>(() -> {
                try { Object result = op.equals("ping") ? "pong" : engine.request(request); if (!Thread.currentThread().isInterrupted()) send(new JSONObject().put("requestId", id).put("ok", true).put("result", result)); }
                catch (Throwable error) {
                    try { StringWriter buffer = new StringWriter(); error.printStackTrace(new PrintWriter(buffer)); String trace = buffer.toString(); String bounded = trace.length() <= 32768 ? trace : trace.substring(0, 8192) + "\n[stack trace middle omitted]\n" + trace.substring(trace.length() - 24000); AniyomiEngine.atomic(new File(args[2], "data/last-host-error.log"), bounded.getBytes(StandardCharsets.UTF_8)); } catch (Exception ignored) { }
                    send(new JSONObject().put("requestId", id).put("ok", false).put("error", String.valueOf(error.getMessage()).replaceAll("https?://\\S+", "[source URL]")));
                }
                finally { calls.remove(id); } return null;
            });
            calls.put(id, task);
            try { work.execute(task); } catch (RejectedExecutionException error) { calls.remove(id); send(new JSONObject().put("requestId", id).put("ok", false).put("error", "Too many provider requests")); }
        }
        work.shutdownNow(); engine.close(); System.exit(0);
    }
}
