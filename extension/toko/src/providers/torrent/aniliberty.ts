/**
 * AniLiberty torrent provider adapter (HTML scrape via loadHtml).
 * Source: net-new
 * Requirements: 4.2, 4.3
 */

import { normalizeQuality } from '../../utils/scraping/quality.js';
import type { TorrentProvider, SourceOptions, SourceResult } from '../../types/index.js';
import { fetchResponse, loadHtml } from '../../utils/http/fetch.js';
import { scoreEpisodeMatch, isBatchTitle } from '../../utils/torrent/matcher.js';

const BASES = ['https://aniliberty.top', 'https://aniliberty.moe', 'https://anilib.top'];

const provider: TorrentProvider = {
  name: 'aniliberty',
  sites: BASES,
  async batch(opts: SourceOptions): Promise<SourceResult[]> {
    const title = opts.titles[0] ?? '';
    const ep = opts.episode ?? 0;
    if (!title) return [];

    const epPad = ep > 0 ? String(ep).padStart(2, '0') : '';
    const query = encodeURIComponent(`${title} ${epPad}`.trim());

    let html = '';
    const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

    for (const domain of BASES) {
      try {
        const res = await fetchResponse(`${domain}/search?q=${query}`, {
          headers: { 'User-Agent': UA },
          signal: AbortSignal.timeout(4000),
        } as RequestInit);
        if (res.ok) {
          html = await res.text();
          if (html) break;
        }
      } catch { continue; }
    }

    if (!html) return [];

    let $: any;
    try {
      $ = loadHtml(html);
    } catch {
      return [];
    }

    const results: SourceResult[] = [];

    // Extract magnet links from <a href="magnet:..."> elements
    $('a[href^="magnet:"]').each((_: number, el: any) => {
      const href = $(el).attr('href') ?? '';
      if (!href) return;

      const linkText = $(el).text().trim();
      const parentTitle = $(el)
        .closest('article, .torrent-item, .entry, .result-item, li, tr')
        .find('h2, h3, h4, .title, .name')
        .first()
        .text()
        .trim();

      const title = parentTitle || linkText;
      if (ep > 0 && (isBatchTitle(title) || scoreEpisodeMatch(title, ep) === 0)) return;

      // Try to extract peer data from nearby elements
      const parent = $(el).closest('article, .torrent-item, .entry, .result-item, li, tr');
      const seedersText = parent.find('.seeders, .seed, [class*="seed"]').first().text().trim();
      const leechersText = parent.find('.leechers, .leech, .peers, [class*="leech"]').first().text().trim();
      
      const seeders = parseInt(seedersText) || undefined;
      const leechers = parseInt(leechersText) || undefined;
      const peers = (seeders || 0) + (leechers || 0);

      results.push({
        source: 'aniliberty',
        url: href,
        quality: normalizeQuality(title),
        headers: {},
        subtitles: [],
        sourceType: 'torrent' as const,
        audioLanguage: 'ja',
        torrentTitle: title,
        seeders,
        leechers,
        peers: peers > 0 ? peers : undefined,
      });
    });

    // Also pick up direct .torrent file links if magnet links aren't present
    if (results.length === 0) {
      $('a[href$=".torrent"], a[href*="/download/torrent"]').each((_: number, el: any) => {
        const href = $(el).attr('href') ?? '';
        if (!href) return;

        // Resolve relative URLs
        const resolvedHref = href.startsWith('http') ? href : `https://aniliberty.moe${href}`;

        const linkText = $(el).text().trim();
        const parent = $(el)
          .closest('article, .torrent-item, .entry, .result-item, li, tr');
        const parentTitle = parent
          .find('h2, h3, h4, .title, .name')
          .first()
          .text()
          .trim();

        const title = parentTitle || linkText;
        
        // Extract peer data
        const seedersText = parent.find('.seeders, .seed, [class*="seed"]').first().text().trim();
        const leechersText = parent.find('.leechers, .leech, .peers, [class*="leech"]').first().text().trim();
        
        const seeders = parseInt(seedersText) || undefined;
        const leechers = parseInt(leechersText) || undefined;
        const peers = (seeders || 0) + (leechers || 0);

        results.push({
          source: 'aniliberty',
          url: resolvedHref,
          quality: normalizeQuality(title),
          headers: {},
          subtitles: [],
          sourceType: 'torrent' as const,
          audioLanguage: 'ja',
          torrentTitle: title,
          seeders,
          leechers,
          peers: peers > 0 ? peers : undefined,
        });
      });
    }

    return results;
  },
};

export default provider;
