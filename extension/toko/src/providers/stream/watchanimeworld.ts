/**
 * WatchAnimeWorld — Toko Stream Provider
 * Ported from extension/A1/src/providers/watchaw/watchaw.ts
 */
import { normalizeQuality, detectSourceType } from '../../utils/quality.js';
import { buildSearchQueries } from '../../utils/titleNorm.js';
import type { StreamProvider, SourceOptions, SourceResult } from '../../types.js';

declare const __tatakai_fetch__: (url: string, init?: RequestInit) => Promise<Response>;
declare const __tatakai_parse_html__: (html: string) => any;

const BASE_URL = 'https://watchanimeworld.top';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export const LANGUAGE_NAMES: Record<string, { name: string; code: string; isDub: boolean }> = {
  hindi: { name: 'Hindi', code: 'hi', isDub: true },
  tamil: { name: 'Tamil', code: 'ta', isDub: true },
  telugu: { name: 'Telugu', code: 'te', isDub: true },
  malayalam: { name: 'Malayalam', code: 'ml', isDub: true },
  bengali: { name: 'Bengali', code: 'bn', isDub: true },
  marathi: { name: 'Marathi', code: 'mr', isDub: true },
  kannada: { name: 'Kannada', code: 'kn', isDub: true },
  english: { name: 'English', code: 'en', isDub: true },
  japanese: { name: 'Japanese', code: 'ja', isDub: false },
  korean: { name: 'Korean', code: 'ko', isDub: true },
  chinese: { name: 'Chinese', code: 'zh', isDub: true },
};

function normalizeLang(lang: string) {
  const key = lang.toLowerCase().trim();
  return LANGUAGE_NAMES[key] || { name: lang, code: 'und', isDub: key !== 'japanese' && key !== 'jpn' };
}

async function findEpisodeSources(titles: string[], epNumber: number): Promise<SourceResult[]> {
  for (const titleQuery of buildSearchQueries(titles)) {
    try {
      const searchRes = await __tatakai_fetch__(
        `${BASE_URL}/?s=${encodeURIComponent(titleQuery)}`,
        { headers: { 'User-Agent': UA, Accept: 'text/html' } },
      );
      if (!searchRes.ok) continue;
      const searchHtml = await searchRes.text();
      const $ = __tatakai_parse_html__(searchHtml);

      let episodeUrl: string | null = null;
      $.find('article.post, .swiper-slide article, a[href*="/episode/"]').each((_: number, el: any) => {
        if (episodeUrl) return;
        const href: string = el.attr?.('href') ?? '';
        if (href && href.includes('/episode/')) {
          if (href.includes(`-${epNumber}`) || href.endsWith(`x${epNumber}/`) || href.endsWith(`-${epNumber}/`)) {
            episodeUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;
          }
        }
      });

      if (!episodeUrl) {
        const slug = titleQuery.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        episodeUrl = `${BASE_URL}/episode/${slug}-1x${epNumber}/`;
      }

      const epRes = await __tatakai_fetch__(episodeUrl, {
        headers: { 'User-Agent': UA, Accept: 'text/html' },
      });
      if (!epRes.ok) continue;
      const epHtml = await epRes.text();

      const results: SourceResult[] = [];

      // Check player1.php base64 server data
      const player1Match = epHtml.match(/iframe[^>]+data-src="([^"]*\/api\/player1\.php\?data=([^"]+))"/i);
      if (player1Match?.[2]) {
        try {
          const decoded = atob(player1Match[2]);
          const servers = JSON.parse(decoded);
          if (Array.isArray(servers)) {
            for (const server of servers) {
              const link = server.link || server.url || '';
              if (!link) continue;

              const lang = normalizeLang(server.language || 'Hindi');
              const isHls = link.includes('.m3u8');

              results.push({
                source: 'watchanimeworld',
                url: link,
                quality: normalizeQuality('HD'),
                headers: { Referer: episodeUrl, 'User-Agent': UA },
                subtitles: [],
                audioLanguage: `${lang.name}/${lang.isDub ? 'Dub' : 'Sub'}`,
                sourceType: isHls ? 'hls' : detectSourceType(link),
              });
            }
          }
        } catch { /* proceed to fallbacks */ }
      }

      if (results.length === 0) {
        const m3u8Match = epHtml.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
        if (m3u8Match) {
          results.push({
            source: 'watchanimeworld',
            url: m3u8Match[1],
            quality: normalizeQuality('HD'),
            headers: { Referer: episodeUrl, 'User-Agent': UA },
            subtitles: [],
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
  name: 'watchanimeworld',
  async single(opts: SourceOptions): Promise<SourceResult[]> {
    try {
      return findEpisodeSources(opts.titles, opts.episode ?? 1);
    } catch {
      return [];
    }
  },
};

export default provider;
