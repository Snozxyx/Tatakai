'use strict';

/**
 * Unified HLS + Torrent episode download queue (download:enqueue / legacy start-download).
 *
 * DownloadQueueEntry shape:
 * {
 *   episodeId:      string          — unique identifier for this download
 *   animeName:      string          — anime title (used for directory naming)
 *   episodeNumber:  number          — episode number
 *   sourceType:     'hls'|'torrent' — which download branch to use
 *   url?:           string          — HLS m3u8 URL (sourceType === 'hls')
 *   magnet?:        string          — magnet link (sourceType === 'torrent')
 *   torrentBuffer?: ArrayBuffer     — .torrent file buffer (sourceType === 'torrent')
 *   headers?:       object          — HTTP headers for HLS
 *   downloadPath?:  string          — explicit output directory (optional)
 *   localStoragePath?: string       — tatakai_download_path from renderer localStorage (optional)
 *   posterUrl?:     string
 *   subtitles?:     array
 * }
 */

const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const axios = require('axios');
const pathMod = require('path');
const fsMod = require('fs');
const { DownloadStorageManager } = require('../runtime/download/storage-manager.cjs');
const { TorrentFacade } = require('../runtime/torrent/facade.cjs');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const activeProcesses = new Map();

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

function formatTime(seconds) {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

async function downloadFile(url, outputPath, options = {}) {
    const dir = pathMod.dirname(outputPath);
    if (!fsMod.existsSync(dir)) fsMod.mkdirSync(dir, { recursive: true });
    if (fsMod.existsSync(outputPath) && fsMod.statSync(outputPath).size > 0) return outputPath;

    const writer = fsMod.createWriteStream(outputPath);
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
            if (fsMod.existsSync(outputPath) && fsMod.statSync(outputPath).size > 0) resolve(outputPath);
            else {
                if (fsMod.existsSync(outputPath)) fsMod.unlinkSync(outputPath);
                reject(new Error('Downloaded file is empty'));
            }
        });
        writer.on('error', reject);
        response.data.on('error', reject);
    });
}

function cancelFfmpeg(episodeId) {
    const proc = activeProcesses.get(episodeId);
    if (proc) {
        try {
            proc.kill('SIGKILL');
        } catch (_) { /* empty */ }
        activeProcesses.delete(episodeId);
        return true;
    }
    return false;
}

