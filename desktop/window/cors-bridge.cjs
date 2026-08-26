'use strict';

/**
 * Streaming CORS bridge
 * ------------------------------------------------------------------------------
 * Some media hosts serve HLS manifests and segments with no CORS headers at all,
 * so an in-app hls.js / <video> fetch is refused even though the bytes are
 * public. This adds the missing headers — and *only* the missing ones.
 *
 * "Only the missing ones" is the whole point. Response headers arrive keyed with
 * the casing the origin server used (in practice lowercase), and JS object keys
 * are case-sensitive, so the previous `{...details.responseHeaders,
 * 'Access-Control-Allow-Origin': ['*']}` left BOTH `access-control-allow-origin`
 * and `Access-Control-Allow-Origin` on the response. Chromium then refused the
 * load with
 *
 *   The 'Access-Control-Allow-Origin' header contains multiple values
 *   'https://vidnest.fun, *', but only one is allowed
 *
 * — and a `'*, *'` variant when the server had already sent `*`, which is proof
 * the second value was ours. That is what broke every embed's `master.m3u8` and
 * `.vtt` fetch and surfaced as `TypeError: Failed to fetch` with the player
 * never starting.
 *
 * Two rules follow from that:
 *   1. A response that already declares an origin policy is passed through
 *      untouched. It knows its own callers better than we do, and replacing a
 *      specific origin with `*` additionally breaks credentialed requests.
 *   2. When we do inject, every existing casing variant of the headers we manage
 *      is dropped first, so exactly one of each ends up on the response.
 */

/**
 * Hostname fragments of media/CDN hosts that commonly omit CORS headers.
 * Matched against the hostname only — the old full-URL `includes()` also matched
 * hosts named inside `?url=` query parameters, and a bare `'cloudflare'` entry
 * pulled in `static.cloudflareinsights.com`, an analytics beacon carrying no
 * media at all.
 */
const STREAMING_HOST_FRAGMENTS = [
    'megacloud', 'rabbitstream', 'rapid-cloud',
    'akamaized', 'bunnycdn', 'b-cdn', 'jwpcdn', 'streamtape',
    'mp4upload', 'filemoon', 'vidcloud', 'vidplay', 'cache.google',
];

/** Lowercased content-type prefixes that mean "this response is media". */
const MEDIA_CONTENT_TYPES = [
    'video/', 'audio/',
    // `application/x-mpegURL` is served in every imaginable casing; compare lower.
    'application/x-mpegurl', 'application/vnd.apple.mpegurl',
    'application/octet-stream',
];

/** The headers this bridge owns. Every casing variant is removed before these. */
const MANAGED_CORS_HEADERS = {
    'Access-Control-Allow-Origin': ['*'],
    'Access-Control-Allow-Methods': ['GET, HEAD, OPTIONS'],
    'Access-Control-Allow-Headers': ['*'],
};

const MANAGED_HEADER_NAMES = new Set(
    Object.keys(MANAGED_CORS_HEADERS).map((name) => name.toLowerCase())
);

function hostnameOf(url) {
    try {
        return new URL(url).hostname.toLowerCase();
    } catch {
        return '';
    }
}

/** First value of a header, case-insensitively. */
function headerValue(responseHeaders, name) {
    if (!responseHeaders) return '';
    const wanted = name.toLowerCase();
    for (const key of Object.keys(responseHeaders)) {
        if (key.toLowerCase() !== wanted) continue;
        const raw = responseHeaders[key];
        const value = Array.isArray(raw) ? raw[0] : raw;
        return typeof value === 'string' ? value : '';
    }
    return '';
}

function isStreamingResponse(details) {
    const hostname = hostnameOf(details.url || '');
    if (hostname && STREAMING_HOST_FRAGMENTS.some((f) => hostname.includes(f))) return true;
    const contentType = headerValue(details.responseHeaders, 'content-type').toLowerCase();
    return !!contentType && MEDIA_CONTENT_TYPES.some((t) => contentType.startsWith(t));
}

/** Replace — never append — the managed CORS headers. */
function withCorsHeaders(responseHeaders) {
    const out = {};
    for (const key of Object.keys(responseHeaders || {})) {
        if (MANAGED_HEADER_NAMES.has(key.toLowerCase())) continue;
        out[key] = responseHeaders[key];
    }
    return Object.assign(out, MANAGED_CORS_HEADERS);
}

/**
 * Targeted CORS injection for streaming media responses that lack it.
 */
function attachStreamingCors(session) {
    session.webRequest.onHeadersReceived((details, callback) => {
        // The origin already stated who may read this response. Touching it can
        // only turn a working request into a duplicate-header failure.
        if (headerValue(details.responseHeaders, 'access-control-allow-origin')) {
            return callback({});
        }
        if (!isStreamingResponse(details)) return callback({});
        callback({ responseHeaders: withCorsHeaders(details.responseHeaders) });
    });

    /**
     * Permissions an embed may ask for.
     *
     * `fullscreen` is here because embed players request it through the
     * Permissions API when their own fullscreen button is pressed, and denying
     * it made the button silently do nothing — the second half of "embed video
     * cannot full screen" (the first half being the iframe's `allow` attribute,
     * see `src/components/video/EmbedPlayer.tsx`).
     *
     * `mediaKeySystem` covers Widevine on the hosts that serve DRM'd streams;
     * without it those players fail at init rather than falling back. Capture
     * and location permissions stay denied — an embed has no business with them.
     */
    session.setPermissionRequestHandler((_webContents, permission, callback) => {
        const allowed = [
            'clipboard-read',
            'clipboard-sanitized-write',
            'clipboard-write',
            'notifications',
            'fullscreen',
            'pointerLock',
            'keyboardLock',
            'mediaKeySystem',
        ];
        callback(allowed.includes(permission));
    });

    // Synchronous sibling of the handler above. Chromium consults this one for
    // checks that cannot wait on a callback (`document.fullscreenEnabled`, the
    // EME availability probe); leaving it at the default meant a frame could be
    // told "no" here even though the async handler would have said yes.
    if (typeof session.setPermissionCheckHandler === 'function') {
        session.setPermissionCheckHandler((_webContents, permission) =>
            ['clipboard-read', 'clipboard-sanitized-write', 'clipboard-write',
                'notifications', 'fullscreen', 'pointerLock', 'keyboardLock',
                'mediaKeySystem'].includes(permission)
        );
    }
}

module.exports = {
    attachStreamingCors,
    // Exported for the header-handling unit checks.
    withCorsHeaders,
    isStreamingResponse,
    headerValue,
};
