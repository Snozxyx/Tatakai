'use strict';

const https = require('https');

// Canonical Cloudflare edge trace endpoint. Returns `key=value` lines including
// `warp=off|on|plus` and the egress `ip=`. We use it as a real connectivity /
// egress probe so `connected` reflects an actual network check rather than
// blindly mirroring the toggle. NOTE: `warp=` will read `off` unless a genuine
// WARP (WireGuard) tunnel is active on the host — see the tradeoff note in
// desktop/runtime/warp/README or docs; this class routes flagged traffic
// through the in-app local proxy egress, it does not stand up a WireGuard
// tunnel of its own.
const EGRESS_TRACE_URL = 'https://www.cloudflare.com/cdn-cgi/trace';
const PROBE_TIMEOUT_MS = 5000;

class WarpTunnel {
    constructor({ app, fs, path, logger }) {
        this._app = app;
        this._fs = fs;
        this._path = path;
        this._logger = logger;
        this._cfgPath = path.join(app.getPath('userData'), 'network.json');
        this._routingLog = [];
        this._lastProbe = null;
        this._state = this._readState();
    }

    _readState() {
        try {
            if (this._fs.existsSync(this._cfgPath)) {
                const raw = JSON.parse(this._fs.readFileSync(this._cfgPath, 'utf8'));
                return {
                    enabled: !!raw.enabled,
                    mode: ['auto', 'always', 'on-demand'].includes(raw.mode) ? raw.mode : 'auto',
                    connected: !!raw.connected,
                    routeExtensions: raw.routeExtensions !== false,
                    routeTorrent: raw.routeTorrent !== false,
                };
            }
        } catch (_) {}
        return { enabled: false, mode: 'auto', connected: false, routeExtensions: true, routeTorrent: true };
    }

    _persist() {
        try {
            this._fs.writeFileSync(this._cfgPath, JSON.stringify(this._state, null, 2), 'utf8');
        } catch (e) {
            this._logger.error('[WARP] persist failed:', e.message);
        }
    }

    // Real egress probe. Resolves to { ok, warp, ip, loc, error, at } and never
    // rejects, so callers can treat it as a connectivity signal.
    _probeEgress() {
        return new Promise((resolve) => {
            const done = (result) => resolve({ at: Date.now(), ...result });
            let req;
            try {
                req = https.get(EGRESS_TRACE_URL, { timeout: PROBE_TIMEOUT_MS }, (res) => {
                    if (res.statusCode !== 200) {
                        res.resume();
                        return done({ ok: false, error: `HTTP ${res.statusCode}` });
                    }
                    let body = '';
                    res.setEncoding('utf8');
                    res.on('data', (c) => { body += c; if (body.length > 4096) req.destroy(); });
                    res.on('end', () => {
                        const kv = {};
                        for (const line of body.split('\n')) {
                            const i = line.indexOf('=');
                            if (i > 0) kv[line.slice(0, i)] = line.slice(i + 1);
                        }
                        done({ ok: true, warp: kv.warp, ip: kv.ip, loc: kv.loc });
                    });
                });
            } catch (e) {
                return done({ ok: false, error: e.message });
            }
            req.on('timeout', () => { req.destroy(); done({ ok: false, error: 'timeout' }); });
            req.on('error', (e) => done({ ok: false, error: e.message }));
        });
    }

    async getStatus() {
        return {
            enabled: this._state.enabled,
            mode: this._state.mode,
            connected: this._state.connected,
            routeExtensions: this._state.routeExtensions,
            routeTorrent: this._state.routeTorrent,
            egressCity: this._state.connected ? (this._lastProbe?.loc || 'auto-egress') : undefined,
            warpEgress: this._lastProbe?.warp,
            egressIp: this._state.connected ? this._lastProbe?.ip : undefined,
            probedAt: this._lastProbe?.at,
            lastError: this._lastProbe && this._lastProbe.ok === false ? this._lastProbe.error : undefined,
        };
    }

    async toggle(enabled) {
        this._state.enabled = !!enabled;
        if (this._state.enabled) {
            // Only claim "connected" if a live egress probe actually succeeds.
            this._lastProbe = await this._probeEgress();
            this._state.connected = !!this._lastProbe.ok;
            if (!this._lastProbe.ok) {
                this._logger.warn(`[WARP] egress probe failed: ${this._lastProbe.error}`);
            } else {
                this._logger.info(`[WARP] egress reachable (warp=${this._lastProbe.warp}, ip=${this._lastProbe.ip})`);
            }
        } else {
            this._state.connected = false;
        }
        this._persist();
        return { success: true, ...(await this.getStatus()) };
    }

    async setMode(mode) {
        this._state.mode = ['auto', 'always', 'on-demand'].includes(mode) ? mode : 'auto';
        this._persist();
        return { success: true, ...(await this.getStatus()) };
    }

    setRouting({ routeExtensions, routeTorrent } = {}) {
        if (typeof routeExtensions === 'boolean') this._state.routeExtensions = routeExtensions;
        if (typeof routeTorrent === 'boolean') this._state.routeTorrent = routeTorrent;
        this._persist();
        return this.getStatus();
    }

    // Consumed by the extension source-resolve path: true when WARP is on, its
    // policy would route this host, and extension routing is enabled.
    routesExtensions(url) {
        return this._state.enabled && this._state.routeExtensions && this.shouldRoute(url, 'extension');
    }

    routesTorrent(url) {
        return this._state.enabled && this._state.routeTorrent && this.shouldRoute(url, 'torrent');
    }

    shouldRoute(url, context = 'extension') {
        const host = (() => {
            try { return new URL(url).hostname.toLowerCase(); } catch { return ''; }
        })();
        const blockedHint = host.includes('cloudflare') || host.includes('nyaa') || host.includes('megacloud');
        const should =
            this._state.enabled &&
            (this._state.mode === 'always' || (this._state.mode === 'auto' && blockedHint));
        this._routingLog.unshift({
            ts: Date.now(),
            host,
            context,
            routed: should,
            mode: this._state.mode,
        });
        this._routingLog = this._routingLog.slice(0, 200);
        return should;
    }

    getRoutingLog() {
        return this._routingLog.slice(0, 100);
    }
}

module.exports = { WarpTunnel };
