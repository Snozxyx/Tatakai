/**
 * AnimeTosho torrent provider — with episode filtering + peer data.
 * API: https://feed.animetosho.org/json?q=<query>
 */
import { normalizeQuality } from '../../utils/scraping/quality.js';
import type { TorrentProvider, SourceOptions, SourceResult } from '../../types/index.js';
import { fetchResponse } from '../../utils/http/fetch.js';
import { scoreEpisodeMatch, isBatchTitle } from '../../utils/torrent/matcher.js';
import { buildSearchQueries } from '../../utils/scraping/title-normalizer.js';

interface AnimeToshoItem {
  title?: string;
  magnet_uri?: string;
  torrent_url?: string;
  seeders?: number;
  leechers?: number;
  total_size?: number;
  num_files?: number;
}

function formatSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
}

function matchesEpisode(title: string, ep: number): boolean {
  if (!ep || ep <= 0) return true;
  return scoreEpisodeMatch(title, ep) > 0;
}

const BASE = 'https://feed.animetosho.org';

const provider: TorrentProvider = {
  name: 'animetosho',
  sites: [BASE],
  async batch(opts: SourceOptions): Promise<SourceResult[]> {
    const titles = opts.titles ?? [];
    const ep = opts.episode ?? 0;
    if (titles.length === 0) return [];

    const epStr = ep > 0 ? ` ${String(ep).padStart(2, '0')}` : '';

    async function fetchItems(qStr: string): Promise<AnimeToshoItem[]> {
      const url = `${BASE}/json?q=${encodeURIComponent(qStr)}`;
      try {
        const res = await fetchResponse(url, {
          timeoutMs: 6000,
        });
        if (!res.ok) return [];
        const json = await res.json() as AnimeToshoItem[];
        return Array.isArray(json) ? json : [];
      } catch { return []; }
    }

    let items: AnimeToshoItem[] = [];
    for (const title of buildSearchQueries(titles)) {
      if (ep > 0) {
        items = await fetchItems(`${title}${epStr}`.trim());
      }
      if (items.length === 0) {
        items = await fetchItems(title);
      }
      if (items.length > 0) break;
    }

    if (!Array.isArray(items) || items.length === 0) return [];

    const results: SourceResult[] = [];
    const seenLinks = new Set<string>();

    for (const item of items) {
      const link = item.magnet_uri ?? item.torrent_url ?? '';
      if (!link || seenLinks.has(link)) continue;

      const torrentTitle = item.title ?? '';
      if (ep > 0) {
        if (isBatchTitle(torrentTitle)) continue;
        if (!matchesEpisode(torrentTitle, ep)) continue;
      }
      seenLinks.add(link);

      const seeders = item.seeders ?? 0;
      const leechers = item.leechers ?? 0;

      results.push({
        source: 'animetosho',
        url: link,
        quality: normalizeQuality(torrentTitle),
        headers: {},
        subtitles: [],
        sourceType: 'torrent' as const,
        audioLanguage: 'ja',
        torrentTitle,
        seeders,
        leechers,
        peers: seeders + leechers,
        fileSize: formatSize(item.total_size),
      });
    }

    return results.slice(0, 15);
  },
};

export default provider;
