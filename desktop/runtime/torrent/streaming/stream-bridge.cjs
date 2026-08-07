'use strict';

/**
 * Stream Bridge — Prebuffering logic for torrent-backed playback.
 *
 * Wraps TorrentSessionManager.stream() with a prebuffer check:
 * waits until the first N bytes of the target file are available
 * before resolving the stream URL to the player.
 *
 * This prevents the player from opening a URL that has no data yet,
 * which would cause immediate buffering failure.
 */

const PREBUFFER_BYTES = 1.5 * 1024 * 1024; // 1.5 MB default for faster startup
const PREBUFFER_POLL_MS = 500;              // check every 0.5s for smoother readiness
const PREBUFFER_TIMEOUT_MS = 35_000;        // fail sooner and let the player continue buffering
const METADATA_PREBUFFER_BYTES = 3 * 1024 * 1024; // 3 MB for end of file

function hasPiece(torrent, pieceIndex) {
    try {
        return Boolean(torrent?.bitfield?.get?.(pieceIndex));
    } catch {
        return false;
    }
}

function getFilePieceWindow(torrent, file, bytesFromStart, fromEnd = false) {
    const pieceLength = torrent.pieceLength || 262144;
    const fileOffset = file.offset || 0;
    const fileLength = file.length || 0;
    const fileStart = fileOffset;
    const fileEnd = Math.max(fileStart, fileOffset + fileLength - 1);
    const byteCount = Math.max(1, Math.min(bytesFromStart, fileLength || bytesFromStart));

    if (fromEnd) {
        const startByte = Math.max(fileStart, fileOffset + fileLength - byteCount);
        return {
            startPiece: Math.floor(startByte / pieceLength),
            endPiece: Math.floor(fileEnd / pieceLength),
            pieceLength,
        };
    }

    const endByte = Math.min(fileEnd, fileOffset + byteCount - 1);
    return {
        startPiece: Math.floor(fileStart / pieceLength),
        endPiece: Math.floor(endByte / pieceLength),
        pieceLength,
    };
}

function getContiguousStartBytes(torrent, file) {
    const pieceLength = torrent.pieceLength || 262144;
    const fileOffset = file.offset || 0;
    const fileLength = file.length || 0;
    const startPiece = Math.floor(fileOffset / pieceLength);
    const endPiece = Math.floor((fileOffset + Math.max(1, fileLength) - 1) / pieceLength);
    let pieces = 0;

    for (let piece = startPiece; piece <= endPiece; piece += 1) {
        if (!hasPiece(torrent, piece)) break;
        pieces += 1;
    }

    return Math.min(fileLength, pieces * pieceLength);
}

function isPieceWindowReady(torrent, window, requiredRatio = 1) {
    const total = Math.max(1, window.endPiece - window.startPiece + 1);
    let ready = 0;

    for (let piece = window.startPiece; piece <= window.endPiece; piece += 1) {
        if (hasPiece(torrent, piece)) ready += 1;
    }

    return ready / total >= requiredRatio;
}

/**
 * Wait until the torrent file has at least `prebufferBytes` downloaded,
 * then return the stream URL.
 *
 * @param {import('webtorrent').Torrent} torrent - Active WebTorrent torrent
 * @param {number} fileIndex - Index of the file in torrent.files
 * @param {number} [prebufferBytes]
 * @returns {Promise<{ ready: boolean, downloadedBytes: number }>}
 */
async function waitForPrebuffer(torrent, fileIndex = 0, prebufferBytes = PREBUFFER_BYTES, options = {}) {
    const file = torrent.files?.[fileIndex];
    if (!file) return { ready: false, downloadedBytes: 0, reason: 'file_not_found' };

    const requireMetadataTail = Boolean(options?.requireMetadataTail);
    const fileLength = file.length || 0;
    // For small files, prebuffer 50%, for large files use the default
    const target = Math.min(prebufferBytes, fileLength * 0.5);
    
    // For MKV/WebM, we also want the end of the file for metadata/cues
    const isMKV = /\.(mkv|webm)$/i.test(file.name);
    const metadataTarget = isMKV ? Math.min(METADATA_PREBUFFER_BYTES, fileLength * 0.1) : 0;

    const startedAt = Date.now();

    return new Promise((resolve) => {
        const check = () => {
            // WebTorrent v2 exposes file.downloaded
            const fileDownloaded = typeof file.downloaded === 'number' 
                ? file.downloaded 
                : (torrent.length > 0 ? (torrent.downloaded / torrent.length) * fileLength : 0);

            const contiguousStartBytes = getContiguousStartBytes(torrent, file);
            const startWindow = getFilePieceWindow(torrent, file, target);

            // A sparse cache file can report downloaded bytes while byte 0 is
            // still missing. ffmpeg needs the actual leading pieces for MKV EBML.
            const hasStart = (
                torrent.done ||
                (
                    hasPiece(torrent, startWindow.startPiece) &&
                    contiguousStartBytes >= target &&
                    isPieceWindowReady(torrent, startWindow, 0.95)
                )
            );
            
            // Check if we have enough of the end (if needed)
            let hasEnd = true;
            if (requireMetadataTail && metadataTarget > 0 && !torrent.done) {
                const metadataWindow = getFilePieceWindow(torrent, file, metadataTarget, true);
                hasEnd = isPieceWindowReady(torrent, metadataWindow, 0.5);
            }

            if ((hasStart && (hasEnd || !requireMetadataTail)) || torrent.done) {
                return resolve({ ready: true, downloadedBytes: fileDownloaded });
            }

            // Requirement 12.1: If we have at least 2MB and a good download speed, resolve early
            if (
                contiguousStartBytes >= Math.min(target, 2 * 1024 * 1024) &&
                torrent.downloadSpeed > 250 * 1024 &&
                ((requireMetadataTail && hasEnd) || !isMKV || !requireMetadataTail)
            ) {
                return resolve({ ready: true, downloadedBytes: fileDownloaded, strategy: 'early_resolve' });
            }

            if (Date.now() - startedAt > PREBUFFER_TIMEOUT_MS) {
                // Requirement 12.2: Even on timeout, only fall back when the
                // leading pieces are real. This avoids feeding sparse files to ffmpeg.
                if (contiguousStartBytes > 256 * 1024) {
                    return resolve({ ready: true, downloadedBytes: fileDownloaded, strategy: 'timeout_fallback' });
                }
                return resolve({
                    ready: false,
                    downloadedBytes: fileDownloaded,
                    reason: 'prebuffer_timeout',
                });
            }

            setTimeout(check, PREBUFFER_POLL_MS);
        };
        check();
    });
}

