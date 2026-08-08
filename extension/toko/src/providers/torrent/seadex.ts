/**
 * SeaDex torrent provider adapter.
 * Source: A2-port
 * Requirements: 4.1, 4.3
 */

import { normalizeQuality } from '../../utils/quality.js';
import type { TorrentProvider, SourceOptions, SourceResult } from '../../types.js';

import { fetchResponse } from '../../utils/http.js';

interface SeaDexItem {
  title?: string;
  torrent?: string;
  magnet?: string;
  quality?: string;
}

interface SeaDexResponse {
  items?: SeaDexItem[];
}

const provider: TorrentProvider = {
  name: 'seadex',
  async batch(opts: SourceOptions): Promise<SourceResult[]> {
    const title = opts.titles[0] ?? '';
    const url = `https://releases.moe/api/collections?filter=name~"${encodeURIComponent(title)}"`;

    let res: Response;
    try {
      res = await fetchResponse(url);
    } catch {
      return [];
    }

    if (!res.ok) return [];

    let data: SeaDexResponse;
    try {
      data = await res.json() as SeaDexResponse;
    } catch {
      return [];
    }

    const items = data?.items ?? (Array.isArray(data) ? (data as unknown as SeaDexItem[]) : []);
    if (!Array.isArray(items)) return [];

    return items
      .map((item): SourceResult | null => {
        const link = item.magnet ?? item.torrent ?? '';
        if (!link) return null;

        return {
          source: 'seadex',
          url: link,
          quality: normalizeQuality(item.quality ?? item.title ?? ''),
          headers: {},
          subtitles: [],
          sourceType: 'torrent' as const,
        };
      })
      .filter((r): r is SourceResult => r !== null);
  },
};

export default provider;
