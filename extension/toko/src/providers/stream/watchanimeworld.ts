/**
 * WatchAnimeWorld — scraper adapter
 * Episode URL pattern: /episode/{anime-slug}-{season}x{episode}/
 * e.g. https://watchanimeworld.top/episode/one-piece-1x1/
 */
import { normalizeQuality, detectSourceType } from '../../utils/scraping/quality.js';
import { buildSearchQueries, scoreMatch } from '../../utils/scraping/title-normalizer.js';
import type { StreamProvider, SourceOptions, SourceResult } from '../../types/index.js';
import { fetchResponse, loadHtml } from '../../utils/http/fetch.js';

const BASES = [
  'https://watchanimeworld.top',
  'https://watchanimeworld.com',
  'https://watchanimeworld.net',
  'https://watchanimeworld.in',
];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

// Language name map used by WAW's player1.php server list
const LANG_MAP: Record<string, { code: string; name: string }> = {
  hindi:     { code: 'hi', name: 'Hindi' },
  tamil:     { code: 'ta', name: 'Tamil' },
  telugu:    { code: 'te', name: 'Telugu' },
  malayalam: { code: 'ml', name: 'Malayalam' },
  bengali:   { code: 'bn', name: 'Bengali' },
  marathi:   { code: 'mr', name: 'Marathi' },
  kannada:   { code: 'kn', name: 'Kannada' },
  english:   { code: 'en', name: 'English' },
  japanese:  { code: 'ja', name: 'Japanese' },
};

function normalizeLang(raw: string): { code: string; name: string } {
  const key = raw.toLowerCase().trim();
  return LANG_MAP[key] ?? { code: 'und', name: raw };
}

export function decodePlayer1Payload(raw: string): string {
  const normalized = decodeURIComponent(raw)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return atob(padded);
}

/**
 * Circuit breaker for the whole mirror set.
 *
 * Every `BASES` entry is currently dead — `.top`/`.net` no longer resolve and
 * `.com`/`.in` accept the connection and never answer — so each `tryBases` call
 * costs the full 3s abort with no chance of success. `findAnimeSlug` makes one
 * per (query × search path), which reliably exhausted the provider's 20s budget
 * and reported `timeout` instead of `empty`. A timeout is far more expensive
 * than an empty result: it holds a slot in the runner's concurrency pool for the
 * entire deadline, delaying providers that do work.
 *
 * So after two consecutive all-bases-unreachable rounds, stop trying for a
 * while. If a mirror comes back the breaker reopens on the next TTL expiry.
 */
const BREAKER_TTL_MS = 5 * 60 * 1000;
const BREAKER_THRESHOLD = 2;
let consecutiveFailures = 0;
let breakerOpenUntil = 0;

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetchResponse(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html', Referer: new URL(url).origin + '/' },
      signal: AbortSignal.timeout(3000),
    } as RequestInit);
    if (!res.ok) return null;
    const text = await res.text();
    return text.length > 200 ? text : null;
  } catch { return null; }
}

async function tryBases(path: string): Promise<{ html: string; base: string } | null> {
  if (Date.now() < breakerOpenUntil) return null;

  // Try all bases in parallel, return first success
  const results = await Promise.all(
    BASES.map(async (base) => {
      const html = await fetchHtml(`${base}${path}`);
      return html ? { html, base } : null;
    })
  );
  const hit = results.find(r => r !== null) ?? null;

  if (hit) {
    consecutiveFailures = 0;
  } else if (++consecutiveFailures >= BREAKER_THRESHOLD) {
    breakerOpenUntil = Date.now() + BREAKER_TTL_MS;
    consecutiveFailures = 0;
  }
  return hit;
}

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-');
}

