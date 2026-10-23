package app.tatakai.me.compatibility;

import android.content.Context;
import android.os.Bundle;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.UUID;

/** Keep Binder envelopes small; large JSON replies cross processes in private one-use files. */
final class CompatibilityReplies {
    static final int INLINE_CHARS = 64000, MAX_BYTES = 16 * 1024 * 1024;
    private static File directory(Context context) throws IOException {
        File cache = context.getCacheDir().getCanonicalFile();
        File directory = new File(cache, "compatibility-replies");
        if (!directory.getCanonicalFile().getParentFile().equals(cache)) throw new IOException("Invalid reply directory");
        if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException("Cannot prepare reply directory");
        return directory;
    }
    static Bundle encode(Context context, String id, String json) throws IOException {
        Bundle result = new Bundle(); result.putString("id", id);
        if (json.length() <= INLINE_CHARS) { result.putString("result", json); return result; }
        if (json.length() > MAX_BYTES) throw new IOException("Provider response exceeds the local reply limit");
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        if (bytes.length > MAX_BYTES) throw new IOException("Provider response exceeds the local reply limit");
        File directory = directory(context);
        File[] old = directory.listFiles();
        if (old != null) for (File file : old) if (file.getName().matches("[a-f0-9-]{36}\\.(json|partial)") && System.currentTimeMillis() - file.lastModified() > 600000 && file.getCanonicalFile().getParentFile().equals(directory.getCanonicalFile())) file.delete();
        String name = UUID.randomUUID() + ".json";
        File complete = new File(directory, name), partial = new File(directory, name.replace(".json", ".partial"));
        try {
            try (FileOutputStream out = new FileOutputStream(partial)) { out.write(bytes); out.getFD().sync(); }
            if (!partial.renameTo(complete)) throw new IOException("Cannot publish provider reply");
        } finally { partial.delete(); }
        result.putString("resultFile", name); return result;
    }
    static String decode(Context context, Bundle reply) throws IOException {
        String name = reply.getString("resultFile");
        if (name == null) {
            String inline = reply.getString("result", "{}");
            if (inline.length() > INLINE_CHARS) throw new IOException("Oversized inline provider reply");
            return inline;
        }
        if (!name.matches("[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\\.json")) throw new IOException("Invalid provider reply capability");
        File directory = directory(context).getCanonicalFile(), file = new File(directory, name);
        if (!file.getCanonicalFile().getParentFile().equals(directory)) throw new IOException("Provider reply escaped its directory");
        try {
            if (!file.isFile() || file.length() > MAX_BYTES) throw new IOException("Invalid provider reply file");
            try (InputStream input = new FileInputStream(file); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] block = new byte[32768]; int read;
                while ((read = input.read(block)) >= 0) { if (output.size() + read > MAX_BYTES) throw new IOException("Provider reply exceeds limit"); output.write(block, 0, read); }
                return output.toString(StandardCharsets.UTF_8.name());
            }
        } finally { Files.deleteIfExists(file.toPath()); }
    }
}
