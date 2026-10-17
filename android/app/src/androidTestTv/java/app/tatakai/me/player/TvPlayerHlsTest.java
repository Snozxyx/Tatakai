package app.tatakai.me.player;

import android.app.Instrumentation;
import android.content.Intent;
import androidx.media3.common.Player;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import static org.junit.Assert.*;

/** Reproduces an HLS proxy endpoint whose path contains no .m3u8 extension. */
@RunWith(AndroidJUnit4.class)
public class TvPlayerHlsTest {
    @Test public void opaqueLoopbackPlaylistReachesReadyWithMimeHint() throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        instrumentation.sendKeyDownUpSync(android.view.KeyEvent.KEYCODE_WAKEUP);
        byte[] segment;
        try (InputStream asset = instrumentation.getContext().getAssets().open("player-test-segment.ts")) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream(); byte[] buffer = new byte[8192]; int count;
            while ((count = asset.read(buffer)) != -1) bytes.write(buffer, 0, count);
            segment = bytes.toByteArray();
        }
        ServerSocket server = new ServerSocket(0, 8, InetAddress.getByName("127.0.0.1"));
        String base = "http://127.0.0.1:" + server.getLocalPort();
        byte[] playlist = ("#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:4\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:4.0,\n" + base + "/segment.ts\n#EXT-X-ENDLIST\n").getBytes(StandardCharsets.UTF_8);
        Thread serving = new Thread(() -> {
            while (!server.isClosed()) {
                try (Socket client = server.accept()) {
                    BufferedReader input = new BufferedReader(new InputStreamReader(client.getInputStream(), StandardCharsets.US_ASCII));
                    String request = input.readLine(), line; while ((line = input.readLine()) != null && !line.isEmpty()) { }
                    boolean media = request != null && request.contains("/segment.ts"); byte[] body = media ? segment : playlist;
                    OutputStream output = client.getOutputStream();
                    output.write(("HTTP/1.1 200 OK\r\nContent-Type: " + (media ? "video/mp2t" : "application/x-mpegURL") + "\r\nContent-Length: " + body.length + "\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
                    output.write(body); output.flush();
                } catch (IOException ignored) { }
            }
        }, "tv-hls-test"); serving.start();
        TvPlayerActivity activity = null;
        try {
            Intent intent = new Intent(instrumentation.getTargetContext(), TvPlayerActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            intent.putExtra("url", base + "/stream/opaque-token"); intent.putExtra("mimeType", "application/x-mpegURL"); intent.putExtra("playWhenReady", false);
            activity = (TvPlayerActivity) instrumentation.startActivitySync(intent);
            TvPlayerActivity playing = activity; CountDownLatch ready = new CountDownLatch(1);
            instrumentation.runOnMainSync(() -> {
                if (playing.player.getPlaybackState() == Player.STATE_READY || playing.player.getPlayerError() != null) ready.countDown();
                playing.player.addListener(new Player.Listener() {
                    @Override public void onPlaybackStateChanged(int state) { if (state == Player.STATE_READY) ready.countDown(); }
                    @Override public void onPlayerError(androidx.media3.common.PlaybackException error) { ready.countDown(); }
                });
            });
            assertTrue("HLS stream must load", ready.await(20, TimeUnit.SECONDS));
            instrumentation.runOnMainSync(() -> {
                assertNull(playing.player.getPlayerError()); assertEquals(Player.STATE_READY, playing.player.getPlaybackState());
                assertTrue(playing.player.getDuration() >= 3000);
            });
        } finally {
            if (activity != null) { TvPlayerActivity closing = activity; instrumentation.runOnMainSync(closing::finish); }
            server.close(); serving.join(1000);
        }
    }
}
