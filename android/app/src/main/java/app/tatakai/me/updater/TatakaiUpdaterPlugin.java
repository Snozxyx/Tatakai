package app.tatakai.me.updater;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * TatakaiUpdater — Android-only in-app updater for the sideloaded APK build.
 *
 * The app is distributed via GitHub Releases (see the `build-android` CI job,
 * which publishes `Tatakai-v<version>-android.apk`), not the Play Store, so
 * updates are a manual download + install. This plugin removes the browser
 * round-trip: the renderer resolves the APK asset URL from the release API,
 * this plugin streams it to the app-private external files dir with progress
 * events, then fires the package-installer intent through FileProvider.
 *
 * Installs of unknown-source APKs need the user to grant "Install unknown
 * apps" for Tatakai once (Android 8+). {@code canInstall} reports that state
 * so the renderer can deep-link straight to the per-app settings page instead
 * of failing the install intent silently.
 */
@CapacitorPlugin(name = "TatakaiUpdater")
public class TatakaiUpdaterPlugin extends Plugin {
    private static final String TAG = "TatakaiUpdater";
    private static final String UPDATES_DIR = "tatakai-updates";
    private static final int CONNECT_TIMEOUT_MS = 20_000;
    private static final int READ_TIMEOUT_MS = 30_000;
    private static final int BUFFER_SIZE = 64 * 1024;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean cancelled = new AtomicBoolean(false);

