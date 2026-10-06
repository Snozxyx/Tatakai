package app.tatakai.me.mux;

import android.util.Log;

import com.arthenica.ffmpegkit.FFmpegKit;
import com.arthenica.ffmpegkit.FFmpegSession;
import com.arthenica.ffmpegkit.ReturnCode;
import com.arthenica.ffmpegkit.Statistics;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Android-only HLS → MP4 remux service (mobile parity with desktop's
 * `ffmpeg -c copy` download path).
 *
 * The WebView downloader resolves the best variant playlist in JS, then hands
 * the variant URL + replay headers here. ffmpeg repackages (no re-encode) into
 * a single `Episode_<n>.mp4` under app-private storage, so the offline player
 * and any gallery/file app can open it — exactly like desktop output.
 *
 * Output is confined to the app's internal files dir (path-traversal safe);
 * only http(s) inputs are accepted.
 */
@CapacitorPlugin(name = "TatakaiMux")
public class TatakaiMuxPlugin extends Plugin {
    private static final String TAG = "TatakaiMux";
    private static final int LOG_TAIL_LINES = 12;

    private final Map<String, FFmpegSession> sessions = new ConcurrentHashMap<>();

    @PluginMethod
    public void muxHlsToMp4(PluginCall call) {
        String url = call.getString("url", "").trim();
        String outPath = call.getString("outPath", "").trim();
        String jobId = call.getString("jobId", "").trim();
        if (jobId.isEmpty()) jobId = UUID.randomUUID().toString();
        final String job = jobId;

        if (!url.regionMatches(true, 0, "http", 0, 4)) {
            call.resolve(failure("Only http(s) stream URLs can be remuxed."));
            return;
        }
        File outFile;
        try {
            outFile = confinedOutput(outPath);
        } catch (IllegalArgumentException e) {
            call.resolve(failure(e.getMessage()));
            return;
        }

        String headersArg = buildHeadersArg(call.getObject("headers", new JSObject()));
        StringBuilder cmd = new StringBuilder("-y ");
        // Reconnect flags must precede -i: mobile radios drop mid-remux and
        // without these a single blip aborts the whole download.
        cmd.append("-reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5 ");
        if (!headersArg.isEmpty()) {
            cmd.append("-headers \"").append(headersArg).append("\" ");
        }
        cmd.append("-i \"").append(url.replace("\"", "")).append("\" ");
        cmd.append("-c copy -bsf:a aac_adtstoasc -movflags +faststart ");
        cmd.append("\"").append(outFile.getAbsolutePath().replace("\"", "")).append("\"");

        // Drop any stale partial from a previous attempt so a failed run never
        // leaves bytes that look like a finished download.
        try {
            if (outFile.exists() && !outFile.delete()) {
                Log.w(TAG, "Could not delete stale partial " + outFile.getAbsolutePath());
            }
        } catch (SecurityException ignored) {
        }
        File parent = outFile.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) {
            call.resolve(failure("Unable to create the download directory."));
            return;
        }

