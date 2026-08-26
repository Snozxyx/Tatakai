/**
 * ACG.rip torrent provider — with episode filtering + peer data from RSS.
 */
import { normalizeQuality } from '../../utils/scraping/quality.js';
import type { TorrentProvider, SourceOptions, SourceResult } from '../../types/index.js';
import { fetchResponse } from '../../utils/http/fetch.js';
import { scoreEpisodeMatch, isBatchTitle } from '../../utils/torrent/matcher.js';
import { buildSearchQueries } from '../../utils/scraping/title-normalizer.js';

const BASE = 'https://acg.rip';

const provider: TorrentProvider = {
  name: 'acgrip',
  sites: [BASE],
  async batch(opts: SourceOptions): Promise<SourceResult[]> {
    const titles = opts.titles ?? [];
    const ep = opts.episode ?? 0;
    if (titles.length === 0) return [];

    const epStr = ep > 0 ? ` ${String(ep).padStart(2, '0')}` : '';
    const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

    let text = '';
    const rssAttempts = await Promise.allSettled(
      buildSearchQueries(titles).map(async (title) => {
        const qStr = ep > 0 ? `${title}${epStr}` : title;
        const url = `${BASE}/.rss?term=${encodeURIComponent(qStr)}`;
        const res = await fetchResponse(url, {
          headers: {
            'User-Agent': UA,
            Accept: 'application/rss+xml, text/xml, application/xml, */*',
          },
          timeoutMs: 6000,
        });
        if (!res.ok) throw new Error('not ok');
        const body = await res.text();
        if (!body.includes('<item>')) throw new Error('no items');
        return body;
      }),
    );
    for (const attempt of rssAttempts) {
      if (attempt.status === 'fulfilled') {
        text = attempt.value;
        break;
      }
    }

    if (!text) return [];

    const items = text.match(/<item>([\s\S]*?)<\/item>/g) ?? [];
    const results: SourceResult[] = [];
    const seenLinks = new Set<string>();

    for (const item of items) {
      const link =
        item.match(/<enclosure[^>]+url="([^"]+)"/)?.[1] ??
        item.match(/<link>(.*?)<\/link>/)?.[1] ??
        '';
      const torrentTitle =
        item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] ??
        item.match(/<title>(.*?)<\/title>/)?.[1] ??
        '';

      if (!link || seenLinks.has(link)) continue;

      if (ep > 0 && (isBatchTitle(torrentTitle) || scoreEpisodeMatch(torrentTitle, ep) === 0)) continue;
      seenLinks.add(link);

      const seeders = parseInt(item.match(/<nyaa:seeders>(.*?)<\/nyaa:seeders>/)?.[1] ?? '0', 10);
      const leechers = parseInt(item.match(/<nyaa:leechers>(.*?)<\/nyaa:leechers>/)?.[1] ?? '0', 10);
      const fileSize = item.match(/<nyaa:size>(.*?)<\/nyaa:size>/)?.[1] ?? '';

      results.push({
        source: 'acgrip',
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
        fileSize,
      });
    }

    results.sort((a, b) => (b.seeders ?? 0) - (a.seeders ?? 0));
    return results.slice(0, 15);
  },
};

export default provider;
