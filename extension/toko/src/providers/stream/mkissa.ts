/**
 * MKissa — native scraper (https://mkissa.com)
 * WordPress-based anime streaming site.
 */
import { normalizeQuality, detectSourceType } from '../../utils/quality.js';
import { buildSearchQueries } from '../../utils/titleNorm.js';
import type { StreamProvider, SourceOptions, SourceResult } from '../../types.js';

declare const __tatakai_fetch__: (url: string, init?: RequestInit) => Promise<Response>;
declare const __tatakai_parse_html__: (html: string) => any;

const BASE = 'https://mkissa.com';
const HEADERS = { Referer: `${BASE}/` };

async function findAndExtract(titles: string[], epNumber: number): Promise<SourceResult[]> {
  for (const q of buildSearchQueries(titles)) {
    try {
      // WordPress search
      const searchRes = await __tatakai_fetch__(`${BASE}/?s=${encodeURIComponent(q)}`, { headers: HEADERS });
      if (!searchRes.ok) continue;
      const searchHtml = await searchRes.text();
      const $ = __tatakai_parse_html__(searchHtml);

      let animeUrl: string | null = null;
      $.find('h2.entry-title a, .post-title a, article a').each((_: number, el: any) => {
        if (animeUrl) return;
        const href: string = el.attr?.('href') ?? '';
        if (href && href.startsWith('http') && !href.includes('?') && !href.includes('/page/')) animeUrl = href;
      });
      if (!animeUrl) continue;

      // Get anime page with episode list
      const animeRes = await __tatakai_fetch__(animeUrl, { headers: HEADERS });
      if (!animeRes.ok) continue;
      const animeHtml = await animeRes.text();
      const $a = __tatakai_parse_html__(animeHtml);

      let epUrl: string | null = null;
      $a.find(`a[href*="episode-${epNumber}"], a[href*="ep-${epNumber}"], a[href*="${epNumber}"]`).each((_: number, el: any) => {
        if (epUrl) return;
        const href: string = el.attr?.('href') ?? '';
        const text: string = el.text?.() ?? '';
        if (href && href.startsWith('http') && (href.includes('episode') || text.match(new RegExp(`\\b${epNumber}\\b`)))) {
          epUrl = href;
        }
      });
      if (epUrl === null) {
        // Try sequential URLs: slug-episode-N
        const urlMatch = (animeUrl as string).match(/\/([^/]+)\/?$/);
        if (urlMatch) epUrl = `${(animeUrl as string).replace(/\/$/, '')}/episode-${epNumber}/`;
      }
      if (!epUrl) continue;

      const epRes = await __tatakai_fetch__(epUrl, { headers: HEADERS });
      if (!epRes.ok) continue;
      const epHtml = await epRes.text();

      // Extract video sources: 1. Script m3u8
      const m3u8 = epHtml.match(/["'`](https?:\/\/[^"'`\s]+\.m3u8[^"'`\s]*)["'`]/);
      if (m3u8) return [{ source: 'mkissa', url: m3u8[1], quality: normalizeQuality(''), headers: HEADERS, subtitles: [], sourceType: 'hls' as const }];

      // 2. iframe embed
      const $ep = __tatakai_parse_html__(epHtml);
      let embedUrl: string | null = null;
      $ep.find('iframe[src], iframe[data-src]').each((_: number, el: any) => {
        if (embedUrl) return;
        const src: string = el.attr?.('src') ?? el.attr?.('data-src') ?? '';
        if (src && !src.includes('googletagmanager')) embedUrl = src;
      });
      if (embedUrl) {
        const isHls = (embedUrl as string).includes('.m3u8');
        return [{
          source: 'mkissa',
          url: embedUrl as string,
          quality: normalizeQuality(''),
          headers: HEADERS,
          subtitles: [],
          sourceType: isHls ? 'hls' as const : detectSourceType(embedUrl as string),
        }];
      }

      // 3. WordPress video player mp4 source tag
      const src = epHtml.match(/<source[^>]+src=['"]([^'"]+\.mp4[^'"]*)['"]/i);
      if (src) return [{ source: 'mkissa', url: src[1], quality: normalizeQuality(''), headers: HEADERS, subtitles: [], sourceType: 'mp4' as const }];

      const mp4 = epHtml.match(/["'`](https?:\/\/[^"'`\s]+\.mp4[^"'`\s]*)["'`]/);
      if (mp4) return [{ source: 'mkissa', url: mp4[1], quality: normalizeQuality(''), headers: HEADERS, subtitles: [], sourceType: 'mp4' as const }];
    } catch { continue; }
  }
  return [];
}

const provider: StreamProvider = {
  name: 'mkissa',
  async single(opts: SourceOptions): Promise<SourceResult[]> {
    try { return findAndExtract(opts.titles, opts.episode ?? 1); }
    catch { return []; }
  },
};
export default provider;
