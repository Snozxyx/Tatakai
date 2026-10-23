package app.tatakai.me.compatibility;

import android.app.Service;
import android.content.Intent;
import android.os.*;
import org.json.JSONObject;
import java.util.concurrent.*;

/** Separate process: a provider crash does not take down the player/WebView process.
 * This is crash containment, not a different-UID security sandbox. */
public final class CompatibilityService extends Service {
    @Override public void onCreate() {
        super.onCreate();
        if (Build.VERSION.SDK_INT >= 28) android.webkit.WebView.setDataDirectorySuffix("compatibility");
    }
    private volatile NativeCompatibilityEngine engine;
    private final ConcurrentHashMap<String, Future<?>> calls = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, String> owners = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Messenger> targets = new ConcurrentHashMap<>();
    private final ExecutorService work = new ThreadPoolExecutor(1, 1, 30, TimeUnit.SECONDS, new ArrayBlockingQueue<>(24));
    private final Messenger messenger = new Messenger(new Handler(Looper.getMainLooper(), message -> {
        Bundle bundle = message.getData();
        final Messenger reply = message.replyTo;
        final String id = bundle.getString("id", "");
        try {
            JSONObject request = new JSONObject(bundle.getString("payload", "{}"));
            String operation = request.getString("op");
            if (engine != null && operation.equals("status")) { respond(reply, id, new JSONObject().put("ok", true).put("result", engine.request(request))); return true; }
            if (operation.equals("cancel")) {
                String target = request.optString("target"); Future<?> task = calls.remove(target); if (task != null) task.cancel(true); owners.remove(target);
                respond(targets.remove(target), target, new JSONObject().put("ok", false).put("error", "Provider request cancelled"));
                respond(reply, id, new JSONObject().put("ok", true).put("result", JSONObject.NULL)); return true;
            }
            if (engine != null && operation.equals("setEnabled")) {
                engine.setEnabled(request);
                if (!request.getBoolean("enabled")) for (String key : calls.keySet()) if (request.getString("sourceId").equals(owners.get(key))) { Future<?> task = calls.remove(key); if (task != null) task.cancel(true); owners.remove(key); respond(targets.remove(key), key, new JSONObject().put("ok", false).put("error", "Source was disabled")); }
                respond(reply, id, new JSONObject().put("ok", true).put("result", JSONObject.NULL)); return true;
            }
            if (calls.containsKey(id)) throw new IllegalArgumentException("Duplicate request ID");
            FutureTask<Void> task = new FutureTask<>(() -> {
                try {
                    if (engine == null) engine = new NativeCompatibilityEngine(this);
                    Object result = engine.request(request);
                    if (!Thread.currentThread().isInterrupted()) respond(reply, id, new JSONObject().put("ok", true).put("result", result));
                } catch (Throwable e) { try { respond(reply, id, new JSONObject().put("ok", false).put("error", CloudStreamEngine.message(e))); } catch (Exception ignored) {} }
                finally { calls.remove(id); owners.remove(id); targets.remove(id); }
                return null;
            });
            calls.put(id, task); owners.put(id, request.optString("sourceId")); if (reply != null) targets.put(id, reply);
            try { work.execute(task); } catch (RejectedExecutionException e) { calls.remove(id); owners.remove(id); targets.remove(id); throw new IllegalStateException("Too many provider requests"); }
        } catch (Exception e) { try { respond(reply, id, new JSONObject().put("ok", false).put("error", CloudStreamEngine.message(e))); } catch (Exception ignored) {} }
        return true;
    }));
    private void respond(Messenger target, String id, JSONObject result) {
        if (target == null) return;
        Message response = Message.obtain(); Bundle data;
        try { data = CompatibilityReplies.encode(this, id, result.toString()); }
        catch (Exception error) { data = new Bundle(); data.putString("id", id); data.putString("result", "{\"ok\":false,\"error\":\"Could not transfer provider reply within the local size limit\"}"); }
        response.setData(data);
        try { target.send(response); } catch (RemoteException ignored) {}
    }
    @Override public IBinder onBind(Intent intent) { return messenger.getBinder(); }
    @Override public void onDestroy() { for (Future<?> task : calls.values()) task.cancel(true); work.shutdownNow(); if (engine != null) engine.stop(); super.onDestroy(); }
}
