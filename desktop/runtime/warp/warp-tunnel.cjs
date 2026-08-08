'use strict';

class WarpTunnel {
    constructor({ app, fs, path, logger }) {
        this._app = app;
        this._fs = fs;
        this._path = path;
        this._logger = logger;
        this._cfgPath = path.join(app.getPath('userData'), 'network.json');
        this._routingLog = [];
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

    async getStatus() {
        return {
            enabled: this._state.enabled,
            mode: this._state.mode,
            connected: this._state.connected,
            routeExtensions: this._state.routeExtensions,
            routeTorrent: this._state.routeTorrent,
            egressCity: this._state.connected ? 'auto-egress' : undefined,
        };
    }

    async toggle(enabled) {
        this._state.enabled = !!enabled;
        this._state.connected = !!enabled;
        this._persist();
        return { success: true, ...(await this.getStatus()) };
    }

    async setMode(mode) {
        this._state.mode = ['auto', 'always', 'on-demand'].includes(mode) ? mode : 'auto';
        this._persist();
        return { success: true, ...(await this.getStatus()) };
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

