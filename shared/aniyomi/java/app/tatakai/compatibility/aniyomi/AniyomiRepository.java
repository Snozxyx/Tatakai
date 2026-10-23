package app.tatakai.compatibility.aniyomi;

import java.io.*;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.zip.GZIPInputStream;
import org.json.*;

/** Modern signed protobuf stores and legacy JSON, with bounded decoding. */
final class AniyomiRepository {
    private static final int LIMIT = 16 * 1024 * 1024;
    private static byte[] inflate(byte[] input) throws Exception {
        if (input.length < 2 || (input[0] & 255) != 31 || (input[1] & 255) != 139) return input;
        try (InputStream stream = new GZIPInputStream(new ByteArrayInputStream(input)); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] block = new byte[16384]; int n; while ((n = stream.read(block)) != -1) { if (Thread.currentThread().isInterrupted()) throw new InterruptedIOException(); if (output.size() + n > LIMIT) throw new IOException("Inflated repository exceeds 16 MB"); output.write(block, 0, n); } return output.toByteArray();
        }
    }
    private static final class Wire {
        final Map<Integer, List<Object>> fields = new HashMap<>(); final byte[] data; int at;
        long integer() throws Exception { long value = 0; for (int shift = 0; shift <= 63; shift += 7) { if (at >= data.length) throw new IOException("Truncated protobuf"); int b = data[at++] & 255; if (shift == 63 && b > 1) throw new IOException("Protobuf integer overflow"); value |= (long)(b & 127) << shift; if ((b & 128) == 0) return value; } throw new IOException("Oversized protobuf integer"); }
        Wire(byte[] data) throws Exception {
            this.data = data; int count = 0; if (data.length > LIMIT) throw new IOException("Protobuf exceeds 16 MB");
            while (at < data.length) {
                if (++count > 500000) throw new IOException("Too many protobuf fields"); long tag = integer(); int field = (int)(tag >>> 3), type = (int)(tag & 7); if (field < 1 || field > 536870911) throw new IOException("Invalid protobuf tag"); Object value;
                if (type == 0) value = integer();
                else if (type == 1 || type == 2 || type == 5) { long size = type == 1 ? 8 : type == 5 ? 4 : integer(); if (size < 0 || size > data.length - at) throw new IOException("Invalid protobuf length"); value = Arrays.copyOfRange(data, at, at + (int)size); at += (int)size; }
                else throw new IOException("Unsupported protobuf wire type"); fields.computeIfAbsent(field, ignored -> new ArrayList<>()).add(value);
            }
        }
        Object first(int field) { List<Object> rows = fields.get(field); return rows == null || rows.isEmpty() ? null : rows.get(0); }
        String text(int field) { Object value = first(field); return value instanceof byte[] ? new String((byte[])value, StandardCharsets.UTF_8) : ""; }
        long number(int field) { Object value = first(field); return value instanceof Long ? (Long)value : 0; }
        Wire message(int field) throws Exception { Object value = first(field); return new Wire(value instanceof byte[] ? (byte[])value : new byte[0]); }
    }
    static JSONArray read(String url) throws Exception { return read(url, new HashSet<>()); }
    private static JSONArray read(String url, Set<String> visited) throws Exception {
        if (visited.size() >= 4 || !visited.add(url)) throw new IOException("Recursive repository index");
        byte[] raw = inflate(AniyomiEngine.download(url, LIMIT)); int first = 0; while (first < raw.length && Character.isWhitespace(raw[first])) first++;
        if (first < raw.length && raw[first] == '[') return new JSONArray(new String(raw, StandardCharsets.UTF_8));
        if (first < raw.length && raw[first] == '{') { JSONObject metadata = new JSONObject(new String(raw, StandardCharsets.UTF_8)); String index = metadata.optString("index_v2", metadata.optString("indexUrl")); if (index.isEmpty()) throw new IOException("Repository metadata has no native index"); return read(new URL(new URL(url), index).toString(), visited); }
        Wire root = new Wire(raw); String signer = root.text(3).toLowerCase(Locale.ROOT);
        if (!signer.matches("[a-f0-9]{64}")) throw new IOException("Protobuf repository must declare a signing fingerprint");
        Wire list = root.fields.containsKey(101) ? root.message(101) : new Wire(inflate(AniyomiEngine.download(new URL(new URL(url), root.text(102)).toString(), LIMIT)));
        JSONArray result = new JSONArray();
        for (Object value : list.fields.getOrDefault(1, Collections.emptyList())) {
            if (!(value instanceof byte[])) throw new IOException("Invalid repository package list"); Wire entry = new Wire((byte[])value), resources = entry.message(3);
            result.put(new JSONObject().put("name", entry.text(1)).put("pkg", entry.text(2)).put("version", entry.text(6)).put("code", Long.toString(entry.number(5))).put("directUrl", resources.text(1)).put("signer", signer));
        }
        return result;
    }
}
