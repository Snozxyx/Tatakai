/**
 * NekoBT torrent provider adapter (HTML scrape via loadHtml).
 * Source: A2-port
 * Requirements: 4.1, 4.3
 */

import { normalizeQuality } from '../../utils/quality.js';
import type { TorrentProvider, SourceOptions, SourceResult } from '../../types.js';

import { fetchResponse, loadHtml } from '../../utils/http.js';

const provider: TorrentProvider = {
  name: 'nekobt',
  async batch(opts: SourceOptions): Promise<SourceResult[]> {
    const query = encodeURIComponent(`${opts.titles[0] ?? ''} ${opts.episode ?? ''}`.trim());
    const url = `https://nekobt.com/?s=${query}`;

    let res: Response;
    try {
      res = await fetchResponse(url);
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

    let $ : any;
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

      // Try to grab a title from the link text or a nearby title element
      const linkText = $(el).text().trim();
      const parentTitle = $(el).closest('article, .post, .item, li')
        .find('h2, h3, .title, .entry-title')
        .first()
        .text()
        .trim();

      const title = parentTitle || linkText;

      results.push({
        source: 'nekobt',
        url: href,
        quality: normalizeQuality(title),
        headers: {},
        subtitles: [],
        sourceType: 'torrent' as const,
      });
    });

    return results;
  },
};

export default provider;