async function downloadEpisode({ url, output, headers = {}, onProgress, episodeId }) {
    return new Promise((resolve, reject) => {
        const dir = pathMod.dirname(output);
        if (!fsMod.existsSync(dir)) fsMod.mkdirSync(dir, { recursive: true });

        if (fsMod.existsSync(output)) {
            const stats = fsMod.statSync(output);
            if (stats.size > 1024) {
                if (onProgress) onProgress(100);
                resolve(output);
                return;
            }
            fsMod.unlinkSync(output);
        }

        const normalizedOutput = pathMod.resolve(output);
        const tempOutput = `${normalizedOutput}.tmp`;
        if (fsMod.existsSync(tempOutput)) fsMod.unlinkSync(tempOutput);

        const command = ffmpeg(url);
        const userAgent =
            headers['User-Agent'] ||
            headers['user-agent'] ||
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

        const inputOptions = ['-user_agent', userAgent, '-analyzeduration', '10000000', '-probesize', '10000000'];
        const headerEntries = Object.entries(headers).filter(([k]) => !k.toLowerCase().includes('user-agent'));
        if (headerEntries.length > 0) {
            inputOptions.push('-headers', `${headerEntries.map(([k, v]) => `${k}: ${v}`).join('\r\n')}\r\n`);
        }
        inputOptions.push('-protocol_whitelist', 'file,http,https,tcp,tls,crypto');
        command.inputOptions(inputOptions);
        command.outputOptions([
            '-f', 'mp4',
            '-c', 'copy',
            '-bsf:a', 'aac_adtstoasc',
            '-movflags', '+faststart',
            '-map', '0:v:0',
            '-map', '0:a:0',
            '-map', '0:s?',
            '-c:s', 'mov_text',
            '-y',
        ]);
        command.output(tempOutput);

        let lastProgress = 0;
        let lastProgressTime = Date.now();
        let downloadStartTime = Date.now();
        let hasReceivedData = false;
        let totalDuration = 0;

        command.on('stderr', (line) => {
            if (line.includes('Duration:')) {
                hasReceivedData = true;
                const match = line.match(/Duration: (\d{2}):(\d{2}):(\d{2})/);
                if (match) {
                    totalDuration = parseInt(match[1], 10) * 3600 + parseInt(match[2], 10) * 60 + parseInt(match[3], 10);
                }
            }
        });

        command.on('progress', (progress) => {
            hasReceivedData = true;
            let percent = 0;
            if (progress.timemark) {
                const parts = progress.timemark.split(':');
                if (parts.length === 3) {
                    const currentSeconds =
                        parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseFloat(parts[2]);
                    percent =
                        totalDuration > 0
                            ? Math.min(Math.round((currentSeconds / totalDuration) * 100), 99)
                            : Math.min(Math.round((currentSeconds / 1440) * 100), 99);
                }
            } else if (progress.percent > 0) {
                percent = Math.min(Math.round(progress.percent), 99);
            }

            const now = Date.now();
            const elapsedSec = (now - downloadStartTime) / 1000;
            const estimatedTotalBytes = 300 * 1024 * 1024;
            const currentBytes = (percent / 100) * estimatedTotalBytes;
            let speedText = '';
            let eta = '';

            if (elapsedSec > 0) {
                const speed = currentBytes / elapsedSec;
                speedText =
                    speed > 1024 * 1024
                        ? `${(speed / (1024 * 1024)).toFixed(1)} MB/s`
                        : speed > 1024
                          ? `${(speed / 1024).toFixed(0)} KB/s`
                          : `${speed.toFixed(0)} B/s`;

                if (percent > 0) {
                    const remainingSec = (estimatedTotalBytes - currentBytes) / speed;
                    eta =
                        remainingSec < 60
                            ? `${Math.round(remainingSec)}s`
                            : remainingSec < 3600
                              ? `${Math.round(remainingSec / 60)}m ${Math.round(remainingSec % 60)}s`
                              : `${Math.round(remainingSec / 3600)}h ${Math.round((remainingSec % 3600) / 60)}m`;
                }
            }

            if (percent > lastProgress || now - lastProgressTime > 2000) {
                lastProgress = percent;
                lastProgressTime = now;
                if (onProgress) {
                    onProgress({
                        percent,
                        speed: speedText,
                        eta,
                        downloaded: formatBytes(currentBytes),
                        elapsed: formatTime(elapsedSec),
                    });
                }
            }
        });

        command.on('error', (err) => {
            if (fsMod.existsSync(tempOutput)) {
                try {
                    fsMod.unlinkSync(tempOutput);
                } catch (_) { /* empty */ }
            }
            activeProcesses.delete(episodeId);
            reject(err);
        });

        command.on('end', () => {
            if (!fsMod.existsSync(tempOutput)) {
                reject(new Error('Download failed: No output file created'));
                return;
            }
            const stats = fsMod.statSync(tempOutput);
            if (stats.size < 1024) {
                fsMod.unlinkSync(tempOutput);
                reject(new Error('Download failed: File is too small'));
                return;
            }
            try {
                fsMod.renameSync(tempOutput, normalizedOutput);
                if (onProgress) onProgress(100);
                activeProcesses.delete(episodeId);
                resolve(normalizedOutput);
            } catch (err) {
                reject(err);
            }
        });

        if (episodeId) activeProcesses.set(episodeId, command);
        command.run();

        setTimeout(() => {
            if (!hasReceivedData) {
                try {
                    command.kill('SIGKILL');
                } catch (_) { /* empty */ }
            }
        }, 30000);
    });
}

