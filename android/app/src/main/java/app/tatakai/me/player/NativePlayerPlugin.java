package app.tatakai.me.player;

import android.content.Intent;

import androidx.annotation.Nullable;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Bridges torrent playback from the Capacitor renderer to the native Media3 screen. */
@CapacitorPlugin(name = "NativePlayer")
public class NativePlayerPlugin extends Plugin {
    @Nullable private static volatile NativePlayerPlugin instance;

    @Override
    public void load() {
        instance = this;
    }

    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url", "");
        if (url == null) url = "";
        url = url.trim();
        if (url.isEmpty()) {
            call.reject("A playback URL is required.");
            return;
        }
        if (getActivity() == null) {
            call.reject("The player is not attached to an activity yet.");
            return;
        }

        Intent intent = new Intent(getActivity(), PlayerActivity.class);
        intent.putExtra(PlayerActivity.EXTRA_URL, url);
        String title = call.getString("title", "");
        intent.putExtra(PlayerActivity.EXTRA_TITLE, title == null ? "" : title);
        intent.putExtra(PlayerActivity.EXTRA_START_POSITION_MS, readPositionMillis(call));
        intent.putExtra(PlayerActivity.EXTRA_INTRO_START_MS, windowMillis(call.getObject("intro"), "start"));
        intent.putExtra(PlayerActivity.EXTRA_INTRO_END_MS, windowMillis(call.getObject("intro"), "end"));
        intent.putExtra(PlayerActivity.EXTRA_OUTRO_START_MS, windowMillis(call.getObject("outro"), "start"));
        intent.putExtra(PlayerActivity.EXTRA_OUTRO_END_MS, windowMillis(call.getObject("outro"), "end"));
        String preferredAudioLanguage = call.getString("preferredAudioLanguage", "");
        String preferredSubtitleLanguage = call.getString("preferredSubtitleLanguage", "");
        intent.putExtra(PlayerActivity.EXTRA_PREFERRED_AUDIO_LANGUAGE, preferredAudioLanguage == null ? "" : preferredAudioLanguage);
        intent.putExtra(PlayerActivity.EXTRA_PREFERRED_SUBTITLE_LANGUAGE, preferredSubtitleLanguage == null ? "" : preferredSubtitleLanguage);
        intent.putExtra(PlayerActivity.EXTRA_SUBTITLES_ENABLED, call.getBoolean("subtitlesEnabled", true));

        JSArray subtitles = call.getArray("subtitles", new JSArray());
        intent.putExtra(PlayerActivity.EXTRA_SUBTITLES, subtitles == null ? "[]" : subtitles.toString());
        JSObject headers = call.getObject("headers", new JSObject());
        intent.putExtra(PlayerActivity.EXTRA_HEADERS, headers == null ? "{}" : headers.toString());
        try {
            getActivity().startActivity(intent);
        } catch (Exception error) {
            call.reject("Unable to open the native player: " + error.getMessage());
            return;
        }

        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }

    /**
     * Reads the requested resume position in a type-tolerant way.
     *
     * Capacitor's {@code PluginCall.getLong()} only returns a value when the
     * JSON number arrived as a {@code Long}. The JS bridge sends
     * {@code startPositionMs} as a plain number, which org.json stores as an
     * {@code Integer} (int range) or {@code Double} — so {@code getLong()}
     * always fell back to the default and resume silently restarted at 0.
     * Reading {@code Double}/{@code Integer} explicitly fixes resume without
     * changing the JS contract.
     */
    private long readPositionMillis(PluginCall call) {
        Double asDouble = call.getDouble("startPositionMs");
        if (asDouble != null && Double.isFinite(asDouble)) {
            return Math.max(0L, Math.round(asDouble));
        }
        Integer asInt = call.getInt("startPositionMs");
        if (asInt != null) {
            return Math.max(0L, asInt.longValue());
        }
        Long asLong = call.getLong("startPositionMs");
        if (asLong != null) {
            return Math.max(0L, asLong);
        }
        return 0L;
    }

    @PluginMethod
    public void close(PluginCall call) {
        PlayerActivity.closeActive();
        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }

    private long windowMillis(@Nullable JSObject window, String field) {
        if (window == null) return -1L;
        double seconds = window.optDouble(field, -1D);
        return seconds >= 0D ? Math.round(seconds * 1000D) : -1L;
    }

    static void emit(String eventName, JSObject payload) {
        NativePlayerPlugin active = instance;
        if (active != null) active.notifyListeners(eventName, payload, true);
    }
}
