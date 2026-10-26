'use strict';

const { MediaProbeService } = require('../services/media-probe.cjs');
const path = require('path');
const fs = require('fs');

module.exports = function registerMediaHandlers(ipcMain, app, logger) {
    const service = new MediaProbeService(logger);
    const tempDir = path.join(app.getPath('temp'), 'tatakai-media');
    const downloadsRoot = path.join(app.getPath('videos'), 'Tatakai');

    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }

    // SEC audit finding DESK-7: these handlers hand the caller's string straight
    // to fluent-ffmpeg, which speaks far more "protocols" than http(s) —
    // `concat:`, `subfile:`, `pipe:` and `file:` can be used to make ffmpeg read
    // local files (or probe arbitrary internal endpoints). Only the schemes the
    // player actually produces are accepted.
    const ALLOWED_MEDIA_SCHEMES = new Set(['http:', 'https:', 'file:', 'tatakai-media:']);
    function checkMediaInput(value) {
        const raw = String(value || '').trim();
        if (!raw) return { ok: false, error: 'missing media url' };
        // A plain absolute path (offline library / imported file) is a legitimate
        // input; ffmpeg only sees it as a path, not as a protocol.
        if (path.isAbsolute(raw) && !/^[a-z0-9+.-]+:\/\//i.test(raw)) return { ok: true };
        // Reject ffmpeg protocol prefixes that look like `scheme:` but are not URLs.
        if (/^[a-z0-9+.-]+:(?!\/\/)/i.test(raw) && !/^[A-Za-z]:[\\/]/.test(raw)) {
            return { ok: false, error: 'unsupported media input' };
        }
        let parsed;
        try {
            parsed = new URL(raw);
        } catch {
            return { ok: false, error: 'invalid media url' };
        }
        if (!ALLOWED_MEDIA_SCHEMES.has(parsed.protocol)) {
            return { ok: false, error: 'unsupported media protocol' };
        }
        return { ok: true };
    }

    ipcMain.handle('media:probe', async (_event, url) => {
        const check = checkMediaInput(url);
        if (!check.ok) return { success: false, error: check.error };
        return service.probe(url);
    });

    ipcMain.handle('media:extract-subtitle', async (_event, url, trackIndex) => {
        const check = checkMediaInput(url);
        if (!check.ok) return { success: false, error: check.error };
        const fileName = `sub-${Date.now()}-${trackIndex}.vtt`;
        const outputPath = path.join(tempDir, fileName);
        const result = await service.extractSubtitle(url, trackIndex, outputPath);
        
        if (result.success) {
            try {
                const content = await fs.promises.readFile(outputPath, 'utf8');
                const dataUrl = `data:text/vtt;charset=utf-8,${encodeURIComponent(content)}`;
                await fs.promises.unlink(outputPath).catch(() => {});
                return { success: true, url: dataUrl };
            } catch {
                const normalizedPath = outputPath.replace(/\\/g, '/');
                return { success: true, url: `tatakai-media:///${normalizedPath}` };
            }
        }
        return result;
    });

    ipcMain.handle('media:extract-audio-track', async (_event, url, trackIndex) => {
        const check = checkMediaInput(url);
        if (!check.ok) return { success: false, error: check.error };
        const fileName = `audio-${Date.now()}-${trackIndex}.m4a`;
        const outputPath = path.join(tempDir, fileName);
        const result = await service.extractAudioTrack(url, trackIndex, outputPath);

        if (result.success) {
            // Serve via the tatakai-media:// custom protocol, not file:// — the
            // renderer runs with webSecurity on and refuses to load file:/// local
            // resources (same reason video/subtitles/posters go through this scheme).
            const normalizedPath = outputPath.replace(/\\/g, '/');
            return { success: true, url: `tatakai-media:///${normalizedPath}` };
        }
        return result;
    });

    function fileUrlToPath(value) {
        let actualPath = String(value || '');
        // Handle tatakai-media:// custom protocol
        if (actualPath.startsWith('tatakai-media:///')) {
            actualPath = actualPath.substring('tatakai-media:///'.length);
        } else if (actualPath.startsWith('tatakai-media://')) {
            actualPath = actualPath.substring('tatakai-media://'.length);
        } else if (actualPath.startsWith('file:///')) {
            actualPath = actualPath.substring(8);
        } else if (actualPath.startsWith('file://')) {
            actualPath = actualPath.substring(7);
        }
        try {
            actualPath = decodeURIComponent(actualPath);
        } catch {
            // Keep the original path when it is not percent-encoded.
        }
        if (process.platform === 'win32') {
            actualPath = actualPath.replace(/\//g, '\\');
        }
        return path.normalize(actualPath);
    }

    const TEXT_ASSET_EXTENSIONS = ['.vtt', '.srt', '.ass', '.ssa', '.txt'];
    const MAX_TEXT_ASSET_BYTES = 8 * 1024 * 1024;

    function isAllowedTextAsset(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        // Only allow subtitle/text file types.
        return TEXT_ASSET_EXTENSIONS.includes(ext);
    }

    /**
     * Paths this bridge must never read, whatever their extension: credential
     * stores, SSH/GPG material, dot-directories in the home folder and the
     * operating system's secret stores. SEC audit finding DESK-8 — the handler
     * is reachable from renderer code, so it must not be a generic text-file
     * reader for the whole disk.
     */
    function isSensitivePath(filePath) {
        const normalized = path.resolve(filePath);
        const home = app.getPath('home');
        const segments = normalized.split(path.sep).map((s) => s.toLowerCase());
        if (segments.some((s) => s === '.ssh' || s === '.gnupg' || s === '.aws' || s === '.config' || s === '.kube' || s === '.docker' || s === '.npmrc' || s === '.env')) {
            return true;
        }
        const sensitiveRoots = [
            path.join(home, 'Library', 'Keychains'),
            path.join(home, 'AppData', 'Roaming', 'Microsoft', 'Credentials'),
            path.join(home, '.local', 'share', 'keyrings'),
            '/etc',
            '/var/root',
        ].map((p) => path.resolve(p));
        return sensitiveRoots.some((root) => normalized === root || normalized.startsWith(root + path.sep));
    }

    // Read local subtitles and return as data URL for browser-safe loading.
    ipcMain.handle('media:read-local-file', async (_event, filePath) => {
        try {
            const normalizedPath = fileUrlToPath(filePath);

            if (!isAllowedTextAsset(normalizedPath)) {
                return { success: false, error: 'Access denied: unsupported file type' };
            }
            if (isSensitivePath(normalizedPath)) {
                logger.warn('[media] Refused to read a sensitive path');
                return { success: false, error: 'Access denied: sensitive location' };
            }
            try {
                const stat = await fs.promises.stat(normalizedPath);
                if (!stat.isFile()) return { success: false, error: 'Access denied: not a file' };
                if (stat.size > MAX_TEXT_ASSET_BYTES) {
                    return { success: false, error: 'Access denied: file too large' };
                }
            } catch {
                return { success: false, error: 'File not found' };
            }

            const { normalizeSubtitleToVtt } = await import('../../src/core/player/subtitle-core.js');
            const content = normalizeSubtitleToVtt(await fs.promises.readFile(normalizedPath, 'utf8'));
            if (!content || !content.includes('-->')) return { success: false, error: 'Subtitle contains no readable cues' };
            // Return as data URL
            const dataUrl = `data:text/vtt;charset=utf-8,${encodeURIComponent(content)}`;
            return { success: true, url: dataUrl };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });
};
