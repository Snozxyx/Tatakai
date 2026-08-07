'use strict';

const http = require('http');
const { URL } = require('url');
const crypto = require('crypto');
const { bypassCloudflare, cookiesToHeader, cleanup } = require('./cloudflare-bypass.cjs');
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
]);

class LocalProxyServer {
    constructor(logger, onEvent) {
        this._logger = logger;
        this._onEvent = typeof onEvent === 'function' ? onEvent : null;
        this._server = null;
        this._port = null;
        this._tokenMap = new Map();
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

    registerSource({ url, headers }) {
        const token = crypto.randomBytes(16).toString('hex');
        this._tokenMap.set(token, {
            url,
            headers: headers && typeof headers === 'object' ? headers : {},
            createdAt: Date.now(),
        });
        // cleanup old tokens (15m)
        const cutoff = Date.now() - 15 * 60 * 1000;
        for (const [k, v] of this._tokenMap.entries()) {
            if ((v?.createdAt || 0) < cutoff) this._tokenMap.delete(k);
        }
        return `${this.baseUrl()}/stream/${token}`;
    }

    _rewritePlaylistUrls(playlistText, playlistUrl, sourceHeaders) {
        const base = new URL(playlistUrl);
        const rewriteUrl = (targetUrl) => {
            try {
                const resolved = new URL(String(targetUrl || '').trim(), base).href;
                return this.registerSource({ url: resolved, headers: sourceHeaders });
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

    async _forwardResponse(res, upstream) {
        const passHeaders = {};
        const hop = new Set([
            'connection', 'keep-alive', 'proxy-authenticate',
            'proxy-authorization', 'te', 'trailers', 'transfer-encoding', 'upgrade',
        ]);
        upstream.headers.forEach((value, key) => {
            if (!hop.has(String(key).toLowerCase())) passHeaders[key] = value;
        });
        passHeaders['access-control-allow-origin'] = '*';
        res.writeHead(upstream.status, passHeaders);
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
            res.writeHead(400).end('invalid target url');
            return;
        }
        if (!['http:', 'https:'].includes(target.protocol)) {
            console.error('[LocalProxy] Unsupported protocol:', target.protocol);
            res.writeHead(400).end('unsupported target protocol');
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

        this._emit('runtime-proxy-extension-fetch', {
            status: upstream.status,
            method,
            targetHost: target.hostname,
            cloudflareBypass: needsBypass,
        });
        await this._forwardResponse(res, upstream);
    }

    async _handleRequest(req, res) {
        try {
            const rawUrl = req.url || '/';
            const parsed = new URL(rawUrl, this.baseUrl());
            if (parsed.pathname === '/proxy') {
                const targetUrl = parsed.searchParams.get('url');
                if (!targetUrl) {
                    res.writeHead(400).end('missing target url');
                    return;
                }
                await this._handleExtensionFetch(req, res, targetUrl);
                return;
            }
            const match = parsed.pathname.match(/^\/stream\/([a-f0-9]{32})$/i);
            if (!match) {
                res.writeHead(404).end('not found');
                return;
            }
            const token = match[1];
            const entry = this._tokenMap.get(token);
            if (!entry || !entry.url) {
                this._emit('runtime-proxy-miss', { token });
                res.writeHead(410).end('expired');
                return;
            }

            const outboundHeaders = {
                ...(entry.headers || {}),
            };
            if (!outboundHeaders['User-Agent'] && !outboundHeaders['user-agent']) {
                outboundHeaders['User-Agent'] = DEFAULT_USER_AGENT;
            }
            if (req.headers.range) outboundHeaders.Range = req.headers.range;

            // Check if this stream URL needs Cloudflare bypass
            let streamTarget;
            try {
                streamTarget = new URL(entry.url);
            } catch {
                res.writeHead(400).end('invalid stream url');
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
                upstream = await fetch(entry.url, {
                    method: 'GET',
                    headers: outboundHeaders,
                    redirect: 'follow',
                    signal: controller.signal,
                });
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
                const rewritten = this._rewritePlaylistUrls(playlistText, entry.url, entry.headers || {});
                res.writeHead(upstream.status, {
                    'content-type': 'application/vnd.apple.mpegurl',
                    'cache-control': 'no-cache',
                    'access-control-allow-origin': '*',
                });
                res.end(rewritten);
                return;
            }

            await this._forwardResponse(res, upstream);
        } catch (err) {
            this._logger.error('[LocalProxy] request failed:', err.message);
            this._emit('runtime-proxy-error', { error: err.message });
            if (!res.headersSent) res.writeHead(502);
            res.end('proxy error');
        }
    }
}

module.exports = { LocalProxyServer };

