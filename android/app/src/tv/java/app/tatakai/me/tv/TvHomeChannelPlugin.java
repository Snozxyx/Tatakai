package app.tatakai.me.tv;

import android.content.*;
import android.database.Cursor;
import android.net.Uri;
import androidx.tvprovider.media.tv.*;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.*;

@CapacitorPlugin(name = "TvHomeChannel")
public class TvHomeChannelPlugin extends Plugin {
    @PluginMethod public void publishSuggestions(PluginCall call) {
        try {
            JSArray input = call.getArray("items", new JSArray()); JSONArray items = new JSONArray();
            for (int i = 0; i < input.length() && i < 100; i++) {
                JSONObject item = input.getJSONObject(i);
                if (item.optString("uri").matches("tatakai://anime/[A-Za-z0-9:_-]+") && item.optString("title").length() <= 256) items.put(item);
            }
            getContext().getSharedPreferences("tv-public-search", 0).edit().putString("items", items.toString()).apply(); call.resolve();
        } catch (Exception error) { call.reject("Could not cache catalog suggestions."); }
    }
    @PluginMethod public void sync(PluginCall call) {
        try {
            ContentResolver resolver = getContext().getContentResolver();
            JSArray items = call.getArray("items", new JSArray());
            java.util.Set<String> retained = new java.util.HashSet<>();
            for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.getJSONObject(i); String id = item.getString("id"); retained.add(id);
                long existing = -1;
                try (Cursor cursor = resolver.query(TvContractCompat.WatchNextPrograms.CONTENT_URI, new String[]{"_id", "internal_provider_id", "browsable"}, null, null, null)) {
                    while (cursor != null && cursor.moveToNext()) if (id.equals(cursor.getString(1))) { existing = cursor.getLong(0); if (cursor.getInt(2) == 0) existing = -2; break; }
                }
                // Do not resurrect items the launcher/user dismissed.
                if (existing == -2) continue;
                WatchNextProgram program = new WatchNextProgram.Builder().setInternalProviderId(id)
                    .setType(TvContractCompat.PreviewPrograms.TYPE_TV_EPISODE)
                    .setWatchNextType(TvContractCompat.WatchNextPrograms.WATCH_NEXT_TYPE_CONTINUE)
                    .setTitle(item.getString("title")).setIntentUri(Uri.parse(item.getString("uri")))
                    .setPosterArtUri(Uri.parse(item.optString("poster", "")))
                    .setLastPlaybackPositionMillis(item.optInt("positionMs"))
                    .setDurationMillis(item.optInt("durationMs"))
                    .setLastEngagementTimeUtcMillis(item.optLong("updatedAt", System.currentTimeMillis())).build();
                if (existing >= 0) resolver.update(TvContractCompat.buildWatchNextProgramUri(existing), program.toContentValues(), null, null);
                else resolver.insert(TvContractCompat.WatchNextPrograms.CONTENT_URI, program.toContentValues());
            }
            try (Cursor cursor = resolver.query(TvContractCompat.WatchNextPrograms.CONTENT_URI, new String[]{"_id", "internal_provider_id"}, null, null, null)) {
                while (cursor != null && cursor.moveToNext()) if (!retained.contains(cursor.getString(1))) resolver.delete(TvContractCompat.buildWatchNextProgramUri(cursor.getLong(0)), null, null);
            }
            call.resolve();
        } catch (Exception error) { call.reject("This launcher does not support Watch Next."); }
    }
    @PluginMethod public void syncLive(PluginCall call) {
        try {
            ContentResolver resolver = getContext().getContentResolver();
            long channelId = -1;
            try (Cursor cursor = resolver.query(TvContractCompat.Channels.CONTENT_URI, new String[]{"_id", "internal_provider_id"}, null, null, null)) {
                while (cursor != null && cursor.moveToNext()) if ("tatakai-live".equals(cursor.getString(1))) channelId = cursor.getLong(0);
            }
            JSArray items = call.getArray("items", new JSArray());
            if (items.length() == 0) { if (channelId >= 0) resolver.delete(TvContractCompat.buildChannelUri(channelId), null, null); call.resolve(); return; }
            if (channelId < 0) {
                Channel channel = new Channel.Builder().setType(TvContractCompat.Channels.TYPE_PREVIEW).setDisplayName("Tatakai Live")
                    .setInternalProviderId("tatakai-live").setAppLinkIntentUri(Uri.parse("tatakai://tv/iptv")).build();
                Uri uri = resolver.insert(TvContractCompat.Channels.CONTENT_URI, channel.toContentValues()); channelId = ContentUris.parseId(uri);
                TvContractCompat.requestChannelBrowsable(getContext(), channelId);
            }
            resolver.delete(TvContractCompat.PreviewPrograms.CONTENT_URI, "channel_id = ?", new String[]{String.valueOf(channelId)});
            for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.getJSONObject(i);
                PreviewProgram program = new PreviewProgram.Builder().setChannelId(channelId).setInternalProviderId(item.getString("id"))
                    .setType(TvContractCompat.PreviewPrograms.TYPE_CHANNEL).setTitle(item.getString("title"))
                    .setIntentUri(Uri.parse(item.getString("uri"))).setPosterArtUri(Uri.parse(item.optString("poster", ""))).build();
                resolver.insert(TvContractCompat.PreviewPrograms.CONTENT_URI, program.toContentValues());
            }
            call.resolve();
        } catch (Exception error) { call.reject("This launcher does not support preview channels."); }
    }
}
