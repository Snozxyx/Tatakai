'use strict';

/**
 * App-level ad / popunder blocker
 * ------------------------------------------------------------------------------
 * Embedded players ("embed" sources) are third-party pages we do not control and
 * cannot modify: their ad layers routinely hijack the first click to spawn a
 * popunder. This module blocks that **from the app side only** — nothing is ever
 * injected into the embedded page:
 *
 *   1. Network layer — `session.webRequest.onBeforeRequest` drops requests to
 *      known ad / popunder / tracker hosts before they leave the machine. This
 *      kills the ad scripts and ad iframes inside the embed without touching its
 *      markup. Hosts are split into two tiers: ad networks (refused whoever
 *      asked) and analytics beacons (refused only when the asking document is
 *      third-party, so the app's own GA is never cancelled).
 *   2. Popup layer — `evaluateWindowOpen()` decides what a `window.open` from any
 *      frame is allowed to do. Ad-network targets are always refused. While an
 *      embed is on screen, any other unknown target is refused too, because the
 *      app's own UI only ever opens a small, known set of hosts. Refused popups
 *      are NOT handed to `shell.openExternal`, which is what previously let an
 *      embed's popunder open in the user's real browser.
 *   3. Notification — every block is counted and pushed to the renderer over
 *      `security:blocked` (coalesced) so the user is told, instead of the block
 *      happening invisibly.
 *
 * **Scope: the watch page only.** Third-party embeds are the only place the app
 * loads untrusted markup, so filtering anywhere else is pure risk — it can only
 * break a first-party request (a metadata CDN, an analytics call the user opted
 * into) with nothing to gain. The renderer raises `security:set-watch-active`
 * when the watch route mounts and lowers it on unmount; with the flag down the
 * network filter is a pass-through and only the ad-network popup blocklist (which
 * is never a false positive) stays armed.
 *
 * Sensitive-permission denial already happens at the session level in
 * `window/window-factory.cjs` (clipboard only), so it is not repeated here.
 */

// Host suffixes for ad, popunder and analytics networks. Matched against the
// request hostname as a suffix, so `x.y.popads.net` matches `popads.net`.
const BLOCKED_HOST_SUFFIXES = [
    // ── Popunder / malvertising networks common on streaming embeds ──
    'popads.net', 'popcash.net', 'popmyads.com', 'poptm.com',
    'propellerads.com', 'propu.sh', 'propellerclick.com',
    'onclickads.net', 'onclckds.com', 'onclickalgo.com', 'onclasrv.com',
    'adcash.com', 'adcashrevenue.com',
    'hilltopads.net', 'hilltopads.com',
    'exoclick.com', 'exosrv.com', 'exdynsrv.com', 'realsrv.com',
    'juicyads.com', 'juicyads.rocks',
    'trafficjunky.com', 'trafficjunky.net',
    'clickadu.com', 'clickaine.com',
    'adsterra.com', 'terraclicks.com', 'bebi.com',
    'admaven.com', 'ad-maven.com', 'admaven.net',
    'zeropark.com', 'voluum.com',
    'mgid.com', 'adskeeper.co.uk', 'adskeeper.com',
    'revcontent.com', 'contentabc.com',
    'popunder.net', 'poweredby.jads.co', 'jads.co',
    'a-ads.com', 'adservme.com', 'adsupply.com',
    'galaksion.com', 'kissmyads.com', 'monetag.com',
    'vidoomy.com', 'sekindo.com',

    // ── Mainstream ad exchanges / video ad servers ──
    'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
    'googletagservices.com', 'imasdk.googleapis.com',
    'adnxs.com', 'adsrvr.org', 'adform.net', 'adroll.com',
    'criteo.com', 'criteo.net',
    'pubmatic.com', 'rubiconproject.com', 'openx.net', 'casalemedia.com',
    'smartadserver.com', 'sharethrough.com', '3lift.com', 'bidswitch.net',
    'teads.tv', 'indexww.com', 'yieldmo.com', 'moatads.com',
    'spotxchange.com', 'spotx.tv', 'stickyadstv.com', 'springserve.com',
    'aniview.com', 'taboola.com', 'outbrain.com',
];

