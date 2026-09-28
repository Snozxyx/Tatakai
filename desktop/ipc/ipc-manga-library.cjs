'use strict';

/**
 * Offline manga library IPC — reads the on-disk series/chapter manifests written
 * by ipc-manga-download-manager.cjs and serves downloaded pages back to the
 * reader through the existing `tatakai-media://` protocol (no raw file paths
 * cross into the renderer for image loading).
 *
 * Channels:
 *   manga:get-offline-library  (customRoot?)            → OfflineSeries[]
 *   manga:get-offline-pages    ({ anilistId, chapterKey, customRoot? })
 *   manga:delete-chapter       ({ anilistId, chapterKey, customRoot? })
 *   manga:delete-series        ({ anilistId, customRoot? })
 *   manga:open-folder          ({ anilistId?, customRoot? })
 */

const IMAGE_RE = /\.(jpe?g|png|webp|gif|avif|bmp)$/i;

function sanitizeName(name) {
    return (
        String(name || 'Untitled')
            .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
            .replace(/\s+/g, ' ')
            .trim() || 'Untitled'
    );
}

function toMediaUrl(absPath) {
    return `tatakai-media:///${absPath.replace(/\\/g, '/')}`;
}

module.exports = function registerMangaLibraryHandlers(ipcMain, app, shell, fs, path, logger) {
    const mangaRoot = (customRoot) => {
        const base = customRoot && String(customRoot).trim()
            ? String(customRoot).trim()
            : path.join(app.getPath('videos'), 'Tatakai');
        return path.join(base, 'Manga');
    };

    const readSeriesManifest = (seriesDir) => {
        const mp = path.join(seriesDir, 'manifest.json');
        if (!fs.existsSync(mp)) return null;
        try {
            return JSON.parse(fs.readFileSync(mp, 'utf8'));
        } catch (_) {
            return null;
        }
    };

    /** Locate a series dir by anilistId under the manga root. */
    const findSeriesDir = (root, anilistId) => {
        if (!fs.existsSync(root)) return null;
        for (const name of fs.readdirSync(root)) {
            const dir = path.join(root, name);
            try {
                if (!fs.statSync(dir).isDirectory()) continue;
            } catch (_) {
                continue;
            }
            const manifest = readSeriesManifest(dir);
            if (manifest && Number(manifest.anilistId) === Number(anilistId)) {
                return { dir, manifest };
            }
        }
        return null;
    };
    // __APPEND_MARKER__

    ipcMain.handle('manga:get-offline-library', async (_event, customRoot) => {
        const root = mangaRoot(customRoot);
        if (!fs.existsSync(root)) return [];
        const library = [];
        for (const name of fs.readdirSync(root)) {
            const seriesDir = path.join(root, name);
            try {
                if (!fs.statSync(seriesDir).isDirectory()) continue;
            } catch (_) {
                continue;
            }
            const manifest = readSeriesManifest(seriesDir);
            if (!manifest) continue;
            // Validate each chapter's page files still exist on disk.
            const chapters = [];
            for (const ch of Array.isArray(manifest.chapters) ? manifest.chapters : []) {
                const chapDir = path.join(seriesDir, ch.dir || '');
                if (!ch.dir || !fs.existsSync(chapDir)) continue;
                let pageCount = 0;
                try {
                    pageCount = fs.readdirSync(chapDir).filter((f) => IMAGE_RE.test(f)).length;
                } catch (_) { /* empty */ }
                if (pageCount === 0) continue;
                chapters.push({ ...ch, pageCount });
            }
            if (chapters.length === 0) continue;
            let poster = null;
            const posterPath = path.join(seriesDir, 'poster.jpg');
            if (fs.existsSync(posterPath)) poster = toMediaUrl(posterPath);
            library.push({
                anilistId: manifest.anilistId,
                title: manifest.title || name,
                posterUrl: manifest.posterUrl || null,
                kind: manifest.kind || 'manga',
                poster,
                path: seriesDir,
                chapters: chapters.sort(
                    (a, b) => Number(a.chapterNumber ?? 0) - Number(b.chapterNumber ?? 0),
                ),
                chapterCount: chapters.length,
            });
        }
        return library;
    });

    ipcMain.handle('manga:get-offline-pages', async (_event, params) => {
        const { anilistId, chapterKey, customRoot } = params || {};
        const root = mangaRoot(customRoot);
        const found = findSeriesDir(root, anilistId);
        if (!found) return { success: false, error: 'series_not_found', pages: [] };
        const chapterRow = (found.manifest.chapters || []).find((c) => c.chapterKey === chapterKey);
        if (!chapterRow || !chapterRow.dir) return { success: false, error: 'chapter_not_found', pages: [] };
        const chapDir = path.join(found.dir, chapterRow.dir);
        if (!fs.existsSync(chapDir)) return { success: false, error: 'chapter_missing', pages: [] };

        // Prefer the chapter manifest's page order; fall back to a sorted dir scan.
        let files = [];
        const chapManifestPath = path.join(chapDir, 'manifest.json');
        if (fs.existsSync(chapManifestPath)) {
            try {
                const cm = JSON.parse(fs.readFileSync(chapManifestPath, 'utf8'));
                files = (cm.pages || []).map((p) => p.file).filter(Boolean);
            } catch (_) { /* empty */ }
        }
        if (files.length === 0) {
            files = fs
                .readdirSync(chapDir)
                .filter((f) => IMAGE_RE.test(f))
                .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        }
        const pages = files.map((file, i) => ({
            pageNumber: i + 1,
            imageUrl: toMediaUrl(path.join(chapDir, file)),
        }));
        return { success: true, pages, title: found.manifest.title, chapterNumber: chapterRow.chapterNumber ?? null };
    });

    ipcMain.handle('manga:delete-chapter', async (_event, params) => {
        const { anilistId, chapterKey, customRoot } = params || {};
        const root = mangaRoot(customRoot);
        const found = findSeriesDir(root, anilistId);
        if (!found) return { success: false, error: 'series_not_found' };
        try {
            const chapterRow = (found.manifest.chapters || []).find((c) => c.chapterKey === chapterKey);
            if (chapterRow?.dir) {
                const chapDir = path.join(found.dir, chapterRow.dir);
                if (fs.existsSync(chapDir)) fs.rmSync(chapDir, { recursive: true, force: true });
            }
            const remaining = (found.manifest.chapters || []).filter((c) => c.chapterKey !== chapterKey);
            if (remaining.length === 0) {
                fs.rmSync(found.dir, { recursive: true, force: true });
            } else {
                found.manifest.chapters = remaining;
                fs.writeFileSync(path.join(found.dir, 'manifest.json'), JSON.stringify(found.manifest, null, 2));
            }
            return { success: true, remaining: remaining.length };
        } catch (err) {
            logger.error('[MangaLibrary] delete-chapter failed:', err.message);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('manga:delete-series', async (_event, params) => {
        const { anilistId, customRoot } = params || {};
        const root = mangaRoot(customRoot);
        const found = findSeriesDir(root, anilistId);
        if (!found) return { success: false, error: 'series_not_found' };
        try {
            fs.rmSync(found.dir, { recursive: true, force: true });
            return { success: true };
        } catch (err) {
            logger.error('[MangaLibrary] delete-series failed:', err.message);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('manga:open-folder', async (_event, params) => {
        const { anilistId, customRoot } = params || {};
        const root = mangaRoot(customRoot);
        if (anilistId != null) {
            const found = findSeriesDir(root, anilistId);
            if (found) {
                await shell.openPath(found.dir);
                return { success: true };
            }
        }
        if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });
        await shell.openPath(root);
        return { success: true };
    });

};
