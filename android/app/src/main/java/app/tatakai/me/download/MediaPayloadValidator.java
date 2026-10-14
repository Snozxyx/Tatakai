package app.tatakai.me.download;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/** Like ffmpeg, inspect the payload instead of trusting a CDN's MIME label. */
public final class MediaPayloadValidator {
    private MediaPayloadValidator() {}
    /** Signed CDN endpoints often have no extension. Detect the container from its bytes. */
    public static String contentType(byte[] bytes, int count) {
        if (count >= 8 && bytes[4] == 'f' && bytes[5] == 't' && bytes[6] == 'y' && bytes[7] == 'p') return "video/mp4";
        if (count >= 4 && (bytes[0] & 255) == 0x1a && (bytes[1] & 255) == 0x45 && (bytes[2] & 255) == 0xdf && (bytes[3] & 255) == 0xa3) {
            String header = new String(bytes, 0, count, StandardCharsets.ISO_8859_1);
            return header.contains("webm") ? "video/webm" : "video/x-matroska";
        }
        if (count > 188 && bytes[0] == 0x47 && bytes[188] == 0x47) return "video/mp2t";
        String text = new String(bytes, 0, Math.max(0, count), StandardCharsets.UTF_8).replaceFirst("^\\uFEFF", "").trim();
        if (text.startsWith("#EXTM3U")) return "application/vnd.apple.mpegurl";
        if (text.startsWith("WEBVTT")) return "text/vtt; charset=utf-8";
        return "application/octet-stream";
    }
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
