package app.tatakai.me.security;

import java.net.URI;
import java.util.Locale;

/** Document containment; independent of ad blocklists and embed bridge timing. */
public final class WatchNavigationPolicy {
    private WatchNavigationPolicy() {}
    private static boolean appHost(String host) {
        if (host == null) return false;
        String value = host.toLowerCase(Locale.ROOT);
        return value.equals("tatakai.me") || value.equals("tatakai.app")
            || value.equals("tatakai.to") || value.equals("localhost");
    }
    public static boolean shouldBlock(boolean active, String currentUrl, String targetUrl, boolean mainFrame) {
        if (!mainFrame) return false;
        try {
            URI current = URI.create(currentUrl == null ? "" : currentUrl);
            boolean watching = active || (appHost(current.getHost())
                && current.getPath() != null && current.getPath().startsWith("/watch/"));
            if (!watching) return false;
            URI target = URI.create(targetUrl == null ? "" : targetUrl);
            return !appHost(target.getHost()) || !("https".equalsIgnoreCase(target.getScheme()) || "http".equalsIgnoreCase(target.getScheme()));
        } catch (IllegalArgumentException error) { return active; }
    }
}
