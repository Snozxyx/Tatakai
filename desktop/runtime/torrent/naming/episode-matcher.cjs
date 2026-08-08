'use strict';

const { parseReleaseName } = require('./release-parser.cjs');

/**
 * Matches torrent files to a target episode.
 *
 * Handles:
 *   - Single episode files (exact episode match)
 *   - Season+Episode files (S01E12 style)
 *   - Batch torrents (selects correct file index within batch)
 *   - Episode ranges (01-12 batch)
 *   - Fuzzy matching for inconsistent naming (Requirement 15.1)
 *   - Returns best match file index for use with WebTorrent file selection
 *
 * @param {Array<{name: string, length?: number}>} torrentFiles - Files in the torrent
 * @param {{ episode: number, season?: number }} animeMetadata - Target episode info
 * @returns {{ matched: boolean, fileIndex: number, episode?: number, parsed?: object, confidence: number }}
 */
function matchTorrentFilesToEpisode(torrentFiles, animeMetadata) {
    if (!Array.isArray(torrentFiles) || torrentFiles.length === 0) {
        return { matched: false, fileIndex: 0, confidence: 0 };
    }

    const targetEp = Number(animeMetadata?.episode ?? animeMetadata?.episodeNumber);
    const targetSeason = Number(animeMetadata?.season ?? 1);

    // Filter to video files only
    const videoFiles = torrentFiles
        .map((f, originalIndex) => ({ file: f, originalIndex }))
        .filter(({ file }) => /\.(mkv|mp4|avi|m4v|ts|mov|webm)$/i.test(file.name || ''));

    if (videoFiles.length === 0) {
        return { matched: false, fileIndex: 0, confidence: 0 };
    }

    // Fuzzy normalization helper: "Episode 05" -> "5", "001" -> "1"
    const normalizeNum = (n) => n != null ? String(parseInt(n, 10)) : null;

    // Score each video file
    const scored = videoFiles.map(({ file, originalIndex }) => {
        const parsed = parseReleaseName(file.name || '');
        let confidence = Math.floor((parsed.confidence || 0) * 0.1); // Base confidence from metadata quality
        let matched = false;

        const ep = parsed.episodeNumber;
        const epEnd = parsed.episodeEnd;
        const season = parsed.season;

        if (!isNaN(targetEp)) {
            const normTarget = normalizeNum(targetEp);
            const normEp = normalizeNum(ep);

            if (normEp === normTarget) {
                // Exact episode match
                // If season is provided, prioritize it. If not, don't penalize.
                if (season != null) {
                    confidence = season === targetSeason ? 100 : 85;
                } else {
                    confidence = 95; // High confidence even without season info
                }
                matched = true;
            } else if (ep != null && epEnd != null && targetEp >= ep && targetEp <= epEnd) {
                // Target falls within episode range (batch file)
                confidence = parsed.isBatch ? 85 : 75;
                matched = true;
            } else if (normEp != null) {
                // Fuzzy check for absolute vs relative numbering (Requirement 15.2)
                // e.g. One Piece Ep 1161 in a S22 folder
                const diff = Math.abs(ep - targetEp);
                if (diff === 0) confidence = 90;
                else if (diff <= 1) confidence = 40;
            }
        }

        // Penalty for mismatched season if both are explicitly present
        if (matched && season != null && season !== targetSeason) {
            confidence -= 15;
        }
        
        // Bonus for "clean" files (no samples/trailers)
        if (!/sample|trailer|preview|promo/i.test(file.name || '')) {
            confidence += 5;
        }

        return { originalIndex, parsed, matched, confidence: Math.min(100, confidence), file };
    });

    // Sort by confidence descending
    scored.sort((a, b) => b.confidence - a.confidence);
    const best = scored[0];

    if (best.confidence >= 50) {
        return {
            matched: true,
            fileIndex: best.originalIndex,
            episode: targetEp,
            parsed: best.parsed,
            confidence: best.confidence,
            fileName: best.file.name,
        };
    }

    // No confident match — return largest video file (most likely the main content)
    const largest = videoFiles.reduce((a, b) =>
        (b.file.length || 0) > (a.file.length || 0) ? b : a
    );
    return {
        matched: false,
        fileIndex: largest.originalIndex,
        parsed: parseReleaseName(largest.file.name || ''),
        confidence: 0,
        fileName: largest.file.name,
    };
}

/**
 * Legacy single-file matcher (backward compatibility).
 */
function matchTorrentFileToEpisode(torrentFile, animeMetadata) {
    const parsed = parseReleaseName(torrentFile?.name || String(torrentFile || ''));
    const targetEp = animeMetadata?.episode ?? animeMetadata?.episodeNumber;

    if (targetEp != null && parsed.episodeNumber === targetEp) {
        return { matched: true, episode: targetEp, parsed, confidence: 100 };
    }
    return { matched: false, parsed, confidence: 0 };
}

module.exports = { matchTorrentFilesToEpisode, matchTorrentFileToEpisode };
