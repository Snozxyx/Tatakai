package app.tatakai.me.download;

import org.junit.Test;
import static org.junit.Assert.*;

public class HlsOfflinePlanTest {
    private static final String BASE = "https://cdn.example/anime/episode.m3u8?token=test";
    @Test public void preservesEncryptedFragmentedVodAndRanges() {
        String input = "#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-MEDIA-SEQUENCE:42\n"
            + "#EXT-X-KEY:METHOD=AES-128,URI=\"../key\",IV=0x0000000000000000000000000000002a\n"
            + "#EXT-X-MAP:URI=\"init.mp4\",BYTERANGE=\"100@0\"\n"
            + "#EXTINF:6,\n#EXT-X-BYTERANGE:200@100\nmedia.mp4\n"
            + "#EXT-X-DISCONTINUITY\n#EXTINF:6,\n#EXT-X-BYTERANGE:200\nmedia.mp4\n#EXT-X-ENDLIST\n";
        HlsOfflinePlan plan = HlsOfflinePlan.parse(input, BASE);
        assertEquals(3, plan.resources.size());
        assertEquals("https://cdn.example/key", plan.resources.get(0).url);
        assertTrue(plan.playlist.contains("IV=0x0000000000000000000000000000002a"));
        assertTrue(plan.playlist.contains("#EXT-X-MEDIA-SEQUENCE:42"));
        assertTrue(plan.playlist.contains("BYTERANGE=\"100@0\""));
        assertTrue(plan.playlist.contains("#EXT-X-BYTERANGE:200\n"));
        assertTrue(plan.playlist.contains("#EXT-X-DISCONTINUITY"));
        assertFalse(plan.playlist.contains("https://"));
    }
    @Test public void selectsOneVariantAndDefaultAudioWithoutDownloadingOtherLanguages() {
        String master = "#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID=\"audio\",NAME=\"English\",DEFAULT=NO,URI=\"en/index.m3u8\"\n"
            + "#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID=\"audio\",NAME=\"Japanese\",DEFAULT=YES,URI=\"ja/index.m3u8\"\n"
            + "#EXT-X-STREAM-INF:BANDWIDTH=100000,AUDIO=\"audio\"\nlow/index.m3u8\n"
            + "#EXT-X-STREAM-INF:BANDWIDTH=1000000,AUDIO=\"audio\"\nhigh/index.m3u8\n";
        HlsOfflinePlan plan = HlsOfflinePlan.parse(master, BASE);
        assertEquals(2, plan.resources.size());
        assertTrue(plan.resources.stream().anyMatch(r -> r.url.endsWith("ja/index.m3u8")));
        assertTrue(plan.resources.stream().anyMatch(r -> r.url.endsWith("high/index.m3u8")));
        assertFalse(plan.playlist.contains("English"));
    }
    @Test public void doesNotTruncateLongEpisodes() {
        StringBuilder vod = new StringBuilder("#EXTM3U\n");
        for (int i = 0; i < 1400; i++) vod.append("#EXTINF:2,\nsegment-").append(i).append(".ts\n");
        vod.append("#EXT-X-ENDLIST\n");
        assertEquals(1400, HlsOfflinePlan.parse(vod.toString(), BASE).resources.size());
    }
    @Test public void rejectsLiveAndProtectedStreams() {
        assertThrows(IllegalArgumentException.class, () -> HlsOfflinePlan.parse("#EXTM3U\n#EXTINF:6,\na.ts\n", BASE));
        assertThrows(IllegalArgumentException.class, () -> HlsOfflinePlan.parse("#EXTM3U\n#EXT-X-KEY:METHOD=SAMPLE-AES,URI=\"drm\"\n#EXTINF:6,\na.ts\n#EXT-X-ENDLIST", BASE));
        assertThrows(IllegalArgumentException.class, () -> HlsOfflinePlan.parse("#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,KEYFORMAT=\"com.apple.streamingkeydelivery\",URI=\"key\"\n#EXTINF:6,\na.ts\n#EXT-X-ENDLIST", BASE));
    }
    @Test public void rejectsErrorPagesAndUnsupportedResources() {
        assertThrows(IllegalArgumentException.class, () -> HlsOfflinePlan.parse("<html>Expired</html>", BASE));
        assertThrows(IllegalArgumentException.class, () -> HlsOfflinePlan.parse("#EXTM3U\n#EXTINF:2,\nfile:///private/key\n#EXT-X-ENDLIST", BASE));
    }
    @Test public void acceptsBomPrefixedVodManifest() {
        HlsOfflinePlan plan = HlsOfflinePlan.parse("\uFEFF#EXTM3U\n#EXTINF:6,\nsegment.ts\n#EXT-X-ENDLIST", BASE);
        assertEquals(1, plan.resources.size());
        assertTrue(plan.playlist.startsWith("#EXTM3U"));
    }
}
