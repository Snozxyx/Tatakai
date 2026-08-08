'use strict';

const STREAMING_DOMAINS = [
    'megacloud', 'rabbitstream', 'rapid-cloud', 'cloudflare',
    'akamaized', 'bunnycdn', 'b-cdn', 'jwpcdn', 'streamtape',
    'mp4upload', 'filemoon', 'vidcloud', 'vidplay', 'cache.google',
];

/**
 * Targeted CORS injection for streaming media responses only.
 */
function attachStreamingCors(session) {
    session.webRequest.onHeadersReceived((details, callback) => {
        const url = details.url || '';
        const isStreamingHost = STREAMING_DOMAINS.some((d) => url.includes(d));
        const isMediaType = [
            'video/', 'audio/', 'application/x-mpegURL',
            'application/vnd.apple.mpegurl', 'application/octet-stream',
        ].some((t) => (details.responseHeaders?.['content-type']?.[0] || '').startsWith(t));

        if (isStreamingHost || isMediaType) {
            callback({
                responseHeaders: {
                    ...details.responseHeaders,
                    'Access-Control-Allow-Origin': ['*'],
                    'Access-Control-Allow-Methods': ['GET, HEAD, OPTIONS'],
                    'Access-Control-Allow-Headers': ['*'],
                },
            });
        } else {
            callback({});
        }
    });

    session.setPermissionRequestHandler((_webContents, permission, callback) => {
        const allowed = ['clipboard-read', 'clipboard-write', 'notifications'];
        callback(allowed.includes(permission));
    });
}

module.exports = { attachStreamingCors };
