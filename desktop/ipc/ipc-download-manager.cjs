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
// Resolved to the unpacked binary in a packaged build (app.asar → app.asar.unpacked).
const { ffmpegPath } = require('../services/ffmpeg-paths.cjs');
const axios = require('axios');
const pathMod = require('path');
const fsMod = require('fs');
const { DownloadStorageManager } = require('../runtime/download/storage-manager.cjs');
const { TorrentFacade } = require('../runtime/torrent/facade.cjs');

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

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

/**
 * hls.js picks the top rendition adaptively for playback, but ffmpeg given a
 * MASTER playlist selects a variant by its own default (often the first-listed,
 * i.e. the LOWEST quality) → the player-button download looks worse than what
 * was on screen. So when the input is a master m3u8, resolve it to the
 * highest-bandwidth variant media playlist and hand ffmpeg *that*. Best-effort:
 * any failure falls back to the original URL (ffmpeg still downloads, just at
 * its default rendition), so this never regresses a working download.
 */
async function resolveBestHlsVariant(url, headers = {}) {
    try {
        if (!/\.m3u8(\?|$)/i.test(url)) return url;
        const res = await axios.get(url, {
            timeout: 15000,
            responseType: 'text',
            transformResponse: [(d) => d],
            maxRedirects: 5,
            headers: {
                'User-Agent': headers['User-Agent'] || headers['user-agent'] ||
                    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': '*/*',
                ...headers,
            },
            validateStatus: (s) => s >= 200 && s < 400,
        });
        const text = String(res.data || '');
        if (!text.includes('#EXT-X-STREAM-INF')) return url; // already a media playlist
        const finalUrl = res.request?.res?.responseUrl || url; // resolve relative URIs against the redirected master
        const lines = text.split(/\r?\n/);
        let best = null; // { bandwidth, height, uri }
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line.startsWith('#EXT-X-STREAM-INF:')) continue;
            const bw = Number((line.match(/[,:]BANDWIDTH=(\d+)/) || [])[1] || 0);
            const height = Number((line.match(/RESOLUTION=\d+x(\d+)/) || [])[1] || 0);
            // The URI is the next non-comment, non-empty line.
            let uri = '';
            for (let j = i + 1; j < lines.length; j++) {
                const cand = lines[j].trim();
                if (!cand || cand.startsWith('#')) continue;
                uri = cand;
                break;
            }
            if (!uri) continue;
            if (!best || bw > best.bandwidth || (bw === best.bandwidth && height > best.height)) {
                best = { bandwidth: bw, height, uri };
            }
        }
        if (!best) return url;
        const resolved = new URL(best.uri, finalUrl).href;
        console.log(`[download] HLS master → best variant ${best.height || '?'}p (${Math.round(best.bandwidth / 1000)}kbps)`);
        return resolved;
    } catch (_) {
        return url; // network/parse failure → let ffmpeg handle the master directly
    }
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
    // Fail fast on a bad input/output rather than letting ffmpeg emit the
    // opaque "Unable to find a suitable output format for ''" (empty output).
    const inputUrlRaw = typeof url === 'string' ? url.trim() : '';
    if (!inputUrlRaw || !/^(https?|file):/i.test(inputUrlRaw)) {
        throw new Error(`No valid stream URL to download (got "${String(url).slice(0, 80)}")`);
    }
    if (!output || !String(output).trim()) {
        throw new Error('Internal error: empty download output path');
    }
    // Upgrade a master HLS playlist to its highest-quality variant before ffmpeg
    // sees it (best-effort; falls back to the original URL on any failure).
    const inputUrl = await resolveBestHlsVariant(inputUrlRaw, headers);

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

        const command = ffmpeg(inputUrl);
        const userAgent =
            headers['User-Agent'] ||
            headers['user-agent'] ||
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

        const inputOptions = ['-user_agent', userAgent, '-analyzeduration', '10000000', '-probesize', '10000000'];
        // Referer gets ffmpeg's dedicated option; only the *remaining* headers go
        // into the -headers blob (a Referer inside -headers is redundant and the
        // CRLF blob is the fiddlier path, so keep it minimal).
        const refererVal = headers['Referer'] || headers['referer'];
        if (refererVal) inputOptions.push('-referer', String(refererVal));
        const headerEntries = Object.entries(headers).filter(([k]) => {
            const lk = k.toLowerCase();
            return lk !== 'user-agent' && lk !== 'referer';
        });
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

        // Captured on 'start' so a failure can report the exact command ffmpeg ran
        // (this is what surfaces an empty/garbled output target when it happens).
        let startedCmd = '';
        command.on('start', (cmdLine) => {
            startedCmd = String(cmdLine || '');
        });

        let lastProgress = 0;
        let lastProgressTime = Date.now();
        let downloadStartTime = Date.now();
        let hasReceivedData = false;
        let totalDuration = 0;
        // Keep a rolling tail of ffmpeg stderr so a bare "exit code 1" carries the
        // real reason (404/403 from the source, "no audio stream", codec errors …)
        // instead of an opaque message the renderer can't act on.
        const stderrTail = [];

        command.on('stderr', (line) => {
            const trimmed = String(line || '').trim();
            if (trimmed) {
                stderrTail.push(trimmed);
                if (stderrTail.length > 12) stderrTail.shift();
            }
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
            const tail = stderrTail.filter((l) => /error|failed|invalid|denied|403|404|not found|no such|unable|could not/i.test(l));
            const detail = (tail.length ? tail : stderrTail).slice(-3).join(' | ');
            if (detail && !String(err.message || '').includes(detail)) {
                err.message = `${err.message} — ${detail}`;
            }
            // Surface an "Unable to find a suitable output format for ''" class of
            // failure with the exact ffmpeg command, so an empty/garbled output or
            // input target is diagnosable from the renderer's error alone.
            if (/suitable output format|invalid argument/i.test(String(err.message || '')) && startedCmd) {
                console.error('[download] ffmpeg failed. Command was:', startedCmd);
                err.message = `${err.message} [cmd: ${startedCmd.slice(0, 300)}]`;
            }
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
                    // Guard so the done→finalize move runs once (progress keeps ticking).
                    let finalized = false;

                    const progressHandler = (progressEvent) => {
                        if (torrentSessionId && progressEvent.sessionId !== torrentSessionId) return;
                        const win = getMainWindow();
                        if (win && !win.isDestroyed()) {
                            const dl = Number(progressEvent.downloadSpeed) || 0;
                            const ul = Number(progressEvent.uploadSpeed) || 0;
                            win.webContents.send('download-progress', {
                                episodeId,
                                percent: progressEvent.progress ?? 0,
                                speed: dl
                                    ? `${(dl / (1024 * 1024)).toFixed(1)} MB/s`
                                    : '',
                                eta: progressEvent.eta != null ? formatTime(progressEvent.eta) : '',
                                // Raw swarm stats for the titlebar widget (down/up/peers/ratio).
                                dlSpeedBps: dl,
                                upSpeedBps: ul,
                                downloadedBytes: Number(progressEvent.downloaded) || 0,
                                uploadedBytes: Number(progressEvent.uploaded) || 0,
                                ratio: typeof progressEvent.ratio === 'number' ? progressEvent.ratio : undefined,
                                seeders: progressEvent.seeders,
                                leechers: progressEvent.leechers,
                                numPeers: progressEvent.numPeers,
                            });
                        }

                        // When the torrent reports done, move the finished file
                        // into the library as a single copy, then emit completed.
                        if (progressEvent.done && torrentSessionId && progressEvent.sessionId === torrentSessionId && !finalized) {
                            finalized = true;
                            void finalizeTorrentDownload();
                        }
                    };

                    // Fold the completed torrent into ONE library file. Previously the
                    // torrent data stayed in the torrent cache while the library only
                    // held a manifest → the "downloading in 2 locations" bug. Now:
                    //  • a fresh download (file under the library root) is moved to
                    //    Episode_N.<ext> and the manifest is pointed at it;
                    //  • a reused streaming torrent (file still in the stream cache)
                    //    is left in place and the download simply points at it —
                    //    no re-download, no second copy, playback uninterrupted.
                    const finalizeTorrentDownload = async () => {
                        let finalPath = resolvedDownloadPath;
                        let fileSize = 0;
                        try {
                            const fp = await torrentFacade.getFilePath(torrentSessionId);
                            const srcPath = fp && fp.success ? fp.path : null;
                            if (srcPath && fs.existsSync(srcPath)) {
                                const underLibrary = path
                                    .resolve(srcPath)
                                    .startsWith(path.resolve(resolvedDownloadPath));
                                if (underLibrary) {
                                    const ext = path.extname(srcPath) || '.mp4';
                                    const dest = path.join(animeDir, `Episode_${episodeNumber}${ext}`);
                                    if (path.resolve(dest) !== path.resolve(srcPath)) {
                                        try {
                                            fs.renameSync(srcPath, dest);
                                        } catch (_) {
                                            // Cross-volume/locked → copy then drop the source.
                                            fs.copyFileSync(srcPath, dest);
                                            try { fs.unlinkSync(srcPath); } catch (_) {}
                                        }
                                    }
                                    finalPath = dest;
                                    // Point the manifest at the real file (was hardcoded .mp4).
                                    try {
                                        const mf = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
                                        const i = (mf.episodes || []).findIndex((e) => e.id === episodeId);
                                        if (i !== -1) {
                                            mf.episodes[i].file = path.basename(dest);
                                            fs.writeFileSync(manifestPath, JSON.stringify(mf, null, 2));
                                        }
                                    } catch (_) {}
                                } else {
                                    // Reused stream-cache torrent — point at it, don't copy.
                                    finalPath = srcPath;
                                }
                                try { fileSize = fs.statSync(finalPath).size; } catch (_) {}
                            }
                        } catch (e) {
                            logger.warn('[Download] Torrent finalize/move failed:', e.message);
                        }
                        // Stop seeding but keep the file (destroyStore:false) — the file
                        // is now the single library copy (moved) or the shared cache copy.
                        try {
                            await torrentFacade.stop(torrentSessionId, { destroyStore: false });
                        } catch (_) {}
                        cleanup();
                        const win = getMainWindow();
                        if (win && !win.isDestroyed()) {
                            win.webContents.send('download-completed', {
                                episodeId,
                                path: finalPath,
                                size: fileSize,
                                sessionId: torrentSessionId,
                            });
                        }
                        processQueue();
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