        final Deque<String> logTail = new ArrayDeque<>();
        Log.i(TAG, "mux start job=" + job);
        FFmpegKit.executeAsync(
            cmd.toString(),
            session -> {
                sessions.remove(job);
                ReturnCode rc = session.getReturnCode();
                if (ReturnCode.isSuccess(rc)) {
                    long size = outFile.exists() ? outFile.length() : 0L;
                    JSObject result = success();
                    result.put("jobId", job);
                    result.put("size", size);
                    call.resolve(result);
                } else if (ReturnCode.isCancel(rc)) {
                    try {
                        if (outFile.exists()) outFile.delete();
                    } catch (SecurityException ignored) {
                    }
                    call.resolve(failure("cancelled"));
                } else {
                    try {
                        if (outFile.exists()) outFile.delete();
                    } catch (SecurityException ignored) {
                    }
                    StringBuilder detail = new StringBuilder();
                    for (String line : logTail) {
                        if (detail.length() > 0) detail.append('\n');
                        detail.append(line);
                    }
                    String message = "Remux failed (exit " + (rc != null ? rc.getValue() : "?") + ")";
                    if (detail.length() > 0) message += ": " + detail;
                    call.resolve(failure(message));
                }
            },
            log -> {
                synchronized (logTail) {
                    logTail.addLast(log.getMessage());
                    while (logTail.size() > LOG_TAIL_LINES) logTail.removeFirst();
                }
            },
            (Statistics stats) -> {
                JSObject event = new JSObject();
                event.put("jobId", job);
                event.put("timeMs", stats.getTime());
                event.put("size", stats.getSize());
                notifyListeners("muxProgress", event);
            }
        );
        // Track the live session for cancelMux. executeAsync returns void, so
        // look it up from the global session list. Downloads are serialized
        // app-wide, so the newest session is ours (no concurrent mux by
        // design — see the mobile download queue).
        try {
            java.util.List<FFmpegSession> all = com.arthenica.ffmpegkit.FFmpegKit.listSessions();
            if (all != null && !all.isEmpty()) {
                sessions.put(job, all.get(all.size() - 1));
            }
        } catch (Throwable t) {
            Log.w(TAG, "Could not track mux session for cancel", t);
        }
    }

    @PluginMethod
    public void cancelMux(PluginCall call) {
        String jobId = call.getString("jobId", "").trim();
        FFmpegSession session = sessions.remove(jobId);
        if (session != null) {
            try {
                session.cancel();
            } catch (Throwable t) {
                Log.w(TAG, "cancelMux failed", t);
            }
        }
        call.resolve(success());
    }

    /**
     * Resolve the requested output inside the app-private files dir.
     * Anything escaping it (../, absolute outside paths) is rejected.
     */
    private File confinedOutput(String outPath) {
        if (outPath.isEmpty()) throw new IllegalArgumentException("A destination path is required.");
        try {
            File root = getContext().getFilesDir().getCanonicalFile();
            File candidate = new File(outPath);
            if (!candidate.isAbsolute()) candidate = new File(root, outPath);
            File resolved = candidate.getCanonicalFile();
            if (!resolved.getPath().startsWith(root.getPath() + File.separator)) {
                throw new IllegalArgumentException("Destination must stay inside app storage.");
            }
            if (!resolved.getName().toLowerCase(Locale.US).endsWith(".mp4")) {
                throw new IllegalArgumentException("Destination must be an .mp4 file.");
            }
            return resolved;
        } catch (java.io.IOException e) {
            throw new IllegalArgumentException("Unable to resolve the destination path.");
        }
    }

    /**
     * Build ffmpeg's `-headers` value (`Name: value\r\n` lines). Values are
     * stripped of CR/LF/quotes so a hostile header can't break out of the
     * quoted argument ffmpeg parses.
     */
    private String buildHeadersArg(JSObject headers) {
        StringBuilder sb = new StringBuilder();
        if (headers == null) return "";
        java.util.Iterator<String> names;
        try {
            names = headers.keys();
        } catch (Exception e) {
            return "";
        }
        while (names != null && names.hasNext()) {
            String name = names.next();
            if (name == null) continue;
            String value;
            try {
                value = headers.getString(name, "");
            } catch (Exception e) {
                continue;
            }
            if (value == null || value.isEmpty()) continue;
            String cleanName = name.replaceAll("[\\r\\n\":]", "").trim();
            String cleanValue = value.replaceAll("[\\r\\n\"]", "").trim();
            if (cleanName.isEmpty() || cleanValue.isEmpty()) continue;
            sb.append(cleanName).append(": ").append(cleanValue).append("\\r\\n");
        }
        return sb.toString();
    }

    private JSObject success() {
        JSObject object = new JSObject();
        object.put("success", true);
        return object;
    }

    private JSObject failure(String message) {
        JSObject object = new JSObject();
        object.put("success", false);
        object.put("error", message == null ? "Mux failed." : message);
        return object;
    }
}
