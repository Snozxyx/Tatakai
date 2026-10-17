package app.tatakai.me.tv;
import android.app.SearchManager;
import android.content.*;
import android.database.*;
import android.net.Uri;
import android.provider.BaseColumns;
import org.json.*;
import java.util.Locale;

/** Launcher-visible suggestions contain only public catalog titles and safe deep links. */
public class TvSearchProvider extends ContentProvider {
    @Override public boolean onCreate() { return true; }
    @Override public Cursor query(Uri uri, String[] projection, String selection, String[] args, String sort) {
        MatrixCursor cursor = new MatrixCursor(new String[]{BaseColumns._ID, SearchManager.SUGGEST_COLUMN_TEXT_1, SearchManager.SUGGEST_COLUMN_INTENT_DATA, SearchManager.SUGGEST_COLUMN_INTENT_ACTION});
        if (getContext() == null) return cursor;
        String query = args != null && args.length > 0 ? args[0] : uri.getLastPathSegment();
        query = query == null || SearchManager.SUGGEST_URI_PATH_QUERY.equals(query) ? "" : query.toLowerCase(Locale.ROOT);
        try {
            JSONArray items = new JSONArray(getContext().getSharedPreferences("tv-public-search", 0).getString("items", "[]"));
            for (int i = 0; i < items.length() && cursor.getCount() < 20; i++) {
                JSONObject item = items.getJSONObject(i); String title = item.optString("title"), link = item.optString("uri");
                if (title.toLowerCase(Locale.ROOT).contains(query) && link.matches("tatakai://anime/[A-Za-z0-9:_-]+")) cursor.addRow(new Object[]{i, title, link, Intent.ACTION_VIEW});
            }
        } catch (Exception ignored) { }
        return cursor;
    }
    @Override public String getType(Uri uri) { return SearchManager.SUGGEST_MIME_TYPE; }
    @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException(); }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] args) { throw new UnsupportedOperationException(); }
    @Override public int delete(Uri uri, String selection, String[] args) { throw new UnsupportedOperationException(); }
}
