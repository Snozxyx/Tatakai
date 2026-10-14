package app.tatakai.me.media;

import android.content.Intent;
import android.net.Uri;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import androidx.core.content.FileProvider;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import java.io.File;

@CapacitorPlugin(name = "TatakaiMedia")
public class TatakaiMediaPlugin extends Plugin {
    @PluginMethod public void networkStatus(PluginCall call) {
        ConnectivityManager manager = (ConnectivityManager) getContext().getSystemService(android.content.Context.CONNECTIVITY_SERVICE);
        NetworkCapabilities capabilities = manager.getNetworkCapabilities(manager.getActiveNetwork());
        JSObject response = new JSObject(); response.put("wifi", capabilities != null && capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI));
        call.resolve(response);
    }
    @PluginMethod public void openExternalPlayer(PluginCall call) {
        try {
            String value = call.getString("url", "");
            Uri uri = Uri.parse(value);
            if (uri.getScheme() == null || "file".equals(uri.getScheme())) {
                File file = new File(uri.getScheme() == null ? value : uri.getPath()).getCanonicalFile();
                String root = getContext().getFilesDir().getCanonicalPath() + File.separator;
                if (!file.getPath().startsWith(root)) { call.reject("File must be in app storage."); return; }
                uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            }
            if (!java.util.Arrays.asList("https", "http", "content").contains(uri.getScheme())) { call.reject("Unsupported media URL."); return; }
            Intent intent = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "video/*");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            intent.setClipData(android.content.ClipData.newRawUri("Tatakai video", uri));
            intent.putExtra("title", call.getString("title", "Tatakai"));
            intent.putExtra("position", (int)(call.getDouble("startTime", 0.0) * 1000));
            JSObject headers = call.getObject("headers", new JSObject());
            java.util.ArrayList<String> replay = new java.util.ArrayList<>();
            java.util.Iterator<String> names = headers.keys();
            while (names.hasNext()) { String name = names.next(); replay.add(name); replay.add(headers.optString(name)); }
            intent.putExtra("headers", replay.toArray(new String[0]));
            if (getContext().getPackageManager().queryIntentActivities(intent, 0).isEmpty()) { call.reject("Install a video player such as VLC or MPV first."); return; }
            getActivity().startActivity(Intent.createChooser(intent, "Open in player"));
            JSObject result = new JSObject(); result.put("success", true); result.put("progressSupported", false); call.resolve(result);
        } catch (Exception error) { call.reject("External player could not open this media."); }
    }
}
