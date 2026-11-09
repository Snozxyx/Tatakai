package app.tatakai.me.extensions;

import android.app.Activity;
import android.content.Intent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public final class ExtensionConfigurationActivityTest {
    private Intent intent() {
        return new Intent(InstrumentationRegistry.getInstrumentation().getTargetContext(), ExtensionConfigurationActivity.class)
            .putExtra("requestId", "fixture-request").putExtra("url", "https://fixture.test/configure");
    }
    private WebView browser(View view) {
        if (view instanceof WebView) return (WebView) view;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) { WebView found = browser(group.getChildAt(i)); if (found != null) return found; }
        }
        return null;
    }
    private void loadFixture(ActivityScenario<ExtensionConfigurationActivity> scenario, String script) {
        scenario.onActivity(activity -> browser(activity.getWindow().getDecorView()).loadDataWithBaseURL(
            "https://fixture.test/configure", "<html><body><script>" + script + "</script></body></html>", "text/html", "UTF-8", null));
    }
    @Test public void capturesStremioRedirectWithoutLaunchingAnExternalApplication() {
        try (ActivityScenario<ExtensionConfigurationActivity> scenario = ActivityScenario.launchActivityForResult(intent())) {
            loadFixture(scenario, "setTimeout(()=>location.href='stremio://fixture.test/encoded%2Ftoken==/manifest.json?key=a%2Bb#discard',30)");
            assertEquals(Activity.RESULT_OK, scenario.getResult().getResultCode());
            Intent result = scenario.getResult().getResultData();
            assertEquals("fixture-request", result.getStringExtra("requestId"));
            assertEquals("https://fixture.test/encoded%2Ftoken==/manifest.json?key=a%2Bb", result.getStringExtra("manifestUrl"));
        }
    }
    @Test public void capturesPopupManifestAndRestoresAfterActivityRecreation() {
        try (ActivityScenario<ExtensionConfigurationActivity> scenario = ActivityScenario.launchActivityForResult(intent())) {
            scenario.recreate();
            loadFixture(scenario, "setTimeout(()=>window.open('stremio://fixture.test/configured/manifest.json?language=id','_blank'),30)");
            assertEquals(Activity.RESULT_OK, scenario.getResult().getResultCode());
            assertEquals("https://fixture.test/configured/manifest.json?language=id", scenario.getResult().getResultData().getStringExtra("manifestUrl"));
        }
    }
    @Test public void backWithoutHistoryCancelsAndReturnsNoManifest() {
        try (ActivityScenario<ExtensionConfigurationActivity> scenario = ActivityScenario.launchActivityForResult(intent())) {
            scenario.onActivity(ExtensionConfigurationActivity::onBackPressed);
            assertEquals(Activity.RESULT_CANCELED, scenario.getResult().getResultCode());
            assertEquals("fixture-request", scenario.getResult().getResultData().getStringExtra("requestId"));
            assertNull(scenario.getResult().getResultData().getStringExtra("manifestUrl"));
        }
    }
}
