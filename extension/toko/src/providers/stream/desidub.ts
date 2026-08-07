/**
 * DesiDub Anime — Toko Stream Provider
 * Ported from extension/A1/src/providers/desidubanime/desidubanime.ts
 */
import { normalizeQuality, detectSourceType } from '../../utils/quality.js';
import { buildSearchQueries } from '../../utils/titleNorm.js';
import type { StreamProvider, SourceOptions, SourceResult } from '../../types.js';

declare const __tatakai_fetch__: (url: string, init?: RequestInit) => Promise<Response>;
declare const __tatakai_parse_html__: (html: string) => any;

const BASE_URL = 'https://www.desidubanime.me';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function decodeB64(str: string): string {
  try { return atob(str); } catch { return ''; }
}

async function findSources(titles: string[], epNumber: number): Promise<SourceResult[]> {
  for (const query of buildSearchQueries(titles)) {
    try {
      let animeSlug: string | null = null;
      
      // 1. WP REST API Search
      try {
        const apiRes = await __tatakai_fetch__(
          `${BASE_URL}/wp-json/wp/v2/anime?search=${encodeURIComponent(query)}&per_page=10`,
          { headers: { 'User-Agent': UA } },
        );
        if (apiRes.ok) {
          const apiJson = (await apiRes.json()) as any[];
          if (Array.isArray(apiJson) && apiJson.length > 0 && apiJson[0]?.slug) {
            animeSlug = String(apiJson[0].slug);
          }
        }
      } catch { /* proceed to HTML fallback */ }

      // 2. HTML fallback search
      if (!animeSlug) {
        const searchRes = await __tatakai_fetch__(
          `${BASE_URL}/?s=${encodeURIComponent(query)}`,
          { headers: { 'User-Agent': UA } },
        );
        if (searchRes.ok) {
          const searchHtml = await searchRes.text();
          const $ = __tatakai_parse_html__(searchHtml);
          $.find("a[href*='/anime/'], a[href*='/series/']").each((_: number, el: any) => {
            if (animeSlug) return;
            const href: string = el.attr?.('href') ?? '';
            const m = href.match(/\/(?:anime|series)\/([^/]+)\/?$/);
            if (m) animeSlug = m[1];
          });
        }
      }

      if (!animeSlug) continue;

      // 3. Fetch watch page
      const watchUrl = `${BASE_URL}/watch/${animeSlug}-episode-${epNumber}/`;
      const watchRes = await __tatakai_fetch__(watchUrl, { headers: { 'User-Agent': UA } });
      if (!watchRes.ok) continue;
      const watchHtml = await watchRes.text();
      const $ = __tatakai_parse_html__(watchHtml);

      const results: SourceResult[] = [];

      // Check base64 span embeds
      $.find('span[data-embed-id]').each((_: number, el: any) => {
        const embedData: string = el.attr?.('data-embed-id') ?? '';
        if (!embedData) return;
        const [b64Name, b64Url] = embedData.split(':');
        if (!b64Name || !b64Url) return;

        const serverName = decodeB64(b64Name);
        let finalUrl = decodeB64(b64Url);
        if (!finalUrl || finalUrl.includes('googletagmanager')) return;

        if (finalUrl.includes('<iframe')) {
          const m = finalUrl.match(/src=['"]([^'"]+)['"]/);
          if (m) finalUrl = m[1];
        }

        const isDub = serverName.toLowerCase().includes('dub');
        const isHls = finalUrl.includes('.m3u8');

        results.push({
          source: 'desidub',
          url: finalUrl,
          quality: normalizeQuality('HD'),
          headers: { Referer: `${BASE_URL}/`, 'User-Agent': UA },
          subtitles: [],
          audioLanguage: isDub ? 'Hindi/Dub' : 'Japanese/Sub',
          sourceType: isHls ? 'hls' : (finalUrl.includes('.mp4') ? 'mp4' : 'custom'),
        });
      });

      // Direct script m3u8/mp4 fallback
      if (results.length === 0) {
        const m3u8Match = watchHtml.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
        if (m3u8Match) {
          results.push({
            source: 'desidub',
            url: m3u8Match[1],
            quality: normalizeQuality('HD'),
            headers: { Referer: `${BASE_URL}/`, 'User-Agent': UA },
            subtitles: [],
            audioLanguage: 'Hindi/Dub',
            sourceType: 'hls',
          });
        }
      }

      if (results.length > 0) return results;
    } catch {
      continue;
    }
  }
  return [];
}

const provider: StreamProvider = {
  name: 'desidub',
  async single(opts: SourceOptions): Promise<SourceResult[]> {
    try {
      return findSources(opts.titles, opts.episode ?? 1);
    } catch {
      return [];
    }
  },
};

export default provider;
