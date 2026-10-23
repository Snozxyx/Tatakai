package app.tatakai.me.compatibility;

import android.content.Context;
import android.content.ContextWrapper;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.json.*;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.*;
import java.nio.charset.StandardCharsets;
import static org.junit.Assert.*;
import static org.junit.Assume.assumeTrue;

/** Opt-in original-APK device check. Uses its own cache directory, never the user's library. */
@RunWith(AndroidJUnit4.class)
public class NativeCompatibilityTest {
    @Test public void originalMihonLifecycle() throws Exception {
        assumeTrue("true".equals(InstrumentationRegistry.getArguments().getString("nativeCompatibilityLive")));
        Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File root = new File(app.getCacheDir(), "compatibility-live-" + System.currentTimeMillis());
        assertTrue(root.mkdirs());
        Context isolated = new ContextWrapper(app) { @Override public File getFilesDir() { return root; } };
        MihonEngine engine = new MihonEngine(isolated);
        JSONArray checks = new JSONArray();
        String repositoryUrl = InstrumentationRegistry.getArguments().getString("repositoryUrl", "https://raw.githubusercontent.com/keiyoushi/extensions/c886cdfc0c1d1bbb997f652396347c64f044729a/index.pb");
        JSONObject fixture = new JSONObject().put("repositoryUrl", repositoryUrl);
        try {
            engine.request(new JSONObject().put("op", "addRepository").put("url", repositoryUrl));
            JSONArray packages = (JSONArray)engine.request(new JSONObject().put("op", "packages"));
            // Exercise the production Binder transport with the complete real catalog,
            // rather than testing only direct engine calls with one selected package.
            String catalogReply = new JSONObject().put("ok", true).put("result", packages).toString();
            android.os.Bundle envelope = CompatibilityReplies.encode(isolated, "catalog-fixture", catalogReply);
            android.os.Parcel parcel = android.os.Parcel.obtain();
            try { parcel.writeBundle(envelope); assertTrue(parcel.dataSize() < 200000); } finally { parcel.recycle(); }
            assertEquals(catalogReply, CompatibilityReplies.decode(isolated, envelope));
            fixture.put("catalogPackages", packages.length()).put("catalogReplyCharacters", catalogReply.length()).put("catalogUsedPrivateReply", envelope.containsKey("resultFile"));
            checks.put("Complete original repository catalog crosses bounded production reply transport");
            JSONObject pkg = null;
            for (int i = 0; i < packages.length(); i++) if (packages.getJSONObject(i).getString("id").equals("eu.kanade.tachiyomi.extension.all.mangaplus")) pkg = packages.getJSONObject(i);
            assertNotNull(pkg);
            fixture.put("package", new JSONObject(pkg.toString()));
            String packageId = pkg.getString("id");
            engine.request(new JSONObject().put("op", "install").put("packageId", packageId));
            JSONArray inventory = (JSONArray)engine.request(new JSONObject().put("op", "installedPackages"));
            assertEquals(1, inventory.length()); assertEquals(packageId, inventory.getJSONObject(0).getString("id"));
            JSONArray sources = (JSONArray)engine.request(new JSONObject().put("op", "sources"));
            JSONObject source = null;
            for (int i = 0; i < sources.length(); i++) if (sources.getJSONObject(i).getString("lang").equals("en")) source = sources.getJSONObject(i);
            assertNotNull(source); assertFalse(source.getBoolean("enabled"));
            String id = source.getString("id");
            engine.setEnabled(new JSONObject().put("sourceId", id).put("enabled", true));
            checks.put("Original APK signer verified, loaded and sources enumerated; initially disabled");
            JSONArray prefs = (JSONArray)engine.request(new JSONObject().put("op", "preferences").put("sourceId", id));
            assertTrue(prefs.length() > 0);
            for (int i = 0; i < prefs.length(); i++) {
                JSONObject pref = prefs.getJSONObject(i);
                if (!pref.getString("kind").equals("boolean") || !pref.getBoolean("enabled") || !pref.getBoolean("visible")) continue;
                boolean before = pref.getBoolean("value");
                try {
                    JSONArray changed = (JSONArray)engine.request(new JSONObject().put("op", "setPreference").put("sourceId", id).put("position", i).put("value", !before));
                    assertEquals(!before, changed.getJSONObject(i).getBoolean("value"));
                } finally { engine.request(new JSONObject().put("op", "setPreference").put("sourceId", id).put("position", i).put("value", before)); }
                checks.put("Original preference callback changed and restored"); break;
            }
            JSONObject search = (JSONObject)engine.request(new JSONObject().put("op", "search").put("sourceId", id).put("query", "Naruto"));
            assertTrue(search.getJSONArray("results").length() > 0);
            JSONObject info = (JSONObject)engine.request(new JSONObject().put("op", "info").put("sourceId", id).put("id", search.getJSONArray("results").getJSONObject(0).getString("id")));
            assertTrue(info.getJSONArray("entries").length() > 0);
            JSONObject pages = (JSONObject)engine.request(new JSONObject().put("op", "pages").put("sourceId", id).put("chapterId", info.getJSONArray("entries").getJSONObject(0).getString("id")));
            assertTrue(pages.getJSONArray("pages").length() > 0);
            try (InputStream image = new java.net.URL(pages.getJSONArray("pages").getJSONObject(0).getString("imageUrl")).openStream()) { assertTrue(image.read() >= 0); }
            checks.put("Original APK search, title, chapters, pages and original-client image bytes");
            engine.stop(); engine = new MihonEngine(isolated);
            assertEquals(1, ((JSONArray)engine.request(new JSONObject().put("op", "installedPackages"))).length());
            JSONArray restored = (JSONArray)engine.request(new JSONObject().put("op", "sources"));
            boolean persisted = false;
            for (int i = 0; i < restored.length(); i++) if (id.equals(restored.getJSONObject(i).getString("id"))) persisted = restored.getJSONObject(i).getBoolean("enabled");
            assertTrue(persisted); checks.put("Package and enable state restored in a new engine");
            engine.setEnabled(new JSONObject().put("sourceId", id).put("enabled", false));
            try { engine.request(new JSONObject().put("op", "search").put("sourceId", id).put("query", "Naruto")); fail("Disabled source executed"); } catch (IllegalArgumentException expected) { }
            engine.request(new JSONObject().put("op", "remove").put("packageId", packageId));
            assertEquals(0, ((JSONArray)engine.request(new JSONObject().put("op", "installedPackages"))).length());
            assertEquals(0, ((JSONArray)engine.request(new JSONObject().put("op", "sources"))).length());
            checks.put("Disable and package removal revoke source dispatch");
        } finally {
            engine.stop();
            JSONObject evidence = new JSONObject().put("sdk", android.os.Build.VERSION.SDK_INT).put("model", android.os.Build.MODEL).put("fixture", fixture).put("checks", checks);
            try (FileOutputStream out = new FileOutputStream(new File(app.getCacheDir(), "compatibility-device-evidence.json"))) { out.write(evidence.toString(2).getBytes(StandardCharsets.UTF_8)); }
            try (FileOutputStream out = new FileOutputStream(new File(app.getCacheDir(), "compatibility-mihon-evidence.json"))) { out.write(evidence.toString(2).getBytes(StandardCharsets.UTF_8)); }
        }
    }
}
