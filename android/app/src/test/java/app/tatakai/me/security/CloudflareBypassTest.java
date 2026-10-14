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
        assertTrue(CloudflareBypass.isChallengeResponse(200, "challenge-platform"));
        assertFalse(CloudflareBypass.isChallengeResponse(200, "Login form with turnstile and cf_clearance cookie check"));
        assertFalse(CloudflareBypass.isChallengeResponse(404, "cf_chl_"));
        assertTrue(CloudflareBypass.isChallengeResponse(403, "<script src='/cdn-cgi/challenge-platform/'></script>"));
        assertTrue(CloudflareBypass.isChallengeResponse(503, "CF_CHL_ retry"));
        assertTrue(CloudflareBypass.isChallengeResponse(429, "turnstile"));
    }
    @Test public void novelAndMixedSourceDomainsCanReuseClearance() {
        assertTrue(CloudflareBypass.appliesTo("www.webnovel.com"));
        assertTrue(CloudflareBypass.appliesTo("novelfull.com"));
        assertTrue(CloudflareBypass.appliesTo("api.novelbuddy.me"));
        assertTrue(CloudflareBypass.appliesTo("www.novelcool.com"));
        assertTrue(CloudflareBypass.appliesTo("onisaga.com"));
        assertFalse(CloudflareBypass.appliesTo("webnovel.com.attacker.test"));
    }
}
