package app.tatakai.me.download;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/** Like ffmpeg, inspect the payload instead of trusting a CDN's MIME label. */
public final class MediaPayloadValidator {
    private MediaPayloadValidator() {}
    public static void validate(byte[] bytes, int count, String contentType) throws IOException {
        String prefix = new String(bytes, 0, Math.max(0, count), StandardCharsets.UTF_8)
            .replaceFirst("^\\uFEFF", "").trim().toLowerCase(Locale.US);
        if (prefix.startsWith("#extm3u") || prefix.startsWith("webvtt") || prefix.startsWith("[script info]")) return;
        String mime = String.valueOf(contentType).toLowerCase(Locale.US);
        boolean html = prefix.startsWith("<") && (mime.contains("html") || prefix.contains("<html") || prefix.contains("<!doctype html")
            || prefix.startsWith("<head") || prefix.startsWith("<body") || prefix.startsWith("<script") || prefix.startsWith("<?xml"));
        boolean json = String.valueOf(contentType).toLowerCase(Locale.US).contains("json")
            && (prefix.startsWith("{") || prefix.matches("(?s)^\\[\\s*(?:[\\{\"\\]0-9]|true|false|null).*"));
        boolean textError = (mime.contains("html") || mime.contains("json"))
            && prefix.matches("(?s)^(access denied|forbidden|unauthorized|just a moment|error:).*" );
        if (html || json || textError) throw new IOException("The provider returned an error page instead of video");
    }
}
