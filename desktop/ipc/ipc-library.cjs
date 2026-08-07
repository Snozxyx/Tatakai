'use strict';

/**
 * Offline library: folder picker, manifests, import/repair/delete.
 * Episode HLS downloads live in ipc-download-manager.cjs.
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { scanDirectoryForVideos } = require('../runtime/library/file-scanner.cjs');
const { identifyMediaFiles, groupMediaBySeries } = require('../runtime/library/media-identifier.cjs');

const VIDEO_EXTENSIONS = new Set(['.mp4', '.mkv', '.avi', '.webm', '.mov', '.m4v']);

// ── Local media stream server ────────────────────────────────────────────────
// A lightweight HTTP server that streams local video files with Range request
// support. Chromium requires HTTP (not file://) for MKV/AVI to work correctly.

let mediaStreamServer = null;
let mediaStreamPort = null;
const MEDIA_STREAM_HOST = '127.0.0.1';
const MEDIA_STREAM_PORT_BASE = 18989;

function guessVideoMime(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.mp4' || ext === '.m4v') return 'video/mp4';
    if (ext === '.webm') return 'video/webm';
    if (ext === '.mkv') return 'video/x-matroska';
    if (ext === '.avi') return 'video/x-msvideo';
    if (ext === '.mov') return 'video/quicktime';
    if (ext === '.vtt') return 'text/vtt; charset=utf-8';
    if (ext === '.srt') return 'text/plain; charset=utf-8';
    if (ext === '.ass' || ext === '.ssa') return 'text/plain; charset=utf-8';
    if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
    if (ext === '.png') return 'image/png';
    if (ext === '.webp') return 'image/webp';
    return 'application/octet-stream';
}

function ensureMediaStreamServer() {
    if (mediaStreamServer) return Promise.resolve(mediaStreamPort);
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            // Decode the file path from the URL: /stream/<base64-encoded-absolute-path>
            const match = req.url.match(/^\/stream\/(.+)$/);
            if (!match) { res.writeHead(400); res.end('Bad Request'); return; }

            let filePath;
            try {
                filePath = Buffer.from(decodeURIComponent(match[1]), 'base64').toString('utf8');
            } catch {
                res.writeHead(400); res.end('Bad Request'); return;
            }

            if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('Not Found'); return; }

            const stat = fs.statSync(filePath);
            const total = stat.size;
            const mimeType = guessVideoMime(filePath);
            const rangeHeader = req.headers.range;

            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Content-Type', mimeType);

            if (rangeHeader) {
                const parts = rangeHeader.replace(/bytes=/, '').split('-');
                const start = parseInt(parts[0], 10);
                const end = parts[1] ? parseInt(parts[1], 10) : total - 1;
                if (start >= total) {
                    res.writeHead(416, { 'Content-Range': `bytes */${total}` });
                    res.end();
                    return;
                }
                const chunkSize = end - start + 1;
                res.writeHead(206, {
                    'Content-Range': `bytes ${start}-${end}/${total}`,
                    'Content-Length': chunkSize,
                });
                fs.createReadStream(filePath, { start, end }).pipe(res);
            } else {
                res.writeHead(200, { 'Content-Length': total });
                fs.createReadStream(filePath).pipe(res);
            }
        });

        server.listen(MEDIA_STREAM_PORT_BASE, MEDIA_STREAM_HOST, () => {
            mediaStreamServer = server;
            mediaStreamPort = MEDIA_STREAM_PORT_BASE;
            resolve(mediaStreamPort);
        });
        server.on('error', (err) => {
            // Port in use — try a different one
            if (err.code === 'EADDRINUSE') {
                const fallbackPort = MEDIA_STREAM_PORT_BASE + Math.floor(Math.random() * 1000);
                server.listen(fallbackPort, MEDIA_STREAM_HOST, () => {
                    mediaStreamServer = server;
                    mediaStreamPort = fallbackPort;
                    resolve(mediaStreamPort);
                });
            } else {
                reject(err);
            }
        });
    });
}

function localFileToStreamUrl(filePath, port) {
    const encoded = encodeURIComponent(Buffer.from(filePath).toString('base64'));
    return `http://${MEDIA_STREAM_HOST}:${port}/stream/${encoded}`;
}

