'use strict';
const { parseReleaseName } = require('../naming/release-parser.cjs');
const MAX_BUDGET = 20 * 1024 * 1024;
function preloadFile(entry, fileIndex, budget = MAX_BUDGET) {
    const torrent = entry.torrent;
    const file = torrent.files[fileIndex];
    if (!file || !torrent.pieceLength) return { success: false, error: 'file_not_found' };
    const count = Math.floor(Math.min(MAX_BUDGET, Math.max(0, Number(budget) || 0)) / torrent.pieceLength);
    if (!count) return { success: false, error: 'preload_budget_too_small' };
    const start = Math.floor(file.offset / torrent.pieceLength);
    const end = Math.min(torrent.pieces.length - 1, Math.floor((file.offset + file.length - 1) / torrent.pieceLength), start + count - 1);
    torrent.select(start, end, 0);
    entry.preloadRanges = [{ start, end }];
    return { success: true, budgetBytes: (end - start + 1) * torrent.pieceLength };
}
function cancelPreload(entry) {
    for (const range of entry?.preloadRanges || []) entry.torrent.deselect?.(range.start, range.end, 0);
    if (entry) entry.preloadRanges = [];
}
function preloadNextEpisode(entry, nextEpisode, budget = MAX_BUDGET) {
    if (!entry?.torrent) return { success: false, error: 'session_not_found' };
    cancelPreload(entry);
    const torrent = entry.torrent;
    const index = torrent.files.findIndex((file, i) => i !== entry.targetFileIndex && parseReleaseName(file.name).episodeNumber === nextEpisode);
    if (index < 0) return { success: false, error: 'next_episode_not_in_torrent' };
    const file = torrent.files[index];
    const pieceLength = torrent.pieceLength;
    const limit = Math.min(MAX_BUDGET, Math.max(0, Number(budget) || 0));
    const count = Math.floor(limit / pieceLength);
    if (!count || !file.length) return { success: false, error: 'preload_budget_too_small' };
    const start = Math.floor(file.offset / pieceLength);
    const end = Math.min(torrent.pieces.length - 1, Math.floor((file.offset + file.length - 1) / pieceLength), start + count - 1);
    const current = torrent.files[entry.targetFileIndex || 0];
    const currentStart = Math.floor(current.offset / pieceLength), currentEnd = Math.floor((current.offset + current.length - 1) / pieceLength);
    const ranges = [];
    if (start < currentStart) ranges.push({ start, end: Math.min(end, currentStart - 1) });
    if (end > currentEnd) ranges.push({ start: Math.max(start, currentEnd + 1), end });
    const safe = ranges.filter(range => range.end >= range.start);
    for (const range of safe) torrent.select(range.start, range.end, 0);
    entry.preloadRanges = safe;
    return { success: true, fileIndex: index, budgetBytes: safe.reduce((sum, range) => sum + (range.end - range.start + 1) * pieceLength, 0) };
}
module.exports = { preloadNextEpisode, preloadFile, cancelPreload, MAX_BUDGET };