async function findAnimeSlug(titles: string[]): Promise<{ slug: string; base: string } | null> {
  for (const query of buildSearchQueries(titles)) {
    const searchPaths = [
      `/?s=${encodeURIComponent(query)}`,
      `/search/${encodeURIComponent(query)}/`,
    ];

    for (const path of searchPaths) {
      const result = await tryBases(path);
      if (!result) continue;

      const $ = loadHtml(result.html);
      const hits: Array<{ slug: string; title: string; score: number }> = [];

      $.find('a[href]').each((_: number, el: any) => {
        const href: string = el.attr?.('href') ?? '';
        const m = href.match(/\/(?:anime|series|show)\/([^/?#]+)\/?$/) || href.match(/\/([^/?#]+)-\d+x\d+\/?$/);
        if (!m) return;
        const title: string = (el.attr?.('title') ?? el.text?.() ?? '').trim();
        if (!title) return;
        const slug = m[1]?.replace(/[-_]+$/, '');
        if (!slug || /^(home|search|anime|series)$/i.test(slug)) return;
        hits.push({ slug, title, score: scoreMatch(query, title) });
      });

      if (hits.length > 0) {
        hits.sort((a, b) => b.score - a.score);
        return { slug: hits[0].slug, base: result.base };
      }
    }
  }
  return null;
}

function extractSources(html: string, pageUrl: string, base: string): SourceResult[] {
  const headers = { Referer: pageUrl, 'User-Agent': UA };
  const out: SourceResult[] = [];

  // WAW primary: base64-encoded player1.php server list (often on data-src, not src).
  const player1DataMatch = html.match(/player1\.php\?data=([^"'\s&]+)/i);
  const player1Match = player1DataMatch
    ? [null, null, player1DataMatch[1]] as RegExpMatchArray
    : html.match(/iframe[^>]+(?:src|data-src)=["']([^"']*\/api\/player1\.php\?data=([^"']+))["']/i);
  if (player1Match?.[2]) {
    try {
      const decoded = decodePlayer1Payload(player1Match[2]);
      const servers = JSON.parse(decoded) as Array<{ link?: string; url?: string; file?: string; language?: string; quality?: string }>;
      if (Array.isArray(servers)) {
        for (const server of servers) {
          const link = server.link ?? server.url ?? server.file ?? '';
          if (!link || !/^https?:\/\//.test(link)) continue;
          const lang = normalizeLang(server.language ?? 'Hindi');
          out.push({
            source: 'watchanimeworld',
            url: link,
            quality: normalizeQuality(server.quality ?? 'HD'),
            headers,
            subtitles: [],
            audioLanguage: lang.code,
            language: lang.name,
            sourceType: link.includes('.m3u8') ? 'hls' : detectSourceType(link),
          });
        }
        if (out.length > 0) return out;
      }
    } catch { /* fall through */ }
  }

  // Fallback: direct HLS/MP4 in page
  const m3u8 = html.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/i);
  if (m3u8) {
    out.push({ source: 'watchanimeworld', url: m3u8[1], quality: normalizeQuality('HD'), headers, subtitles: [], sourceType: 'hls' });
    return out;
  }

  const mp4 = html.match(/<source[^>]+src=["']([^"']+\.mp4[^"']*)["']/i) ?? html.match(/(https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*)/i);
  if (mp4) {
    out.push({ source: 'watchanimeworld', url: mp4[1], quality: normalizeQuality('HD'), headers, subtitles: [], sourceType: 'mp4' });
    return out;
  }

  // iframes — skip analytics, captchas and the zephyr* wrapper (see
  // SKIP_IFRAME_HOSTS: the wrapper never plays anything and its current
  // hostname does not resolve).
  const $ = loadHtml(html);
  $.find('iframe[src], iframe[data-src]').each((_: number, el: any) => {
    const src: string = el.attr?.('src') ?? el.attr?.('data-src') ?? '';
    if (isSkippableIframe(src)) return;
    out.push({ source: 'watchanimeworld', url: src, quality: normalizeQuality(''), headers, subtitles: [], sourceType: detectSourceType(src) });
  });

  return out;
}

/**
 * Iframe hosts that are never a playable source.
 *
 * The `zephyr*` family is WAW's own wrapper: it does not play anything itself,
 * it re-frames whatever `player1.php` already gave us. The old filter named
 * only `play.zephyrix.top`, so when the wrapper was renamed to
 * `play.zephyrflick.top` it started leaking through as a "source" — and that
 * host does not resolve at all (NXDOMAIN), which is where
 * `[EmbedPlayer] play.zephyrflick.top is not answering (fetch failed) — failing
 * over` came from. Match the family rather than one hostname so the next rename
 * is already covered.
 */
const SKIP_IFRAME_HOSTS = /googletagmanager|recaptcha|doubleclick|histats|zephyr[a-z0-9-]*\./i;

/** True for an iframe src that is analytics, a captcha, or a known wrapper. */
function isSkippableIframe(src: string): boolean {
  if (!src) return true;
  if (SKIP_IFRAME_HOSTS.test(src)) return true;
  // about:blank / javascript: placeholders that some themes ship.
  return /^(?:about:|javascript:|data:)/i.test(src.trim());
}

const provider: StreamProvider = {
  name: 'watchanimeworld',
  sites: BASES,
  async single(opts: SourceOptions): Promise<SourceResult[]> {
    try {
      const ep = opts.episode ?? 1;
      const titles = opts.titles;

      // Strategy 1: try the series page first, then the standard episode URL variants.
      for (const title of buildSearchQueries(titles)) {
        const slug = slugify(title);
        if (!slug) continue;

        const seriesPaths = [`/series/${slug}/`, `/anime/${slug}/`];
        for (const seriesPath of seriesPaths) {
          const result = await tryBases(seriesPath);
          if (result) {
            const sources = extractSources(result.html, `${result.base}${seriesPath}`, result.base);
            if (sources.length > 0) return sources;
          }
        }

        for (const season of [1, 2, 3]) {
          const epPaths = [
            `/episode/${slug}-${season}x${ep}/`,
            `/episode/${slug}-${ep}/`,
            `/episode/${slug}-ep-${ep}/`,
            `/episode/${slug}-${season}x${ep}/?ep=${ep}`,
          ];
          for (const epPath of epPaths) {
            const result = await tryBases(epPath);
            if (result) {
              const sources = extractSources(result.html, `${result.base}${epPath}`, result.base);
              if (sources.length > 0) return sources;
            }
          }
        }
      }

      // Strategy 2: Search → find slug → try the series and episode pages on the live host.
      const anime = await findAnimeSlug(titles);
      if (anime) {
        const seriesUrl = `/series/${anime.slug}/`;
        const seriesHtml = await fetchHtml(`${anime.base}${seriesUrl}`);
        if (seriesHtml) {
          const sources = extractSources(seriesHtml, `${anime.base}${seriesUrl}`, anime.base);
          if (sources.length > 0) return sources;
        }

        for (const season of [1, 2, 3]) {
          const epPaths = [
            `/episode/${anime.slug}-${season}x${ep}/`,
            `/episode/${anime.slug}-${ep}/`,
            `/episode/${anime.slug}-ep-${ep}/`,
          ];
          for (const epPath of epPaths) {
            const html = await fetchHtml(`${anime.base}${epPath}`);
            if (html) {
              const sources = extractSources(html, `${anime.base}${epPath}`, anime.base);
              if (sources.length > 0) return sources;
            }
          }
        }
      }

      return [];
    } catch { return []; }
  },
};

export default provider;
