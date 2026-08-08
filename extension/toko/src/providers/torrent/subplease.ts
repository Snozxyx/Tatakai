/**
 * SubsPlease torrent provider adapter.
 * Source: A2-port
 * Requirements: 4.1, 4.3
 */

import { normalizeQuality } from '../../utils/quality.js';
import type { TorrentProvider, SourceOptions, SourceResult } from '../../types.js';

declare const __tatakai_fetch__: (url: string, init?: RequestInit) => Promise<Response>;

interface SubPleaseDownload {
  res: string;
  magnet: string;
}

interface SubPleaseShow {
  downloads: SubPleaseDownload[];
}

interface SubPleaseResponse {
  [key: string]: SubPleaseShow;
}

const provider: TorrentProvider = {
  name: 'subplease',
  async batch(opts: SourceOptions): Promise<SourceResult[]> {
    const title = encodeURIComponent(opts.titles[0] ?? '');
    const url = `https://subsplease.org/api/?f=search&tz=UTC&s=${title}`;

    let res: Response;
    try {
      res = await __tatakai_fetch__(url);
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

    for (const key of Object.keys(data)) {
      const show = data[key];
      if (!show?.downloads || !Array.isArray(show.downloads)) continue;

      for (const dl of show.downloads) {
        if (!dl.magnet) continue;
        results.push({
          source: 'subplease',
          url: dl.magnet,
          quality: normalizeQuality(dl.res ?? ''),
          headers: {},
          subtitles: [],
          sourceType: 'torrent' as const,
        });
      }
    }

    return results;
  },
};

export default provider;
