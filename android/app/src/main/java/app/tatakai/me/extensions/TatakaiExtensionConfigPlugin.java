package app.tatakai.me.extensions;

import android.app.Activity;
import android.content.Intent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "TatakaiExtensionConfig")
public final class TatakaiExtensionConfigPlugin extends Plugin {
    private String pendingRequestId;

    @PluginMethod public void configure(PluginCall call) {
        String requestId = call.getString("requestId", "");
        String url = call.getString("url", "");
        if (!requestId.matches("[a-zA-Z0-9_-]{1,128}") || !ExtensionConfigurationUrl.isWebUrl(url)) {
            call.reject("Use an HTTP or HTTPS configuration URL without embedded login credentials", "INVALID_URL");
            return;
        }
        if (getActivity() == null) { call.reject("Extension configuration is unavailable. Please reopen Tatakai", "UNAVAILABLE"); return; }
        getActivity().runOnUiThread(() -> {
            if (pendingRequestId != null) {
                call.reject("Another extension configuration window is already open", "CONFIGURATION_BUSY");
                return;
            }
            pendingRequestId = requestId;
            Intent intent = new Intent(getContext(), ExtensionConfigurationActivity.class)
                .putExtra("requestId", requestId).putExtra("url", url);
            try { startActivityForResult(call, intent, "configurationResult"); }
            catch (Exception error) {
                pendingRequestId = null;
                call.reject("Could not open extension configuration. Please try again", "START_FAILED");
            }
        });
    }

    @ActivityCallback private void configurationResult(PluginCall call, ActivityResult result) {
        pendingRequestId = null;
        // Capacitor restores this call after Android reclaims the main activity,
        // forwarding its resolved data through App.appRestoredResult.
        if (call == null) return;
        String requestId = call.getString("requestId", "");
        JSObject response = new JSObject();
        response.put("requestId", requestId);
        Intent data = result.getData();
        String manifest = data == null ? null : ExtensionConfigurationUrl.configuredManifest(data.getStringExtra("manifestUrl"));
        boolean success = result.getResultCode() == Activity.RESULT_OK && manifest != null
            && requestId.equals(data.getStringExtra("requestId"));
        response.put("success", success);
        if (success) response.put("manifestUrl", manifest);
        call.resolve(response);
    }
}
