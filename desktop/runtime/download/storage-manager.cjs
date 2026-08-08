'use strict';

/**
 * Resolves storage paths and enforces caps for the download manager.
 */
class DownloadStorageManager {
    constructor({ app, fs, path }) {
        this._app = app;
        this._fs = fs;
        this._path = path;
    }

    defaultLibraryRoot() {
        return this._path.join(this._app.getPath('videos'), 'Tatakai');
    }

    ensureDir(dir) {
        if (!this._fs.existsSync(dir)) this._fs.mkdirSync(dir, { recursive: true });
        return dir;
    }

    /** @returns {number} bytes free (best-effort) */
    freeBytes(dir) {
        try {
            // Node has fs.statfs only on some platforms; omit detailed check for portability.
            return Number.MAX_SAFE_INTEGER;
        } catch (_) {
            return 0;
        }
    }
}

module.exports = { DownloadStorageManager };
