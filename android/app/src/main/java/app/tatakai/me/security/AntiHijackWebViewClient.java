package app.tatakai.me.security;

import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;
import com.getcapacitor.Logger;

import java.io.ByteArrayInputStream;
import java.util.Map;

import app.tatakai.me.proxy.SecurityState;

/**
 * AntiHijackWebViewClient — the network-layer half of the mobile anti-click-hijack,
 * the WebView equivalent of desktop's `session.webRequest.onBeforeRequest`
 * (`desktop/security/ad-blocker.cjs`).
 *
 * It extends Capacitor's {@link BridgeWebViewClient} and delegates EVERYTHING to
 * super except two additions, so Capacitor's local-asset serving, deep-link
 * launching and lifecycle callbacks keep working unchanged:
 *
 *   • {@link #shouldInterceptRequest} drops requests to ad / popunder / third-party
 *     analytics hosts (see {@link AdHosts}) before they hit the network — the same
 *     networks desktop cancels. Everything else falls through to
 *     {@code super.shouldInterceptRequest}, which serves bundled app assets.
 *
 *   • {@link #shouldOverrideUrlLoading} blocks a TOP-FRAME navigation to a known ad
 *     host — the redirect-hijack an embed attempts when it tries to replace the
 *     whole app with an ad page. In-frame (iframe) navigations are not main-frame,
 *     so the embed still plays; and non-ad external links still go through super
 *     (Capacitor opens them per `allowNavigation`).
 *
 * The protection is always-on and native, so — exactly like desktop's main-process
 * filter — an untrusted embed cannot detect or switch it off from JavaScript.
 */
public class AntiHijackWebViewClient extends BridgeWebViewClient {

    public AntiHijackWebViewClient(Bridge bridge) {
        super(bridge);
    }

    private static String headerIgnoreCase(Map<String, String> headers, String name) {
        if (headers == null) return null;
        for (Map.Entry<String, String> e : headers.entrySet()) {
            if (e.getKey() != null && e.getKey().equalsIgnoreCase(name)) return e.getValue();
        }
        return null;
    }

    /** An empty 200 response — the request is answered with nothing, i.e. dropped. */
    private static WebResourceResponse blockedResponse() {
        return new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream(new byte[0]));
    }

    @Override
    public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
        try {
            Uri uri = request.getUrl();
            String url = uri != null ? uri.toString() : null;
            if (url != null) {
                // Never block the app's own loopback media (local proxy + torrent
                // stream server) — same as desktop LOOPBACK_HOSTS exemption.
                String host = AdHosts.hostnameOf(url);
                if (AdHosts.isLoopbackHost(host)) {
                    return super.shouldInterceptRequest(view, request);
                }
                // Desktop parity: the network filter is only armed while the
                // watch page is mounted. Hard ad-network hosts are still always
                // dropped (never a false positive); analytics + unknown hosts
                // are gated on the filter so first-party telemetry elsewhere in
                // the app is never cancelled.
                if (AdHosts.isHardBlockedHost(host)) {
                    Logger.debug("AntiHijack blocked request: " + host);
                    return blockedResponse();
                }
                if (SecurityState.isFilteringActive()) {
                    Map<String, String> headers = request.getRequestHeaders();
                    String referer = headerIgnoreCase(headers, "Referer");
                    if (referer == null) referer = headerIgnoreCase(headers, "Origin");
                    if (AdHosts.shouldBlock(url, referer)) {
                        Logger.debug("AntiHijack blocked request: " + host);
                        return blockedResponse();
                    }
                }
            }
        } catch (Exception ignored) {
            // Never let the filter break asset serving — fall through to super.
        }
        return super.shouldInterceptRequest(view, request);
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        try {
            if (request.isForMainFrame()) {
                Uri uri = request.getUrl();
                String url = uri != null ? uri.toString() : null;
                String host = AdHosts.hostnameOf(url);
                if (AdHosts.isHardBlockedHost(host)) {
                    // Top-frame redirect hijack to an ad network — swallow it so the
                    // app frame is never navigated away from the player.
                    Logger.debug("AntiHijack blocked top-frame navigation: " + host);
                    return true;
                }
                // Desktop `will-navigate` + `evaluateWindowOpen` embed-popunder
                // parity: while an untrusted embed is on screen, no top-frame
                // navigation may leave the app for an unknown third party.
                // Loopback (local proxy / torrent), first-party and explicitly
                // trusted hosts still pass through to Capacitor.
                if (url != null && SecurityState.isEmbedActive()
                    && !AdHosts.isLoopbackHost(host)
                    && AdHosts.isEmbedPopunder(url, true)) {
                    Logger.debug("AntiHijack blocked embed hijack navigation: " + host);
                    return true;
                }
            }
        } catch (Exception ignored) {
            // Fall through to Capacitor's default handling on any parsing error.
        }
        return super.shouldOverrideUrlLoading(view, request);
    }
}
