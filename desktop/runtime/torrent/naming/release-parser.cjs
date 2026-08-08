'use strict';

/**
 * Full anitomy-style release name parser for anime torrent filenames.
 *
 * Extracts: title, episode, season, resolution, codec, audio, source,
 * bit depth, subtitle format, release group, and batch signals.
 *
 * No external dependencies — pure regex heuristics modeled after anitomyscript.
 */

const TRUSTED_GROUPS = new Set([
    'SubsPlease', 'Erai-raws', 'Judas', 'EMBER', 'HorribleSubs',
    'NanDesuKa', 'LostYears', 'Anime Time', 'Reaktor', 'GJM',
    'Yametekudasai', 'Dogi', 'Pog42', 'MTBB', 'Kaleido-subs',
]);

const SOURCE_PATTERNS = [
    { pattern: /\b(blu[- ]?ray|bdremux|bd)\b/i,   value: 'BluRay',  score: 30 },
    { pattern: /\b(web[- ]?dl|webdl)\b/i,          value: 'WEB-DL',  score: 25 },
    { pattern: /\b(web[- ]?rip|webrip)\b/i,        value: 'WEBRip',  score: 20 },
    { pattern: /\b(hdtv)\b/i,                      value: 'HDTV',    score: 12 },
    { pattern: /\b(dvd|dvdrip)\b/i,                value: 'DVD',     score: 5  },
    { pattern: /\b(amzn|amazon)\b/i,               value: 'AMZN',    score: 26 },
    { pattern: /\b(cr|crunchyroll)\b/i,            value: 'CR',      score: 22 },
    { pattern: /\b(adn|abema|hidive|funi)\b/i,     value: 'Streaming', score: 21 },
];

const SOURCE_TAG_PATTERNS = [
    { pattern: /\b(amzn|amazon)\b/i, value: 'AMZN' },
    { pattern: /\b(dsnp|disney\+?)\b/i, value: 'DSNP' },
    { pattern: /\b(nf|netflix)\b/i, value: 'NF' },
    { pattern: /\b(cr|crunchyroll)\b/i, value: 'CR' },
];

const CODEC_PATTERNS = [
    { pattern: /\b(av1)\b/i,               value: 'AV1',   score: 12 },
    { pattern: /\b(x265|h\.?265|hevc)\b/i, value: 'H.265', score: 8  },
    { pattern: /\b(x264|h\.?264|avc)\b/i,  value: 'H.264', score: 4  },
    { pattern: /\b(vp9)\b/i,               value: 'VP9',   score: 6  },
];

const VIDEO_CODEC_PATTERNS = [
    { pattern: /\b(av1)\b/i, value: 'AV1' },
    { pattern: /\b(x265|h\.?265|hevc)\b/i, value: 'H.265' },
    { pattern: /\b(x264|h\.?264|avc)\b/i, value: 'H.264' },
    { pattern: /\b(vp9)\b/i, value: 'VP9' },
];

const AUDIO_CODEC_PATTERNS = [
    { pattern: /\b(flac)\b/i, value: 'FLAC' },
    { pattern: /\b(aac)\b/i, value: 'AAC' },
    { pattern: /\b(ac3|dolby[- ]?digital)\b/i, value: 'AC3' },
    { pattern: /\b(e-?ac3|ddp)\b/i, value: 'EAC3' },
    { pattern: /\b(truehd)\b/i, value: 'TrueHD' },
    { pattern: /\b(dts(?:-hdma)?)\b/i, value: 'DTS' },
    { pattern: /\b(opus)\b/i, value: 'Opus' },
];

