package app.tatakai.me.compatibility;

import android.content.Context;
import android.content.ContextWrapper;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import static org.junit.Assert.*;
import static org.junit.Assume.assumeTrue;

/** Opt-in original APK/device proof; never runs against normal app storage. */
public class AniyomiCompatibilityTest {
    @Test public void originalPrivateApkLoadsOnDevice() throws Exception {
        assumeTrue("true".equals(InstrumentationRegistry.getArguments().getString("nativeAniyomiLive")) || "true".equals(InstrumentationRegistry.getArguments().getString("nativeCompatibilityLive")));
        Context target = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File isolated = new File(target.getCacheDir(), "aniyomi-live-" + UUID.randomUUID()); assertTrue(isolated.mkdirs());
        Context context = new ContextWrapper(target) { @Override public File getFilesDir() { return isolated; } };
        AniyomiAndroidEngine engine = new AniyomiAndroidEngine(context);
        JSONObject evidence = new JSONObject().put("ecosystem", "aniyomi").put("platform", "android").put("sdk", android.os.Build.VERSION.SDK_INT).put("demonstrated", false).put("checks", new JSONArray());
        try (InputStream input = target.getAssets().open("aniyomi-runtime.json"); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] block = new byte[4096]; int size; while ((size = input.read(block)) >= 0) { assertTrue(out.size() + size < 32768); out.write(block, 0, size); }
            JSONObject runtime = new JSONObject(out.toString("UTF-8")); evidence.put("runtime", runtime.getJSONObject("android")).put("runtimeSourceCommit", runtime.getString("commit"));
        }
        JSONArray checks = evidence.getJSONArray("checks");
        java.net.CookieHandler originalCookies = java.net.CookieHandler.getDefault();
        try {
            assertEquals(0, engine.status().getLong("downloadBytes"));
            engine.request(new JSONObject().put("op", "prepare")); checks.put("Pinned original Android runtime preparation from verified installation assets");
            String repository = "https://raw.githubusercontent.com/yuzono/anime-repo/8c497bde62b8b3b2f3b99dcde5cf4e1c971336da/index.min.json";
            engine.request(new JSONObject().put("op", "addRepository").put("url", repository)); checks.put("Original JSON repository discovery");
            JSONArray packages = (JSONArray)engine.request(new JSONObject().put("op", "packages")); JSONObject selected = null;
            for (int i = 0; i < packages.length(); i++) if (packages.getJSONObject(i).getString("name").equals("Jellyfin")) selected = packages.getJSONObject(i);
            assertNotNull(selected); String id = selected.getString("id"); engine.request(new JSONObject().put("op", "install").put("packageId", id)); checks.put("Original signed Jellyfin APK and factory loading");
            assertSame(originalCookies, java.net.CookieHandler.getDefault());
            JSONArray sources = (JSONArray)engine.request(new JSONObject().put("op", "sources")); assertEquals(3, sources.length());
            JSONObject source = sources.getJSONObject(0); assertFalse(source.getBoolean("enabled")); assertTrue(source.get("upstreamId") instanceof String);
            engine.setEnabled(new JSONObject().put("sourceId", source.getString("id")).put("enabled", true));
            JSONArray preferences = (JSONArray)engine.request(new JSONObject().put("op", "preferences").put("sourceId", source.getString("id"))); assertTrue(preferences.length() > 0); checks.put("Original source preferences");
            engine.setEnabled(new JSONObject().put("sourceId", source.getString("id")).put("enabled", false));
            engine.request(new JSONObject().put("op", "remove").put("packageId", id)); assertEquals(0, ((JSONArray)engine.request(new JSONObject().put("op", "installedPackages"))).length()); checks.put("Disable and installed inventory removal");
            evidence.put("sourceId", source.getString("id")).put("upstreamId", source.getString("upstreamId")).put("preferences", preferences.length()).put("repository", repository).put("jellyfinDemonstrated", true);
            String mangaRepository = "https://raw.githubusercontent.com/keiyoushi/extensions/b00de1d361ab08eb38567ecacfd267c154130592/index.pb";
            engine.request(new JSONObject().put("op", "addRepository").put("url", mangaRepository));
            JSONArray mangaPackages = (JSONArray)engine.request(new JSONObject().put("op", "packages")); JSONObject manga = null;
            for (int i = 0; i < mangaPackages.length(); i++) if (mangaPackages.getJSONObject(i).getString("name").equals("MangaDex")) manga = mangaPackages.getJSONObject(i);
            assertNotNull(manga); engine.request(new JSONObject().put("op", "install").put("packageId", manga.getString("id")));
            assertSame(originalCookies, java.net.CookieHandler.getDefault()); checks.put("Original source cookie jars do not replace the host's global cookie handler");
            JSONArray mangaSources = (JSONArray)engine.request(new JSONObject().put("op", "sources")); JSONObject english = null;
            for (int i = 0; i < mangaSources.length(); i++) if (mangaSources.getJSONObject(i).getString("lang").equals("en")) english = mangaSources.getJSONObject(i);
            assertNotNull(english); engine.setEnabled(new JSONObject().put("sourceId", english.getString("id")).put("enabled", true)); String sourceId = english.getString("id");
            JSONObject found = (JSONObject)engine.request(new JSONObject().put("op", "search").put("sourceId", sourceId).put("query", "Give My Regards to Black Jack").put("page", 1)); assertTrue(found.getJSONArray("results").length() > 0);
            JSONObject title = (JSONObject)engine.request(new JSONObject().put("op", "info").put("sourceId", sourceId).put("id", found.getJSONArray("results").getJSONObject(0).getString("id"))); assertTrue(title.getJSONArray("entries").length() > 0);
            JSONObject pages = (JSONObject)engine.request(new JSONObject().put("op", "pages").put("sourceId", sourceId).put("chapterId", title.getJSONArray("entries").getJSONObject(0).getString("id"))); assertTrue(pages.getJSONArray("pages").length() > 0);
            java.net.URLConnection image = new java.net.URL(pages.getJSONArray("pages").getJSONObject(0).getString("imageUrl")).openConnection(); image.setConnectTimeout(15000); image.setReadTimeout(30000);
            try (InputStream bytes = image.getInputStream()) { assertTrue(bytes.read() >= 0); }
            checks.put("Original signed protobuf MangaDex APK search/details/chapters/pages and original-client image bytes");
            evidence.put("mangaSources", mangaSources.length()).put("mangaChapters", title.getJSONArray("entries").length()).put("mangaPages", pages.getJSONArray("pages").length());
            engine.setEnabled(new JSONObject().put("sourceId", sourceId).put("enabled", false)); engine.request(new JSONObject().put("op", "remove").put("packageId", manga.getString("id")));
            evidence.put("demonstrated", true);
        } finally {
            engine.stop();
            try (FileOutputStream out = new FileOutputStream(new File(target.getCacheDir(), "compatibility-device-evidence.json"))) { out.write(evidence.toString(2).getBytes(StandardCharsets.UTF_8)); }
            try (FileOutputStream out = new FileOutputStream(new File(target.getCacheDir(), "compatibility-aniyomi-evidence.json"))) { out.write(evidence.toString(2).getBytes(StandardCharsets.UTF_8)); }
        }
    }
}
