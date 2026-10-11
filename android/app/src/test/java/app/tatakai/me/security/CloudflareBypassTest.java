package app.tatakai.me.security;

import org.junit.Test;
import static org.junit.Assert.*;

public class CloudflareBypassTest {
    @Test public void domainMatchingDoesNotAcceptLookalikeHosts() {
        assertTrue(CloudflareBypass.appliesTo("ANIMEPAHE.COM"));
        assertTrue(CloudflareBypass.appliesTo("cdn.animepahe.com"));
        assertFalse(CloudflareBypass.appliesTo("animepahe.com.attacker.test"));
        assertFalse(CloudflareBypass.appliesTo("notanimepahe.com"));
        assertFalse(CloudflareBypass.appliesTo(null));
    }
    @Test public void ordinaryHttpErrorsAreNotChallenges() {
        assertFalse(CloudflareBypass.isChallengeResponse(403, "Access denied"));
        assertFalse(CloudflareBypass.isChallengeResponse(503, "Origin unavailable"));
        assertFalse(CloudflareBypass.isChallengeResponse(200, "challenge-platform"));
        assertFalse(CloudflareBypass.isChallengeResponse(404, "cf_chl_"));
        assertTrue(CloudflareBypass.isChallengeResponse(403, "<script src='/cdn-cgi/challenge-platform/'></script>"));
        assertTrue(CloudflareBypass.isChallengeResponse(503, "CF_CHL_ retry"));
        assertTrue(CloudflareBypass.isChallengeResponse(429, "turnstile"));
    }
}
