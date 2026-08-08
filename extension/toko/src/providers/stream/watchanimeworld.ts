/**
 * WatchAnimeWorld — Toko Stream Provider
 * Ported from extension/A1/src/providers/watchaw/watchaw.ts
 */
import { normalizeQuality, detectSourceType } from '../../utils/quality.js';
import { buildSearchQueries } from '../../utils/titleNorm.js';
import type { StreamProvider, SourceOptions, SourceResult } from '../../types.js';

import { fetchResponse, loadHtml } from '../../utils/http.js';

// Domain rotates periodically. Try the active mirror first then known fallbacks.
const BASE_URLS = [
  'https://watchanimeworld.net',
  'https://watchanimeworld.top',
  'https://watchanimeworld.com',
];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function fetchHtml(url: string, init?: RequestInit): Promise<{ html: string; base: string } | null> {
  for (const base of BASE_URLS) {
    try {
      const candidate = url.startsWith('http') ? url : `${base}${url}`;
      const res = await fetchResponse(candidate, {
        ...init,
        headers: { 'User-Agent': UA, Accept: 'text/html', ...(init?.headers ?? {}) },
      });
      if (!res.ok) continue;
      const html = await res.text();
      if (!html || html.length < 200) continue;
      return { html, base };
    } catch { /* try next mirror */ }
  }
  return null;
}

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

function episodeNumberFromHref(href: string): number | null {
  // Episode slugs look like "/episode/{anime-slug}-1x{ep}/" or "-{ep}/".
  const m = href.match(/(\d+)(?:x|-)(\d+)(?:\/|$|\?)/i);
  if (m) return parseInt(m[2], 10);
  const alt = href.match(/[-x](\d+)(?:\/|$|\?)/);
  return alt ? parseInt(alt[1], 10) : null;
}

async function findEpisodeSources(titles: string[], epNumber: number): Promise<SourceResult[]> {
  for (const titleQuery of buildSearchQueries(titles)) {
    try {
      const search = await fetchHtml(`/?s=${encodeURIComponent(titleQuery)}`);
      if (!search) continue;
      const $ = loadHtml(search.html);

      // Build candidate episode links from search results.
      const candidates: Array<{ href: string; score: number }> = [];
      $.find('article.post a[href*="/episode/"], .swiper-slide article a[href*="/episode/"], a[href*="/episode/"]').each(
        (_: number, el: any) => {
          const href: string = el.attr?.('href') ?? '';
          if (!href.includes('/episode/')) return;
          const ep = episodeNumberFromHref(href);
          if (ep !== epNumber) return;
          const label: string = (el.attr?.('title') ?? el.text?.() ?? '').trim();
          candidates.push({
            href: href.startsWith('http') ? href : `${search.base}${href.startsWith('/') ? '' : '/'}${href}`,
            score: label ? label.length : 1,
          });
        },
      );

      if (candidates.length === 0) {
        // Guess the conventional slug.
        const slug = titleQuery.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        candidates.push({ href: `${search.base}/episode/${slug}-1x${epNumber}/`, score: 0 });
      }

      for (const candidate of candidates) {
        const epPage = await fetchHtml(candidate.href);
        if (!epPage) continue;
        const epHtml = epPage.html;
        const results: SourceResult[] = [];

        // 1. player1.php base64 server list (primary source on WAW).
        const player1Match = epHtml.match(/iframe[^>]+data-src="([^"]*\/api\/player1\.php\?data=([^"]+))"/i);
        if (player1Match?.[2]) {
          try {
            const decoded = atob(player1Match[2]);
            const servers = JSON.parse(decoded);
            if (Array.isArray(servers)) {
              for (const server of servers) {
                const link: string = server.link || server.url || server.file || '';
                if (!link || !/^https?:\/\//.test(link)) continue;

                const lang = normalizeLang(server.language || 'Hindi');
                const isHls = link.includes('.m3u8');

                results.push({
                  source: 'watchanimeworld',
                  url: link,
                  quality: normalizeQuality(server.quality || 'HD'),
                  headers: { Referer: candidate.href, 'User-Agent': UA },
                  subtitles: [],
                  audioLanguage: `${lang.name}/${lang.isDub ? 'Dub' : 'Sub'}`,
                  sourceType: isHls ? 'hls' : detectSourceType(link),
                });
              }
            }
          } catch { /* proceed to fallbacks */ }
        }

        // 2. Inline m3u8 in a <script> tag.
        if (results.length === 0) {
          const m3u8Match = epHtml.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
          if (m3u8Match) {
            results.push({
              source: 'watchanimeworld',
              url: m3u8Match[1],
              quality: normalizeQuality('HD'),
              headers: { Referer: candidate.href, 'User-Agent': UA },
              subtitles: [],
              sourceType: 'hls',
            });
          }
        }

        // 3. Direct mp4 in a <video><source>.
        if (results.length === 0) {
          const mp4Match = epHtml.match(/<source[^>]+src=["']([^"']+\.mp4[^"']*)["']/i)
            || epHtml.match(/(https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*)/i);
          if (mp4Match) {
            results.push({
              source: 'watchanimeworld',
              url: mp4Match[1],
              quality: normalizeQuality('HD'),
              headers: { Referer: candidate.href, 'User-Agent': UA },
              subtitles: [],
              sourceType: 'mp4',
            });
          }
        }

        if (results.length > 0) return results;
      }
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
