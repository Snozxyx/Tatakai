/**
 * AniLiberty torrent provider adapter (HTML scrape via __tatakai_parse_html__).
 * Source: net-new
 * Requirements: 4.2, 4.3
 */

import { normalizeQuality } from '../../utils/quality.js';
import type { TorrentProvider, SourceOptions, SourceResult } from '../../types.js';

declare const __tatakai_fetch__: (url: string, init?: RequestInit) => Promise<Response>;
declare const __tatakai_parse_html__: (html: string) => any;

const provider: TorrentProvider = {
  name: 'aniliberty',
  async batch(opts: SourceOptions): Promise<SourceResult[]> {
    const query = encodeURIComponent(`${opts.titles[0] ?? ''} ${opts.episode ?? ''}`.trim());
    const url = `https://aniliberty.moe/search?q=${query}`;

    let res: Response;
    try {
      res = await __tatakai_fetch__(url);
    } catch {
      return [];
    }

    if (!res.ok) return [];

    let html: string;
    try {
      html = await res.text();
    } catch {
      return [];
    }

    if (!html) return [];

    let $: any;
    try {
      $ = __tatakai_parse_html__(html);
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

      results.push({
        source: 'aniliberty',
        url: href,
        quality: normalizeQuality(title),
        headers: {},
        subtitles: [],
        sourceType: 'torrent' as const,
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
        const parentTitle = $(el)
          .closest('article, .torrent-item, .entry, .result-item, li, tr')
          .find('h2, h3, h4, .title, .name')
          .first()
          .text()
          .trim();

        const title = parentTitle || linkText;

        results.push({
          source: 'aniliberty',
          url: resolvedHref,
          quality: normalizeQuality(title),
          headers: {},
          subtitles: [],
          sourceType: 'torrent' as const,
        });
      });
    }

    return results;
  },
};

export default provider;
