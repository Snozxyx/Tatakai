package app.tatakai.me.player;

import android.app.Instrumentation;
import android.content.Intent;
import android.webkit.WebView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import app.tatakai.me.MainActivity;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.json.JSONTokener;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

/** Runs the real bundled UI in Android WebView, including its public catalogue API. */
@RunWith(AndroidJUnit4.class)
public class TvWebExperienceTest {
    private Instrumentation instrumentation;
    private WebView web;
    private JSONObject evaluate(String script) throws Exception {
        CountDownLatch reply = new CountDownLatch(1); AtomicReference<String> result = new AtomicReference<>();
        instrumentation.runOnMainSync(() -> web.evaluateJavascript("JSON.stringify((()=>{" + script + "})())", value -> { result.set(value); reply.countDown(); }));
        assertTrue("WebView must respond", reply.await(8, TimeUnit.SECONDS));
        return new JSONObject(new JSONTokener(result.get()).nextValue().toString());
    }
    private JSONObject waitFor(String script, String field, int minimum) throws Exception {
        long end = android.os.SystemClock.uptimeMillis() + 60000; JSONObject state;
        do {
            state = evaluate(script);
            if (state.optInt(field) >= minimum) return state;
            android.os.SystemClock.sleep(250);
        } while (android.os.SystemClock.uptimeMillis() < end);
        fail("TV WebView did not reach " + field + ": " + state); return state;
    }
    @Test(timeout=150000) public void bundledWallpaperAndRemotePaginationWorkInAndroidWebView() throws Exception {
        instrumentation = InstrumentationRegistry.getInstrumentation();
        instrumentation.sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_WAKEUP);
        MainActivity activity = (MainActivity) instrumentation.startActivitySync(new Intent(instrumentation.getTargetContext(), MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        try {
            instrumentation.runOnMainSync(() -> web = activity.getBridge().getWebView());
            String cards = "return {count:document.querySelectorAll('.tv-discovery-grid .tv-content-card').length};";
            JSONObject first = waitFor(cards, "count", 24);
            evaluate("const rail=[...document.querySelectorAll('.tv-rail-items')].find(row=>row.querySelectorAll('.tv-content-card').length>=9); window.__tvNavRail=rail; window.__tvExpectedHref=rail?.querySelectorAll('.tv-content-card')[8]?.getAttribute('href'); rail?.querySelector('.tv-content-card')?.focus(); return {found:!!rail};");
            for (int step = 0; step < 8; step++) {
                instrumentation.sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_DPAD_RIGHT);
                instrumentation.waitForIdleSync();
            }
            JSONObject navigation = waitFor("return {correct:document.activeElement?.closest('.tv-rail-items')===window.__tvNavRail&&document.activeElement?.getAttribute('href')===window.__tvExpectedHref?1:0};", "correct", 1);
            assertEquals("Remote focus must stay in its rail during hero and metadata updates", 1, navigation.getInt("correct"));
            evaluate("const button=document.querySelector('.tv-load-more button'); if(button){button.focus();button.scrollIntoView({block:'nearest'});} return {found:!!button};");
            JSONObject next = waitFor(cards, "count", first.getInt("count") + 1);
            assertTrue("Android focus must append another catalogue page", next.getInt("count") > first.getInt("count"));
            String origin = evaluate("return {origin:location.origin};").getString("origin");
            instrumentation.runOnMainSync(() -> web.loadUrl(origin + "/settings"));
            JSONObject settings = waitFor("return {presets:document.querySelectorAll('.tv-wallpaper-preset').length,tv:document.querySelector('h1')?.textContent||''};", "presets", 6);
            assertEquals("TV settings", settings.getString("tv"));
            JSONObject video = waitFor("const video=document.querySelector('video.tv-video-wallpaper'); return {ready:video?.readyState||0,width:video?.videoWidth||0,height:video?.videoHeight||0,local:video?.getAttribute('src')?.startsWith('/assets/tv/wallpapers/')||false};", "ready", 2);
            assertTrue("Default wallpaper must use bundled assets", video.getBoolean("local"));
            assertTrue(video.getInt("width") <= 1280 && video.getInt("height") <= 720);
            evaluate("window.__tvWallpaperProbe=document.querySelector('video.tv-video-wallpaper'); [...document.querySelectorAll('label')].find(label=>label.textContent?.includes('Animated wallpaper'))?.querySelector('input')?.click(); return {}; ");
            waitFor("const old=window.__tvWallpaperProbe; return {stopped:document.querySelector('.tv-shell')&&!document.querySelector('video.tv-video-wallpaper')&&old?.paused&&!old.getAttribute('src')?1:0};", "stopped", 1);
        } finally {
            try { evaluate("const toggle=[...document.querySelectorAll('label')].find(label=>label.textContent?.includes('Animated wallpaper'))?.querySelector('input'); if(toggle&&!toggle.checked)toggle.click(); return {}; "); }
            finally { instrumentation.runOnMainSync(activity::finish); }
        }
    }
}
