package app.tatakai.me.extensions;

import java.net.URI;

/** URL handling shared by the configuration activity and its native tests. */
public final class ExtensionConfigurationUrl {
    private ExtensionConfigurationUrl() {}

    public static boolean isWebUrl(String value) {
        if (value == null || value.length() > 16384 || value.chars().anyMatch(c -> c <= 32 || c == 127)) return false;
        try {
            URI url = new URI(value);
            return ("https".equalsIgnoreCase(url.getScheme()) || "http".equalsIgnoreCase(url.getScheme()))
                && url.getHost() != null && !url.getHost().isEmpty() && url.getRawUserInfo() == null;
        } catch (Exception ignored) { return false; }
    }

    public static String configuredManifest(String value) {
        if (value == null) return null;
        String normalized = value.replaceFirst("(?i)^stremio://", "https://");
        if (!isWebUrl(normalized)) return null;
        try {
            URI url = new URI(normalized);
            if (url.getRawPath() == null || !url.getRawPath().endsWith("/manifest.json")) return null;
            int fragment = normalized.indexOf('#');
            return fragment < 0 ? normalized : normalized.substring(0, fragment);
        } catch (Exception ignored) { return null; }
    }
}
