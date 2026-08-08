/**
 * HindiDubbed — native scraper adapter (Hindi dubbed anime)
 * Site: https://hindidubbed.in
 */
import { normalizeQuality } from '../../utils/quality.js';
import { buildSearchQueries } from '../../utils/titleNorm.js';
import type { StreamProvider, SourceOptions, SourceResult } from '../../types.js';

import { fetchResponse, loadHtml } from '../../utils/http.js';

const BASE = 'https://hindidubbed.in';

const HEADERS = {
  Referer: `${BASE}/`,
  'Accept-Language': 'hi,en;q=0.9',
};

async function findSources(titles: string[], epNumber: number): Promise<SourceResult[]> {
  for (const title of buildSearchQueries(titles)) {
    try {
      const searchRes = await fetchResponse(
        `${BASE}/?s=${encodeURIComponent(title)}`,
        { headers: HEADERS },
      );
      if (!searchRes.ok) continue;
      const html = await searchRes.text();
      const $ = loadHtml(html);

      let animeUrl: string | null = null;
      $.find('article a, .post-title a, h2 a, h3 a, .entry-title a').each((_: number, el: any) => {
        if (animeUrl) return;
        const href: string = el.attr?.('href') ?? '';
        if (href && href.startsWith('http') && !href.includes('/page/') && !href.includes('/tag/') && !href.includes('/category/')) {
          animeUrl = href;
        }
      });
      if (!animeUrl) continue;

      const animeRes = await fetchResponse(animeUrl, { headers: HEADERS });
      if (!animeRes.ok) continue;
      const animeHtml = await animeRes.text();
      const $a = loadHtml(animeHtml);

      let epUrl: string | null = null;
      $a.find(`a[href*="episode-${epNumber}"], a[href*="ep-${epNumber}"]`).each((_: number, el: any) => {
        if (epUrl) return;
        const href: string = el.attr?.('href') ?? '';
        if (href) epUrl = href.startsWith('http') ? href : `${BASE}${href}`;
      });
      if (!epUrl) continue;

      const epRes = await fetchResponse(epUrl, { headers: HEADERS });
      if (!epRes.ok) continue;
      const epHtml = await epRes.text();

      const m3u8 = epHtml.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/);
      if (m3u8) return [{ source: 'hindidubbed', url: m3u8[1], quality: normalizeQuality(''), headers: HEADERS, subtitles: [], sourceType: 'hls' as const }];

      const mp4 = epHtml.match(/["'](https?:\/\/[^"']+\.mp4[^"']*)["']/);
      if (mp4) return [{ source: 'hindidubbed', url: mp4[1], quality: normalizeQuality(''), headers: HEADERS, subtitles: [], sourceType: 'mp4' as const }];
    } catch { continue; }
  }
  return [];
}

const provider: StreamProvider = {
  name: 'hindidubbed',
  async single(opts: SourceOptions): Promise<SourceResult[]> {
    try { return findSources(opts.titles, opts.episode ?? 1); }
    catch { return []; }
  },
};
export default provider;
