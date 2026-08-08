'use strict';

const axios = require('axios');
const { scoreReleaseQuality } = require('../naming/quality-scorer.cjs');
const { parseReleaseName } = require('../naming/release-parser.cjs');

/**
 * Extract a text value from an XML block by tag name.
 */
function xmlText(block, tag) {
    // CDATA variant
    const cdata = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`, 'i'));
    if (cdata) return cdata[1].trim();
    // Plain text
    const plain = block.match(new RegExp(`<${tag}[^>]*>([^<]*)<\\/${tag}>`, 'i'));
    return plain ? plain[1].trim() : '';
}

/**
 * Parse Nyaa RSS XML into an array of candidate objects.
 * Nyaa RSS exposes a `nyaa:` namespace with seeders, leechers, infoHash, etc.
 */
function parseNyaaRSS(xml) {
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let m;

    while ((m = itemRegex.exec(xml)) !== null) {
        const block = m[1];

        const title = xmlText(block, 'title');
        const link = xmlText(block, 'link') || xmlText(block, 'guid');
        const pubDate = xmlText(block, 'pubDate');
        const size = xmlText(block, 'nyaa:size');
        const seeders = parseInt(xmlText(block, 'nyaa:seeders') || '0', 10) || 0;
        const leechers = parseInt(xmlText(block, 'nyaa:leechers') || '0', 10) || 0;
        const downloads = parseInt(xmlText(block, 'nyaa:downloads') || '0', 10) || 0;
        const category = xmlText(block, 'nyaa:category');
        const trusted = xmlText(block, 'nyaa:trusted');
        const remake = xmlText(block, 'nyaa:remake');

        // infoHash from nyaa namespace or magnet
        const infoHashTag = block.match(/\<nyaa:infoHash\>([a-fA-F0-9]{40})<\/nyaa:infoHash>/i);
        const magnetMatch = block.match(/magnet:\?[^<"\s]+/i);
        const magnet = magnetMatch ? magnetMatch[0] : '';
        const infoHashMagnet = magnet.match(/btih:([a-fA-F0-9]{40})/i);
        const infoHash = (infoHashTag?.[1] || infoHashMagnet?.[1] || '').toLowerCase();

        if (!title || (!infoHash && !magnet)) continue;

        const parsed = parseReleaseName(title);
        const qualityScore = scoreReleaseQuality(parsed, { seeders });

        items.push({
            title: title.trim(),
            url: link.trim() || magnet,
            magnet: magnet || (infoHash ? `magnet:?xt=urn:btih:${infoHash}` : ''),
            infoHash,
            seeders,
            leechers,
            downloads,
            size: size || undefined,
            category: category || undefined,
            isTrusted: trusted === 'Yes',
            isRemake: remake === 'Yes',
            pubDate: pubDate || undefined,
            parsed,
            qualityScore,
            source: 'nyaa.si',
        });
    }

    return items;
}

/**
 * Search Nyaa.si RSS for torrent candidates.
 *
 * @param {{ query?: string, q?: string, category?: string }} options
 * @returns {Promise<TorrentCandidate[]>}
 */
async function searchNyaa(options) {
    const query = options.query || options.q || '';
    const category = options.category || '1_2'; // Anime - English-translated by default

    const url = `https://nyaa.si/?page=rss&c=${encodeURIComponent(category)}&f=0&q=${encodeURIComponent(query)}`;

    const { data } = await axios.get(url, {
        timeout: 20000,
        headers: {
            'User-Agent': 'TatakaiDesktop/1.0 (torrent discovery)',
            Accept: 'application/rss+xml, application/xml, text/xml, */*',
        },
        validateStatus: (s) => s >= 200 && s < 400,
    });

    return parseNyaaRSS(data);
}

/**
 * Search Nyaa with all relevant categories merged.
 * Searches both `1_2` (Anime-English) and `1_4` (Anime-Raw) and deduplicates by infoHash.
 */
async function searchNyaaMultiCategory(options) {
    const categories = ['1_2', '1_4'];
    const results = await Promise.allSettled(
        categories.map((category) => searchNyaa({ ...options, category }))
    );

    const seen = new Set();
    const merged = [];
    for (const r of results) {
        if (r.status !== 'fulfilled') continue;
        for (const item of r.value) {
            const key = item.infoHash || item.title;
            if (!seen.has(key)) {
                seen.add(key);
                merged.push(item);
            }
        }
    }

    return merged;
}

