'use strict';

class TorrentCacheManager {
    constructor({ app, fs, path, maxBytes, root }) {
        const overrideRoot = typeof root === 'string' && root.trim() ? root.trim() : null;
        this._root = overrideRoot || path.join(app.getPath('userData'), 'torrent_cache');
        this._fs = fs;
        this._path = path;
        this._maxBytes = maxBytes || 50 * 1024 * 1024 * 1024;
        if (!fs.existsSync(this._root)) fs.mkdirSync(this._root, { recursive: true });
    }

    getRoot() {
        return this._root;
    }

    _scanBytes(dirPath) {
        let total = 0;
        for (const entry of this._fs.readdirSync(dirPath, { withFileTypes: true })) {
            const p = this._path.join(dirPath, entry.name);
            if (entry.isDirectory()) total += this._scanBytes(p);
            else if (entry.isFile()) {
                try { total += this._fs.statSync(p).size; } catch (_) {}
            }
        }
        return total;
    }

    getUsage() {
        try {
            return {
                root: this._root,
                totalBytes: this._scanBytes(this._root),
                maxBytes: this._maxBytes,
            };
        } catch {
            return { root: this._root, totalBytes: 0, maxBytes: this._maxBytes };
        }
    }

    /** LRU-like eviction by mtime across top-level children. */
    evictIfNeeded(options = {}) {
        const maxBytes = Number.isFinite(Number(options.maxBytes)) && Number(options.maxBytes) > 0
            ? Number(options.maxBytes)
            : this._maxBytes;
        const activePaths = new Set((options.activePaths || []).map((value) => this._path.resolve(String(value || ''))));
        const currentBytes = this._scanBytes(this._root);
        if (currentBytes <= maxBytes) return { evicted: 0, currentBytes };
        const children = this._fs.readdirSync(this._root).map((name) => {
            const full = this._path.join(this._root, name);
            let mtime = 0;
            try { mtime = this._fs.statSync(full).mtimeMs || 0; } catch (_) {}
            return { name, full, mtime };
        }).sort((a, b) => a.mtime - b.mtime);
        let evicted = 0;
        for (const child of children) {
            const resolved = this._path.resolve(child.full);
            if (activePaths.has(resolved)) continue;
            try {
                this._fs.rmSync(child.full, { recursive: true, force: true });
                evicted += 1;
                if (this._scanBytes(this._root) <= maxBytes) break;
            } catch (_) {}
        }
        return { evicted, currentBytes: this._scanBytes(this._root) };
    }

    cleanupUnused({ maxAgeMs = 0, maxBytes, activePaths = [] } = {}) {
        const active = new Set(activePaths.map((value) => this._path.resolve(String(value || ''))));
        const root = this._path.resolve(this._root);
        const now = Date.now();
        let evicted = 0;

        for (const name of this._fs.readdirSync(this._root)) {
            const full = this._path.join(this._root, name);
            const resolved = this._path.resolve(full);
            if (!resolved.startsWith(root) || active.has(resolved)) continue;

            try {
                const stat = this._fs.statSync(full);
                const ageMs = now - (stat.mtimeMs || stat.ctimeMs || now);
                if (maxAgeMs > 0 && ageMs >= maxAgeMs) {
                    this._fs.rmSync(full, { recursive: true, force: true });
                    evicted += 1;
                }
            } catch (_) {}
        }

        const sizeResult = this.evictIfNeeded({ maxBytes, activePaths });
        return {
            evicted: evicted + (sizeResult.evicted || 0),
            currentBytes: this._scanBytes(this._root),
        };
    }
}

module.exports = { TorrentCacheManager };
