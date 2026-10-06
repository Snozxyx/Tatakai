package app.tatakai.me.proxy;

/**
 * SecurityState — shared embed/watch flags for the mobile anti-click-hijack.
 *
 * Desktop parity: {@code desktop/security/ad-blocker.cjs} arms its network
 * filter only while the watch route is mounted ({@code setWatchActive}) and
 * treats any unknown {@code window.open} target as a popunder while an
 * untrusted embed is on screen ({@code setEmbedActive}).
 *
 * The WebView clients ({@code AntiHijackWebViewClient}) read these flags;
 * the JS shell sets them via {@code TatakaiLocalProxyPlugin} so there is a
 * single native entry-point (no extra plugin just for two booleans).
 */
public final class SecurityState {
    private SecurityState() {}

    private static volatile boolean embedActive = false;
    private static volatile boolean watchActive = false;

    public static void setEmbedActive(boolean active) {
        embedActive = active;
    }

    public static void setWatchActive(boolean active) {
        watchActive = active;
        if (!active) embedActive = false;
    }

    public static boolean isEmbedActive() {
        return embedActive;
    }

    public static boolean isWatchActive() {
        return watchActive;
    }

    /** Desktop {@code isFilteringActive()}: enabled && (watch || embed). */
    public static boolean isFilteringActive() {
        return watchActive || embedActive;
    }
}
