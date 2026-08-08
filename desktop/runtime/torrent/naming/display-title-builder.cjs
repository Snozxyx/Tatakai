'use strict';

/**
 * Build a clean, human-readable display title from parsed release metadata.
 *
 * Format: "Ep 12 · 1080p · H.265 · WEB-DL · 10bit · FLAC · [SubsPlease]"
 * or for batches: "Ep 1–12 · 1080p · BluRay · H.265 · [EMBER]"
 *
 * @param {object} parsedMetadata - Output of parseReleaseName()
 * @returns {string}
 */
function buildDisplayTitleFromRelease(parsedMetadata) {
    if (!parsedMetadata) return '';

    const parts = [];

    // Episode / range
    if (parsedMetadata.episodeNumber != null) {
        if (parsedMetadata.episodeEnd != null) {
            parts.push(`Ep ${parsedMetadata.episodeNumber}–${parsedMetadata.episodeEnd}`);
        } else {
            parts.push(`Ep ${parsedMetadata.episodeNumber}`);
        }
    } else if (parsedMetadata.isBatch) {
        parts.push('Batch');
    }

    // Season (only if > 1 to avoid cluttering single-season shows)
    if (parsedMetadata.season != null && parsedMetadata.season > 1) {
        parts.push(`S${parsedMetadata.season}`);
    }

    // Resolution
    if (parsedMetadata.resolution) parts.push(parsedMetadata.resolution);

    // Source
    if (parsedMetadata.source) parts.push(parsedMetadata.source);

    // Codec
    if (parsedMetadata.codec) parts.push(parsedMetadata.codec);

    // Bit depth
    if (parsedMetadata.bitDepth === '10bit') parts.push('10-bit');

    // Audio (most interesting ones)
    const audio = Array.isArray(parsedMetadata.audio) ? parsedMetadata.audio : [];
    const importantAudio = audio.filter((a) => ['FLAC', 'TrueHD', 'DTS', 'DualAudio'].includes(a));
    if (importantAudio.length > 0) parts.push(importantAudio[0]);
    if (parsedMetadata.isDualAudio && !importantAudio.includes('DualAudio')) {
        parts.push('Dual Audio');
    }

    // Subtitle format (only notable ones)
    const subs = Array.isArray(parsedMetadata.subtitleFormats) ? parsedMetadata.subtitleFormats : [];
    if (subs.includes('HardSub')) parts.push('HardSub');

    // Release group
    if (parsedMetadata.releaseGroup) parts.push(`[${parsedMetadata.releaseGroup}]`);

    return parts.length > 0 ? parts.join(' · ') : parsedMetadata.raw || '';
}

/**
 * Build a shorter badge-style label (for compact card display).
 * e.g. "1080p WEB-DL H.265"
 */
function buildQualityBadge(parsedMetadata) {
    if (!parsedMetadata) return '';
    const parts = [];
    if (parsedMetadata.resolution) parts.push(parsedMetadata.resolution);
    if (parsedMetadata.source) parts.push(parsedMetadata.source);
    if (parsedMetadata.codec) parts.push(parsedMetadata.codec);
    return parts.join(' ');
}

module.exports = { buildDisplayTitleFromRelease, buildQualityBadge };
