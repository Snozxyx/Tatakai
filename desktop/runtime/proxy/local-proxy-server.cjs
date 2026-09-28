'use strict';

const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { URL } = require('url');
const crypto = require('crypto');
const { bypassCloudflare, cookiesToHeader, cleanup, clearSession, isChallengeResponse } = require('./cloudflare-bypass.cjs');
const { FlareSolverrClient } = require('./flaresolverr-client.cjs');
const { EmbeddedFlareSolverr } = require('./embedded-flaresolverr.cjs');

const DEFAULT_USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

// Domains that are known to use Cloudflare protection
const CLOUDFLARE_DOMAINS = new Set([
    'animepahe.com',
    'animepahe.ru',
    'senshi.live',
    'senshianime.com',
    'aniworld.to',
    '4anime.gg',
    'mkissa.com',
    'anizone.to',
    'animesalt.com',
    'animeya.cc',
    'animeya.to',
    'toonstream.co',
    'animelok.xyz',
    'animelok.com',
    'watchanimeworld.com',
    'desidubbed.in',
    'hindidubbed.in',
    'reanime.to',
    'reanime.net',
    'anikoto.to',
    // Manga sites (Toko) fronted by Cloudflare — the worker-path proxy applies
    // the same challenge bypass so `getChapters`/`getPages` reach them.
    'weebcentral.com',
    'nelomanga.com',
    'toongod.org',
    'www.toongod.org',
    'mangadot.net',
    'www.mangadot.net',
    'mangaball.net',
    'www.mangaball.net',
    // mangaball serves pages/images off rotating Pokémon-themed CDN hosts.
    'bulbasaur.poke-black-and-white.net',
    'heracross.red-and-blue.net',
    'api.comick.dev',
]);

// Local video file extensions → MIME. mp4/webm/ogg play in a browser <video>
// (so cross-device watch-party participants can watch them); mkv/avi/mov are
// served faithfully but only play where the client has a demuxer for them
// (the host's desktop always does).
const LOCAL_VIDEO_MIME = {
    '.mp4': 'video/mp4',
    '.m4v': 'video/x-m4v',
    '.webm': 'video/webm',
    '.ogv': 'video/ogg',
    '.ogg': 'video/ogg',
    '.mkv': 'video/x-matroska',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.ts': 'video/mp2t',
};

class LocalProxyServer {
    constructor(logger, onEvent) {
        this._logger = logger;
        this._onEvent = typeof onEvent === 'function' ? onEvent : null;
        this._server = null;
        this._port = null;
        this._tokenMap = new Map();
        this._shareSecret = null; // minted lazily; gates public (tunneled) /stream
        this._cloudflareBypassEnabled = true; // Re-enabled after URL fixes
        this._flaresolverr = new FlareSolverrClient(logger, { enabled: false }); // External FlareSolverr (disabled by default)
        this._embeddedFlaresolverr = new EmbeddedFlareSolverr(logger); // Embedded FlareSolverr
        this._bypassMode = 'playwright'; // 'playwright', 'flaresolverr', or 'embedded'
    }

    _emit(type, payload) {
        if (!this._onEvent) return;
        try {
            this._onEvent({
                type,
                ts: Date.now(),
                ...(payload || {}),
            });
        } catch (_) {
            // non-fatal
        }
    }

    async ensureStarted() {
        if (this._server && this._port) {
            console.log(`[LocalProxy] Already running on port ${this._port}`);
            return this.baseUrl();
        }
        
        console.log('[LocalProxy] Starting proxy server...');
        this._server = http.createServer(this._handleRequest.bind(this));
        await new Promise((resolve, reject) => {
            this._server.once('error', reject);
            this._server.listen(0, '127.0.0.1', () => {
                this._port = this._server.address().port;
                resolve();
            });
        });
        this._logger.info(`[LocalProxy] Started on 127.0.0.1:${this._port}`);
        console.log(`[LocalProxy] ✅ Proxy server started on 127.0.0.1:${this._port}`);
        this._emit('runtime-proxy-started', { port: this._port });
        return this.baseUrl();
    }

    baseUrl() {
        return `http://127.0.0.1:${this._port}`;
    }

    /**
     * Enable or disable Cloudflare bypass
     */
    setCloudflareBypass(enabled) {
        this._cloudflareBypassEnabled = !!enabled;
        this._logger.info(`[LocalProxy] Cloudflare bypass ${enabled ? 'enabled' : 'disabled'}`);
    }

    /**
     * Check if Cloudflare bypass is enabled
     */
    isCloudflareBypassEnabled() {
        return this._cloudflareBypassEnabled;
    }

