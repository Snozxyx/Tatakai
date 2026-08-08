/**
 * MKissa — scraper adapter.
 *
 * The historical WordPress site lived at https://mkissa.com but that domain is
 * now parked. The project re-launched as a SPA at https://mkissa.to (with an
 * anime browser at /search/anime?q=...). That new site is gated behind a
 * reCAPTCHA "Security Check" for non-browser clients, so direct scraping is
 * best-effort:
 *
 *   1. Try the SPA search results page and pull /anime/{slug} links.
 *   2. Resolve the anime page, then the episode page.
 *   3. Extract any m3u8/mp4/iframe from the episode HTML.
 *
 * When the security check blocks us the provider simply returns [] — the rest
 * of the Toko fan-out is unaffected.
 */
import { normalizeQuality, detectSourceType } from '../../utils/quality.js';
import { buildSearchQueries, scoreMatch } from '../../utils/titleNorm.js';
import type { StreamProvider, SourceOptions, SourceResult } from '../../types.js';

import { fetchResponse, loadHtml } from '../../utils/http.js';

const BASES = ['https://mkissa.to', 'https://mkissa.com'];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

const HEADERS = {
  'User-Agent': UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

function isBlocked(html: string): boolean {
  const t = html.toLowerCase();
  return (
    t.includes('security check') ||
    t.includes('recaptcha') ||
    t.includes('challenge-platform') ||
    t.includes('rapidresultsearch')
  );
}

async function fetchHtml(url: string, referer?: string): Promise<string | null> {
  try {
    const res = await fetchResponse(url, {
      headers: { ...HEADERS, Referer: referer ?? new URL(url).origin + '/' },
    });
    if (!res.ok) return null;
    const html = await res.text();
    if (isBlocked(html)) return null;
    return html;
  } catch {
    return null;
  }
}

interface Candidate {
  url: string;
  title: string;
}

async function searchAnime(titles: string[]): Promise<Candidate | null> {
  for (const base of BASES) {
    for (const query of buildSearchQueries(titles)) {
      // mkissa.to SPA search
      const searchUrls = [
        `${base}/search/anime?q=${encodeURIComponent(query)}`,
        `${base}/?s=${encodeURIComponent(query)}`,
      ];
      for (const searchUrl of searchUrls) {
        const html = await fetchHtml(searchUrl);
        if (!html) continue;
        const $ = loadHtml(html);

        const candidates: Candidate[] = [];
        const collect = (el: any) => {
          const href: string = el.attr?.('href') ?? '';
          const title: string = (el.attr?.('title') ?? el.text?.() ?? '').trim();
          if (!href || !title) return;
          // Anime detail links on mkissa.to look like /anime/{slug}; legacy WP
          // used /{slug}/ with embedded content.
          if (/\/anime\//.test(href) || /\/[a-z0-9-]+\/?$/.test(href)) {
            if (href.includes('/search') || href.includes('/genre') || href.includes('/type/')) return;
            const absolute = href.startsWith('http') ? href : `${base}${href.startsWith('/') ? '' : '/'}${href}`;
            candidates.push({ url: absolute, title });
          }
        };

        $.find('a[href*="/anime/"], a[href*="/watch/"], h2.entry-title a, .post-title a, article a').each(
          (_: number, el: any) => collect(el),
        );

        if (candidates.length === 0) continue;
        const scored = candidates
          .map(c => ({ ...c, score: scoreMatch(query, c.title) }))
          .sort((a, b) => b.score - a.score);
        return scored[0];
      }
    }
  }
  return null;
}

async function findEpisodeUrl(animeUrl: string, epNumber: number): Promise<string | null> {
  const html = await fetchHtml(animeUrl);
  if (!html) return null;
  const $ = loadHtml(html);

  let epUrl: string | null = null;
  const patterns = [
    new RegExp(`episode[-_/]?0*${epNumber}(?:/|$|\\?)`, 'i'),
    new RegExp(`ep[-_/]?0*${epNumber}(?:/|$|\\?)`, 'i'),
    new RegExp(`[-/]0*${epNumber}(?:/|$|\\?)`, 'i'),
  ];

  $.find('a[href]').each((_: number, el: any) => {
    if (epUrl) return;
    const href: string = el.attr?.('href') ?? '';
    if (!href) return;
    if (patterns.some(p => p.test(href))) {
      epUrl = href.startsWith('http') ? href : new URL(href, animeUrl).toString();
    }
  });

  if (!epUrl) {
    // Construct a conventional episode URL: /anime/{slug}/episode-{n} or ?ep=n
    const base = animeUrl.replace(/\/$/, '');
    const candidates = [
      `${base}/episode-${epNumber}`,
      `${base}/ep-${epNumber}`,
      `${base}?ep=${epNumber}`,
    ];
    for (const candidate of candidates) {
      const probe = await fetchHtml(candidate, animeUrl);
      if (probe) return candidate;
    }
  }
  return epUrl;
}

function extractSourcesFromHtml(html: string, epUrl: string): SourceResult[] {
  const out: SourceResult[] = [];
  const headers = { Referer: epUrl, 'User-Agent': UA };

  const m3u8 = html.match(/["'`](https?:\/\/[^"'`\s]+\.m3u8[^"'`\s]*)["'`]/);
  if (m3u8) {
    out.push({ source: 'mkissa', url: m3u8[1], quality: normalizeQuality(''), headers, subtitles: [], sourceType: 'hls' });
  }

  if (out.length === 0) {
    const $ = loadHtml(html);
    let embedUrl: string | null = null;
    $.find('iframe[src], iframe[data-src]').each((_: number, el: any) => {
      if (embedUrl) return;
      const src: string = el.attr?.('src') ?? el.attr?.('data-src') ?? '';
      if (src && !/googletagmanager|gtag|recaptcha/i.test(src)) embedUrl = src;
    });
    if (embedUrl) {
      out.push({
        source: 'mkissa',
        url: embedUrl,
        quality: normalizeQuality(''),
        headers,
        subtitles: [],
        sourceType: detectSourceType(embedUrl),
      });
    }
  }

  if (out.length === 0) {
    const mp4 = html.match(/<source[^>]+src=["']([^"']+\.mp4[^"']*)["']/i) ||
      html.match(/["'`](https?:\/\/[^"'`\s]+\.mp4[^"'`\s]*)["'`]/);
    if (mp4) {
      out.push({ source: 'mkissa', url: mp4[1], quality: normalizeQuality(''), headers, subtitles: [], sourceType: 'mp4' });
    }
  }

  return out;
}

const provider: StreamProvider = {
  name: 'mkissa',

  async single(opts: SourceOptions): Promise<SourceResult[]> {
    try {
      const targetEp = opts.episode ?? 1;
      const anime = await searchAnime(opts.titles);
      if (!anime) return [];

      const epUrl = await findEpisodeUrl(anime.url, targetEp);
      if (!epUrl) return [];

      const html = await fetchHtml(epUrl, anime.url);
      if (!html) return [];

      return extractSourcesFromHtml(html, epUrl);
    } catch {
      return [];
    }
  },
};

export default provider;
