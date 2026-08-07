/**
 * AnimeSalt — native scraper (https://animesalt.com)
 */
import { normalizeQuality, detectSourceType } from '../../utils/quality.js';
import { buildSearchQueries } from '../../utils/titleNorm.js';
import type { StreamProvider, SourceOptions, SourceResult } from '../../types.js';

declare const __tatakai_fetch__: (url: string, init?: RequestInit) => Promise<Response>;
declare const __tatakai_parse_html__: (html: string) => any;

const BASE = 'https://animesalt.link';
const HEADERS = { Referer: `${BASE}/` };

async function findSources(titles: string[], epNumber: number): Promise<SourceResult[]> {
  for (const q of buildSearchQueries(titles)) {
    try {
      const searchRes = await __tatakai_fetch__(`${BASE}/search?q=${encodeURIComponent(q)}`, { headers: HEADERS });
      if (!searchRes.ok) continue;
      const html = await searchRes.text();
      const $ = __tatakai_parse_html__(html);

      let animeUrl: string | null = null;
      $.find('a[href*="/anime/"], .title a, h3 a, h2 a').each((_: number, el: any) => {
        if (animeUrl) return;
        const href: string = el.attr?.('href') ?? '';
        if (href && href.includes('/anime/') && !href.includes('episode')) animeUrl = href.startsWith('http') ? href : `${BASE}${href}`;
      });
      if (!animeUrl) continue;

      const animeRes = await __tatakai_fetch__(animeUrl, { headers: HEADERS });
      if (!animeRes.ok) continue;
      const animeHtml = await animeRes.text();
      const $a = __tatakai_parse_html__(animeHtml);

      let epUrl: string | null = null;
      $a.find(`a[href*="episode-${epNumber}"], a[href*="ep-${epNumber}"]`).each((_: number, el: any) => {
        if (epUrl) return;
        const href: string = el.attr?.('href') ?? '';
        if (href) epUrl = href.startsWith('http') ? href : `${BASE}${href}`;
      });
      if (!epUrl) continue;

      const epRes = await __tatakai_fetch__(epUrl, { headers: HEADERS });
      if (!epRes.ok) continue;
      const epHtml = await epRes.text();

      const m3u8 = epHtml.match(/["'`](https?:\/\/[^"'`\s]+\.m3u8[^"'`\s]*)["'`]/);
      if (m3u8) return [{ source: 'animesalt', url: m3u8[1], quality: normalizeQuality(''), headers: HEADERS, subtitles: [], sourceType: 'hls' as const }];
      const mp4 = epHtml.match(/["'`](https?:\/\/[^"'`\s]+\.mp4[^"'`\s]*)["'`]/);
      if (mp4) return [{ source: 'animesalt', url: mp4[1], quality: normalizeQuality(''), headers: HEADERS, subtitles: [], sourceType: 'mp4' as const }];
    } catch { continue; }
  }
  return [];
}

const provider: StreamProvider = {
  name: 'animesalt',
  async single(opts: SourceOptions): Promise<SourceResult[]> {
    try { return findSources(opts.titles, opts.episode ?? 1); }
    catch { return []; }
  },
};
export default provider;
