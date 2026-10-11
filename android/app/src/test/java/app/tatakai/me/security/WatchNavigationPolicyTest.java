package app.tatakai.me.security;
import org.junit.Test;
import static org.junit.Assert.*;
public final class WatchNavigationPolicyTest {
    private final String watch = "https://tatakai.me/watch/16498%3Fep%3D1";
    @Test public void blocksUnknownAndTrustedExternalDocumentsBeforeBridgeSignal() {
        assertTrue(WatchNavigationPolicy.shouldBlock(false, watch, "https://ad.example/", true));
        assertTrue(WatchNavigationPolicy.shouldBlock(false, watch, "https://github.com/", true));
        assertTrue(WatchNavigationPolicy.shouldBlock(true, watch, "https://ad.tatakai.me/", true));
    }
    @Test public void blocksIntentAndHostlessEscapes() {
        assertTrue(WatchNavigationPolicy.shouldBlock(false, watch, "intent://ad/#Intent;end", true));
        assertTrue(WatchNavigationPolicy.shouldBlock(false, watch, "javascript:alert(1)", true));
    }
    @Test public void allowsIframeAndMediaNavigation() {
        assertFalse(WatchNavigationPolicy.shouldBlock(true, watch, "https://player.example/embed/1", false));
        assertFalse(WatchNavigationPolicy.shouldBlock(true, watch, "http://127.0.0.1:45259/stream/token", false));
    }
    @Test public void allowsAppRoutesAndExternalLinksAwayFromWatch() {
        assertFalse(WatchNavigationPolicy.shouldBlock(true, watch, "https://tatakai.me/anime/16498", true));
        assertFalse(WatchNavigationPolicy.shouldBlock(false, "https://tatakai.me/settings", "https://github.com/", true));
    }
}
