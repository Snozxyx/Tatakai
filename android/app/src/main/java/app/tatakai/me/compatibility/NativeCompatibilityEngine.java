package app.tatakai.me.compatibility;

import android.content.Context;
import android.os.Build;
import org.json.JSONArray;
import org.json.JSONObject;

/** One native dispatch contract for Android phones and Android TV. */
final class NativeCompatibilityEngine {
    private final Context context;
    private CloudStreamEngine cloudstream;
    private MihonEngine mihon;
    private AniyomiAndroidEngine aniyomi;
    NativeCompatibilityEngine(Context context) { this.context = context; }
    private synchronized CloudStreamEngine cloudstream() throws Exception { if (cloudstream == null) cloudstream = new CloudStreamEngine(context); return cloudstream; }
    private synchronized MihonEngine mihon() { if (mihon == null) mihon = new MihonEngine(context); return mihon; }
    private synchronized AniyomiAndroidEngine aniyomi() throws Exception { if (aniyomi == null) aniyomi = new AniyomiAndroidEngine(context); return aniyomi; }
    private boolean isAniyomi(JSONObject p) { return p.optString("ecosystem").equals("aniyomi") || p.optString("sourceId").startsWith("compat-aniyomi-"); }
    private boolean isMihon(JSONObject p) { return p.optString("ecosystem").equals("mihon") || p.optString("sourceId").startsWith("compat-mihon-"); }
    Object request(JSONObject p) throws Exception {
        String op = p.getString("op");
        if (op.equals("status")) {
            JSONObject status;
            try { status = (JSONObject)cloudstream().request(p); }
            catch (Exception error) { status = new JSONObject().put("platform", "android").put("runtimes", new JSONArray().put(new JSONObject().put("ecosystem", "cloudstream").put("available", true).put("ready", false).put("message", CloudStreamEngine.message(error)))); }
            JSONArray runtimes = status.getJSONArray("runtimes");
            runtimes.put(1, new JSONObject().put("ecosystem", "mihon").put("available", Build.VERSION.SDK_INT >= 26).put("ready", Build.VERSION.SDK_INT >= 26).put("updates", true).put("authentication", true)
                .put("message", Build.VERSION.SDK_INT >= 26 ? "Local original-APK host with repository signing verification" : "Mihon extensions require Android 8 or newer"));
            if (Build.VERSION.SDK_INT >= 26) {
                try { runtimes.put(aniyomi().status()); } catch (Exception error) { runtimes.put(new JSONObject().put("ecosystem", "aniyomi").put("available", false).put("ready", false).put("message", CloudStreamEngine.message(error))); }
            } else runtimes.put(new JSONObject().put("ecosystem", "aniyomi").put("available", false).put("ready", false).put("message", "Aniyomi requires Android 8 or newer"));
            return status;
        }
        if (op.equals("authenticate") && isMihon(p)) {
            String agent = CompatibilityActivity.authenticate(context, mihon().authenticationUrl(p.getString("sourceId")));
            mihon().authenticated(agent);
            return JSONObject.NULL;
        }
        if (op.equals("sources") && !p.has("ecosystem")) {
            JSONArray result = new JSONArray();
            Exception failed = null;
            int hosts = 0;
            try { result = (JSONArray)cloudstream().request(p); hosts++; } catch (Exception error) { failed = error; }
            if (Build.VERSION.SDK_INT >= 26) {
                try {
                    JSONArray manga = (JSONArray)mihon().request(p);
                    for (int i = 0; i < manga.length(); i++) result.put(manga.get(i));
                    hosts++;
                } catch (Exception error) { failed = error; }
                try { JSONArray anime = (JSONArray)aniyomi().request(new JSONObject(p.toString()).put("ecosystem", "aniyomi")); for (int i = 0; i < anime.length(); i++) result.put(anime.get(i)); hosts++; } catch (Exception error) { failed = error; }
            }
            if (hosts == 0 && failed != null) throw failed;
            return result;
        }
        return isAniyomi(p) ? aniyomi().request(p) : isMihon(p) ? mihon().request(p) : cloudstream().request(p);
    }
    Object setEnabled(JSONObject p) throws Exception { return isAniyomi(p) ? aniyomi().setEnabled(p) : isMihon(p) ? mihon().setEnabled(p) : cloudstream().setEnabled(p); }
    void stop() { if (aniyomi != null) aniyomi.stop(); if (mihon != null) mihon.stop(); }
}
