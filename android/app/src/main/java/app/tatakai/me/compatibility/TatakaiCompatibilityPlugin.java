package app.tatakai.me.compatibility;

import android.content.*;
import android.os.*;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;
import java.util.concurrent.ConcurrentHashMap;

@CapacitorPlugin(name = "TatakaiCompatibility")
public final class TatakaiCompatibilityPlugin extends Plugin {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ConcurrentHashMap<String, PluginCall> pending = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, String> bodies = new ConcurrentHashMap<>();
    private Messenger service;
    private boolean binding;
    private final Messenger replies = new Messenger(new Handler(Looper.getMainLooper(), message -> {
        String id = message.getData().getString("id", ""); PluginCall call = pending.remove(id); bodies.remove(id);
        try { String result = CompatibilityReplies.decode(getContext(), message.getData()); if (call != null) call.resolve(new JSObject(result)); }
        catch (Exception e) { if (call != null) call.reject("Invalid provider response"); }
        return true;
    }));
    private final ServiceConnection connection = new ServiceConnection() {
        @Override public void onServiceConnected(ComponentName name, IBinder binder) {
            service = new Messenger(binder);
            for (String id : pending.keySet()) send(id);
        }
        @Override public void onServiceDisconnected(ComponentName name) { service = null; failAll("Compatibility process stopped; retry the source"); }
        @Override public void onBindingDied(ComponentName name) { service = null; failAll("Compatibility process stopped"); if (binding) getContext().unbindService(this); binding = false; }
        @Override public void onNullBinding(ComponentName name) { failAll("Compatibility service is unavailable"); }
    };
    @PluginMethod public void request(PluginCall call) {
        try {
            String body = call.getString("payload", "{}"); if (body.length() > 65536) throw new IllegalArgumentException();
            JSONObject request = new JSONObject(body); String id = request.getString("requestId");
            if (id.length() > 100 || pending.size() >= 24 || pending.containsKey(id)) throw new IllegalArgumentException();
            pending.put(id, call); bodies.put(id, body);
            if (!binding) {
                binding = getContext().bindService(new Intent(getContext(), CompatibilityService.class), connection, Context.BIND_AUTO_CREATE);
                if (!binding) { failAll("Could not bind compatibility process"); return; }
            }
            if (service != null) send(id);
            long timeout = request.optString("op").equals("prepare") ? 600000 : request.optString("op").equals("authenticate") ? 310000 : 120000;
            handler.postDelayed(() -> {
                PluginCall waiting = pending.remove(id); bodies.remove(id);
                if (waiting != null) {
                    waiting.reject("Compatibility request timed out");
                    try { sendBody("cancel-" + id, new JSONObject().put("op", "cancel").put("target", id).toString()); } catch (Exception ignored) {}
                }
            }, timeout);
        } catch (Exception e) { call.reject("Invalid compatibility request"); }
    }
    private void send(String id) {
        String body = bodies.remove(id); if (body == null) return;
        try { sendBody(id, body); } catch (Exception e) { PluginCall call = pending.remove(id); if (call != null) call.reject("Compatibility process is unavailable"); }
    }
    private void sendBody(String id, String body) throws RemoteException {
        if (service == null) throw new RemoteException();
        Message message = Message.obtain(); Bundle data = new Bundle(); data.putString("id", id); data.putString("payload", body); message.setData(data); message.replyTo = replies; service.send(message);
    }
    private void failAll(String error) { for (PluginCall call : pending.values()) call.reject(error); pending.clear(); bodies.clear(); }
    @Override protected void handleOnDestroy() { failAll("Compatibility bridge closed"); if (binding) getContext().unbindService(connection); binding = false; service = null; super.handleOnDestroy(); }
}
