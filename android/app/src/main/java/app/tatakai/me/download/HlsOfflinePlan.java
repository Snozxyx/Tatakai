package app.tatakai.me.download;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.regex.*;

/** Lossless VOD rewriting: download whole objects so original byte-range offsets remain valid. */
public final class HlsOfflinePlan {
    public static final class Resource {
        public final String url, name, kind;
        Resource(String url, String kind) { this.url = url; this.kind = kind; this.name = fileName(url, kind); }
    }
    public final String playlist;
    public final List<Resource> resources;
    private static final Pattern URI_ATTR = Pattern.compile("URI=\"([^\"]+)\"");
    private static final Pattern BANDWIDTH = Pattern.compile("(?:^|,)BANDWIDTH=(\\d+)");

    private HlsOfflinePlan(String playlist, List<Resource> resources) {
        this.playlist = playlist; this.resources = resources;
    }
    public static String fileName(String url, String kind) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(url.getBytes(StandardCharsets.UTF_8));
            StringBuilder id = new StringBuilder();
            for (byte b : hash) id.append(String.format(Locale.US, "%02x", b));
            String path;
            try { path = URI.create(url).getPath(); } catch (IllegalArgumentException ignored) { path = ""; }
            String ext = path != null && path.matches("(?i).*\\.(mp4|mkv|webm|m4s|ts|aac|vtt|srt|ass|key)$")
                ? path.substring(path.lastIndexOf('.')) : ".bin";
            return id + ("playlist".equals(kind) ? ".m3u8" : ext);
        } catch (Exception e) { throw new IllegalArgumentException("Invalid media URL", e); }
    }
    public static HlsOfflinePlan parse(String text, String base) {
        text = text.replaceFirst("^\\uFEFF", "").trim();
        if (!text.trim().startsWith("#EXTM3U")) throw new IllegalArgumentException("Not an HLS playlist");
        String[] lines = text.replace("\r", "").split("\n");
        int chosen = -1; long best = -1;
        for (int i = 0; i < lines.length; i++) {
            if (lines[i].startsWith("#EXT-X-STREAM-INF:")) {
                Matcher m = BANDWIDTH.matcher(lines[i].substring(lines[i].indexOf(':') + 1));
                long bw = m.find() ? Long.parseLong(m.group(1)) : 0;
                if (bw > best) { best = bw; chosen = i; }
            }
        }
        boolean master = chosen >= 0;
        if (!master && !text.contains("#EXT-X-ENDLIST"))
            throw new IllegalArgumentException("Only completed HLS VOD episodes can be downloaded");
        String selected = master ? lines[chosen] : "";
        Set<Integer> media = new HashSet<>();
        for (String type : new String[]{"AUDIO", "SUBTITLES"}) {
            String group = attribute(selected, type); int pick = -1;
            if (group == null) continue;
            for (int i = 0; i < lines.length; i++) {
                String line = lines[i];
                if (line.startsWith("#EXT-X-MEDIA:") && type.equals(attribute(line, "TYPE"))
                    && group.equals(attribute(line, "GROUP-ID"))) {
                    if (pick < 0) pick = i;
                    if ("YES".equals(attribute(line, "DEFAULT"))) { pick = i; break; }
                }
            }
            if (pick >= 0) media.add(pick);
        }
        Map<String, Resource> refs = new LinkedHashMap<>(); StringBuilder out = new StringBuilder();
        boolean variantUri = false;
        for (int i = 0; i < lines.length; i++) {
            String line = lines[i].trim();
            if (line.startsWith("#EXT-X-I-FRAME-STREAM-INF:")) continue;
            if (line.startsWith("#EXT-X-STREAM-INF:")) { variantUri = i == chosen; if (!variantUri) continue; }
            if (line.startsWith("#EXT-X-MEDIA:") && master && !media.contains(i)) continue;
            if (line.startsWith("#EXT-X-KEY:") || line.startsWith("#EXT-X-SESSION-KEY:")) {
                String method = attribute(line, "METHOD"), format = attribute(line, "KEYFORMAT");
                if (!("NONE".equals(method) || "AES-128".equals(method)) || (format != null && !"identity".equals(format)))
                    throw new IllegalArgumentException("Protected HLS streams are not supported for offline downloads");
            }
            if (!line.isEmpty() && !line.startsWith("#")) {
                if (master && !variantUri) continue;
                Resource ref = reference(base, line, master ? "playlist" : "binary", refs);
                line = ref.name; variantUri = false;
            } else {
                Matcher m = URI_ATTR.matcher(line); StringBuffer replaced = new StringBuffer();
                while (m.find()) {
                    String kind = line.startsWith("#EXT-X-MEDIA:") ? "playlist" : "binary";
                    Resource ref = reference(base, m.group(1), kind, refs);
                    m.appendReplacement(replaced, Matcher.quoteReplacement("URI=\"" + ref.name + "\""));
                }
                m.appendTail(replaced); line = replaced.toString();
            }
            out.append(line).append('\n');
        }
        if (refs.isEmpty()) throw new IllegalArgumentException("Playlist has no downloadable resources");
        return new HlsOfflinePlan(out.toString(), new ArrayList<>(refs.values()));
    }
    private static Resource reference(String base, String value, String kind, Map<String, Resource> refs) {
        String url = URI.create(base).resolve(value).toString();
        if (!(url.startsWith("https://") || url.startsWith("http://"))) throw new IllegalArgumentException("Unsupported HLS resource URL");
        Resource ref = new Resource(url, kind); refs.putIfAbsent(ref.name, ref); return ref;
    }
    private static String attribute(String line, String name) {
        Matcher m = Pattern.compile("(?:[:,])" + name + "=(?:\"([^\"]*)\"|([^,]*))").matcher(line);
        return m.find() ? (m.group(1) != null ? m.group(1) : m.group(2)) : null;
    }
}
