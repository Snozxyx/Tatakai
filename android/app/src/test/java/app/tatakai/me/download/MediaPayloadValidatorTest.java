package app.tatakai.me.download;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import org.junit.Test;
import static org.junit.Assert.*;
public final class MediaPayloadValidatorTest {
    @Test public void detectsExtensionlessOfflineContainers() {
        byte[] mp4 = new byte[]{0, 0, 0, 24, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm'};
        assertEquals("video/mp4", MediaPayloadValidator.contentType(mp4, mp4.length));
        byte[] webm = new byte[]{0x1a, 0x45, (byte) 0xdf, (byte) 0xa3, 'w', 'e', 'b', 'm'};
        assertEquals("video/webm", MediaPayloadValidator.contentType(webm, webm.length));
        assertEquals("application/octet-stream", MediaPayloadValidator.contentType(new byte[0], 0));
    }
    private void validate(String text, String mime) throws IOException {
        byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
        MediaPayloadValidator.validate(bytes, bytes.length, mime);
    }
    @Test public void acceptsPlaylistAndSubtitlesWithIncorrectMimeLabels() throws Exception {
        validate("\uFEFF#EXTM3U\n#EXTINF:10\nsegment.ts", "text/html");
        validate("WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nHello", "application/json");
        validate("[Script Info]\nTitle: Anime", "text/html");
    }
    @Test public void acceptsTransportStreamBytesEvenWhenLabeledHtml() throws Exception {
        byte[] bytes = new byte[512]; bytes[0] = 0x47; bytes[188] = 0x47; bytes[376] = 0x47;
        MediaPayloadValidator.validate(bytes, bytes.length, "text/html");
    }
    @Test public void rejectsActualHtmlEvenWithVideoMime() throws Exception {
        try { validate("<!DOCTYPE html><html>Access denied</html>", "video/mp2t"); fail("accepted error page"); }
        catch (IOException expected) { assertTrue(expected.getMessage().contains("error page")); }
    }
    @Test public void rejectsJsonErrorResponse() throws Exception {
        try { validate("{\"error\":\"expired\"}", "application/json"); fail("accepted error response"); }
        catch (IOException expected) { assertTrue(expected.getMessage().contains("error page")); }
    }
    @Test public void rejectsHtmlFragmentsAndTextDenials() throws Exception {
        for (String body : new String[]{"<div>Blocked</div>", "Access denied"}) {
            try { validate(body, "text/html"); fail("accepted error response"); }
            catch (IOException expected) { assertTrue(expected.getMessage().contains("error page")); }
        }
    }
}