module.exports = function registerDownloadManager(ipcMain, app, fs, path, logger, getMainWindow) {
    const autoDownloader = require('../services/auto-downloader.cjs').init(logger);
    const storageManager = new DownloadStorageManager({ app, fs, path });
    const torrentFacade = new TorrentFacade({ app, fs, path, logger, getMainWindow });

    const activeDownloads = new Map();
    const downloadQueue = [];

    const processQueue = () => {
        if (downloadQueue.length > 0 && activeDownloads.size < 3) {
            const nextTask = downloadQueue.shift();
            if (nextTask) nextTask();
        }
    };

    /**
     * Resolve the effective download path using priority order:
     *   1. explicit `downloadPath` field in payload
     *   2. `localStoragePath` (tatakai_download_path from renderer localStorage, passed in payload)
     *   3. DownloadStorageManager.defaultLibraryRoot() → app.getPath('videos')/Tatakai
     *
     * @param {object} payload
     * @returns {string} resolved download path
     */
    function resolveDownloadPath(payload) {
        if (payload.downloadPath && payload.downloadPath.trim()) {
            return payload.downloadPath.trim();
        }
        if (payload.localStoragePath && payload.localStoragePath.trim()) {
            return payload.localStoragePath.trim();
        }
        return storageManager.defaultLibraryRoot();
    }

    async function runEpisodeDownload(payload) {
        const {
            episodeId,
            animeName,
            episodeNumber,
            sourceType = 'hls',
            url,
            magnet,
            torrentBuffer,
            headers,
            posterUrl,
            subtitles,
        } = payload;

        // Security: reject path traversal sequences before resolving the path
        const rawDownloadPath = payload.downloadPath || '';
        if (rawDownloadPath.includes('../') || rawDownloadPath.includes('..\\')) {
            return { success: false, error: 'invalid_download_path' };
        }

        const resolvedDownloadPath = resolveDownloadPath(payload);
        const animeDir = path.join(resolvedDownloadPath, animeName.replace(/[<>:"/\\|?*]/g, ''));
        const outputFilePath = path.join(animeDir, `Episode_${episodeNumber}.mp4`);

        if (activeDownloads.has(episodeId)) {
            return { success: false, error: 'Download already in progress' };
        }

        try {
            if (!fs.existsSync(animeDir)) fs.mkdirSync(animeDir, { recursive: true });

            const posterPath = path.join(animeDir, 'poster.jpg');
            if (!fs.existsSync(posterPath) && posterUrl) {
                try {
                    await downloadFile(posterUrl, posterPath);
                } catch (e) {
                    logger.warn('[Download] Poster download failed:', e.message);
                }
            }

            const subtitleFiles = [];
            if (subtitles && Array.isArray(subtitles)) {
                for (const sub of subtitles) {
                    if (!sub.url) continue;
                    const langCode = sub.lang || sub.language || 'en';
                    const label = sub.label || langCode;
                    const subPath = path.join(animeDir, `Episode_${episodeNumber}_${langCode}.vtt`);
                    if (!fs.existsSync(subPath)) {
                        try {
                            await downloadFile(sub.url, subPath, {
                                headers: {
                                    Referer: headers?.Referer || 'https://megacloud.blog/',
                                    Origin: 'https://megacloud.blog',
                                    'User-Agent': headers?.['User-Agent'] || 'Mozilla/5.0',
                                },
                                timeout: 30000,
                            });
                            subtitleFiles.push({
                                lang: langCode,
                                label,
                                file: `Episode_${episodeNumber}_${langCode}.vtt`,
                            });
                        } catch (e) {
                            logger.warn(`[Download] Subtitle ${label} failed:`, e.message);
                        }
                    } else {
                        subtitleFiles.push({
                            lang: langCode,
                            label,
                            file: `Episode_${episodeNumber}_${langCode}.vtt`,
                        });
                    }
                }
            }

            const manifestPath = path.join(animeDir, 'manifest.json');
            let manifest = { animeName, episodes: [], posterUrl };
            if (fs.existsSync(manifestPath)) {
                const existing = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
                manifest = {
                    ...existing,
                    animeName: existing.animeName || animeName,
                    posterUrl: existing.posterUrl || posterUrl,
                };
            }
            if (!manifest.episodes.find((e) => e.id === episodeId)) {
                manifest.episodes.push({
                    id: episodeId,
                    number: episodeNumber,
                    file: `Episode_${episodeNumber}.mp4`,
                    subtitles: subtitleFiles,
                    addedAt: new Date().toISOString(),
                });
            } else {
                const idx = manifest.episodes.findIndex((e) => e.id === episodeId);
                if (idx !== -1 && subtitleFiles.length > 0) manifest.episodes[idx].subtitles = subtitleFiles;
            }
            fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

            const startConversion = () => {
                if (sourceType === 'torrent') {
                    // ── Torrent branch ────────────────────────────────────────
                    // Requirements 18.2, 18.4, 18.5
                    const torrentOptions = {
                        downloadPath: resolvedDownloadPath,
                        episode: episodeNumber,
                        fileIndex: payload.fileIndex,
                    };

                    // Create a placeholder promise so activeDownloads tracks this slot
                    // while we wait for the torrent session to start.
                    let resolveSlot;
                    const slotPromise = new Promise((res) => { resolveSlot = res; });
                    activeDownloads.set(episodeId, slotPromise);

                    const sessionManager = torrentFacade._sessions;

                    // Forward torrent:progress events as download-progress to the renderer.
                    // We match by sessionId once start() resolves.
                    let torrentSessionId = null;

                    const progressHandler = (progressEvent) => {
                        if (torrentSessionId && progressEvent.sessionId !== torrentSessionId) return;
                        const win = getMainWindow();
                        if (win && !win.isDestroyed()) {
                            win.webContents.send('download-progress', {
                                episodeId,
                                percent: progressEvent.progress ?? 0,
                                speed: progressEvent.downloadSpeed
                                    ? `${(progressEvent.downloadSpeed / (1024 * 1024)).toFixed(1)} MB/s`
                                    : '',
                                eta: progressEvent.eta != null ? formatTime(progressEvent.eta) : '',
                                seeders: progressEvent.seeders,
                                leechers: progressEvent.leechers,
                                numPeers: progressEvent.numPeers,
                            });
                        }

                        // When the torrent reports done, emit download-completed
                        if (progressEvent.done && torrentSessionId && progressEvent.sessionId === torrentSessionId) {
                            try {
                                void torrentFacade.stop(torrentSessionId, { destroyStore: false });
                            } catch (_) {}
                            cleanup();
                            const win = getMainWindow();
                            if (win && !win.isDestroyed()) {
                                win.webContents.send('download-completed', {
                                    episodeId,
                                    path: resolvedDownloadPath,
                                    sessionId: torrentSessionId,
                                });
                            }
                            processQueue();
                        }
                    };

                    const cleanup = () => {
                        activeDownloads.delete(episodeId);
                        if (sessionManager && typeof sessionManager.off === 'function') {
                            sessionManager.off('torrent:progress', progressHandler);
                        }
                        resolveSlot();
                    };

                    if (sessionManager && typeof sessionManager.on === 'function') {
                        sessionManager.on('torrent:progress', progressHandler);
                    }

                    // Start the torrent session
                    let startPromise;
                    if (torrentBuffer) {
                        let buf;
                        if (Buffer.isBuffer(torrentBuffer)) {
                            buf = torrentBuffer;
                        } else if (torrentBuffer instanceof Uint8Array) {
                            buf = Buffer.from(torrentBuffer);
                        } else if (typeof torrentBuffer === 'object') {
                            // Plain object from contextBridge serialisation
                            buf = Buffer.from(Object.values(torrentBuffer));
                        } else {
                            buf = Buffer.from(torrentBuffer);
                        }
                        startPromise = torrentFacade.startFromBuffer(buf, torrentOptions);
                    } else {
                        startPromise = torrentFacade.start(magnet, torrentOptions);
                    }

                    startPromise
                        .then((result) => {
                            if (!result || result.success === false) {
                                // Start failed (e.g. blocked, invalid buffer, timeout)
                                cleanup();
                                logger.error(`[Download] Torrent start failed for ${episodeId}:`, result && result.error);
                                const win = getMainWindow();
                                if (win && !win.isDestroyed()) {
                                    win.webContents.send('download-error', {
                                        episodeId,
                                        error: (result && result.error) || 'Torrent start failed',
                                    });
                                }
                                processQueue();
                                return;
                            }
                            // Session started — record the sessionId so the progress
                            // handler can filter events to this specific session.
                            torrentSessionId = result.sessionId;
                            logger.info(`[Download] Torrent session started: ${torrentSessionId} for episodeId: ${episodeId}`);
                            // Note: download-completed is emitted by progressHandler when done:true
                        })
                        .catch((err) => {
                            cleanup();
                            logger.error(`[Download] Torrent start error for ${episodeId}:`, err.message);
                            const win = getMainWindow();
                            if (win && !win.isDestroyed()) {
                                win.webContents.send('download-error', { episodeId, error: err.message });
                            }
                            processQueue();
                        });
                } else {
                    // ── HLS branch (ffmpeg) ───────────────────────────────────
                    const promise = downloadEpisode({
                        url,
                        output: outputFilePath,
                        headers: headers || {},
                        episodeId,
                        onProgress: (data) => {
                            const win = getMainWindow();
                            if (win && !win.isDestroyed()) {
                                win.webContents.send(
                                    'download-progress',
                                    typeof data === 'object' ? { episodeId, ...data } : { episodeId, percent: data },
                                );
                            }
                        },
                    });
                    activeDownloads.set(episodeId, promise);
                    promise
                        .then((filePath) => {
                            activeDownloads.delete(episodeId);
                            const win = getMainWindow();
                            if (win && !win.isDestroyed()) {
                                let fileSize = 0;
                                try {
                                    fileSize = fs.statSync(filePath).size;
                                } catch (_) { /* empty */ }
                                win.webContents.send('download-completed', { episodeId, path: filePath, size: fileSize });
                            }
                            processQueue();
                        })
                        .catch((err) => {
                            activeDownloads.delete(episodeId);
                            logger.error(`[Download] Failed for ${episodeId}:`, err.message);
                            const win = getMainWindow();
                            if (win && !win.isDestroyed()) {
                                win.webContents.send('download-error', { episodeId, error: err.message });
                            }
                            processQueue();
                        });
                }
            };

            if (activeDownloads.size < 3) startConversion();
            else downloadQueue.push(startConversion);

            return { success: true, status: 'queued' };
        } catch (err) {
            logger.error('[Download] Initiation failed:', err.message);
            return { success: false, error: err.message };
        }
    }

    const enqueueHandler = async (_event, payload) => runEpisodeDownload(payload);

    ipcMain.handle('download:enqueue', enqueueHandler);
    ipcMain.handle('start-download', enqueueHandler);

    const cancelHandler = async (_event, params) => {
        const { episodeId, animePath } = params || {};
        try {
            if (activeDownloads.has(episodeId)) {
                cancelFfmpeg(episodeId);
                activeDownloads.delete(episodeId);
            }
            if (animePath && fs.existsSync(animePath)) {
                const manifestPath = path.join(animePath, 'manifest.json');
                if (fs.existsSync(manifestPath)) fs.unlinkSync(manifestPath);
                const dirFiles = fs.readdirSync(animePath);
                for (const file of dirFiles) {
                    if (file.endsWith('.tmp')) fs.unlinkSync(path.join(animePath, file));
                }
                const remainingVideos = dirFiles.filter(
                    (f) =>
                        (f.endsWith('.mp4') || f.endsWith('.mkv') || f.endsWith('.webm')) && !f.endsWith('.tmp'),
                );
                if (remainingVideos.length === 0) fs.rmSync(animePath, { recursive: true, force: true });
            }
            return { success: true };
        } catch (err) {
            logger.error('[Download] Cancel failed:', err.message);
            return { success: false, error: err.message };
        }
    };

    ipcMain.handle('download:cancel', cancelHandler);
    ipcMain.handle('cancel-download', cancelHandler);

    ipcMain.handle('download:list', async () => ({
        active: Array.from(activeDownloads.keys()),
        queued: downloadQueue.length,
    }));

    ipcMain.handle('download:pause', async () => ({ success: true }));
    ipcMain.handle('download:resume', async () => ({ success: true }));

    ipcMain.handle('download:clear-completed', async () => ({ success: true }));

    // Auto Downloader IPC
    ipcMain.handle('auto-download:subscribe', async (_event, animeId, title, nextEpisode) => {
        return autoDownloader.subscribe(animeId, title, nextEpisode);
    });
    ipcMain.handle('auto-download:unsubscribe', async (_event, animeId) => {
        return autoDownloader.unsubscribe(animeId);
    });
    ipcMain.handle('auto-download:list', async () => {
        return autoDownloader.getSubscriptions();
    });

    // Start auto downloader service
    autoDownloader.start(runEpisodeDownload);
};
