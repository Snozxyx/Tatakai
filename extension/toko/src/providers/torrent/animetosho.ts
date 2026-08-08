/**
 * AnimeTosho torrent provider adapter.
 * Source: A2-port
 * Requirements: 4.1, 4.3
 */

import { normalizeQuality } from '../../utils/quality.js';
import type { TorrentProvider, SourceOptions, SourceResult } from '../../types.js';

declare const __tatakai_fetch__: (url: string, init?: RequestInit) => Promise<Response>;

interface AnimeToshoItem {
  title?: string;
  magnet_uri?: string;
  torrent_url?: string;
}

const provider: TorrentProvider = {
  name: 'animetosho',
  async batch(opts: SourceOptions): Promise<SourceResult[]> {
    const query = encodeURIComponent(`${opts.titles[0] ?? ''} ${opts.episode ?? ''}`.trim());
    const url = `https://animetosho.org/search?q=${query}&search_type=json`;

    let res: Response;
    try {
      res = await __tatakai_fetch__(url);
    } catch {
      return [];
    }

    if (!res.ok) return [];

    let items: AnimeToshoItem[];
    try {
      items = await res.json() as AnimeToshoItem[];
    } catch {
      return [];
    }

    if (!Array.isArray(items)) return [];

    return items
      .map((item): SourceResult | null => {
        const link = item.magnet_uri ?? item.torrent_url ?? '';
        if (!link) return null;

        return {
          source: 'animetosho',
          url: link,
          quality: normalizeQuality(item.title ?? ''),
          headers: {},
          subtitles: [],
          sourceType: 'torrent' as const,
        };
      })
      .filter((r): r is SourceResult => r !== null);
  },
};

export default provider;
