package app.tatakai.me.download;

import android.content.Intent;
import android.os.Build;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.*;
import java.io.File;

@CapacitorPlugin(name = "TatakaiDownloads")
public final class TatakaiDownloadsPlugin extends Plugin {
    private MobileDownloadStore store;
    @Override public void load() {
        store = MobileDownloadStore.get(getContext());
        store.observer = jobs -> notifyListeners("downloadsChanged", new JSObject().put("jobs", jobs));
    }
    private void start() {
        Intent intent = new Intent(getContext(), TatakaiDownloadService.class);
        if (Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(intent); else getContext().startService(intent);
    }
    @PluginMethod public void enqueue(PluginCall call) {
        try { store.enqueue(call.getData()); start(); call.resolve(new JSObject().put("success", true)); }
        catch (Exception e) { call.reject(e.getMessage()); }
    }
    @PluginMethod public void cancel(PluginCall call) { store.cancel(call.getString("episodeId", "")); call.resolve(); }
    @PluginMethod public void importLegacy(PluginCall call) {
        new Thread(() -> {
            try { store.importLegacy(call.getData()); call.resolve(); } catch (Exception e) { call.reject(e.getMessage()); }
        }, "tatakai-legacy-import").start();
    }
    @PluginMethod public void retry(PluginCall call) {
        try { store.retry(call.getString("episodeId", "")); start(); call.resolve(); } catch (Exception e) { call.reject(e.getMessage()); }
    }
    @PluginMethod public void snapshot(PluginCall call) {
        call.resolve(new JSObject().put("jobs", store.snapshot()));
    }
    @PluginMethod public void reconcile(PluginCall call) {
        try { store.validateLibrary(); if (store.hasPending()) start(); call.resolve(new JSObject().put("jobs", store.snapshot())); }
        catch (Exception e) { call.reject(e.getMessage()); }
    }
    @PluginMethod public void remove(PluginCall call) {
        try { store.remove(call.getString("episodeId", ""), true); call.resolve(); } catch (Exception e) { call.reject(e.getMessage()); }
    }
    @PluginMethod public void configure(PluginCall call) {
        MobileDownloadStore.dataSaver = call.getBoolean("dataSaver", false);
        MobileDownloadStore.wifiOnly = call.getBoolean("wifiOnly", false);
        getContext().getSharedPreferences("tatakai-downloads", 0).edit()
            .putBoolean("dataSaver", MobileDownloadStore.dataSaver).putBoolean("wifiOnly", MobileDownloadStore.wifiOnly)
            .putBoolean("autoResume", call.getBoolean("autoResume", true)).apply();
        if (call.getBoolean("autoResume", true)) start();
        call.resolve();
    }
    @PluginMethod public void resolvePlayback(PluginCall call) {
        store.validateLibrary();
        JSONObject job = store.find(call.getString("episodeId", ""));
        if (job == null || !"completed".equals(job.optString("status"))) { call.reject("Episode is not downloaded"); return; }
        File file = new File(new File(store.root, job.optString("folder")), job.optString("entry"));
        if (!file.isFile()) { call.reject("Offline files are missing; retry the download"); return; }
        call.resolve(new JSObject().put("path", file.toURI().toString()).put("folder", job.optString("folder")).put("entry", job.optString("entry")));
    }
    @Override protected void handleOnDestroy() { store.observer = null; }
}