// Analytics / fingerprinting beacons. Deliberately a SEPARATE tier: the app's
// own telemetry (`src/core/analytics/AnalyticsService.ts`) loads GA/GTM, so
// blocking these outright cancels our own first-party analytics — which is what
// the "Blocked 2 ad requests: google-analytics.com" report was. These are
// therefore blocked only when the request was initiated by a third-party frame
// (i.e. from inside an embed), never when it came from our own document.
const THIRD_PARTY_ANALYTICS_SUFFIXES = [
    'google-analytics.com', 'googletagmanager.com',
    'scorecardresearch.com', 'quantserve.com', 'quantcount.com',
    'histats.com', 'statcounter.com', 'hotjar.com', 'hotjar.io',
    'mixpanel.com', 'segment.io', 'segment.com',
    'mc.yandex.ru',
    'luckyorange.com', 'clarity.ms',
];

// Hosts the app's own UI legitimately opens externally. Kept permissive enough
// that watching an embed never blocks a real in-app link.
const TRUSTED_EXTERNAL_SUFFIXES = [
    'github.com', 'githubusercontent.com',
    'anilist.co', 'myanimelist.net', 'kitsu.io', 'simkl.com',
    'mangadex.org', 'annas-archive.org',
    'discord.com', 'discord.gg', 'dsc.gg', 'discordapp.com',
    'twitter.com', 'x.com', 'facebook.com', 'reddit.com',
    'tatakai.app', 'tatakai.to',
    'localhost', '127.0.0.1',
];

/** Hosts that must never be blocked — the app's own loopback services. */
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '0.0.0.0']);

/** Origins that count as "our own document" when deciding first- vs third-party. */
const FIRST_PARTY_SUFFIXES = ['tatakai.app', 'tatakai.to', 'tatakai.me'];

function hostnameOf(url) {
    try {
        return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    } catch {
        return '';
    }
}

