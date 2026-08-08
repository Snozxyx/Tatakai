'use strict';

/**
 * Piece prioritization for streaming playback.
 *
 * WebTorrent exposes `torrent.file.select()` and `torrent.critical()` which
 * mark pieces as high-priority. This module wraps those calls to implement
 * sequential playback-first prioritization.
 *
 * Strategy:
 *   1. Call `file.select()` on the target file — tells WebTorrent to focus on it
 *   2. Use `torrent.critical(startPiece, endPiece)` to mark the first N seconds
 *      of playback as critical (downloaded before anything else)
 *
 * @param {import('webtorrent').Torrent} torrent - Active WebTorrent torrent
 * @param {number} fileIndex - Index of the file to prioritize
 * @param {{ prebufferBytes?: number }} [options]
 * @returns {{ strategy: string, applied: boolean, criticalPieces?: number }}
 */
function prioritizePlaybackPieces(torrent, fileIndex = 0, options = {}) {
    if (!torrent || typeof torrent !== 'object') {
        return { strategy: 'noop', applied: false, reason: 'no_torrent' };
    }

    const file = torrent.files?.[fileIndex];
    if (!file) {
        return { strategy: 'noop', applied: false, reason: 'file_not_found' };
    }

    try {
        // 1. Select the file — deselects all others and focuses bandwidth
        if (typeof file.select === 'function') {
            file.select();
        }

        // 2. Mark first ~15MB of the file as critical pieces (Requirement 10.1)
        // This ensures the video starts playing as quickly as possible.
        const prebufferBytes = options.prebufferBytes ?? 15 * 1024 * 1024;
        const pieceLength = torrent.pieceLength || 262144; // default 256KB
        const fileOffset = file.offset ?? 0;
        const startPiece = Math.floor(fileOffset / pieceLength);
        const criticalPieces = Math.ceil(prebufferBytes / pieceLength);
        const endPiece = startPiece + criticalPieces;

        if (typeof torrent.critical === 'function') {
            torrent.critical(startPiece, endPiece);
        }

        // 3. Mark the last pieces of the file as critical (Requirement 10.2)
        // Some video containers (MP4, MKV) store metadata or indexes at the end.
        // Downloading the end helps players resolve duration and seek points.
        // NOTE: We do not call torrent.critical here because calling critical() multiple
        // times overwrites the previous range, which would remove the high priority from the start pieces.
        // Instead, we use torrent.select() with a higher priority (1) for these pieces.
        const fileEndOffset = fileOffset + file.length;
        const lastPiece = Math.floor(fileEndOffset / pieceLength);
        const metadataPieces = Math.ceil((options.metadataBytes ?? 2 * 1024 * 1024) / pieceLength); // last 2MB
        const metadataStartPiece = Math.max(startPiece, lastPiece - metadataPieces);

        if (typeof torrent.select === 'function') {
            torrent.select(metadataStartPiece, lastPiece, 1);
        }

        return {
            strategy: 'sequential-critical-with-metadata',
            applied: true,
            startPiece,
            endPiece,
            metadataStartPiece,
            lastPiece,
            criticalPieces,
        };
    } catch (err) {
        return { strategy: 'sequential-critical', applied: false, reason: err.message };
    }
}

/**
 * Dynamic prioritization based on current playback time.
 * Marks pieces around the current time as critical.
 * 
 * @param {import('webtorrent').Torrent} torrent 
 * @param {number} fileIndex 
 * @param {number} currentTime - seconds
 * @param {number} duration - seconds
 */
function prioritizeSeekPoint(torrent, fileIndex, currentTime, duration) {
    if (!torrent || !torrent.files?.[fileIndex]) return;
    
    const file = torrent.files[fileIndex];
    const pieceLength = torrent.pieceLength || 262144;
    const fileOffset = file.offset || 0;
    const fileLength = file.length;
    
    if (duration <= 0) return;
    
    // Calculate the byte position in the file
    const bytePosition = (currentTime / duration) * fileLength;
    const absoluteOffset = fileOffset + bytePosition;
    
    const centerPiece = Math.floor(absoluteOffset / pieceLength);
    
    // Mark next 20MB as critical (about 30-60s of video)
    const lookaheadBytes = 20 * 1024 * 1024;
    const lookaheadPieces = Math.ceil(lookaheadBytes / pieceLength);
    
    // Mark previous 5MB as critical (just in case of small seeks back)
    const lookbehindBytes = 5 * 1024 * 1024;
    const lookbehindPieces = Math.ceil(lookbehindBytes / pieceLength);
    
    const start = Math.max(Math.floor(fileOffset / pieceLength), centerPiece - lookbehindPieces);
    const end = Math.min(Math.floor((fileOffset + fileLength) / pieceLength), centerPiece + lookaheadPieces);
    
    if (typeof torrent.critical === 'function') {
        torrent.critical(start, end);
    }
}

module.exports = { prioritizePlaybackPieces, prioritizeSeekPoint };