/**
 * Search AnimeTosho RSS for torrent candidates.
 *
 * @param {{ query?: string, q?: string }} options
 * @returns {Promise<TorrentCandidate[]>}
 */
async function searchAnimeTosho(options) {
    const query = options.query || options.q || '';
    const url = `https://animetosho.org/rss2.0?q=${encodeURIComponent(query)}`;

    try {
        const { data } = await axios.get(url, {
            timeout: 15000,
            headers: { 'User-Agent': 'TatakaiDesktop/1.0' },
        });

        const items = [];
        const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
        let m;

        while ((m = itemRegex.exec(data)) !== null) {
            const block = m[1];
            const title = xmlText(block, 'title');
            const magnetMatch = block.match(/magnet:\?[^<"\s]+/i);
            const magnet = magnetMatch ? magnetMatch[0] : '';
            const infoHashMatch = magnet.match(/btih:([a-fA-F0-9]{40})/i);
            const infoHash = (infoHashMatch?.[1] || '').toLowerCase();

            if (!title || (!infoHash && !magnet)) continue;

            const parsed = parseReleaseName(title);
            const qualityScore = scoreReleaseQuality(parsed, { seeders: 1 }); // Tosho doesn't always expose seeders in RSS

            items.push({
                title: title.trim(),
                url: magnet,
                magnet,
                infoHash,
                seeders: 1, // Default
                leechers: 0,
                parsed,
                qualityScore: qualityScore - 5, // Slightly penalize Tosho results to prefer Nyaa if both exist
                source: 'animetosho.org',
            });
        }
        return items;
    } catch (err) {
        return [];
    }
}

/**
 * Main discovery function — aggregates results from multiple providers,
 * implements batch/single fallback, filters, and sorts.
 *
 * @param {{ query?: string, q?: string, episode?: number, season?: number, preferTrusted?: boolean }} options
 * @returns {Promise<{ success: boolean, candidates: TorrentCandidate[], source: string }>}
 */
async function searchTorrentCandidates(options) {
    const query = options.query || options.q || '';
    if (!query.trim()) {
        return { success: true, candidates: [], source: 'none' };
    }

    // 1. Concurrent search from Nyaa and AnimeTosho
    const [nyaaResults, toshoResults] = await Promise.allSettled([
        searchNyaaMultiCategory(options),
        searchAnimeTosho(options)
    ]);

    let candidates = [];
    const seen = new Set();

    const addUnique = (list) => {
        if (!Array.isArray(list)) return;
        for (const item of list) {
            const key = item.infoHash || item.title;
            if (!seen.has(key)) {
                seen.add(key);
                candidates.push(item);
            }
        }
    };

    if (nyaaResults.status === 'fulfilled') addUnique(nyaaResults.value);
    if (toshoResults.status === 'fulfilled') addUnique(toshoResults.value);

    // 2. Batch/Single Fallback (Smart Search Pattern)
    // If we searched for a specific episode and got very few results, try a broader search
    if (options.episode != null && candidates.length < 3) {
        const broaderQuery = query.replace(/\b(episode|ep|e)\s*\d+\b/i, '').trim();
        if (broaderQuery && broaderQuery !== query) {
            const broaderResults = await searchNyaaMultiCategory({ ...options, query: broaderQuery });
            addUnique(broaderResults);
        }
    }

    // Filter out remakes unless explicitly requested
    if (!options.includeRemakes) {
        candidates = candidates.filter((c) => !c.isRemake);
    }

    // Filter minimum seeders (allow 0-seeder results but penalize them via score)
    const hasSeeders = candidates.some((c) => c.seeders > 0);
    if (hasSeeders) {
        candidates = candidates.filter((c) => c.seeders > 0);
    }

    // Sort by quality score descending, then by seeders as secondary
    candidates.sort((a, b) => {
        if (b.qualityScore !== a.qualityScore) return b.qualityScore - a.qualityScore;
        return b.seeders - a.seeders;
    });

    return { success: true, candidates, source: 'multi' };
}

module.exports = { searchTorrentCandidates, searchNyaa, parseNyaaRSS, searchAnimeTosho };