function matchesSuffix(hostname, suffixes) {
    if (!hostname) return false;
    return suffixes.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`));
}

/** True when `url` looks like a document served by the app itself. */
function isFirstPartyUrl(url) {
    if (!url) return false;
    if (/^(file|devtools|chrome-extension|about):/i.test(url)) return true;
    const hostname = hostnameOf(url);
    if (!hostname) return false;
    return LOOPBACK_HOSTS.has(hostname) || matchesSuffix(hostname, FIRST_PARTY_SUFFIXES);
}

/**
 * Which document asked for this request — our renderer, or a page inside an
 * embed?
 *
 * The strongest available signal is the frame *hierarchy*, not the frame URL:
 * this app's own document is always the top-level frame, and every piece of
 * untrusted markup it loads is in an iframe. So "no parent frame" means ours,
 * full stop, with no URL parsing and no dev-vs-packaged origin differences to
 * get wrong. URL checks are only a fallback for nested frames (a dev overlay,
 * an about:blank shim).
 *
 * `details.frame` is absent for requests with no live initiating frame —
 * service workers, `sendBeacon` after teardown, and some renderer-internal
 * fetches, which is exactly the shape our analytics beacons take, and why the
 * previous URL-only version still cancelled our own GA. Hence 'unknown' is a
 * distinct verdict and the analytics tier treats it as "leave it alone".
 *
 * @returns {'first-party' | 'third-party' | 'unknown'}
 */
function classifyInitiator(details) {
    try {
        const frame = details.frame;
        if (frame && !frame.isDestroyed?.()) {
            // Top-level frame => our own document.
            if (!frame.parent) return 'first-party';
            return isFirstPartyUrl(frame.url) ? 'first-party' : 'third-party';
        }
    } catch {
        /* frame already gone — fall through to the weaker signals */
    }

    // A top-level navigation is its own initiator.
    if (details.resourceType === 'mainFrame') {
        return isFirstPartyUrl(details.url) ? 'first-party' : 'third-party';
    }
    if (details.referrer) {
        return isFirstPartyUrl(details.referrer) ? 'first-party' : 'third-party';
    }
    return 'unknown';
}

function createAdBlocker() {
    let logger = null;
    let getMainWindow = () => null;
    let enabled = true;
    let embedActive = false;
    let watchActive = false;

    const stats = { requests: 0, popups: 0 };
    /** Hosts blocked since the last notification flush. */
    let pendingHosts = new Set();
    let pendingRequests = 0;
    let flushTimer = null;

    function init({ logger: log, getMainWindow: getWindow } = {}) {
        logger = log || null;
        if (typeof getWindow === 'function') getMainWindow = getWindow;
        return api;
    }

    function setEnabled(value) {
        enabled = value !== false;
    }

    function setEmbedActive(value) {
        embedActive = value === true;
    }

    /**
     * Raised while the watch route is mounted. Gates the network filter so no
     * request outside the watch page is ever inspected or cancelled.
     */
    function setWatchActive(value) {
        watchActive = value === true;
        if (!watchActive) embedActive = false;
    }

    /** True when the network filter should actually cancel anything. */
    function isFilteringActive() {
        return enabled && (watchActive || embedActive);
    }

    function getStats() {
        return { ...stats, enabled, embedActive, watchActive, filtering: isFilteringActive() };
    }

    /** Push a payload to the renderer; silently ignores a missing/destroyed window. */
    function notify(channel, payload) {
        try {
            const win = getMainWindow();
            if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
        } catch (_) {
            /* renderer not ready — dropping the notification is fine */
        }
    }

    /**
     * Network blocks fire in bursts (one ad script pulls in a dozen more), so
     * they are coalesced into a single renderer notification per window.
     */
    function queueRequestNotification(hostname) {
        pendingRequests++;
        if (hostname) pendingHosts.add(hostname);
        if (flushTimer) return;
        flushTimer = setTimeout(() => {
            flushTimer = null;
            const hosts = Array.from(pendingHosts).slice(0, 5);
            const count = pendingRequests;
            pendingHosts = new Set();
            pendingRequests = 0;
            notify('security:blocked', {
                kind: 'request',
                count,
                hosts,
                totalRequests: stats.requests,
                totalPopups: stats.popups,
            });
        }, 2500);
    }

    function isBlockedHost(url) {
        const hostname = hostnameOf(url);
        if (!hostname || LOOPBACK_HOSTS.has(hostname)) return false;
        return matchesSuffix(hostname, BLOCKED_HOST_SUFFIXES)
            || matchesSuffix(hostname, THIRD_PARTY_ANALYTICS_SUFFIXES);
    }

    /**
     * Request-level verdict. Ad and popunder networks are refused whoever asked
     * for them. Analytics hosts are refused *only* when the asking document is
     * positively identified as third-party — an unidentifiable initiator is left
     * alone, because the app's own GA/GTM beacons are the requests that arrive
     * without a live frame, and cancelling those is a false positive the user
     * sees as "Blocked 2 ad requests: google-analytics.com". Failing open here
     * costs nothing that matters: an analytics beacon is privacy noise, while
     * the popunders and click hijacks this module exists to stop all come from
     * the ad-network tier above, which stays fail-closed.
     *
     * @returns {{ block: boolean, hostname: string, tier?: 'ad-network'|'third-party-analytics', initiator?: string }}
     */
    function evaluateRequest(details) {
        const url = details.url || '';
        const hostname = hostnameOf(url);
        if (!hostname || LOOPBACK_HOSTS.has(hostname)) return { block: false, hostname };

        if (matchesSuffix(hostname, BLOCKED_HOST_SUFFIXES)) {
            return { block: true, hostname, tier: 'ad-network' };
        }
        if (matchesSuffix(hostname, THIRD_PARTY_ANALYTICS_SUFFIXES)) {
            const initiator = classifyInitiator(details);
            if (initiator !== 'third-party') return { block: false, hostname, initiator };
            return { block: true, hostname, tier: 'third-party-analytics', initiator };
        }
        return { block: false, hostname };
    }

    function isTrustedExternal(url) {
        const hostname = hostnameOf(url);
        if (!hostname) return false;
        if (LOOPBACK_HOSTS.has(hostname)) return true;
        // Private LAN ranges — the user's own home server.
        if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname)) return true;
        return matchesSuffix(hostname, TRUSTED_EXTERNAL_SUFFIXES);
    }

    /**
     * Install the network-level filter on a session. Safe to call more than once
     * per session (the last handler wins, and the handler is idempotent).
     *
     * The handler stays installed for the app's lifetime but is a pass-through
     * unless the watch page is mounted — see the scope note at the top.
     */
    function attachToSession(session) {
        if (!session?.webRequest) return;
        session.webRequest.onBeforeRequest((details, callback) => {
            if (!isFilteringActive()) return callback({});
            const url = details.url || '';
            if (!/^https?:/i.test(url)) return callback({});

            const verdict = evaluateRequest(details);
            if (!verdict.block) return callback({});

            stats.requests++;
            logger?.info?.(
                `[AdBlock] Blocked ${details.resourceType || 'request'} (${verdict.tier}`
                + `${verdict.initiator ? `, initiator=${verdict.initiator}` : ''}): ${verdict.hostname}`
            );
            queueRequestNotification(verdict.hostname);
            callback({ cancel: true });
        });
    }

    /**
     * Decide what to do with a `window.open` / target=_blank from any frame.
     *
     * @param {string} url
     * @param {object} [context]
     * @param {string} [context.source] label for logs ('main-window' | 'web-contents')
     * @param {boolean} [context.userInitiated] true for an explicit in-app click
     *   routed through the preload bridge — such a request skips the
     *   embed-popunder heuristic (an embedded page cannot reach that bridge) and
     *   is only checked against the ad-network blocklist.
     * @returns {{ allowExternal: boolean, blocked: boolean, reason?: string }}
     */
    function evaluateWindowOpen(url, context = {}) {
        const target = String(url || '');
        if (!/^https?:\/\//i.test(target)) {
            return { allowExternal: false, blocked: false };
        }
        if (!enabled) {
            return { allowExternal: true, blocked: false };
        }

        const hostname = hostnameOf(target);

        if (isBlockedHost(target)) {
            stats.popups++;
            logger?.warn?.(`[AdBlock] Blocked ad popup (${context.source || 'unknown'}): ${hostname}`);
            notify('security:blocked', {
                kind: 'popup',
                reason: 'ad-network',
                host: hostname,
                totalRequests: stats.requests,
                totalPopups: stats.popups,
            });
            return { allowExternal: false, blocked: true, reason: 'ad-network' };
        }

        // An embed is on screen: treat any unknown popup target as a popunder /
        // click hijack rather than handing it to the user's real browser.
        if (embedActive && !context.userInitiated && !isTrustedExternal(target)) {
            stats.popups++;
            logger?.warn?.(`[AdBlock] Blocked embed popunder (${context.source || 'unknown'}): ${hostname}`);
            notify('security:blocked', {
                kind: 'popup',
                reason: 'embed-popunder',
                host: hostname,
                totalRequests: stats.requests,
                totalPopups: stats.popups,
            });
            return { allowExternal: false, blocked: true, reason: 'embed-popunder' };
        }

        return { allowExternal: true, blocked: false };
    }

    function registerIpc(ipcMain) {
        if (!ipcMain) return;
        ipcMain.handle('security:get-adblock-stats', () => getStats());
        ipcMain.handle('security:set-embed-active', (_event, active) => {
            setEmbedActive(active);
            return { success: true, embedActive };
        });
        ipcMain.handle('security:set-watch-active', (_event, active) => {
            setWatchActive(active);
            return { success: true, watchActive, embedActive };
        });
        ipcMain.handle('security:set-adblock-enabled', (_event, value) => {
            setEnabled(value);
            return { success: true, enabled };
        });
    }

    const api = {
        init,
        attachToSession,
        evaluateWindowOpen,
        setEmbedActive,
        setWatchActive,
        setEnabled,
        getStats,
        registerIpc,
        // Exposed for the request-verdict unit checks; not used by the app.
        evaluateRequest,
    };

    return api;
}

// Single shared instance: `main.cjs` and `window/window-factory.cjs` both need
// the same counters and the same embed-active flag.
const adBlocker = createAdBlocker();

module.exports = { adBlocker, createAdBlocker, BLOCKED_HOST_SUFFIXES, THIRD_PARTY_ANALYTICS_SUFFIXES };
