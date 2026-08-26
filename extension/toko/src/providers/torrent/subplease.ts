/**
 * SubsPlease torrent provider — episode-filtered with peer data.
 * SubsPlease API: https://subsplease.org/api/?f=search&tz=UTC&s=<title>
 * Key format: each key is a release file name like "One Piece - 001 (1080p)..."
 * Requirements: 4.1, 4.3
 */
import { normalizeQuality } from '../../utils/scraping/quality.js';
import type { TorrentProvider, SourceOptions, SourceResult } from '../../types/index.js';
import { fetchResponse } from '../../utils/http/fetch.js';
import { scoreEpisodeMatch } from '../../utils/torrent/matcher.js';

interface SubPleaseDownload {
  res: string;
  magnet: string;
}

interface SubPleaseShow {
  show: string;
  episode: string;
  downloads: SubPleaseDownload[];
}

interface SubPleaseResponse {
  [key: string]: SubPleaseShow;
}

/** Parse episode number from a SubsPlease key like "One Piece - 001 (1080p) [...]" */
function parseEpisodeNumber(key: string): number | null {
  // SubsPlease keys: "Title - 001v2 (1080p) [hash]" or "Title - 001 (720p)"
  const m = key.match(/- (\d+)(?:v\d+)?\s*\(/);
  if (m) return parseInt(m[1], 10);
  return null;
}

/** Check if title looks like a batch pack */
function isBatch(key: string): boolean {
  return /\d+\s*[-~]\s*\d+/.test(key) || /\bbatch\b/i.test(key) || /\bseries\b/i.test(key) || /\bcomplete\b/i.test(key);
}

/** Normalize title for matching by removing extra spaces, brackets, version tags */
function normalizeTitle(title: string): string {
  return title.toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[[\](){}]/g, '')
    .replace(/\bv\d+\b/g, '')
    .trim();
}

const BASE = 'https://subsplease.org';

const provider: TorrentProvider = {
  name: 'subplease',
  sites: [BASE],
  async batch(opts: SourceOptions): Promise<SourceResult[]> {
    const title = opts.titles[0] ?? '';
    const ep = opts.episode ?? 0;
    if (!title) return [];

    const url = `${BASE}/api/?f=search&tz=UTC&s=${encodeURIComponent(title)}`;

    let res: Response;
    try {
      res = await fetchResponse(url, { signal: AbortSignal.timeout(10000) } as RequestInit);
    } catch {
      return [];
    }

    if (!res.ok) return [];

    let data: SubPleaseResponse;
    try {
      data = await res.json() as SubPleaseResponse;
    } catch {
      return [];
    }

    if (!data || typeof data !== 'object') return [];

    const results: SourceResult[] = [];
    const normalizedSearchTitle = normalizeTitle(title);
    const titleMatches: Array<{ key: string; show: SubPleaseShow }> = [];

    for (const key of Object.keys(data)) {
      const show = data[key];
      if (!show?.downloads || !Array.isArray(show.downloads)) continue;
      if (isBatch(key)) continue;

      const normalizedKeyTitle = normalizeTitle(key.split('-')[0] || '');
      const titleMatch = normalizedKeyTitle.includes(normalizedSearchTitle) || normalizedSearchTitle.includes(normalizedKeyTitle);
      if (!titleMatch) continue;

      titleMatches.push({ key, show });
    }

    const shouldFallbackToLatest = ep > 0 && titleMatches.length > 0 && !titleMatches.some(({ key }) => {
      const epFromField = data[key]?.episode ? parseInt(data[key].episode, 10) : null;
      const epFromKey = parseEpisodeNumber(key);
      const detectedEp = epFromField ?? epFromKey;
      return detectedEp === ep || scoreEpisodeMatch(key, ep) > 0;
    });

    for (const { key, show } of titleMatches) {
      if (ep > 0 && !shouldFallbackToLatest) {
        const epFromField = show.episode ? parseInt(show.episode, 10) : null;
        const epFromKey = parseEpisodeNumber(key);
        const detectedEp = epFromField ?? epFromKey;

        if (detectedEp !== null) {
          if (detectedEp !== ep) continue;
        } else if (scoreEpisodeMatch(key, ep) === 0) {
          continue;
        }
      }

      for (const dl of show.downloads) {
        if (!dl.magnet) continue;

        results.push({
          source: 'subplease',
          url: dl.magnet,
          quality: normalizeQuality(dl.res ?? ''),
          headers: {},
          subtitles: [],
          sourceType: 'torrent' as const,
          audioLanguage: 'ja',
          torrentTitle: key,
          seeders: undefined,
          leechers: undefined,
          peers: undefined,
        });
      }
    }

    // Sort by quality: 1080p > 720p > others
    results.sort((a, b) => {
      const qa = a.quality === '1080p' ? 0 : a.quality === '720p' ? 1 : 2;
      const qb = b.quality === '1080p' ? 0 : b.quality === '720p' ? 1 : 2;
      return qa - qb;
    });

    return results.slice(0, 10);
  },
};

export default provider;
