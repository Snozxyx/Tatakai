package app.tatakai.me.extensions;

import org.junit.Test;
import static org.junit.Assert.*;

public final class ExtensionConfigurationUrlTest {
    @Test public void preservesConfiguredPathAndQueryWithoutDecodingTokens() {
        assertEquals("https://fixture.test/a%2Fb+/key==/manifest.json?token=x%2By%3D&mode=1",
            ExtensionConfigurationUrl.configuredManifest("StReMiO://fixture.test/a%2Fb+/key==/manifest.json?token=x%2By%3D&mode=1#discard"));
        assertEquals("http://127.0.0.1:1234/config/manifest.json?key=abc",
            ExtensionConfigurationUrl.configuredManifest("http://127.0.0.1:1234/config/manifest.json?key=abc"));
    }
    @Test public void rejectsCredentialsUnsupportedSchemesAndNonManifestLinks() {
        for (String value : new String[] { "stremio://user:pass@fixture.test/manifest.json", "https://user%40name@fixture.test/manifest.json",
            "javascript:alert(1)", "intent://fixture.test/manifest.json", "file:///manifest.json", "https://fixture.test/configure",
            "https:///manifest.json", "https://fixture.test/manifest.json\n", null }) {
            assertNull(value, ExtensionConfigurationUrl.configuredManifest(value));
        }
    }
    @Test public void permitsWebConfigurationPagesWithFragments() {
        assertTrue(ExtensionConfigurationUrl.isWebUrl("https://fixture.test/configure?language=id#settings"));
        assertFalse(ExtensionConfigurationUrl.isWebUrl("stremio://fixture.test/manifest.json"));
        assertFalse(ExtensionConfigurationUrl.isWebUrl("https://user:pass@fixture.test/configure"));
    }
}
