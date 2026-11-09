package app.tatakai.me.branding;

import android.content.ComponentName;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@CapacitorPlugin(name = "TatakaiBranding")
public final class TatakaiBrandingPlugin extends Plugin {
    private static final String[] VARIANTS = {"dark", "light", "monochrome", "legacy"};
    private boolean changing;
    private SharedPreferences prefs() { return getContext().getSharedPreferences("tatakai_branding", 0); }
    private boolean valid(String value) { for (String variant : VARIANTS) if (variant.equals(value)) return true; return false; }
    private ComponentName component(String variant) {
        String suffix = variant.substring(0, 1).toUpperCase(java.util.Locale.ROOT) + variant.substring(1);
        return new ComponentName(getContext().getPackageName(), "app.tatakai.me.branding.LauncherActivity$" + suffix);
    }
    private boolean active(PackageManager pm, String variant) {
        int state = pm.getComponentEnabledSetting(component(variant));
        return state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED || (state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT && "dark".equals(variant));
    }
    private JSObject selection(boolean success) {
        JSObject response = new JSObject();
        response.put("success", success);
        response.put("mode", prefs().getString("mode", "auto"));
        String variant = prefs().getString("variant", "dark");
        PackageManager pm = getContext().getPackageManager();
        for (String candidate : VARIANTS) if (active(pm, candidate)) { variant = candidate; break; }
        response.put("variant", variant);
        return response;
    }
    @PluginMethod public void getCapabilities(PluginCall call) {
        JSObject response = new JSObject();
        response.put("success", true); response.put("supported", true); response.put("platform", "android"); response.put("automatic", true);
        JSArray limitations = new JSArray(); limitations.put("customization.launcherAndroid");
        response.put("limitations", limitations); call.resolve(response);
    }
    @PluginMethod public void getSelection(PluginCall call) { call.resolve(selection(true)); }
    @PluginMethod public void setSelection(PluginCall call) {
        String mode = call.getString("mode", "auto");
        String target = "auto".equals(mode) ? call.getString("resolvedVariant", "dark") : mode;
        if (!("auto".equals(mode) || valid(mode)) || !valid(target)) { call.reject("Choose a supported Tatakai icon", "INVALID_ICON"); return; }
        final String requestedMode = mode, requestedVariant = target;
        getActivity().runOnUiThread(() -> {
            if (changing) { call.reject("An icon change is already running", "BUSY"); return; }
            changing = true;
            PackageManager pm = getContext().getPackageManager();
            Map<ComponentName, Integer> previous = new LinkedHashMap<>();
            String previousMode = prefs().getString("mode", "auto"), previousVariant = prefs().getString("variant", "dark");
            try {
                for (String variant : VARIANTS) previous.put(component(variant), pm.getComponentEnabledSetting(component(variant)));
                switchComponents(pm, requestedVariant);
                int count = 0;
                for (String variant : VARIANTS) if (active(pm, variant)) count++;
                if (count != 1 || !active(pm, requestedVariant)) throw new IllegalStateException("The launcher did not confirm the icon change");
                if (!prefs().edit().putString("mode", requestedMode).putString("variant", requestedVariant).commit()) throw new IllegalStateException("Could not save the icon choice");
                call.resolve(selection(true));
            } catch (Exception error) {
                prefs().edit().putString("mode", previousMode).putString("variant", previousVariant).commit();
                // Restore the prior launcher state; MainActivity and its deep links are never disabled.
                try {
                    for (Map.Entry<ComponentName, Integer> entry : previous.entrySet()) if (entry.getValue() == PackageManager.COMPONENT_ENABLED_STATE_ENABLED || entry.getValue() == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT) pm.setComponentEnabledSetting(entry.getKey(), entry.getValue(), PackageManager.DONT_KILL_APP);
                    for (Map.Entry<ComponentName, Integer> entry : previous.entrySet()) pm.setComponentEnabledSetting(entry.getKey(), entry.getValue(), PackageManager.DONT_KILL_APP);
                } catch (Exception rollbackError) {
                    try { pm.setComponentEnabledSetting(component("dark"), PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP); } catch (Exception ignored) {}
                }
                JSObject response = selection(false); response.put("error", error.getMessage()); call.resolve(response);
            } finally { changing = false; }
        });
    }
    private void switchComponents(PackageManager pm, String target) {
        if (Build.VERSION.SDK_INT >= 33) {
            List<PackageManager.ComponentEnabledSetting> changes = new ArrayList<>();
            for (String variant : VARIANTS) changes.add(new PackageManager.ComponentEnabledSetting(component(variant), variant.equals(target) ? PackageManager.COMPONENT_ENABLED_STATE_ENABLED : PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP));
            pm.setComponentEnabledSettings(changes);
        } else {
            pm.setComponentEnabledSetting(component(target), PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
            for (String variant : VARIANTS) if (!variant.equals(target)) pm.setComponentEnabledSetting(component(variant), PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
        }
    }
}
