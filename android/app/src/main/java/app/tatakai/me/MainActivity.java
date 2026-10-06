package app.tatakai.me;

import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

import app.tatakai.me.security.AntiHijackWebChromeClient;
import app.tatakai.me.security.AntiHijackWebViewClient;
import app.tatakai.me.player.NativePlayerPlugin;
import app.tatakai.me.proxy.TatakaiLocalProxyPlugin;
import app.tatakai.me.mux.TatakaiMuxPlugin;
import app.tatakai.me.torrent.TatakaiTorrentPlugin;
import app.tatakai.me.updater.TatakaiUpdaterPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        // This must happen before BridgeActivity builds its Capacitor bridge.
        registerPlugin(TatakaiTorrentPlugin.class);
        registerPlugin(NativePlayerPlugin.class);
        // Loopback media proxy (anime HLS/MP4 + subtitles + manga images +
        // download assets) — native counterpart to the desktop LocalProxyServer.
        registerPlugin(TatakaiLocalProxyPlugin.class);
        // In-app updater: downloads the release APK and fires the installer.
        registerPlugin(TatakaiUpdaterPlugin.class);
        // HLS → MP4 remux for offline downloads (mobile parity with desktop's
        // ffmpeg `-c copy` path).
        registerPlugin(TatakaiMuxPlugin.class);
        super.onCreate(savedInstanceState);

        // Install the native anti-click-hijack clients, the mobile equivalent of
        // desktop's main-process ad-blocker. The bridge (and its WebView) exist
        // once super.onCreate() has run. Both clients extend Capacitor's own, so
        // asset serving / deep links / dialogs keep working; they only add the
        // ad-network request drop, top-frame redirect-hijack block, and popunder
        // refusal. See app.tatakai.me.security.*.
        Bridge bridge = getBridge();
        if (bridge != null) {
            bridge.setWebViewClient(new AntiHijackWebViewClient(bridge));
            WebView webView = bridge.getWebView();
            if (webView != null) {
                webView.setWebChromeClient(new AntiHijackWebChromeClient(bridge));
                // Production WebView tuning: the defaults cost first-frame time
                // and smoothness on low-end phones (no DOM storage, user-gesture
                // gated media, unpredictable text zoom, software rendering).
                try {
                    android.webkit.WebSettings settings = webView.getSettings();
                    settings.setDomStorageEnabled(true);
                    settings.setDatabaseEnabled(true);
                    settings.setMediaPlaybackRequiresUserGesture(false);
                    settings.setLoadWithOverviewMode(true);
                    settings.setUseWideViewPort(true);
                    settings.setTextZoom(100);
                    settings.setCacheMode(android.webkit.WebSettings.LOAD_DEFAULT);
                    try {
                        settings.setMixedContentMode(
                            android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW);
                    } catch (Exception ignored) {}
                    webView.setLayerType(WebView.LAYER_TYPE_HARDWARE, null);
                } catch (Exception ignored) {
                    // Never let tuning break WebView creation.
                }
            }
        }
    }
}
