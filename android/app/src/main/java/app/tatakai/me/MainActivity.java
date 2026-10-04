package app.tatakai.me;

import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;

import app.tatakai.me.security.AntiHijackWebChromeClient;
import app.tatakai.me.security.AntiHijackWebViewClient;
import app.tatakai.me.player.NativePlayerPlugin;
import app.tatakai.me.torrent.TatakaiTorrentPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        // This must happen before BridgeActivity builds its Capacitor bridge.
        registerPlugin(TatakaiTorrentPlugin.class);
        registerPlugin(NativePlayerPlugin.class);
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
            }
        }
    }
}
