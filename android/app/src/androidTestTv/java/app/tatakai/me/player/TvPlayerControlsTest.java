package app.tatakai.me.player;

import android.app.Instrumentation;
import android.content.Intent;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.TextView;
import com.getcapacitor.JSObject;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Exercises the shipped native controls with real Android focus/key dispatch. */
@RunWith(AndroidJUnit4.class)
public class TvPlayerControlsTest {
    private TvPlayerActivity activity;
    private Instrumentation instrumentation;
    private static class EventProbe extends NativePlayerPlugin {
        volatile JSObject source;
        @Override protected void notifyListeners(String name, JSObject data, boolean retain) {
            if ("playerSourceRequested".equals(name)) source = data;
        }
    }
    private Button button(String text) {
        View found = find(activity.getWindow().getDecorView(), text);
        assertNotNull("Missing visible control: " + text + "; visible: " + labels(activity.getWindow().getDecorView()), found);
        return (Button) found;
    }
    private String labels(View view) {
        if (!view.isShown()) return "";
        if (view instanceof Button) return "[" + ((Button) view).getText() + "]";
        String result = "";
        if (view instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) view).getChildCount(); i++) result += labels(((ViewGroup) view).getChildAt(i));
        return result;
    }
    private View find(View view, String text) {
        if (!view.isShown()) return null;
        if (view instanceof Button && ((TextView) view).getText().toString().equals(text)) return view;
        if (view instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) view).getChildCount(); i++) {
            View found = find(((ViewGroup) view).getChildAt(i), text); if (found != null) return found;
        }
        return null;
    }
    private void awaitControl(String text) {
        long deadline = android.os.SystemClock.uptimeMillis() + 3000;
        java.util.concurrent.atomic.AtomicReference<View> found = new java.util.concurrent.atomic.AtomicReference<>();
        do {
            instrumentation.runOnMainSync(() -> found.set(find(activity.getWindow().getDecorView(), text)));
            if (found.get() != null) break;
            android.os.SystemClock.sleep(25);
        } while (android.os.SystemClock.uptimeMillis() < deadline);
        instrumentation.runOnMainSync(() -> assertNotNull(button(text)));
    }
    private void select(String text) {
        awaitControl(text);
        instrumentation.runOnMainSync(() -> assertTrue("Control must accept focus: " + text, button(text).requestFocus()));
        instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_DPAD_CENTER);
        instrumentation.waitForIdleSync();
    }
    @Test public void remoteCanChangeSettingsAndReturnToServerDrawer() {
        instrumentation = InstrumentationRegistry.getInstrumentation();
        instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_WAKEUP);
        Intent intent = new Intent(instrumentation.getTargetContext(), TvPlayerActivity.class);
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        intent.putExtra("url", "asset:///public/assets/tv/wallpapers/sakura.mp4");
        intent.putExtra("title", "Tatakai · Player UI preview");
        intent.putExtra("playWhenReady", false);
        intent.putExtra("sessionId", "tv-player-test");
        intent.putExtra("episodeId", "preview-episode");
        intent.putExtra("sources", "[{\"id\":\"server-a\",\"title\":\"Preview server\",\"detail\":\"UI test fixture\",\"selected\":true},{\"id\":\"server-b\",\"title\":\"Alternate server\",\"detail\":\"UI test fixture\"}]");
        EventProbe probe = new EventProbe(); probe.load();
        activity = (TvPlayerActivity) instrumentation.startActivitySync(intent);
        instrumentation.waitForIdleSync();
        android.content.SharedPreferences prefs = activity.getSharedPreferences("tatakai-tv-playback", 0);
        boolean hadSpeed = prefs.contains("speed"); float previousSpeed = prefs.getFloat("speed", 1f);
        try {
            select("Servers");
            instrumentation.runOnMainSync(() -> assertTrue(button("Preview server · Current\nUI test fixture").hasFocus()));
            instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_DPAD_DOWN);
            instrumentation.waitForIdleSync();
            instrumentation.runOnMainSync(() -> assertTrue(button("Alternate server\nUI test fixture").hasFocus()));
            instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
            instrumentation.waitForIdleSync();
            instrumentation.runOnMainSync(() -> { assertFalse("Back from a drawer must not finish playback", activity.isFinishing()); assertTrue(button("Servers").hasFocus()); });
            select("Settings");
            select("Playback speed · " + previousSpeed + "×");
            select("1.25×");
            instrumentation.runOnMainSync(() -> assertEquals(1.25f, activity.player.getPlaybackParameters().speed, .001f));
            select("Subtitles");
            awaitControl("Off");
            instrumentation.runOnMainSync(() -> assertNotNull(button("Off")));
            instrumentation.sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
            instrumentation.waitForIdleSync();
            select("Servers");
            instrumentation.runOnMainSync(() -> { activity.player.pause(); activity.player.seekTo(3000); });
            select("Alternate server\nUI test fixture");
            assertNotNull(probe.source);
            assertEquals("server-b", probe.source.optString("sourceId"));
            assertEquals("preview-episode", probe.source.optString("episodeId"));
            assertEquals("tv-player-test", probe.source.optString("sessionId"));
            assertEquals(3000, probe.source.optLong("positionMs"));
            assertFalse(probe.source.optBoolean("playWhenReady", true));
        } finally {
            if (hadSpeed) prefs.edit().putFloat("speed", previousSpeed).apply(); else prefs.edit().remove("speed").apply();
            if (!"true".equals(InstrumentationRegistry.getArguments().getString("keepOpen"))) instrumentation.runOnMainSync(activity::finish);
        }
    }
}