const AUDIO_PATTERNS = [
    { pattern: /\b(flac)\b/i,              value: 'FLAC',       score: 6 },
    { pattern: /\b(aac)\b/i,              value: 'AAC',        score: 4 },
    { pattern: /\b(ac3|dolby[- ]?digital)\b/i, value: 'AC3',   score: 3 },
    { pattern: /\b(truehd)\b/i,           value: 'TrueHD',     score: 7 },
    { pattern: /\b(dts)\b/i,              value: 'DTS',        score: 5 },
    { pattern: /\b(dual[- ]?audio|multi[- ]?audio)\b/i, value: 'DualAudio', score: 8 },
    { pattern: /\b(jpn|japanese)\b/i,      value: 'Japanese',   score: 0 },
    { pattern: /\b(eng|english)\b/i,       value: 'English',    score: 0 },
];

const SUB_PATTERNS = [
    { pattern: /\b(ass|ssa)\b/i,  value: 'ASS',  score: 5 },
    { pattern: /\b(srt)\b/i,      value: 'SRT',  score: 3 },
    { pattern: /\b(pgs)\b/i,      value: 'PGS',  score: 4 },
    { pattern: /\b(vtt)\b/i,      value: 'VTT',  score: 3 },
    { pattern: /\b(soft[- ]?sub|softsub)\b/i, value: 'SoftSub', score: 4 },
    { pattern: /\b(hard[- ]?sub|hardsub)\b/i, value: 'HardSub', score: 1 },
    { pattern: /\b(multi[- ]?sub|multiple[- ]?sub)\b/i, value: 'MultiSub', score: 6 },
];

/**
 * Extract release group from brackets.
 * Groups appear at the start [Group] or end [...Group].
 */
function extractGroup(name) {
    // Leading bracket group: [SubsPlease] Anime Name ...
    const leading = name.match(/^\s*\[([^\]]{1,30})\]/);
    if (leading) return leading[1].trim();
    // Trailing bracket group
    const trailing = name.match(/\[([^\]]{1,30})\]\s*$/);
    if (trailing) return trailing[1].trim();
    return undefined;
}

/**
 * Extract anime title by stripping known metadata tokens.
 */
function extractTitle(name, group) {
    let work = name;
    // Remove leading group bracket
    if (group) {
        // Only remove if it's actually the group name we found
        const escapedGroup = group.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        work = work.replace(new RegExp(`^\\s*\\[${escapedGroup}\\]\\s*`, 'i'), '');
    }
    // Remove parenthetical year
    work = work.replace(/\(\d{4}\)/g, '');
    // Remove trailing brackets (metadata)
    work = work.replace(/\[[^\]]*\]/g, '');
    // Remove empty bracket/paren fragments left behind by cleanup
    work = work.replace(/\(\s*\)/g, ' ').replace(/\[\s*\]/g, ' ');
    // Remove metadata tokens (episode, resolution, codec, etc.)
    // Stop at the first mention of Episode/S01E01/Resolution
    const metaIdx = work.search(/\b(S\d{1,2}E\d{1,3}|Episode|Ep\.?|E\d{1,3}|[0-9]{1,4}v\d)\b/i);
    if (metaIdx !== -1) {
        work = work.substring(0, metaIdx);
    }
    // Remove common quality/source tails
    work = work
        .replace(/\b(2160p|1080p|720p|540p|480p)\b/ig, ' ')
        .replace(/\b(bluray|bdremux|bd|web[- ]?dl|webdl|web[- ]?rip|webrip|dvd|dvdrip|hdtv)\b/ig, ' ')
        .replace(/\b(x265|x264|h\.?265|h\.?264|hevc|avc|av1|aac|ac3|flac|dts|truehd)\b/ig, ' ')
        .replace(/\b(dual[- ]?audio|multi[- ]?audio|multi[- ]?sub|multiple[- ]?sub|softsub|hardsub)\b/ig, ' ')
        .replace(/\b(amzn|amazon|dsnp|disney\+?|nf|netflix|cr|crunchyroll)\b/ig, ' ')
        .replace(/\b(ddp\d(?:\.\d)?|e-?ac3|aac\d(?:\.\d)?)\b/ig, ' ')
        .replace(/\b(remux|repack|v\d+|batch|complete)\b/ig, ' ')
        .replace(/\b(19\d{2}|20\d{2})\b/g, ' ');
    // Remove crc-like hashes
    work = work.replace(/\b[0-9A-F]{8}\b/ig, ' ');
    // Trim a trailing release-group-like suffix that often appears after a dash.
    work = work.replace(/\s*[-_.]+\s*[A-Z0-9]{2,30}\s*$/g, ' ');
    // Clean punctuation
    work = work.replace(/[_.]/g, ' ').replace(/\s{2,}/g, ' ').trim();
    // Remove trailing hyphens/dots
    work = work.replace(/[-.\s]+$/, '').trim();
    return work || undefined;
}