    @PluginMethod
    public void canInstall(PluginCall call) {
        boolean canRequest = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            try {
                canRequest = getContext().getPackageManager().canRequestPackageInstalls();
            } catch (Exception ignored) {
                canRequest = false;
            }
        }
        JSObject result = new JSObject();
        result.put("supported", true);
        result.put("canRequestInstalls", canRequest);
        result.put("apiLevel", Build.VERSION.SDK_INT);
        call.resolve(result);
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        if (getActivity() == null) {
            call.reject("The updater is not attached to an activity yet.");
            return;
        }
        try {
            Intent intent;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                intent = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getContext().getPackageName()));
            } else {
                intent = new Intent(Settings.ACTION_SECURITY_SETTINGS);
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(intent);
            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Unable to open install settings: " + error.getMessage());
        }
    }

    @PluginMethod
    public void cancelDownload(PluginCall call) {
        cancelled.set(true);
        JSObject result = new JSObject();
        result.put("success", true);
        call.resolve(result);
    }

    @PluginMethod
    public void downloadApk(PluginCall call) {
        String url = call.getString("url", "");
        if (url == null) url = "";
        url = url.trim();
        String version = call.getString("version", "");
        if (version == null) version = "";
        version = version.trim().replaceAll("[^0-9A-Za-z.\\-]", "");
        if (url.isEmpty() || !url.startsWith("https://")) {
            call.reject("A valid https download URL is required.");
            return;
        }
        if (version.isEmpty()) {
            call.reject("A version label is required.");
            return;
        }

        final String downloadUrl = url;
        final String fileName = "Tatakai-v" + version + "-android.apk";
        // Progress is reported via the `updaterProgress` event (notifyListeners),
        // so the call itself resolves exactly once when the download finishes.
        cancelled.set(false);

        executor.execute(() -> {
            HttpURLConnection connection = null;
            try {
                File dir = new File(getContext().getExternalFilesDir(null), UPDATES_DIR);
                if (!dir.exists() && !dir.mkdirs()) {
                    rejectOnUiThread(call, "Unable to create the update download directory.");
                    return;
                }
                // Drop stale APKs from previous attempts so only the newest
                // download is ever installed.
                File[] stale = dir.listFiles();
                if (stale != null) {
                    for (File file : stale) {
                        if (!file.getName().equals(fileName)) {
                            try { file.delete(); } catch (Exception ignored) {}
                        }
                    }
                }
                File target = new File(dir, fileName);

                connection = openFollowingRedirects(downloadUrl);
                int status = connection.getResponseCode();
                if (status < 200 || status >= 300) {
                    rejectOnUiThread(call, "Download failed with HTTP " + status + ".");
                    return;
                }
                long total = connection.getContentLengthLong();

                // Resume an interrupted download when the server supports it.
                long existing = target.exists() ? target.length() : 0;
                if (existing > 0 && total > existing) {
                    HttpURLConnection resume = null;
                    try {
                        resume = (HttpURLConnection) new URL(downloadUrl).openConnection();
                        resume.setConnectTimeout(CONNECT_TIMEOUT_MS);
                        resume.setReadTimeout(READ_TIMEOUT_MS);
                        resume.setRequestProperty("Range", "bytes=" + existing + "-");
                        resume.setRequestProperty("User-Agent", "TatakaiAndroidUpdater");
                        resume.setInstanceFollowRedirects(true);
                        int resumeStatus = resume.getResponseCode();
                        if (resumeStatus == HttpURLConnection.HTTP_PARTIAL) {
                            try { connection.disconnect(); } catch (Exception ignored) {}
                            connection = resume;
                            resume = null;
                            total = existing + connection.getContentLengthLong();
                        } else {
                            existing = 0;
                        }
                    } catch (Exception ignored) {
                        existing = 0;
                    } finally {
                        if (resume != null) {
                            try { resume.disconnect(); } catch (Exception ignored) {}
                        }
                    }
                } else if (total >= 0 && existing >= total && total > 0) {
                    // Already fully downloaded (e.g. retry after a crash).
                    resolveOnUiThread(call, target, total);
                    return;
                } else {
                    existing = 0;
                }

                long received = existing;
                int lastEmitted = -1;
                try (
                    InputStream raw = new BufferedInputStream(connection.getInputStream());
                    OutputStream out = new FileOutputStream(target, existing > 0)
                ) {
                    byte[] buffer = new byte[BUFFER_SIZE];
                    int read;
                    while ((read = raw.read(buffer)) != -1) {
                        if (cancelled.get()) {
                            rejectOnUiThread(call, "Download cancelled.");
                            return;
                        }
                        out.write(buffer, 0, read);
                        received += read;
                        if (total > 0) {
                            int percent = (int) Math.min(100, (received * 100) / total);
                            if (percent != lastEmitted && (percent - lastEmitted >= 1 || percent == 100)) {
                                lastEmitted = percent;
                                JSObject progress = new JSObject();
                                progress.put("progress", percent);
                                progress.put("receivedBytes", received);
                                progress.put("totalBytes", total);
                                notifyListeners("updaterProgress", progress);
                            }
                        }
                    }
                    out.flush();
                }

                if (total > 0 && received < total) {
                    rejectOnUiThread(call, "Download ended early. Check your connection and retry.");
                    return;
                }
                resolveOnUiThread(call, target, received);
            } catch (Exception error) {
                rejectOnUiThread(call, "Download failed: " + error.getMessage());
            } finally {
                if (connection != null) {
                    try { connection.disconnect(); } catch (Exception ignored) {}
                }
            }
        });
    }

    @PluginMethod
    public void installApk(PluginCall call) {
        String version = call.getString("version", "");
        if (version == null) version = "";
        version = version.trim().replaceAll("[^0-9A-Za-z.\\-]", "");
        String explicitPath = call.getString("path", "");
        if (explicitPath == null) explicitPath = "";
        explicitPath = explicitPath.trim();
        if (getActivity() == null) {
            call.reject("The updater is not attached to an activity yet.");
            return;
        }

        try {
            File apk;
            if (!explicitPath.isEmpty()) {
                apk = new File(explicitPath);
            } else {
                if (version.isEmpty()) {
                    call.reject("A version label is required.");
                    return;
                }
                apk = new File(
                    new File(getContext().getExternalFilesDir(null), UPDATES_DIR),
                    "Tatakai-v" + version + "-android.apk");
            }
            if (!apk.exists() || apk.length() == 0) {
                call.reject("The downloaded update was not found. Download it again.");
                return;
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                boolean allowed = getContext().getPackageManager().canRequestPackageInstalls();
                if (!allowed) {
                    JSObject result = new JSObject();
                    result.put("success", false);
                    result.put("needsPermission", true);
                    call.resolve(result);
                    return;
                }
            }

            Uri uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                apk);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            try {
                getActivity().startActivity(intent);
            } catch (Exception error) {
                call.reject("No installer found to open the update: " + error.getMessage());
                return;
            }
            JSObject result = new JSObject();
            result.put("success", true);
            result.put("needsPermission", false);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Unable to install the update: " + error.getMessage());
        }
    }

    private HttpURLConnection openFollowingRedirects(String url) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
        connection.setReadTimeout(READ_TIMEOUT_MS);
        connection.setRequestProperty("User-Agent", "TatakaiAndroidUpdater");
        connection.setRequestProperty("Accept", "application/octet-stream");
        connection.setInstanceFollowRedirects(true);
        return connection;
    }

    private void resolveOnUiThread(PluginCall call, File target, long size) {
        JSObject result = new JSObject();
        result.put("success", true);
        result.put("path", target.getAbsolutePath());
        result.put("size", size);
        result.put("progress", 100);
        if (getActivity() != null) {
            getActivity().runOnUiThread(() -> call.resolve(result));
        } else {
            call.resolve(result);
        }
    }

    private void rejectOnUiThread(PluginCall call, String message) {
        try {
            if (getActivity() != null) {
                getActivity().runOnUiThread(() -> call.reject(message));
                return;
            }
        } catch (Exception ignored) {
            // Fall through to a direct reject below.
        }
        call.reject(message);
    }
}
