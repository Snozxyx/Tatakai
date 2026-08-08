/**
 * ACG.rip torrent provider adapter.
 * Source: A2-port
 * Requirements: 4.1, 4.3
 */

import { normalizeQuality } from '../../utils/quality.js';
import type { TorrentProvider, SourceOptions, SourceResult } from '../../types.js';

import { fetchResponse } from '../../utils/http.js';

const provider: TorrentProvider = {
  name: 'acgrip',
  async batch(opts: SourceOptions): Promise<SourceResult[]> {
    const query = encodeURIComponent(`${opts.titles[0] ?? ''} ${opts.episode ?? ''}`.trim());
    const url = `https://acg.rip/.rss?term=${query}`;

    let res: Response;
    try {
      res = await fetchResponse(url);
    } catch {
      return [];
    }

    if (!res.ok) return [];

    const text = await res.text();
    const items = text.match(/<item>([\s\S]*?)<\/item>/g) ?? [];

    return items
      .map((item): SourceResult | null => {
        const link =
          item.match(/<link>(.*?)<\/link>/)?.[1] ??
          item.match(/<enclosure[^>]+url="([^"]+)"/)?.[1] ??
          '';
        const title =
          item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] ??
          item.match(/<title>(.*?)<\/title>/)?.[1] ??
          '';

        if (!link) return null;

        return {
          source: 'acgrip',
          url: link,
          quality: normalizeQuality(title),
          headers: {},
          subtitles: [],
          sourceType: 'torrent' as const,
        };
      })
      .filter((r): r is SourceResult => r !== null);
  },
};

export default provider;
