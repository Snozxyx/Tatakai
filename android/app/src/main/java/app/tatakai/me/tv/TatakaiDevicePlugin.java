package app.tatakai.me.tv;

import android.app.SearchManager;
import android.content.Intent;
import android.speech.RecognizerIntent;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.ActivityCallback;
import androidx.activity.result.ActivityResult;
import app.tatakai.me.BuildConfig;

@CapacitorPlugin(name = "TatakaiDevice")
public class TatakaiDevicePlugin extends Plugin {
    @PluginMethod public void info(PluginCall call) {
        JSObject result = new JSObject();
        result.put("flavor", BuildConfig.FLAVOR);
        result.put("apiLevel", android.os.Build.VERSION.SDK_INT);
        if (getActivity() != null && Intent.ACTION_SEARCH.equals(getActivity().getIntent().getAction())) result.put("searchQuery", getActivity().getIntent().getStringExtra(SearchManager.QUERY));
        call.resolve(result);
    }
    @PluginMethod public void voiceSearch(PluginCall call) {
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        try { startActivityForResult(call, intent, "voiceResult"); }
        catch (Exception e) { call.reject("Voice search is unavailable. Use the keyboard."); }
    }
    @ActivityCallback private void voiceResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject response = new JSObject();
        Intent data = result.getData();
        java.util.ArrayList<String> matches = data == null ? null : data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
        response.put("query", matches == null || matches.isEmpty() ? "" : matches.get(0));
        call.resolve(response);
    }
    @Override protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (Intent.ACTION_SEARCH.equals(intent.getAction())) {
            JSObject event = new JSObject(); event.put("query", intent.getStringExtra(SearchManager.QUERY));
            notifyListeners("search", event, true);
        }
    }
}
