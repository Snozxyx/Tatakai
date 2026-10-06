package app.tatakai.me.security;

import android.net.Uri;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * AdHosts — host-suffix blocklists for the mobile WebView anti-click-hijack,
 * ported verbatim from the desktop reference `desktop/security/ad-blocker.cjs`.
 *
 * The desktop app stops popunders / click-hijacks in the Electron main process
 * (`session.webRequest.onBeforeRequest` + a `window.open` guard). Capacitor has
 * no main process, so the mobile equivalent lives in the Android WebView clients
 * (see {@link AntiHijackWebViewClient} / {@link AntiHijackWebChromeClient}). This
 * class holds the same two tiers of host suffixes so the two platforms block the
 * same networks.
 *
 * Matching is suffix-based against the lower-cased, `www.`-stripped hostname, so
 * `x.y.popads.net` matches `popads.net` — identical to `matchesSuffix` on desktop.
 */
public final class AdHosts {

    private AdHosts() {}

    /**
     * Ad / popunder / malvertising networks + mainstream ad exchanges. These are
     * NEVER a legitimate first-party request, so they are blocked unconditionally
     * (desktop's `BLOCKED_HOST_SUFFIXES`).
     */
    private static final Set<String> BLOCKED = new HashSet<>(Arrays.asList(
        // Popunder / malvertising networks common on streaming embeds
        "popads.net", "popcash.net", "popmyads.com", "poptm.com",
        "propellerads.com", "propu.sh", "propellerclick.com",
        "onclickads.net", "onclckds.com", "onclickalgo.com", "onclasrv.com",
        "adcash.com", "adcashrevenue.com",
        "hilltopads.net", "hilltopads.com",
        "exoclick.com", "exosrv.com", "exdynsrv.com", "realsrv.com",
        "juicyads.com", "juicyads.rocks",
        "trafficjunky.com", "trafficjunky.net",
        "clickadu.com", "clickaine.com",
        "adsterra.com", "terraclicks.com", "bebi.com",
        "admaven.com", "ad-maven.com", "admaven.net",
        "zeropark.com", "voluum.com",
        "mgid.com", "adskeeper.co.uk", "adskeeper.com",
        "revcontent.com", "contentabc.com",
        "popunder.net", "poweredby.jads.co", "jads.co",
        "a-ads.com", "adservme.com", "adsupply.com",
        "galaksion.com", "kissmyads.com", "monetag.com",
        "vidoomy.com", "sekindo.com",

        // Mainstream ad exchanges / video ad servers
        "doubleclick.net", "googlesyndication.com", "googleadservices.com",
        "googletagservices.com", "imasdk.googleapis.com",
        "adnxs.com", "adsrvr.org", "adform.net", "adroll.com",
        "criteo.com", "criteo.net",
        "pubmatic.com", "rubiconproject.com", "openx.net", "casalemedia.com",
        "smartadserver.com", "sharethrough.com", "3lift.com", "bidswitch.net",
        "teads.tv", "indexww.com", "yieldmo.com", "moatads.com",
        "spotxchange.com", "spotx.tv", "stickyadstv.com", "springserve.com",
        "aniview.com", "taboola.com", "outbrain.com"
    ));

    /**
     * Analytics / fingerprinting beacons. Blocked ONLY when the request did not
     * originate from the app's own document (desktop's
     * `THIRD_PARTY_ANALYTICS_SUFFIXES`), because the app loads GA/GTM itself for
     * first-party telemetry — blocking these outright would cancel our own
     * analytics.
     */
    private static final Set<String> ANALYTICS = new HashSet<>(Arrays.asList(
        "google-analytics.com", "googletagmanager.com",
        "scorecardresearch.com", "quantserve.com", "quantcount.com",
        "histats.com", "statcounter.com", "hotjar.com", "hotjar.io",
        "mixpanel.com", "segment.io", "segment.com",
        "mc.yandex.ru",
        "luckyorange.com", "clarity.ms"
    ));

    /** Origins that count as the app's own document (desktop's FIRST_PARTY_SUFFIXES). */
    private static final Set<String> FIRST_PARTY = new HashSet<>(Arrays.asList(
        "tatakai.app", "tatakai.to", "tatakai.me"
    ));

