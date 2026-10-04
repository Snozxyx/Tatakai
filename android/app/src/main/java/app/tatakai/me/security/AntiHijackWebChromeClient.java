package app.tatakai.me.security;

import android.os.Message;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.Logger;

/**
 * AntiHijackWebChromeClient — the popup half of the mobile anti-click-hijack, the
 * WebView equivalent of desktop's `window.open` guard (`evaluateWindowOpen` in
 * `desktop/security/ad-blocker.cjs`), which refuses popunders raised by an
 * untrusted embed.
 *
 * It extends Capacitor's {@link BridgeWebChromeClient} (so JS dialogs, geolocation
 * and file-chooser handling are untouched) and only overrides {@link #onCreateWindow}
 * to refuse WebView-created windows. Popunders are the one thing that opens a new
 * WebView window from script; the app itself never does (external links are same-
 * frame navigations handled by {@link AntiHijackWebViewClient}#shouldOverrideUrlLoading
 * → Capacitor's launchIntent, or the Browser plugin), so refusing here costs no
 * legitimate behaviour.
 */
public class AntiHijackWebChromeClient extends BridgeWebChromeClient {

    public AntiHijackWebChromeClient(Bridge bridge) {
        super(bridge);
    }

    @Override
    public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
        // Refuse the new window (popunder / popup ad). Returning false and not
        // sending the transport message means no window is created.
        Logger.debug("AntiHijack blocked window.open (userGesture=" + isUserGesture + ")");
        return false;
    }
}
