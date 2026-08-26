/**
 * DesiDub Anime — Toko Stream Provider
 * Ported from extension/A1/src/providers/desidubanime/desidubanime.ts
 */
import { normalizeQuality, detectSourceType } from '../../utils/scraping/quality.js';
import { buildSearchQueries } from '../../utils/scraping/title-normalizer.js';
import type { StreamProvider, SourceOptions, SourceResult } from '../../types/index.js';

import { fetchResponse, loadHtml } from '../../utils/http/fetch.js';

const BASE_URL = 'https://www.desidubanime.me';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function decodeB64(str: string): string {
  try { return atob(str); } catch { return ''; }
}

async function findSources(titles: string[], epNumber: number): Promise<SourceResult[]> {
  const bases = [BASE_URL];
  for (const query of buildSearchQueries(titles)) {
    for (const base of bases) {
      try {
        let animeSlug: string | null = null;
        let candidateWatchUrl: string | null = null;

        // 1. WP REST API search (fast)
        try {
          const apiRes = await fetchResponse(
            `${base}/wp-json/wp/v2/anime?search=${encodeURIComponent(query)}&per_page=10`,
            { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(5000) } as RequestInit,
          );
          if (apiRes.ok) {
            const apiJson = (await apiRes.json()) as any[];
            if (Array.isArray(apiJson) && apiJson.length > 0 && apiJson[0]?.slug) {
              animeSlug = String(apiJson[0].slug);
            }
          }
        } catch { /* fallback to HTML */ }

        // 2. HTML search fallback
        if (!animeSlug) {
          const searchRes = await fetchResponse(
            `${base}/?s=${encodeURIComponent(query)}`,
            { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(5000) } as RequestInit,
          );
          if (searchRes.ok) {
            const searchHtml = await searchRes.text();
            const $ = loadHtml(searchHtml);
            $.find('a[href]').each((_: number, el: any) => {
              if (candidateWatchUrl || animeSlug) return;
              const href: string = el.attr?.('href') ?? '';
              if (!href || !href.startsWith('http')) return;
              if (href.includes('/category/') || href.includes('/tag/') || href.includes('/az-list/')) return;
              const m = href.match(/\/(?:anime|series|watch)\/([^/]+)\/?$/) || href.match(/desidubanime\.me\/([^/]+)\/?$/) || href.match(/desidub\.com\/([^/]+)\/?$/);
              if (m && m[1] && !['search', 'disclaimer', 'dmca', 'page'].includes(m[1])) {
                animeSlug = m[1];
                candidateWatchUrl = href;
              }
            });
          }
        }

        if (!animeSlug && !candidateWatchUrl) continue;

        // 3. Fetch the episode watch page
        const watchUrl = candidateWatchUrl || `${base}/watch/${animeSlug}-episode-${epNumber}/`;
        const watchRes = await fetchResponse(watchUrl, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(5000) } as RequestInit);
        if (!watchRes.ok) continue;
        const watchHtml = await watchRes.text();
        const $ = loadHtml(watchHtml);

        const results: SourceResult[] = [];

        // Base64-encoded server embeds
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
          const isDub = serverName.toLowerCase().includes('dub') || !serverName.toLowerCase().includes('sub');
          results.push({
            source: 'desidub',
            url: finalUrl,
            quality: normalizeQuality('HD'),
            headers: { Referer: `${base}/`, 'User-Agent': UA },
            subtitles: [],
            audioLanguage: isDub ? 'hi' : 'ja',
            language: isDub ? 'Hindi' : 'Japanese',
            sourceType: finalUrl.includes('.m3u8') ? 'hls' : finalUrl.includes('.mp4') ? 'mp4' : 'custom',
          });
        });

        // Fallback: inline m3u8/mp4
        if (results.length === 0) {
          const m3u8 = watchHtml.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
          if (m3u8) {
            results.push({ source: 'desidub', url: m3u8[1], quality: normalizeQuality('HD'), headers: { Referer: `${base}/`, 'User-Agent': UA }, subtitles: [], audioLanguage: 'hi', language: 'Hindi', sourceType: 'hls' });
          }
        }

        if (results.length > 0) return results;
      } catch { continue; }
    }
  }
  return [];
}

const provider: StreamProvider = {
  name: 'desidub',
  sites: [BASE_URL],
  async single(opts: SourceOptions): Promise<SourceResult[]> {
    try {
      return findSources(opts.titles, opts.episode ?? 1);
    } catch {
      return [];
    }
  },
};

export default provider;