    /**
     * Hosts the app's own UI legitimately opens externally (desktop's
     * {@code TRUSTED_EXTERNAL_SUFFIXES}). While an untrusted embed is on
     * screen, any top-frame navigation to a host outside this set (+ first
     * party + loopback + LAN) is treated as a click-hijack and swallowed —
     * desktop {@code evaluateWindowOpen} embed-popunder parity.
     */
    private static final Set<String> TRUSTED_EXTERNAL = new HashSet<>(Arrays.asList(
        "github.com", "githubusercontent.com",
        "anilist.co", "myanimelist.net", "kitsu.io", "simkl.com",
        "mangadex.org", "annas-archive.org",
        "discord.com", "discord.gg", "dsc.gg", "discordapp.com",
        "twitter.com", "x.com", "facebook.com", "reddit.com",
        "tatakai.app", "tatakai.to", "tatakai.me",
        "localhost", "127.0.0.1"
    ));

    /** Lower-cased, `www.`-stripped hostname, or "" when unparseable. */
    public static String hostnameOf(String url) {
        if (url == null || url.isEmpty()) return "";
        try {
            String host = Uri.parse(url).getHost();
            if (host == null) return "";
            host = host.toLowerCase(Locale.ROOT);
            return host.startsWith("www.") ? host.substring(4) : host;
        } catch (Exception e) {
            return "";
        }
    }

    private static boolean matchesSuffix(String host, Set<String> suffixes) {
        if (host == null || host.isEmpty()) return false;
        if (suffixes.contains(host)) return true;
        for (String suffix : suffixes) {
            if (host.endsWith("." + suffix)) return true;
        }
        return false;
    }

    /** True when the host is served by the app itself (loopback or first-party). */
    public static boolean isFirstPartyHost(String host) {
        if (host == null || host.isEmpty()) return false;
        if (host.equals("localhost") || host.equals("127.0.0.1") || host.equals("::1")) return true;
        return matchesSuffix(host, FIRST_PARTY);
    }

    /** True for loopback (local proxy / torrent stream server) hosts. */
    public static boolean isLoopbackHost(String host) {
        if (host == null || host.isEmpty()) return false;
        String h = host.toLowerCase(Locale.ROOT);
        return h.equals("localhost") || h.equals("127.0.0.1") || h.equals("::1")
            || h.equals("0.0.0.0") || h.equals("[::1]");
    }

    /** Desktop {@code isTrustedExternal} parity (trusted + first-party + LAN). */
    public static boolean isTrustedExternal(String url) {
        String host = hostnameOf(url);
        if (host.isEmpty()) return false;
        if (isLoopbackHost(host)) return true;
        if (host.startsWith("10.")
            || host.startsWith("192.168.")
            || host.matches("172\\.(1[6-9]|2\\d|3[01])\\..*")) return true;
        return matchesSuffix(host, TRUSTED_EXTERNAL) || matchesSuffix(host, FIRST_PARTY);
    }

    /**
     * Desktop {@code evaluateWindowOpen} embed-popunder verdict: while an embed
     * is on screen, any unknown (non-trusted) target is refused. Ad-network
     * targets are always refused.
     */
    public static boolean isEmbedPopunder(String url, boolean embedActive) {
        if (!embedActive) return false;
        String host = hostnameOf(url);
        if (host.isEmpty()) return false;
        if (isHardBlockedHost(host)) return true;
        return !isTrustedExternal(url);
    }

    /** Hard ad/popunder host — always blocked, in any frame. */
    public static boolean isHardBlockedHost(String host) {
        return matchesSuffix(host, BLOCKED);
    }

    /**
     * Decide whether to drop a subresource request.
     *
     * @param url            the request URL
     * @param refererOrOrigin the request's Referer or Origin header, used to tell
     *                        first- from third-party analytics (may be null)
     */
    public static boolean shouldBlock(String url, String refererOrOrigin) {
        String host = hostnameOf(url);
        if (host.isEmpty()) return false;
        if (isHardBlockedHost(host)) return true;
        if (matchesSuffix(host, ANALYTICS)) {
            // Mirror desktop: block analytics only when it did not come from our
            // own document. A missing initiator ("unknown") is left alone.
            String refHost = hostnameOf(refererOrOrigin);
            if (!refHost.isEmpty() && !isFirstPartyHost(refHost)) return true;
        }
        return false;
    }
}
