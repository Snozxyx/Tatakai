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

    ipcMain.handle('media:probe', async (_event, url) => {
        return service.probe(url);
    });

    ipcMain.handle('media:extract-subtitle', async (_event, url, trackIndex) => {
        const fileName = `sub-${Date.now()}-${trackIndex}.vtt`;
        const outputPath = path.join(tempDir, fileName);
        const result = await service.extractSubtitle(url, trackIndex, outputPath);
        
        if (result.success) {
            // Return the local file path which can be loaded via file:// protocol
            return { success: true, url: `file:///${outputPath.replace(/\\/g, '/')}` };
        }
        return result;
    });

    ipcMain.handle('media:extract-audio-track', async (_event, url, trackIndex) => {
        const fileName = `audio-${Date.now()}-${trackIndex}.m4a`;
        const outputPath = path.join(tempDir, fileName);
        const result = await service.extractAudioTrack(url, trackIndex, outputPath);

        if (result.success) {
            return { success: true, url: `file:///${outputPath.replace(/\\/g, '/')}` };
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

    function isAllowedTextAsset(filePath) {
        const ext = path.extname(filePath).toLowerCase();
        // Only allow subtitle/text file types — no security risk to read text files
        return ['.vtt', '.srt', '.ass', '.ssa', '.txt'].includes(ext);
    }

    // Read local subtitles and return as data URL for browser-safe loading.
    ipcMain.handle('media:read-local-file', async (_event, filePath) => {
        try {
            const normalizedPath = fileUrlToPath(filePath);

            if (!isAllowedTextAsset(normalizedPath)) {
                return { success: false, error: 'Access denied: subtitles must be inside Tatakai library or temp media folder' };
            }

            const content = await fs.promises.readFile(normalizedPath, 'utf8');
            // Return as data URL
            const dataUrl = `data:text/vtt;charset=utf-8,${encodeURIComponent(content)}`;
            return { success: true, url: dataUrl };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });
};