/**
 * Extract episode number(s) from filename.
 * Returns { episodeNumber, episodeEnd, isSpecial, isBatch } for ranges (batch files).
 */
function extractEpisode(name) {
    // Pattern: S00E03 — season zero means special episode; handle before generic SxEx
    const s00 = name.match(/\bS00[\s._-]*E(\d{1,3})\b/i);
    if (s00) {
        return {
            season: 0,
            episodeNumber: parseInt(s00[1], 10),
            isSpecial: true,
        };
    }

    // Pattern: S01E12 or S1E12
    const sxe = name.match(/\bS(\d{1,2})[\s._-]*E(\d{1,3})(?:[\s._-]*-?[\s._-]*E?(\d{1,3}))?\b/i);
    if (sxe) {
        return {
            season: parseInt(sxe[1], 10),
            episodeNumber: parseInt(sxe[2], 10),
            episodeEnd: sxe[3] ? parseInt(sxe[3], 10) : undefined,
        };
    }
    // Pattern: - 12 or - 12v2 (SubsPlease style), but NOT a range like - 01-12
    // Check for episode ranges FIRST so the range hyphen isn't mistaken for a dash-episode marker
    // Episode range: 01-12 → batch
    const range = name.match(/\b(\d{2,3})[\s._-]*[-~][\s._-]*(\d{2,3})\b/);
    if (range) {
        const a = parseInt(range[1], 10), b = parseInt(range[2], 10);
        if (b > a && b - a < 200) {
            return { episodeNumber: a, episodeEnd: b, isBatch: true };
        }
    }

    // SubsPlease / Erai-raws style: "Anime Title - 1161 (1080p)"
    const dashEp = name.match(/-\s*(\d{1,4})(?:[A-Za-z])?(?:v\d)?(?:\s*\(|\s*\[|\s*$)/);
    if (dashEp) return { episodeNumber: parseInt(dashEp[1], 10) };

    // Episode keyword: Episode 5, Ep.5, E05
    const keyword = name.match(/\b(?:Episode|Ep\.?|E)[\s._-]*(\d{1,4})\b/i);
    if (keyword) return { episodeNumber: parseInt(keyword[1], 10) };

    // Decimal specials like 18.5
    const decimal = name.match(/\b(\d{1,3}\.\d)\b/);
    if (decimal) {
        return {
            episodeNumber: parseFloat(decimal[1]),
            isSpecial: true,
        };
    }

    // Bare number after space/bracket (last resort)
    const bare = name.match(/(?:[\s\[_-])(\d{1,4})(?:v\d)?(?:[\s\]_.-]|$)/);
    if (bare) {
        const n = parseInt(bare[1], 10);
        // Skip year-like numbers
        if (n < 2000 && n > 0) return { episodeNumber: n };
    }
    return {};
}

/**
 * Extract season number separately (for series-level context).
 */
function extractSeason(name) {
    const s = name.match(/\bSeason[\s._-]*(\d{1,2})\b|\bS(\d{1,2})(?:E\d)?\b/i);
    if (s) return parseInt(s[1] || s[2], 10);
    const part = name.match(/\bPart[\s._-]*([1-4])\b/i);
    if (part) return parseInt(part[1], 10);
    return undefined;
}

function extractResolution(name) {
    const dim = name.match(/\b(\d{3,4})x(\d{3,4})\b/i);
    if (dim) {
        const h = Math.max(Number(dim[1]), Number(dim[2]));
        if (h >= 2100) return '2160p';
        if (h >= 1000) return '1080p';
        if (h >= 700) return '720p';
        if (h >= 500) return '576p';
        return '480p';
    }

    const m = name.match(/\b(480|540|576|720|1080|2160|4320)([pi])?\b/i);
    if (!m) return undefined;
    const scan = (m[2] || 'p').toLowerCase();
    return `${m[1]}${scan}`;
}

function extractBitDepth(name) {
    if (/\b10[- ]?bit\b|\bhi10p\b/i.test(name)) return '10bit';
    if (/\b8[- ]?bit\b/i.test(name)) return '8bit';
    return undefined;
}

function matchFirst(name, patterns) {
    for (const { pattern, value } of patterns) {
        if (pattern.test(name)) return value;
    }
    return undefined;
}

function matchAll(name, patterns) {
    return patterns
        .filter(({ pattern }) => pattern.test(name))
        .map(({ value }) => value);
}

function extractYear(name) {
    const m = name.match(/\b(19\d{2}|20\d{2})\b/);
    return m ? Number(m[1]) : undefined;
}

function extractPrimaryCodecs(name) {
    const video = matchFirst(name, VIDEO_CODEC_PATTERNS);
    const audio = matchFirst(name, AUDIO_CODEC_PATTERNS);
    return { videoCodec: video, audioCodec: audio };
}

function isRemux(name) {
    return /\b(remux|bdremux|dvd\s*remux)\b/i.test(name);
}

function extractSpecialEpisodeCode(name) {
    const m = name.match(/\bS00[\s._-]*E(\d{1,3})\b/i);
    return m ? Number(m[1]) : undefined;
}

function extractSourceTag(name) {
    return matchFirst(name, SOURCE_TAG_PATTERNS);
}

/**
 * Main parser. Returns a rich metadata object from a release filename.
 *
 * @param {string} filename
 * @returns {ParsedRelease}
 */
function parseReleaseName(filename) {
    /** Safe default returned on any unexpected exception */
    const safeDefault = {
        raw: filename,
        title: undefined,
        searchTitle: '',
        releaseGroup: undefined,
        episodeNumber: undefined,
        episodeEnd: undefined,
        season: undefined,
        specialEpisode: undefined,
        isSpecial: false,
        year: undefined,
        resolution: undefined,
        bitDepth: undefined,
        codec: undefined,
        videoCodec: undefined,
        audioCodec: undefined,
        source: undefined,
        sourceTag: undefined,
        remux: false,
        audio: [],
        subtitleFormats: [],
        isDualAudio: false,
        isHardSub: false,
        isBatch: false,
        isTrusted: false,
        confidence: 0,
    };

    try {
        const name = String(filename || '').replace(/\.(mkv|mp4|avi|m4v|mov|ts)$/i, '');

        const releaseGroup = extractGroup(name);
        const resolution = extractResolution(name);
        const bitDepth = extractBitDepth(name);
        const codec = matchFirst(name, CODEC_PATTERNS);
        const { videoCodec, audioCodec } = extractPrimaryCodecs(name);
        const source = matchFirst(name, SOURCE_PATTERNS);
        const sourceTag = extractSourceTag(name);
        const audio = matchAll(name, AUDIO_PATTERNS);
        const subtitleFormats = matchAll(name, SUB_PATTERNS);
        const isDualAudio = /\b(dual[- ]?audio|multi[- ]?audio)\b/i.test(name);
        const isHardSub = /\b(hard[- ]?sub|hardsub)\b/i.test(name);

        const episodeResult = extractEpisode(name);
        const { season, episodeNumber, episodeEnd, isSpecial } = episodeResult;
        // isBatch from episode range detection takes precedence; also check name-level keywords
        const isBatch = Boolean(episodeResult.isBatch)
            || /\b(batch|complete|bd[- ]?box|season\s*\d+\s*-\s*\d+)\b/i.test(name)
            || (/\b(\d{2,3})\s*-\s*(\d{2,3})\b/.test(name) && episodeEnd != null);

        const seasonFallback = season ?? extractSeason(name);
        // specialEpisode from S00Exx: extractEpisode already handles S00 → isSpecial,
        // but we still call extractSpecialEpisodeCode for the numeric value.
        const specialEpisode = extractSpecialEpisodeCode(name);

        let title = extractTitle(name, releaseGroup);

        if (title) {
            if (episodeNumber != null) {
                const episodeToken = String(episodeNumber).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                title = title.replace(new RegExp(`(^|[\\s._-])${episodeToken}(?=([\\s._-]|$))`, 'g'), ' ');
            }

            if (episodeEnd != null && episodeEnd !== episodeNumber) {
                const episodeEndToken = String(episodeEnd).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                title = title.replace(new RegExp(`(^|[\\s._-])${episodeEndToken}(?=([\\s._-]|$))`, 'g'), ' ');
            }

            title = title
                .replace(/\b(end)\b/ig, ' End ')
                .replace(/\b(\d{4})\b/g, ' ')
                .replace(/\s{2,}/g, ' ')
                .replace(/[-.\s]+$/, '')
                .trim();
        }
        const year = extractYear(name);
        const remux = isRemux(name);
        const isTrusted = releaseGroup ? TRUSTED_GROUPS.has(releaseGroup) : false;
        const confidence = calculateParseConfidence({
            title,
            episodeNumber,
            specialEpisode,
            resolution,
            source,
            sourceTag,
            codec,
            videoCodec,
            audioCodec,
            releaseGroup,
            isBatch,
            isTrusted,
            remux,
        });
        const searchTitle = buildSearchTitle(title, name);

        return {
            raw: filename,
            title,
            searchTitle,
            releaseGroup,
            episodeNumber,
            episodeEnd,
            season: seasonFallback,
            specialEpisode,
            isSpecial: Boolean(isSpecial || specialEpisode != null),
            year,
            resolution,
            bitDepth,
            codec,
            videoCodec,
            audioCodec,
            source,
            sourceTag,
            remux,
            audio,
            subtitleFormats,
            isDualAudio,
            isHardSub,
            isBatch,
            isTrusted,
            confidence,
        };
    } catch (_err) {
        return safeDefault;
    }
}

function calculateParseConfidence(parsed) {
    let score = 0;
    if (parsed.title) score += 45;
    if (parsed.episodeNumber != null) score += 20;
    if (parsed.specialEpisode != null) score += 8;
    if (parsed.resolution) score += 8;
    if (parsed.source) score += 8;
    if (parsed.sourceTag) score += 5;
    if (parsed.codec) score += 6;
    if (parsed.videoCodec) score += 5;
    if (parsed.audioCodec) score += 5;
    if (parsed.releaseGroup) score += 5;
    if (parsed.isBatch) score += 4;
    if (parsed.isTrusted) score += 4;
    if (parsed.remux) score += 3;
    return Math.max(0, Math.min(100, score));
}

function buildSearchTitle(title, rawName) {
    const source = String(title || rawName || '');
    const normalized = source
        .replace(/\[[^\]]*\]/g, ' ')
        .replace(/\([^)]*\)/g, ' ')
        .replace(/\b(S\d{1,2}E\d{1,3}|E\d{1,3}|Episode\s*\d{1,3}|Season\s*\d{1,2})\b/ig, ' ')
        .replace(/\b(2160p|1080p|720p|540p|480p|x264|x265|h\.?264|h\.?265|hevc|avc|aac|flac|ac3|dts|truehd)\b/ig, ' ')
        .replace(/[._]/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();

    return normalized || title || rawName || '';
}

module.exports = { parseReleaseName, TRUSTED_GROUPS, calculateParseConfidence, buildSearchTitle };