    /**
     * Set bypass mode: 'playwright', 'flaresolverr', or 'embedded'
     */
    setBypassMode(mode) {
        if (!['playwright', 'flaresolverr', 'embedded'].includes(mode)) {
            throw new Error('Invalid bypass mode. Use "playwright", "flaresolverr", or "embedded"');
        }
        this._bypassMode = mode;
        this._logger.info(`[LocalProxy] Bypass mode set to ${mode}`);
    }

    /**
     * Get bypass mode
     */
    getBypassMode() {
        return this._bypassMode;
    }

    /**
     * Configure FlareSolverr
     */
    async configureFlareSolverr(config) {
        if (config.enabled !== undefined) {
            this._flaresolverr.setEnabled(config.enabled);
        }
        if (config.url) {
            this._flaresolverr.setUrl(config.url);
        }
        
        // Check availability if enabled
        if (config.enabled) {
            const available = await this._flaresolverr.isAvailable();
            this._logger.info(`[LocalProxy] FlareSolverr ${available ? 'is available' : 'not available'}`);
            return { available };
        }
        
        return { available: false };
    }

    /**
     * Get FlareSolverr status
     */
    getFlareSolverrStatus() {
        return this._flaresolverr.getConfig();
    }

    /**
     * Start embedded FlareSolverr
     */
    async startEmbeddedFlareSolverr() {
        if (this._embeddedFlaresolverr.isRunning()) {
            return { success: true, url: this._embeddedFlaresolverr.getUrl(), already: true };
        }

        try {
            await this._embeddedFlaresolverr.start();
            return { success: true, url: this._embeddedFlaresolverr.getUrl() };
        } catch (error) {
            this._logger.error('[LocalProxy] Failed to start embedded FlareSolverr:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Stop embedded FlareSolverr
     */
    async stopEmbeddedFlareSolverr() {
        try {
            await this._embeddedFlaresolverr.stop();
            return { success: true };
        } catch (error) {
            this._logger.error('[LocalProxy] Failed to stop embedded FlareSolverr:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get embedded FlareSolverr status
     */
    getEmbeddedFlareSolverrStatus() {
        return {
            running: this._embeddedFlaresolverr.isRunning(),
            url: this._embeddedFlaresolverr.isRunning() ? this._embeddedFlaresolverr.getUrl() : null,
        };
    }

    async stop() {
        if (!this._server) return;
        const server = this._server;
        this._server = null;
        this._port = null;
        this._tokenMap.clear();
        this._shareSecret = null;
        
        // Cleanup Cloudflare bypass resources
        try {
            await cleanup();
        } catch (err) {
            this._logger?.warn('[LocalProxy] Cloudflare bypass cleanup error:', err.message);
        }
        
        // Stop embedded FlareSolverr if running
        if (this._embeddedFlaresolverr && this._embeddedFlaresolverr.isRunning()) {
            try {
                await this._embeddedFlaresolverr.stop();
            } catch (err) {
                this._logger?.warn('[LocalProxy] Embedded FlareSolverr stop error:', err.message);
            }
        }
        
        await new Promise((resolve, reject) => {
            server.close((err) => err ? reject(err) : resolve());
        });
    }

    registerSource({ url, headers, persistent = false, relative = false }) {
        const token = crypto.randomBytes(16).toString('hex');
        this._tokenMap.set(token, {
            url,
            headers: headers && typeof headers === 'object' ? headers : {},
            createdAt: Date.now(),
            persistent: !!persistent,
        });
        // cleanup old tokens (15m) — never purge persistent share tokens, so a
        // long movie streamed to a watch party doesn't 410 mid-session.
        const cutoff = Date.now() - 15 * 60 * 1000;
        for (const [k, v] of this._tokenMap.entries()) {
            if (v?.persistent) continue;
            if ((v?.createdAt || 0) < cutoff) this._tokenMap.delete(k);
        }
        // A relative `/stream/<token>` resolves against whatever origin the
        // client fetched from — the loopback base for the single-user player,
        // the Cloudflare tunnel host for a remote watch-party participant.
        return relative ? `/stream/${token}` : `${this.baseUrl()}/stream/${token}`;
    }

    /**
     * Register a persistent share-root source (host-hosted watch party) and
     * return `{ token, path }`. The caller builds the public tunnel URL from
     * `path` plus the share secret.
     */
    registerShareSource({ url, headers }) {
        const ref = this.registerSource({ url, headers, persistent: true, relative: true });
        const token = ref.slice('/stream/'.length);
        return { token, path: ref };
    }

    /**
     * Register a local video FILE (host's device or the offline library) as a
     * persistent share source. Unlike registerSource, the token serves bytes off
     * disk with Range support instead of proxying an upstream fetch. The path is
     * fixed at registration and never derived from the request, so there is no
     * traversal vector. Returns `{ token, path }`; the caller builds the public
     * tunnel URL from `path` plus the share secret.
     */
    registerLocalFile({ path: filePath }) {
        const abs = String(filePath || '').trim();
        if (!abs) throw new Error('registerLocalFile: path required');
        const token = crypto.randomBytes(16).toString('hex');
        this._tokenMap.set(token, {
            localPath: abs,
            createdAt: Date.now(),
            persistent: true,
        });
        return { token, path: `/stream/${token}` };
    }

    /**
     * Per-session secret required on public (tunneled) /stream requests, so a
     * guessed tunnel URL alone can't pull the host's stream. Loopback requests
     * (the single-user player) never need it. Minted lazily and reused for the
     * proxy's lifetime.
     */
    getShareSecret() {
        if (!this._shareSecret) {
            this._shareSecret = crypto.randomBytes(24).toString('hex');
        }
        return this._shareSecret;
    }

    clearShareSecret() {
        this._shareSecret = null;
    }

    /**
     * A request arrives over loopback (the local player) rather than the public
     * Cloudflare tunnel. cloudflared always connects from 127.0.0.1, so the
     * socket address can't tell them apart — the Host header can: a tunneled
     * request carries the public `*.trycloudflare.com` host, a direct one
     * carries `127.0.0.1:<port>` / `localhost`.
     */
    _isLoopbackRequest(req) {
        const host = String(req.headers?.host || '').toLowerCase();
        const name = host.split(':')[0].replace(/^\[|\]$/g, '');
        return name === '127.0.0.1' || name === 'localhost' || name === '::1' || name === '';
    }

    /**
     * CORS headers that must be on *every* response, errors included.
     *
     * The renderer runs on http://localhost:8090 and this server on
     * http://127.0.0.1:<ephemeral>, so every request to it is cross-origin. Only
     * the success paths used to set `access-control-allow-origin`, which meant a
     * failed subtitle fetch surfaced in the console as
     *
     *   Access to text track at 'http://127.0.0.1:49351/stream/…' from origin
     *   'http://localhost:8090' has been blocked by CORS policy: No
     *   'Access-Control-Allow-Origin' header is present
     *
     * on top of the real error (502 / 410 expired). Chrome strips a cross-origin
     * response with no ACAO before the page can read its status, so the actual
     * failure — an expired token, a dead upstream — was invisible and every
     * proxy fault looked like the same CORS bug. Errors carry the headers now so
     * the status the player sees is the status that happened.
     */
    _corsHeaders(extra) {
        return {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'GET, HEAD, POST, OPTIONS',
            // `*` is not honoured for allow-headers on requests with credentials,
            // and hls.js/track fetches send Range plus content negotiation.
            'access-control-allow-headers': 'Range, Content-Type, Accept, Origin, Authorization, X-Requested-With',
            'access-control-expose-headers': '*',
            'access-control-max-age': '86400',
            // The renderer and this loopback proxy are different origins, so every
            // proxied subresource is a cross-site load. CDNs that omit CORP (atsu)
            // or send `same-site`/`same-origin` (hotlink-locked hosts) make Chrome
            // block the `<img>`/media load with ERR_BLOCKED_BY_RESPONSE.NotSameSite.
            // We front the fetch, so advertise the resource as cross-origin-usable.
            'cross-origin-resource-policy': 'cross-origin',
            ...(extra || {}),
        };
    }

    /** Terminate a request with a status + text body, always CORS-safe. */
    _endWithStatus(res, status, message) {
        if (res.headersSent) {
            res.end();
            return;
        }
        const body = Buffer.from(String(message ?? ''), 'utf8');
        res.writeHead(status, this._corsHeaders({
            'content-type': 'text/plain; charset=utf-8',
            'content-length': String(body.length),
            'cache-control': 'no-store',
        }));
        res.end(body);
    }

    _rewritePlaylistUrls(playlistText, playlistUrl, sourceHeaders, opts = {}) {
        const base = new URL(playlistUrl);
        const persistent = !!opts.persistent;
        const shareQuery = opts.shareQuery || '';
        const rewriteUrl = (targetUrl) => {
            try {
                const resolved = new URL(String(targetUrl || '').trim(), base).href;
                // Emit origin-relative `/stream/<token>` so the reference resolves
                // against whichever origin fetched the playlist (loopback player
                // or tunnel participant). Append the share secret when we're
                // serving over the tunnel so child segments pass the /stream gate.
                const ref = this.registerSource({
                    url: resolved,
                    headers: sourceHeaders,
                    persistent,
                    relative: true,
                });
                return `${ref}${shareQuery}`;
            } catch (_) {
                return targetUrl;
            }
        };

        return String(playlistText || '')
            .split('\n')
            .map((line) => {
                const trimmed = line.trim();
                if (!trimmed) return line;
                if (trimmed.startsWith('#')) {
                    return line.replace(/URI="([^"]+)"/g, (_m, p1) => `URI="${rewriteUrl(p1)}"`);
                }
                return rewriteUrl(trimmed);
            })
            .join('\n');
    }

    async _readRequestBody(req) {
        const chunks = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
    }

    _extensionRequestHeaders(req) {
        const headers = {};
        const blocked = new Set([
            'host', 'connection', 'keep-alive', 'proxy-authenticate',
            'proxy-authorization', 'te', 'trailers', 'transfer-encoding',
            'upgrade', 'content-length',
        ]);
        for (const [key, value] of Object.entries(req.headers || {})) {
            if (blocked.has(key.toLowerCase()) || value == null) continue;
            headers[key] = Array.isArray(value) ? value.join(', ') : value;
        }
        return headers;
    }

    /**
     * Build the headers to send downstream from an upstream `fetch` response.
     *
     * The one that matters is `content-encoding`. Node's `fetch` transparently
     * gunzips/brotli-decodes the response, so the bytes we relay are already
     * plaintext while the upstream header still says `gzip`/`br`. Copying it
     * tells Chrome to inflate plaintext, which fails the request as
     * ERR_CONTENT_DECODING_FAILED *at HTTP 200* — hls.js reads that as a fatal
     * network error and retries forever ("Fatal network error, trying to
     * recover..."). `content-length` has to go with it, because the length
     * upstream reported describes the encoded body, not what we write.
     */
    _responseHeaders(upstream) {
        const hop = new Set([
            'connection', 'keep-alive', 'proxy-authenticate',
            'proxy-authorization', 'te', 'trailers', 'transfer-encoding', 'upgrade',
        ]);
        const encoding = String(upstream.headers.get('content-encoding') || '')
            .trim()
            .toLowerCase();
        // 'identity' (or absent) means fetch passed the bytes through untouched,
        // so the upstream content-length is still accurate — keep it, byte-range
        // playback depends on it.
        const wasDecoded = encoding !== '' && encoding !== 'identity';

        const passHeaders = {};
        upstream.headers.forEach((value, key) => {
            const name = String(key).toLowerCase();
            if (hop.has(name)) return;
            if (name === 'content-encoding') return;
            if (name === 'content-length' && wasDecoded) return;
            // `_corsHeaders` owns every CORS/cross-origin-policy header below. An
            // upstream copy (often differently-cased, e.g. atsu's per-origin
            // `Access-Control-Allow-Origin`) would survive `Object.assign` as a
            // second header of the same name and let the browser honour the
            // restrictive value — so drop the upstream ones here.
            if (name.startsWith('access-control-') || name.startsWith('cross-origin-')) return;
            passHeaders[key] = value;
        });
        Object.assign(passHeaders, this._corsHeaders());
        return passHeaders;
    }

    async _forwardResponse(res, upstream) {
        res.writeHead(upstream.status, this._responseHeaders(upstream));
        if (!upstream.body) {
            res.end();
            return;
        }

        const reader = upstream.body.getReader();
        // eslint-disable-next-line no-constant-condition
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!res.write(Buffer.from(value))) {
                await new Promise((resolve) => res.once('drain', resolve));
            }
        }
        res.end();
    }

    async _handleExtensionFetch(req, res, targetUrl) {
        console.log('[LocalProxy] Handling extension fetch:', targetUrl);
        let target;
        try {
            target = new URL(targetUrl);
        } catch (_) {
            console.error('[LocalProxy] Invalid target URL:', targetUrl);
            this._endWithStatus(res, 400, 'invalid target url');
            return;
        }
        if (!['http:', 'https:'].includes(target.protocol)) {
            console.error('[LocalProxy] Unsupported protocol:', target.protocol);
            this._endWithStatus(res, 400, 'unsupported target protocol');
            return;
        }

        const method = String(req.method || 'GET').toUpperCase();
        const body = ['GET', 'HEAD'].includes(method) ? undefined : await this._readRequestBody(req);
        
        // Check if this domain needs Cloudflare bypass
        const needsBypass = this._cloudflareBypassEnabled && CLOUDFLARE_DOMAINS.has(target.hostname);
        let requestHeaders = this._extensionRequestHeaders(req);
        
        console.log(`[LocalProxy] Request to ${target.hostname} - CF bypass: ${needsBypass}`);
        
        if (needsBypass) {
            try {
                this._logger.info(`[LocalProxy] Using Cloudflare bypass (${this._bypassMode}) for ${target.hostname}`);
                
                let cookies, userAgent;
                const FlareSolverrClientClass = require('./flaresolverr-client.cjs').FlareSolverrClient;
                
                if (this._bypassMode === 'flaresolverr' && this._flaresolverr.getConfig().enabled) {
                    // Use external FlareSolverr
                    const solution = await this._flaresolverr.solve(targetUrl);
                    cookies = solution.cookies;
                    userAgent = solution.userAgent;
                    
                    // Convert FlareSolverr cookies to header string
                    const cookieHeader = FlareSolverrClientClass.cookiesToHeader(cookies);
                    if (cookieHeader) {
                        requestHeaders['Cookie'] = requestHeaders['Cookie'] 
                            ? `${requestHeaders['Cookie']}; ${cookieHeader}`
                            : cookieHeader;
                    }
                } else if (this._bypassMode === 'embedded' && this._embeddedFlaresolverr.isRunning()) {
                    // Use embedded FlareSolverr
                    const embeddedClient = new FlareSolverrClientClass(this._logger, {
                        url: this._embeddedFlaresolverr.getUrl(),
                        enabled: true
                    });
                    const solution = await embeddedClient.solve(targetUrl);
                    cookies = solution.cookies;
                    userAgent = solution.userAgent;
                    
                    // Convert FlareSolverr cookies to header string
                    const cookieHeader = FlareSolverrClientClass.cookiesToHeader(cookies);
                    if (cookieHeader) {
                        requestHeaders['Cookie'] = requestHeaders['Cookie'] 
                            ? `${requestHeaders['Cookie']}; ${cookieHeader}`
                            : cookieHeader;
                    }
                } else {
                    // Use Playwright bypass
                    const result = await bypassCloudflare(targetUrl, this._logger);
                    cookies = result.cookies;
                    userAgent = result.userAgent;
                    
                    // Merge bypassed cookies with request headers
                    const cookieHeader = cookiesToHeader(cookies);
                    if (cookieHeader) {
                        requestHeaders['Cookie'] = requestHeaders['Cookie'] 
                            ? `${requestHeaders['Cookie']}; ${cookieHeader}`
                            : cookieHeader;
                    }
                }
                
                // Use the browser's user agent
                if (userAgent) {
                    requestHeaders['User-Agent'] = userAgent;
                }
                
                this._emit('runtime-proxy-cloudflare-bypass', {
                    targetHost: target.hostname,
                    success: true,
                    mode: this._bypassMode,
                });
            } catch (err) {
                this._logger.warn(`[LocalProxy] Cloudflare bypass failed for ${target.hostname}, continuing anyway:`, err.message);
                this._emit('runtime-proxy-cloudflare-bypass', {
                    targetHost: target.hostname,
                    success: false,
                    error: err.message,
                    mode: this._bypassMode,
                });
            }
        }
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30_000);
        let upstream;
        try {
            console.log(`[LocalProxy] Fetching ${method} ${target.href}`);
            upstream = await fetch(target, {
                method,
                headers: requestHeaders,
                body,
                redirect: 'follow',
                signal: controller.signal,
            });
            console.log(`[LocalProxy] Response ${upstream.status} from ${target.hostname}`);
        } catch (err) {
            console.error(`[LocalProxy] Fetch failed for ${target.hostname}:`, err.message);
            throw err;
        } finally {
            clearTimeout(timeoutId);
        }

        // A cached cf_clearance can go stale between solves (Cloudflare rotates it,
        // or the failure cooldown handed us nothing). When the upstream answers with
        // a challenge instead of the asset, drop the session and re-solve once with a
        // forced refresh — otherwise we'd forward the challenge HTML as the "page".
        // Only the Playwright path self-solves; the FlareSolverr modes own their own
        // challenge handling. We only peek on the challenge status codes so ordinary
        // 200 image bytes are never buffered.
        if (
            needsBypass &&
            this._bypassMode !== 'flaresolverr' &&
            this._bypassMode !== 'embedded' &&
            [403, 503, 429].includes(upstream.status)
        ) {
            const peeked = Buffer.from(await upstream.arrayBuffer());
            const originalHeaders = upstream.headers;
            if (isChallengeResponse(upstream.status, peeked.toString('utf8'))) {
                this._logger.warn(`[LocalProxy] Stale Cloudflare clearance for ${target.hostname}; re-solving`);
                clearSession(target.hostname);
                try {
                    const result = await bypassCloudflare(targetUrl, this._logger, { forceRefresh: true });
                    const retryHeaders = { ...requestHeaders };
                    // Overwrite Cookie outright so the stale cf_clearance we just
                    // merged in is gone, not appended alongside the fresh one.
                    const cookieHeader = cookiesToHeader(result.cookies);
                    if (cookieHeader) retryHeaders['Cookie'] = cookieHeader;
                    if (result.userAgent) retryHeaders['User-Agent'] = result.userAgent;

                    const retryController = new AbortController();
                    const retryTimeoutId = setTimeout(() => retryController.abort(), 30_000);
                    try {
                        upstream = await fetch(target, {
                            method,
                            headers: retryHeaders,
                            body,
                            redirect: 'follow',
                            signal: retryController.signal,
                        });
                    } finally {
                        clearTimeout(retryTimeoutId);
                    }
                } catch (err) {
                    this._logger.warn(`[LocalProxy] Cloudflare re-solve failed for ${target.hostname}: ${err.message}`);
                    // Re-solve failed — forward the challenge body we already drained.
                    upstream = new Response(peeked, { status: 403, headers: originalHeaders });
                }
            } else {
                // A genuine 4xx/5xx from the origin, not a wall — replay the drained body.
                upstream = new Response(peeked, { status: upstream.status, headers: originalHeaders });
            }
        }

        this._emit('runtime-proxy-extension-fetch', {
            status: upstream.status,
            method,
            targetHost: target.hostname,
            cloudflareBypass: needsBypass,
        });
        await this._forwardResponse(res, upstream);
    }

    /**
     * GET an upstream stream asset, retrying once on a *connection-level* failure.
     *
     * A single `fetch` reject used to become a 502 straight away, and the assets
     * most likely to hit one are the small ones: subtitle tracks on
     * `cdn.watching.onl` sit behind a CDN that resets the first connection often
     * enough to be noticeable, while the video segments — requested in a steady
     * stream over an already-warm socket — almost never do. So the visible
     * symptom was "the .vtt 502s but the video plays".
     *
     * Only network rejections are retried. An HTTP error (403/404/5xx) is a real
     * answer from the origin and is relayed as-is, and an abort means the 18s
     * budget is gone so there is no time for a second attempt.
     */
    async _fetchStreamUpstream(url, headers, signal) {
        let lastErr;
        for (let attempt = 0; attempt < 2; attempt += 1) {
            try {
                return await fetch(url, {
                    method: 'GET',
                    headers,
                    redirect: 'follow',
                    signal,
                });
            } catch (err) {
                lastErr = err;
                if (signal?.aborted || /abort/i.test(String(err?.name || ''))) throw err;
                if (attempt === 0) {
                    this._logger?.warn?.(
                        `[LocalProxy] upstream fetch failed (${err.message}) — retrying once`,
                    );
                    await new Promise((resolve) => setTimeout(resolve, 250));
                }
            }
        }
        throw lastErr;
    }

    /**
     * Serve a local video file with HTTP Range support so seeking works in the
     * player. The path is the one fixed at registerLocalFile() time — never
     * taken from the request — so a token can only ever read its own file.
     */
    async _serveLocalFile(req, res, filePath) {
        let stat;
        try {
            stat = await fsp.stat(filePath);
        } catch (_) {
            this._endWithStatus(res, 404, 'file not found');
            return;
        }
        if (!stat.isFile()) {
            this._endWithStatus(res, 404, 'not a file');
            return;
        }

        const total = stat.size;
        const ext = path.extname(filePath).toLowerCase();
        const contentType = LOCAL_VIDEO_MIME[ext] || 'application/octet-stream';
        const method = String(req.method || 'GET').toUpperCase();

        // Parse a single "bytes=start-end" range; ignore anything more exotic.
        let start = 0;
        let end = total - 1;
        let isRange = false;
        const range = req.headers.range;
        if (range) {
            const m = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim());
            if (m) {
                const s = m[1] === '' ? NaN : Number(m[1]);
                const e = m[2] === '' ? NaN : Number(m[2]);
                if (Number.isFinite(s)) {
                    start = s;
                    end = Number.isFinite(e) ? e : total - 1;
                } else if (Number.isFinite(e)) {
                    // suffix range: last N bytes
                    start = Math.max(0, total - e);
                    end = total - 1;
                }
                isRange = true;
            }
            if (isRange && (start > end || start >= total)) {
                res.writeHead(416, this._corsHeaders({
                    'content-range': `bytes */${total}`,
                    'content-type': 'text/plain; charset=utf-8',
                }));
                res.end('range not satisfiable');
                return;
            }
        }

        const chunkSize = isRange ? end - start + 1 : total;
        const headers = this._corsHeaders({
            'content-type': contentType,
            'content-length': String(chunkSize),
            'accept-ranges': 'bytes',
            'cache-control': 'no-store',
        });
        if (isRange) headers['content-range'] = `bytes ${start}-${end}/${total}`;

        res.writeHead(isRange ? 206 : 200, headers);
        if (method === 'HEAD') {
            res.end();
            return;
        }

        const stream = fs.createReadStream(filePath, isRange ? { start, end } : {});
        stream.on('error', (err) => {
            this._logger?.error?.('[LocalProxy] local file read error:', err.message);
            if (!res.headersSent) this._endWithStatus(res, 500, 'file read error');
            else res.destroy();
        });
        res.on('close', () => stream.destroy());
        stream.pipe(res);
    }

    async _handleRequest(req, res) {
        try {
            const rawUrl = req.url || '/';
            const parsed = new URL(rawUrl, this.baseUrl());
            const isLoopback = this._isLoopbackRequest(req);

            // Preflight. A `<track>` element never sends one, but hls.js does as
            // soon as a request carries a non-simple header (Range on a seek,
            // Content-Type on a key request), and without an answer here those
            // fail before the GET is ever attempted.
            if (String(req.method || '').toUpperCase() === 'OPTIONS') {
                res.writeHead(204, this._corsHeaders({ 'content-length': '0' }));
                res.end();
                return;
            }

            if (parsed.pathname === '/proxy') {
                // `/proxy?url=` is an open fetch — an SSRF vector. It's only for
                // the local extension host, so refuse it over the public tunnel;
                // public callers can reach nothing but /stream/<token>.
                if (!isLoopback) {
                    this._endWithStatus(res, 403, 'forbidden');
                    return;
                }
                const targetUrl = parsed.searchParams.get('url');
                if (!targetUrl) {
                    this._endWithStatus(res, 400, 'missing target url');
                    return;
                }
                await this._handleExtensionFetch(req, res, targetUrl);
                return;
            }
            const match = parsed.pathname.match(/^\/stream\/([a-f0-9]{32})$/i);
            if (!match) {
                this._endWithStatus(res, 404, 'not found');
                return;
            }
            // A public (tunneled) stream read must carry the per-session share
            // secret, so a guessed tunnel URL alone can't pull the host's stream.
            // Loopback reads (the single-user player) are exempt.
            if (!isLoopback) {
                const provided = parsed.searchParams.get('s');
                if (!this._shareSecret || provided !== this._shareSecret) {
                    this._endWithStatus(res, 403, 'forbidden');
                    return;
                }
            }
            const token = match[1];
            const entry = this._tokenMap.get(token);
            if (!entry || (!entry.url && !entry.localPath)) {
                this._emit('runtime-proxy-miss', { token });
                // 410 rather than 404: the token was valid, it aged out of
                // `_tokenMap` (15m). The player re-requests sources on this.
                this._endWithStatus(res, 410, 'stream token expired');
                return;
            }

            // Local file share source: serve bytes off disk with Range support.
            if (entry.localPath) {
                await this._serveLocalFile(req, res, entry.localPath);
                return;
            }

            const outboundHeaders = {
                ...(entry.headers || {}),
            };
            if (!outboundHeaders['User-Agent'] && !outboundHeaders['user-agent']) {
                outboundHeaders['User-Agent'] = DEFAULT_USER_AGENT;
            }
            // Media is already compressed, and a gzipped byte-range response is a
            // mess to relay correctly. Ask for the bytes raw unless the source
            // explicitly wants otherwise, so content-length/content-range stay
            // true all the way to the player.
            if (!outboundHeaders['Accept-Encoding'] && !outboundHeaders['accept-encoding']) {
                outboundHeaders['Accept-Encoding'] = 'identity';
            }
            if (req.headers.range) outboundHeaders.Range = req.headers.range;

            // Check if this stream URL needs Cloudflare bypass
            let streamTarget;
            try {
                streamTarget = new URL(entry.url);
            } catch {
                this._endWithStatus(res, 400, 'invalid stream url');
                return;
            }
            
            const needsBypass = this._cloudflareBypassEnabled && CLOUDFLARE_DOMAINS.has(streamTarget.hostname);
            if (needsBypass) {
                try {
                    this._logger.info(`[LocalProxy] Using Cloudflare bypass (${this._bypassMode}) for stream ${streamTarget.hostname}`);
                    
                    let cookies, userAgent;
                    const FlareSolverrClientClass = require('./flaresolverr-client.cjs').FlareSolverrClient;
                    
                    if (this._bypassMode === 'flaresolverr' && this._flaresolverr.getConfig().enabled) {
                        // Use external FlareSolverr
                        const solution = await this._flaresolverr.solve(entry.url);
                        cookies = solution.cookies;
                        userAgent = solution.userAgent;
                        
                        // Convert FlareSolverr cookies to header string
                        const cookieHeader = FlareSolverrClientClass.cookiesToHeader(cookies);
                        if (cookieHeader) {
                            outboundHeaders['Cookie'] = outboundHeaders['Cookie']
                                ? `${outboundHeaders['Cookie']}; ${cookieHeader}`
                                : cookieHeader;
                        }
                    } else if (this._bypassMode === 'embedded' && this._embeddedFlaresolverr.isRunning()) {
                        // Use embedded FlareSolverr
                        const embeddedClient = new FlareSolverrClientClass(this._logger, {
                            url: this._embeddedFlaresolverr.getUrl(),
                            enabled: true
                        });
                        const solution = await embeddedClient.solve(entry.url);
                        cookies = solution.cookies;
                        userAgent = solution.userAgent;
                        
                        // Convert FlareSolverr cookies to header string
                        const cookieHeader = FlareSolverrClientClass.cookiesToHeader(cookies);
                        if (cookieHeader) {
                            outboundHeaders['Cookie'] = outboundHeaders['Cookie']
                                ? `${outboundHeaders['Cookie']}; ${cookieHeader}`
                                : cookieHeader;
                        }
                    } else {
                        // Use Playwright bypass
                        const result = await bypassCloudflare(entry.url, this._logger);
                        cookies = result.cookies;
                        userAgent = result.userAgent;
                        
                        const cookieHeader = cookiesToHeader(cookies);
                        if (cookieHeader) {
                            outboundHeaders['Cookie'] = outboundHeaders['Cookie']
                                ? `${outboundHeaders['Cookie']}; ${cookieHeader}`
                                : cookieHeader;
                        }
                    }
                    
                    if (userAgent) {
                        outboundHeaders['User-Agent'] = userAgent;
                    }
                } catch (err) {
                    this._logger.warn(`[LocalProxy] Cloudflare bypass failed for stream ${streamTarget.hostname}:`, err.message);
                }
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 18_000);
            let upstream;
            try {
                upstream = await this._fetchStreamUpstream(entry.url, outboundHeaders, controller.signal);
            } finally {
                clearTimeout(timeoutId);
            }
            this._emit('runtime-proxy-upstream', {
                status: upstream.status,
                targetHost: (() => {
                    try { return new URL(entry.url).hostname; } catch { return ''; }
                })(),
                isPlaylist: /\.m3u8($|\?)/i.test(entry.url),
            });

            const contentType = String(upstream.headers.get('content-type') || '').toLowerCase();
            const isPlaylist =
                /\.m3u8($|\?)/i.test(entry.url) ||
                contentType.includes('application/vnd.apple.mpegurl') ||
                contentType.includes('application/x-mpegurl');

            if (isPlaylist) {
                const playlistText = await upstream.text();
                // Child references inherit the parent's persistence, and carry
                // the share secret only when this playlist was fetched over the
                // tunnel (so the single-user loopback path stays secret-free).
                const shareQuery = isLoopback ? '' : `?s=${encodeURIComponent(this.getShareSecret())}`;
                const rewritten = this._rewritePlaylistUrls(playlistText, entry.url, entry.headers || {}, {
                    persistent: !!entry.persistent,
                    shareQuery,
                });
                const body = Buffer.from(rewritten, 'utf8');
                res.writeHead(upstream.status, this._corsHeaders({
                    'content-type': 'application/vnd.apple.mpegurl',
                    // The rewritten body is a different length than upstream's,
                    // and never compressed — state both explicitly so nothing is
                    // inherited from the upstream response.
                    'content-length': String(body.length),
                    'cache-control': 'no-cache',
                }));
                res.end(body);
                return;
            }

            await this._forwardResponse(res, upstream);
        } catch (err) {
            this._logger.error('[LocalProxy] request failed:', err.message);
            this._emit('runtime-proxy-error', { error: err.message });
            // Streamed responses have already written their head; only a
            // pre-body failure can still say 502. Either way the CORS headers
            // are on the response, so the player reads the status instead of a
            // CORS violation.
            const aborted = /abort/i.test(String(err?.name || err?.message || ''));
            this._endWithStatus(res, aborted ? 504 : 502, `proxy error: ${err.message}`);
        }
    }
}

module.exports = { LocalProxyServer };

