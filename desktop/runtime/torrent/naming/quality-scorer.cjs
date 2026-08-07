'use strict';

const { TRUSTED_GROUPS } = require('./release-parser.cjs');

// Source quality tiers (higher = better)
const SOURCE_SCORES = {
    BluRay:    35,
    AMZN:      28,
    'WEB-DL':  26,
    CR:        24,
    Streaming: 22,
    WEBRip:    20,
    HDTV:      12,
    DVD:       5,
};

// Codec quality tiers
const CODEC_SCORES = {
    AV1:    15,
    'H.265': 10,
    VP9:     8,
    'H.264': 4,
};

// Audio quality tiers
const AUDIO_SCORES = {
    TrueHD:     10,
    FLAC:        8,
    DTS:         6,
    AAC:         4,
    AC3:         3,
    DualAudio:   10,
};

// Subtitle quality tiers
const SUB_SCORES = {
    MultiSub:  10,
    ASS:       8,
    PGS:       6,
    SoftSub:   6,
    VTT:       4,
    SRT:       4,
    HardSub:  -10,
};

/**
 * Scores a parsed release on a 0–250 scale.
 * Higher = better quality, more preferred by TatakaiTorrentCore.
 *
 * Scoring breakdown:
 *   Base:        50
 *   Resolution:  up to 50 (2160p: 50, 1080p: 35, 720p: 20)
 *   Source:      up to 35
 *   Codec:       up to 15
 *   Audio:       up to 20 (best audio + dual bonus)
 *   Subtitle:    up to 10
 *   Bit depth:   +10 for 10-bit
 *   Trusted group: +25 (Strongly prefer known groups)
 *   Batch:       -10 (prefer single-ep releases for streaming)
 *   Seeder bonus: up to 15 (Prefer healthy torrents for speed)
 *
 * @param {object} parsed - Output of parseReleaseName()
 * @param {{ seeders?: number }} [meta] - Optional runtime metadata (seeders)
 * @returns {number}
 */
function scoreReleaseQuality(parsed, meta = {}) {
    if (!parsed) return 0;

    let score = 50;

    // ── Resolution ──────────────────────────────────────────────────────────
    const res = String(parsed.resolution || '');
    if (res.startsWith('2160') || res.includes('4K')) score += 50;
    else if (res.startsWith('1080')) score += 35;
    else if (res.startsWith('720'))  score += 20;
    else if (res.startsWith('540'))  score += 10;
    else if (res.startsWith('480'))  score += 5;

    // ── Source ───────────────────────────────────────────────────────────────
    const srcScore = SOURCE_SCORES[parsed.source] ?? 0;
    score += srcScore;

    // ── Codec ────────────────────────────────────────────────────────────────
    const codecScore = CODEC_SCORES[parsed.codec] ?? 0;
    score += codecScore;

    // ── Audio (pick highest scoring audio signal) ────────────────────────────
    const audioSignals = Array.isArray(parsed.audio) ? parsed.audio : [];
    const bestAudio = audioSignals.reduce((best, sig) => {
        return Math.max(best, AUDIO_SCORES[sig] ?? 0);
    }, 0);
    score += bestAudio;

    // DualAudio / Dub bonus
    if (parsed.isDualAudio || parsed.isDub) score += 5;

    // ── Subtitle format ───────────────────────────────────────────────────────
    const subSignals = Array.isArray(parsed.subtitleFormats) ? parsed.subtitleFormats : [];
    const bestSub = subSignals.reduce((best, sig) => {
        return Math.max(best, SUB_SCORES[sig] ?? 0);
    }, 0);
    score += bestSub;

    // MultiSub bonus
    if (parsed.isMultiSub) score += 2;

    // ── Bit depth ────────────────────────────────────────────────────────────
    if (parsed.bitDepth === '10bit') score += 10;

    // ── Trusted release group ─────────────────────────────────────────────────
    if (parsed.isTrusted || TRUSTED_GROUPS.has(parsed.releaseGroup || '')) score += 25;

    // ── Batch penalty ────────────────────────────────────────────────────────
    if (parsed.isBatch) score -= 10;

    // ── Seeder health (SeaAnime style: prefer speed) ──────────────────────────
    const seeders = Number(meta?.seeders ?? 0);
    if (seeders > 0) {
        // Capped at 15pts. 100+ seeders = max bonus
        score += Math.min(15, (seeders / 100) * 15);
    }

    return Math.round(Math.max(0, Math.min(250, score)));
}

module.exports = { scoreReleaseQuality, SOURCE_SCORES, CODEC_SCORES };