function isVideoFile(filePath) {
    return VIDEO_EXTENSIONS.has(path.extname(String(filePath || '')).toLowerCase());
}

function cleanPathSegment(value, fallback = 'Imported Videos') {
    const cleaned = String(value || fallback)
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[. ]+$/g, '');
    return cleaned || fallback;
}

async function downloadFile(url, outputPath, options = {}) {
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        if (stats.size > 0) return outputPath;
    }

    const writer = fs.createWriteStream(outputPath);
    try {
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream',
            timeout: options.timeout || 30000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': '*/*',
                ...options.headers,
            },
            maxRedirects: 5,
            validateStatus: (s) => s >= 200 && s < 400,
        });

        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => {
                if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
                    resolve(outputPath);
                } else {
                    if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                    reject(new Error('Downloaded file is empty'));
                }
            });
            writer.on('error', (err) => {
                writer.destroy();
                if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
                reject(err);
            });
            response.data.on('error', (err) => {
                writer.destroy();
                reject(err);
            });
        });
    } catch (error) {
        writer.destroy();
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
        throw error;
    }
}

module.exports = function registerLibraryHandlers(ipcMain, app, dialog, shell, fs, path, logger, getMainWindow) {
    ipcMain.handle('select-directory', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog(getMainWindow(), { properties: ['openDirectory'] });
        return canceled ? null : filePaths[0];
    });

    ipcMain.handle('select-file', async (_event, options = {}) => {
        const { canceled, filePaths } = await dialog.showOpenDialog(getMainWindow(), {
            title: options.title || 'Select File',
            filters: options.filters || [],
            properties: ['openFile'],
        });
        return canceled ? null : filePaths[0];
    });

    ipcMain.handle('get-downloads-dir', async (_event, customPath) => {
        return customPath || path.join(app.getPath('videos'), 'Tatakai');
    });

    ipcMain.handle('scan-local-library', async (_event, directoryPath) => {
        try {
            if (!directoryPath || !fs.existsSync(directoryPath)) {
                return { success: false, error: 'Invalid directory path' };
            }

            const videoFiles = await scanDirectoryForVideos(directoryPath);
            const identified = identifyMediaFiles(videoFiles);
            const grouped = groupMediaBySeries(identified);

            return {
                success: true,
                directory: directoryPath,
                totalFiles: videoFiles.length,
                seriesCount: Object.keys(grouped).length,
                series: grouped
            };
        } catch (error) {
            logger.error('[Library] Scan failed:', error.message);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('get-offline-library', async (_event, customPath) => {
        const downloadPath = customPath || path.join(app.getPath('videos'), 'Tatakai');
        if (!fs.existsSync(downloadPath)) return [];

        const library = [];
        const animeDirs = fs.readdirSync(downloadPath).filter((f) => fs.statSync(path.join(downloadPath, f)).isDirectory());

        for (const dirName of animeDirs) {
            const animeDir = path.join(downloadPath, dirName);
            const manifestPath = path.join(animeDir, 'manifest.json');
            const videoFiles = fs.readdirSync(animeDir).filter((f) => isVideoFile(f));
            
            if (videoFiles.length === 0) continue;

            try {
                let manifest = { animeName: dirName, episodes: [] };
                if (fs.existsSync(manifestPath)) {
                    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                } else {
                    // No manifest? Try to build one on the fly using the name parser
                    const { identifyMediaFiles } = require('../runtime/library/media-identifier.cjs');
                    const identified = identifyMediaFiles(videoFiles.map(f => path.join(animeDir, f)));
                    manifest.episodes = identified.map((file, i) => ({
                        id: `auto-${dirName}-${i}`,
                        number: file.episode || (i + 1),
                        file: file.fileName,
                        addedAt: new Date().toISOString(),
                        synced: true
                    }));
                }

                const posterPath = path.join(animeDir, 'poster.jpg');
                const validEpisodes = (manifest.episodes || []).filter((ep) => {
                    const vp = path.join(animeDir, ep.file);
                    return fs.existsSync(vp) && fs.statSync(vp).size > 1024;
                });

                if (validEpisodes.length > 0 || manifest.episodes?.length > 0) {
                    // Return poster as tatakai-media:// URL for Electron renderer
                    // (tatakai-media:// protocol bypasses webSecurity for local images)
                    let posterUrl = null;
                    if (fs.existsSync(posterPath)) {
                        const normalizedPoster = posterPath.replace(/\\/g, '/');
                        posterUrl = `tatakai-media:///${normalizedPoster}`;
                    }
                    library.push({
                        name: manifest.animeName || dirName,
                        path: animeDir,
                        poster: posterUrl,
                        posterUrl: manifest.posterUrl || null,
                        episodes: validEpisodes.length > 0 ? validEpisodes : manifest.episodes || [],
                        totalEpisodes: manifest.episodes?.length || 0,
                        downloadedEpisodes: validEpisodes.length,
                    });
                }
            } catch (err) {
                logger.error(`[Library] Error reading/syncing ${dirName}:`, err.message);
            }
        }
        return library;
    });

    ipcMain.handle('sync-offline-library', async (_event, customPath) => {
        const downloadPath = customPath || path.join(app.getPath('videos'), 'Tatakai');
        if (!fs.existsSync(downloadPath)) {
            fs.mkdirSync(downloadPath, { recursive: true });
            return { synced: 0, total: 0, message: 'Download folder created' };
        }

        let synced = 0;
        let total = 0;
        const results = [];
        const animeDirs = fs.readdirSync(downloadPath).filter((f) => fs.statSync(path.join(downloadPath, f)).isDirectory());

        for (const dirName of animeDirs) {
            const animeDir = path.join(downloadPath, dirName);
            const manifestPath = path.join(animeDir, 'manifest.json');
            const videoFiles = fs.readdirSync(animeDir).filter((f) => isVideoFile(f));
            if (videoFiles.length === 0) continue;
            total += videoFiles.length;

            let manifest = { animeName: dirName, episodes: [] };
            if (fs.existsSync(manifestPath)) {
                try {
                    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                } catch (_) { /* empty */ }
            }

            const { identifyMediaFiles } = require('../runtime/library/media-identifier.cjs');
            const identified = identifyMediaFiles(videoFiles.map(f => path.join(animeDir, f)));

            for (const file of identified) {
                const videoFile = file.fileName;
                const stats = fs.statSync(file.absolutePath);
                if (stats.size < 1024 * 1024) continue;
                
                const episodeNumber = file.episode || (identified.indexOf(file) + 1);
                
                if (!manifest.episodes.find((e) => e.file === videoFile || e.number === episodeNumber)) {
                    manifest.episodes.push({
                        id: `${dirName.toLowerCase().replace(/\s+/g, '-')}-ep-${episodeNumber}`,
                        number: episodeNumber,
                        file: videoFile,
                        addedAt: new Date().toISOString(),
                        size: stats.size,
                        synced: true,
                    });
                    synced++;
                }
            }
            manifest.episodes.sort((a, b) => a.number - b.number);
            fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
            results.push({ name: dirName, episodes: manifest.episodes.length, newlyAdded: synced });
        }

        return {
            synced,
            total,
            results,
            message: synced > 0 ? `Found and added ${synced} episode(s) to your library!` : 'Library is already up to date',
        };
    });

    ipcMain.handle('import-video-files', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog(getMainWindow(), {
            title: 'Import Video Files',
            filters: [{ name: 'Video Files', extensions: ['mp4', 'mkv', 'webm', 'avi', 'mov', 'm4v'] }],
            properties: ['openFile', 'multiSelections'],
        });
        if (canceled || filePaths.length === 0) return { success: false, message: 'No files selected' };

        const downloadPath = path.join(app.getPath('videos'), 'Tatakai');
        if (!fs.existsSync(downloadPath)) fs.mkdirSync(downloadPath, { recursive: true });

        const { response } = await dialog.showMessageBox(getMainWindow(), {
            type: 'question',
            buttons: ['Cancel', 'Import'],
            defaultId: 1,
            title: 'Import Videos',
            message: `Import ${filePaths.length} video file(s)?`,
            detail: 'Files will be copied to your Tatakai library.',
        });
        if (response === 0) return { success: false, message: 'Import cancelled' };

        const importedDir = path.join(downloadPath, 'Imported');
        if (!fs.existsSync(importedDir)) fs.mkdirSync(importedDir, { recursive: true });

        let imported = 0;
        for (const filePath of filePaths) {
            try {
                fs.copyFileSync(filePath, path.join(importedDir, path.basename(filePath)));
                imported++;
            } catch (_) { /* empty */ }
        }

        const manifestPath = path.join(importedDir, 'manifest.json');
        let manifest = { animeName: 'Imported Videos', episodes: [] };
        if (fs.existsSync(manifestPath)) manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const videoFiles = fs.readdirSync(importedDir).filter((f) => isVideoFile(f));
        manifest.episodes = videoFiles.map((file, i) => ({
            id: `imported-${i + 1}`,
            number: i + 1,
            file,
            addedAt: new Date().toISOString(),
        }));
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

        return { success: true, imported, message: `Successfully imported ${imported} video(s)` };
    });

    ipcMain.handle('open-downloads-folder', async (_event, customPath) => {
        const downloadPath = customPath || path.join(app.getPath('videos'), 'Tatakai');
        if (!fs.existsSync(downloadPath)) fs.mkdirSync(downloadPath, { recursive: true });
        await shell.openPath(downloadPath);
        return { success: true };
    });

    ipcMain.handle('repair-anime', async (_event, { animePath, posterUrl, subtitles, animeName }) => {
        if (!fs.existsSync(animePath)) return { success: false, error: 'Anime folder not found' };

        const results = {
            poster: { needed: false, success: false },
            subtitles: { needed: 0, downloaded: 0 },
            manifest: { updated: false },
        };
        try {
            const posterPath = path.join(animePath, 'poster.jpg');
            if (!fs.existsSync(posterPath) && posterUrl) {
                results.poster.needed = true;
                try {
                    await downloadFile(posterUrl, posterPath);
                    results.poster.success = true;
                } catch (e) {
                    logger.warn('[Repair] Poster failed:', e.message);
                }
            }

            const manifestPath = path.join(animePath, 'manifest.json');
            let manifest = { animeName: animeName || path.basename(animePath), episodes: [] };
            if (fs.existsSync(manifestPath)) manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

            if (subtitles && Array.isArray(subtitles) && subtitles.length > 0) {
                for (const episode of manifest.episodes) {
                    for (const sub of subtitles) {
                        if (!sub.url) continue;
                        const subFileName = `Episode_${episode.number}_${sub.lang || 'en'}.vtt`;
                        const subPath = path.join(animePath, subFileName);
                        if (!fs.existsSync(subPath)) {
                            results.subtitles.needed++;
                            try {
                                await downloadFile(sub.url, subPath);
                                if (fs.existsSync(subPath)) results.subtitles.downloaded++;
                                if (!episode.subtitles) episode.subtitles = [];
                                if (!episode.subtitles.find((s) => s.file === subFileName)) {
                                    episode.subtitles.push({
                                        lang: sub.lang || 'en',
                                        label: sub.label || 'English',
                                        file: subFileName,
                                    });
                                }
                            } catch (e) {
                                logger.warn(`[Repair] Subtitle ${subFileName} failed:`, e.message);
                            }
                        }
                    }
                }
            }

            if (!manifest.animeName && animeName) {
                manifest.animeName = animeName;
                results.manifest.updated = true;
            }
            if (posterUrl && !manifest.posterUrl) {
                manifest.posterUrl = posterUrl;
                results.manifest.updated = true;
            }
            if (results.manifest.updated || results.subtitles.downloaded > 0) {
                fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
            }

            const msgs = [];
            if (results.poster.success) msgs.push('Poster downloaded');
            if (results.subtitles.downloaded > 0) msgs.push(`${results.subtitles.downloaded} subtitle(s) downloaded`);
            if (results.manifest.updated) msgs.push('Manifest updated');
            return { success: true, results, message: msgs.length ? msgs.join(', ') : 'Everything looks good!' };
        } catch (err) {
            logger.error('[Repair] Failed:', err.message);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('open-path', async (_event, filePath) => {
        await shell.openPath(filePath);
    });

    ipcMain.handle('select-import-files', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog(getMainWindow(), {
            title: 'Select Video Files to Import',
            filters: [{ name: 'Video Files', extensions: ['mp4', 'mkv', 'webm', 'avi', 'mov', 'm4v'] }],
            properties: ['openFile', 'multiSelections'],
        });
        return canceled ? null : filePaths;
    });

    ipcMain.handle('select-import-directory', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog(getMainWindow(), {
            title: 'Select Folder to Import',
            properties: ['openDirectory'],
        });
        return canceled ? null : filePaths[0];
    });

    ipcMain.handle('analyze-import-paths', async (_event, paths) => {
        try {
            if (!Array.isArray(paths) || paths.length === 0) {
                return { success: false, error: 'No paths provided' };
            }

            const allVideoFiles = [];
            for (const p of paths) {
                if (!fs.existsSync(p)) continue;
                const stats = fs.statSync(p);
                if (stats.isDirectory()) {
                    const videoFiles = await scanDirectoryForVideos(p);
                    allVideoFiles.push(...videoFiles);
                } else if (stats.isFile()) {
                    const ext = path.extname(p).toLowerCase();
                    if (isVideoFile(p)) {
                        allVideoFiles.push(p);
                    }
                }
            }

            const identified = identifyMediaFiles(allVideoFiles);
            const grouped = groupMediaBySeries(identified);

            return {
                success: true,
                items: Object.entries(grouped).map(([groupKey, group]) => ({
                    groupKey,
                    displayTitle: group.displayTitle,
                    totalFiles: group.files.length,
                    files: group.files.map((item) => ({
                        originalPath: item.absolutePath,
                        fileName: item.fileName,
                        parsedTitle: item.title || '',
                        parsedEpisode: item.episode !== null ? item.episode : null,
                        parsedSeason: item.season !== null && item.season !== undefined ? item.season : 1,
                        parsedGroup: item.releaseGroup || (item.isBatch ? 'Batch' : ''),
                        parsedSource: item.source || null,
                        parsedQuality: item.quality || null,
                        parsedSubtitles: Array.isArray(item.subtitleFormats) ? item.subtitleFormats : [],
                    })),
                }))
            };
        } catch (error) {
            logger.error('[Library] Analyze import failed:', error.message);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('finalize-import', async (_event, { items, mode, customPath, posterUrl }) => {
        try {
            if (!Array.isArray(items) || items.length === 0) {
                return { success: false, error: 'No items to import' };
            }

            const downloadPath = customPath || path.join(app.getPath('videos'), 'Tatakai');
            if (!fs.existsSync(downloadPath)) fs.mkdirSync(downloadPath, { recursive: true });

            let importedCount = 0;
            const updatedDirectories = new Set();

            for (const item of items) {
                const batchFiles = Array.isArray(item.files) && item.files.length > 0
                    ? item.files
                    : [{
                        originalPath: item.originalPath,
                        episodeNumber: item.episodeNumber,
                        seasonNumber: item.seasonNumber,
                        releaseGroup: item.releaseGroup,
                        source: item.source,
                        quality: item.quality,
                    }];

                const cleanTitle = cleanPathSegment(item.targetAnimeName || item.displayTitle, 'Imported Videos');

                const destDir = path.join(downloadPath, cleanTitle);
                if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

                const manifestPath = path.join(destDir, 'manifest.json');
                let manifest = { animeName: cleanTitle, posterUrl: item.posterUrl || posterUrl || null, episodes: [] };
                if (fs.existsSync(manifestPath)) {
                    try {
                        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                        // Update posterUrl if provided and not already set
                        if ((item.posterUrl || posterUrl) && !manifest.posterUrl) {
                            manifest.posterUrl = item.posterUrl || posterUrl;
                        }
                    } catch (_) {}
                }

                manifest.animeName = cleanTitle;

                // Download poster if provided and not already on disk
                const effectivePosterUrl = item.posterUrl || posterUrl || null;
                const posterPath = path.join(destDir, 'poster.jpg');
                if (effectivePosterUrl && !fs.existsSync(posterPath)) {
                    try {
                        await downloadFile(effectivePosterUrl, posterPath);
                        logger.info(`[Library] Downloaded poster for "${cleanTitle}"`);
                    } catch (posterErr) {
                        logger.warn(`[Library] Failed to download poster for "${cleanTitle}":`, posterErr.message);
                    }
                }

                for (const fileItem of batchFiles) {
                    if (!fileItem?.originalPath || !fs.existsSync(fileItem.originalPath)) continue;

                    const ext = path.extname(fileItem.originalPath);
                    const seasonStr = String(fileItem.seasonNumber || item.seasonNumber || 1).padStart(2, '0');
                    const epNumber = Number(fileItem.episodeNumber || 1);
                    const epStr = String(epNumber).padStart(2, '0');
                    const groupName = cleanPathSegment(fileItem.releaseGroup || item.releaseGroup || '', '');
                    const groupSuffix = groupName ? ` - [${groupName}]` : '';
                    const sanitizedName = cleanPathSegment(`${cleanTitle} - S${seasonStr}E${epStr}${groupSuffix}${ext}`, `Episode ${epStr}${ext}`);
                    const destPath = path.join(destDir, sanitizedName);

                    if (mode === 'move') {
                        fs.renameSync(fileItem.originalPath, destPath);
                    } else {
                        fs.copyFileSync(fileItem.originalPath, destPath);
                    }

                    const existingIndex = manifest.episodes.findIndex(ep => ep.number === epNumber);
                    const newEp = {
                        id: `local-${cleanTitle.toLowerCase().replace(/\s+/g, '-')}-ep-${epNumber}`,
                        number: epNumber,
                        file: sanitizedName,
                        addedAt: new Date().toISOString(),
                        size: fs.statSync(destPath).size,
                        synced: true,
                        source: fileItem.source || null,
                        quality: fileItem.quality || null,
                    };

                    if (existingIndex >= 0) {
                        manifest.episodes[existingIndex] = newEp;
                    } else {
                        manifest.episodes.push(newEp);
                    }

                    importedCount++;
                }

                manifest.episodes.sort((a, b) => a.number - b.number);
                fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

                updatedDirectories.add(destDir);
            }

            return {
                success: true,
                importedCount,
                message: `Successfully imported ${importedCount} episode(s) to Tatakai library!`
            };
        } catch (error) {
            logger.error('[Library] Finalize import failed:', error.message);
            return { success: false, error: error.message };
        }
    });

    ipcMain.handle('parse-release-name', async (_event, name) => {
        try {
            const { parseReleaseName } = require('../torrent/naming/release-parser.cjs');
            return { success: true, parsed: parseReleaseName(name) };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('delete-anime', async (_event, animePath) => {
        try {
            if (!fs.existsSync(animePath)) return { success: false, error: 'Anime folder not found' };
            fs.rmSync(animePath, { recursive: true, force: true });
            return { success: true, message: 'Anime deleted successfully' };
        } catch (err) {
            logger.error('[Library] Delete failed:', err.message);
            return { success: false, error: err.message };
        }
    });

    // Stream a local video file via HTTP with range request support.
    // Returns a http://127.0.0.1:PORT/stream/<encoded-path> URL that Chromium
    // can load without webSecurity restrictions, including MKV files.
    // Also handles subtitle files (.vtt, .srt, .ass) for offline playback.
    ipcMain.handle('media:stream-local-file', async (_event, filePath) => {
        try {
            // Decode tatakai-media:// or file:// URLs back to a filesystem path
            let resolvedPath = String(filePath || '');
            if (resolvedPath.startsWith('tatakai-media:///')) {
                resolvedPath = decodeURIComponent(resolvedPath.slice('tatakai-media:///'.length));
                if (process.platform === 'win32') {
                    resolvedPath = resolvedPath.replace(/\//g, '\\');
                }
            } else if (resolvedPath.startsWith('file:///')) {
                resolvedPath = decodeURIComponent(resolvedPath.slice('file:///'.length));
                if (process.platform === 'win32') {
                    resolvedPath = resolvedPath.replace(/\//g, '\\');
                }
            }
            resolvedPath = path.normalize(resolvedPath);

            if (!fs.existsSync(resolvedPath)) {
                return { success: false, error: `File not found: ${resolvedPath}` };
            }

            const port = await ensureMediaStreamServer();
            const streamUrl = localFileToStreamUrl(resolvedPath, port);
            return { success: true, url: streamUrl };
        } catch (err) {
            logger.error('[Library] stream-local-file failed:', err.message);
            return { success: false, error: err.message };
        }
    });
};
