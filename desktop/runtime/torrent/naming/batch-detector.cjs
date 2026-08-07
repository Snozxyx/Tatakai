'use strict';

/**
 * Detect whether a torrent is a batch/season pack.
 *
 * Uses two signals:
 *   1. Title pattern — keywords like "batch", "complete series", episode range (01-12)
 *   2. File count — a torrent with > 1 video file is almost certainly a batch
 *
 * @param {{ title?: string, name?: string }} torrentMeta - Torrent metadata (title/name)
 * @param {Array<{name: string}>} [files] - Torrent file list (from WebTorrent)
 * @returns {{ isBatch: boolean, title: string, signal: string, episodeCount?: number }}
 */
function detectBatchTorrentLayout(torrentMeta, files) {
    const title = torrentMeta?.title || torrentMeta?.name || '';

    // Signal 1: title pattern
    const titleBatch = /\b(batch|complete\s*(series)?|bd[- ]?box|season\s*\d+\s*-\s*\d+)\b/i.test(title);
    const rangeMatch = title.match(/\b(\d{2,3})\s*-\s*(\d{2,3})\b/);
    const titleRange = !!rangeMatch;
    let episodeCount;
    if (rangeMatch) {
        const from = parseInt(rangeMatch[1], 10);
        const to = parseInt(rangeMatch[2], 10);
        if (to > from && to - from < 200) episodeCount = to - from + 1;
    }

    // Signal 2: file count
    const videoFiles = Array.isArray(files)
        ? files.filter((f) => /\.(mkv|mp4|avi|m4v|ts|mov|webm|flv|wmv|mpg|mpeg|ogv)$/i.test(f.name || ''))
        : [];
    const fileCountBatch = videoFiles.length > 1;

    const isBatch = titleBatch || titleRange || fileCountBatch;
    let signal = 'none';
    if (titleBatch) signal = 'title-keyword';
    else if (titleRange) signal = 'title-range';
    else if (fileCountBatch) signal = 'file-count';

    return {
        isBatch,
        title,
        signal,
        episodeCount: episodeCount ?? (fileCountBatch ? videoFiles.length : undefined),
        videoFileCount: videoFiles.length,
    };
}

module.exports = { detectBatchTorrentLayout };
