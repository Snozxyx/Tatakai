/**
 * 4anime — WordPress AnimeStream theme scraper.
 *
 * Live host: https://4anime.com.ro
 *   /anime/{slug}/                         → series page with episode list
 *   /{slug}-episode-{n}-english-subbed/    → watch page with iframe embed
 *   /?s={query}                            → search
 */
import { normalizeQuality, detectSourceType } from '../../utils/scraping/quality.js';
import { buildSearchQueries, scoreMatch, slugifyTitle } from '../../utils/scraping/title-normalizer.js';
import type { StreamProvider, SourceOptions, SourceResult } from '../../types/index.js';
import { fetchResponse, loadHtml } from '../../utils/http/fetch.js';

const BASES = [
  'https://4anime.com.ro',
  'https://4anime.to',
  'https://4anime.gg',
];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

function headersFor(base: string): Record<string, string> {
  return { 'User-Agent': UA, Referer: `${base}/` };
}

async function fetchHtml(url: string, base: string): Promise<string | null> {
  try {
    const res = await fetchResponse(url, {
      headers: headersFor(base),
      signal: AbortSignal.timeout(8000),
    } as RequestInit);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

interface Candidate {
  url: string;
  title: string;
  base: string;
  slug: string;
}

async function searchAnime(titles: string[]): Promise<Candidate | null> {
  for (const query of buildSearchQueries(titles)) {
    const settled = await Promise.allSettled(
      BASES.map(async (BASE) => {
        const html = await fetchHtml(`${BASE}/?s=${encodeURIComponent(query)}`, BASE);
        if (!html) throw new Error('no html');

        const $ = loadHtml(html);
        const hits: Array<Candidate & { score: number }> = [];

        $.find('a[href*="/anime/"]').each((_: number, el: any) => {
          const href: string = el.attr?.('href') ?? '';
          const title: string = (el.attr?.('title') ?? el.text?.() ?? '').trim();
          if (!href || !title || href.endsWith('/anime/')) return;
          const m = href.match(/\/anime\/([^/?#]+)\/?(?:[?#].*)?$/);
          if (!m) return;
          hits.push({
            url: href.startsWith('http') ? href : `${BASE}${href}`,
            title,
            base: BASE,
            slug: m[1],
            score: scoreMatch(query, title),
          });
        });

        if (hits.length === 0) throw new Error('no hits');
        hits.sort((a, b) => b.score - a.score);
        return hits[0];
      }),
    );
    for (const attempt of settled) {
      if (attempt.status === 'fulfilled') return attempt.value;
    }
  }
  return null;
}

async function probeEpisodeUrl(base: string, slug: string, ep: number): Promise<string | null> {
  const epPad = String(ep).padStart(2, '0');
  const candidates = [
    `${base}/${slug}-episode-${ep}-english-subbed/`,
    `${base}/${slug}-episode-${epPad}-english-subbed/`,
    `${base}/${slug}-episode-${ep}/`,
    `${base}/${slug}-episode-${epPad}/`,
  ];

  const settled = await Promise.allSettled(
    candidates.map(async (url) => {
      const res = await fetchResponse(url, {
        headers: headersFor(base),
        timeoutMs: 5000,
      });
      if (!res.ok) throw new Error('not ok');
      return url;
    }),
  );
  for (const attempt of settled) {
    if (attempt.status === 'fulfilled') return attempt.value;
  }
  return null;
}

async function findEpisodeUrl(anime: Candidate, ep: number): Promise<string | null> {
  const html = await fetchHtml(anime.url, anime.base);
  if (html) {
    const $ = loadHtml(html);
    let epUrl: string | null = null;

    const epPatterns = [
      new RegExp(`episode-${ep}(?:[^0-9]|$)`, 'i'),
      new RegExp(`episode-${String(ep).padStart(2, '0')}(?:[^0-9]|$)`, 'i'),
    ];

    $.find('a[href]').each((_: number, el: any) => {
      if (epUrl) return;
      const href: string = el.attr?.('href') ?? '';
      if (!href || !epPatterns.some(p => p.test(href))) return;
      epUrl = href.startsWith('http') ? href : `${anime.base}${href.startsWith('/') ? '' : '/'}${href}`;
    });

    if (epUrl) return epUrl;
  }

  return probeEpisodeUrl(anime.base, anime.slug, ep);
}

function extractStreams(html: string, pageUrl: string): SourceResult[] {
  const headers = { Referer: pageUrl, 'User-Agent': UA };
  const out: SourceResult[] = [];
  const seen = new Set<string>();

  for (const m of html.matchAll(/["'`](https?:\/\/[^"'`\s]+\.m3u8[^"'`\s]*)["'`]/gi)) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      out.push({
        source: '4anime',
        url: m[1],
        quality: normalizeQuality(''),
        headers,
        subtitles: [],
        audioLanguage: 'ja',
        sourceType: 'hls',
      });
    }
  }

  if (out.length === 0) {
    const $ = loadHtml(html);
    $.find('iframe[src], iframe[data-src], .mirrorembed iframe, #player iframe').each((_: number, el: any) => {
      const src: string = el.attr?.('src') ?? el.attr?.('data-src') ?? '';
      if (src && !/googletagmanager|recaptcha|doubleclick/i.test(src) && !seen.has(src)) {
        seen.add(src);
        const url = src.startsWith('http') ? src : new URL(src, pageUrl).toString();
        out.push({
          source: '4anime',
          url,
          quality: normalizeQuality(''),
          headers,
          subtitles: [],
          audioLanguage: 'ja',
          sourceType: detectSourceType(url),
        });
      }
    });
    if (out.length === 0) {
      for (const m of html.matchAll(/<iframe[^>]*\ssrc=["']([^"']+)["']/gi)) {
        const raw = m[1].replace(/&#038;/g, '&').replace(/&amp;/g, '&');
        if (!raw || seen.has(raw) || raw.includes('${')) continue;
        seen.add(raw);
        const url = raw.startsWith('http') ? raw : new URL(raw, pageUrl).toString();
        out.push({
          source: '4anime',
          url,
          quality: normalizeQuality(''),
          headers,
          subtitles: [],
          audioLanguage: 'ja',
          sourceType: detectSourceType(url),
        });
      }
    }
  }

  return out;
}

const provider: StreamProvider = {
  name: '4anime',
  sites: BASES,
  async single(opts: SourceOptions): Promise<SourceResult[]> {
    try {
      const targetEp = opts.episode ?? 1;

      // Direct slug probe across all bases and title variants — run in parallel
      const slugProbes: Promise<SourceResult[] | null>[] = [];
      for (const title of buildSearchQueries(opts.titles).slice(0, 3)) {
        const slug = slugifyTitle(title);
        if (!slug) continue;
        for (const base of BASES) {
          slugProbes.push(
            probeEpisodeUrl(base, slug, targetEp).then(async epUrl => {
              if (!epUrl) return null;
              const html = await fetchHtml(epUrl, base);
              if (!html) return null;
              const sources = extractStreams(html, epUrl);
              return sources.length > 0 ? sources : null;
            })
          );
        }
      }

      const probeResults = await Promise.allSettled(slugProbes);
      for (const r of probeResults) {
        if (r.status === 'fulfilled' && r.value) return r.value;
      }

      // Search fallback (slow path)
      const anime = await searchAnime(opts.titles);
      if (!anime) return [];

      const epUrl = await findEpisodeUrl(anime, targetEp);
      if (!epUrl) return [];

      const html = await fetchHtml(epUrl, anime.base);
      if (!html) return [];

      return extractStreams(html, epUrl);
    } catch {
      return [];
    }
  },
};

export default provider;
