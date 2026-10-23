package app.tatakai.me.compatibility;

import android.content.Context;
import android.content.ContextWrapper;
import android.os.Bundle;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import java.io.*;
import java.util.UUID;
import static org.junit.Assert.*;

public class CompatibilityRepliesTest {
    @Test public void largeRepliesAreOneUseAndRejectArbitraryPaths() throws Exception {
        Context app = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File cache = new File(app.getCacheDir(), "reply-test-" + UUID.randomUUID()); assertTrue(cache.mkdirs());
        Context isolated = new ContextWrapper(app) { @Override public File getCacheDir() { return cache; } };
        String original = "{\"ok\":true,\"result\":\"" + "雨".repeat(500000) + "\"}";
        Bundle reply = CompatibilityReplies.encode(isolated, "large", original);
        assertTrue(reply.containsKey("resultFile")); assertFalse(reply.containsKey("result"));
        assertEquals(original, CompatibilityReplies.decode(isolated, reply));
        assertFalse(new File(new File(cache, "compatibility-replies"), reply.getString("resultFile")).exists());
        try { CompatibilityReplies.decode(isolated, reply); fail("Reply capability was reusable"); } catch (IOException expected) { }
        Bundle traversal = new Bundle(); traversal.putString("resultFile", "../private.json");
        try { CompatibilityReplies.decode(isolated, traversal); fail("Arbitrary path accepted"); } catch (IOException expected) { }
        File oversized = new File(new File(cache, "compatibility-replies"), UUID.randomUUID() + ".json");
        try (RandomAccessFile out = new RandomAccessFile(oversized, "rw")) { out.setLength(CompatibilityReplies.MAX_BYTES + 1L); }
        Bundle tooLarge = new Bundle(); tooLarge.putString("resultFile", oversized.getName());
        try { CompatibilityReplies.decode(isolated, tooLarge); fail("Oversized reply accepted"); } catch (IOException expected) { }
        assertFalse(oversized.exists());
    }
}