/**
 * Create a playback manifest — resolves stream URL after prebuffering.
 *
 * @param {{ sessionId: string, fileIndex?: number }} params
 * @param {Function} getStreamUrl - (sessionId, fileIndex) => Promise<{success, url, ...}>
 * @param {import('webtorrent').Torrent} [torrent] - Optional torrent for prebuffer check
 * @returns {Promise<{ success: boolean, url: string|null, ready: boolean, error?: string, prebuffered?: boolean, name?: string, length?: number, fileIndex?: number }>} 
 */
async function createPlaybackManifest(params, getStreamUrl, torrent, options = {}) {
    const { sessionId, fileIndex = 0 } = params || {};

    if (!sessionId) return { success: false, url: null, ready: false, error: 'missing_session' };
    if (typeof getStreamUrl !== 'function') {
        return { success: false, url: null, ready: false, error: 'stream_resolver_missing' };
    }

    let prebuffered = false;

    // Requirement 12.0: If the torrent is already fully downloaded, bypass prebuffer immediately
    if (torrent && typeof torrent === 'object' && (torrent.done || (torrent.progress || 0) >= 0.99)) {
        const streamResult = await getStreamUrl(sessionId, fileIndex);
        if (streamResult?.success) {
            return {
                success: true,
                url: streamResult.url,
                rawUrl: streamResult.rawUrl,
                ready: true,
                mode: 'direct',
                prebuffered: true,
                strategy: 'instant_complete',
                name: streamResult.name,
                length: streamResult.length,
                fileIndex: streamResult.fileIndex,
                infoHash: streamResult.infoHash,
            };
        }
    }

    // If we have the torrent object, wait for prebuffer
    if (torrent && typeof torrent === 'object' && !torrent.done && (torrent.progress || 0) < 0.99) {
        const prebufResult = await waitForPrebuffer(torrent, fileIndex, undefined, {
            requireMetadataTail: Boolean(options?.requireMetadataTail),
        });
        prebuffered = prebufResult.ready;
        if (!prebuffered && prebufResult.reason === 'prebuffer_timeout') {
            return {
                success: false,
                url: null,
                ready: false,
                error: 'prebuffer_timeout',
                prebuffered: false,
                downloadedBytes: prebufResult.downloadedBytes,
            };
        }
    }

    // Poll getStreamUrl until the HLS manifest is written by ffmpeg.
    // For MKV files, session-manager starts ffmpeg and immediately returns
    // transcode_not_ready because the manifest doesn't exist yet. We keep
    // retrying here (not in WatchPage) so the player receives a URL only
    // once playback is truly ready.
    const TRANSCODE_POLL_MS = 1000;
    const TRANSCODE_TIMEOUT_MS = 45_000;
    const transcodeStart = Date.now();
    let streamResult;
    while (true) {
        streamResult = await getStreamUrl(sessionId, fileIndex);
        if (streamResult?.success) break;
        if (streamResult?.error !== 'transcode_not_ready') break; // hard error
        if (Date.now() - transcodeStart > TRANSCODE_TIMEOUT_MS) break; // timed out
        await new Promise((r) => setTimeout(r, TRANSCODE_POLL_MS));
    }
    if (!streamResult?.success) {
        const err = streamResult?.error || 'stream_unavailable';
        const timedOut = err === 'transcode_not_ready' && Date.now() - transcodeStart > TRANSCODE_TIMEOUT_MS;
        return {
            success: false,
            url: null,
            ready: false,
            error: timedOut ? 'transcode_timeout' : err,
            prebuffered,
        };
    }

    return {
        success: true,
        url: streamResult.url,
        rawUrl: streamResult.rawUrl,
        ready: true,
        prebuffered,
        name: streamResult.name,
        length: streamResult.length,
        fileIndex: streamResult.fileIndex,
        infoHash: streamResult.infoHash,
    };
}

module.exports = { createPlaybackManifest, waitForPrebuffer, PREBUFFER_BYTES };
