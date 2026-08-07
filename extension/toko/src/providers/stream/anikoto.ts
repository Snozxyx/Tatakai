/**
 * AniKoto — native scraper (https://anikoto.cz)
 * Structure similar to GogoAnime/Zoro-style sites.
 */
import { normalizeQuality, detectSourceType } from '../../utils/quality.js';
import { buildSearchQueries } from '../../utils/titleNorm.js';
import type { StreamProvider, SourceOptions, SourceResult } from '../../types.js';

declare const __tatakai_fetch__: (url: string, init?: RequestInit) => Promise<Response>;
declare const __tatakai_parse_html__: (html: string) => any;

const BASE = 'https://anikoto.cz';
const HEADERS = {
  Referer: `${BASE}/`,
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
};

async function tryFetch(url: string, init?: RequestInit): Promise<Response | null> {
  try {
    const res = await __tatakai_fetch__(url, { ...init, headers: { ...HEADERS, ...(init?.headers ?? {}) } });
    return res.ok ? res : null;
  } catch { return null; }
}

async function searchAnime(queries: string[]): Promise<{ id: string; title: string } | null> {
  for (const q of queries) {
    const res = await tryFetch(`${BASE}/search?keyword=${encodeURIComponent(q)}`);
    if (!res) continue;
    const html = await res.text();
    const $ = __tatakai_parse_html__(html);
    let found: { id: string; title: string } | null = null;
    // Common selectors for Gogoanime-derivative sites
    $.find('a[href*="/anime/"], .film-name a, .ani_name a, h3.title a').each((_: number, el: any) => {
      if (found) return;
      const href: string = el.attr?.('href') ?? '';
      const title: string = (el.text?.() ?? el.attr?.('title') ?? '').trim();
      const m = href.match(/\/anime\/([^/?#]+)/);
      if (m && title) found = { id: m[1], title };
    });
    if (found) return found;
  }
  return null;
}

async function getEpisodeId(animeId: string, epNumber: number): Promise<string | null> {
  const res = await tryFetch(`${BASE}/anime/${animeId}`);
  if (res) {
    const html = await res.text();
    const $ = __tatakai_parse_html__(html);
    let epId: string | null = null;
    $.find(`[data-episode="${epNumber}"], li[data-id][data-ep="${epNumber}"], .ep-item[data-num="${epNumber}"]`).each((_: number, el: any) => {
      if (epId) return;
      epId = el.attr?.('data-id') ?? el.attr?.('data-ep-id') ?? null;
    });
    if (!epId) {
      $.find(`a[href*="episode-${epNumber}"], a[href*="/ep-${epNumber}"], a[href*="ep=${epNumber}"]`).each((_: number, el: any) => {
        if (epId) return;
        const href: string = el.attr?.('href') ?? '';
        if (href) epId = href;
      });
    }
    if (epId) return epId;
  }
  // Direct fallback URL pattern
  return `/watch/${animeId}-episode-${epNumber}`;
}

async function extractSources(idOrUrl: string): Promise<SourceResult[]> {
  const url = idOrUrl.startsWith('http') ? idOrUrl : `${BASE}${idOrUrl}`;
  const res = await tryFetch(url);
  if (!res) return [];
  const html = await res.text();
  const sources: SourceResult[] = [];

  // 1. Script m3u8
  const m3u8 = html.match(/["'`](https?:\/\/[^"'`\s]+\.m3u8[^"'`\s]*)["'`]/);
  if (m3u8) {
    sources.push({ source: 'anikoto', url: m3u8[1], quality: normalizeQuality(''), headers: HEADERS, subtitles: [], sourceType: 'hls' as const });
  }

  // 2. Direct iframe / video tag embed
  if (sources.length === 0) {
    const $ = __tatakai_parse_html__(html);
    let embedUrl: string | null = null;
    $.find('iframe[src], iframe[data-src], video source[src]').each((_: number, el: any) => {
      if (embedUrl) return;
      const src: string = el.attr?.('src') ?? el.attr?.('data-src') ?? '';
      if (src && !src.includes('googletagmanager')) embedUrl = src;
    });
    if (embedUrl) {
      const isHls = (embedUrl as string).includes('.m3u8');
      sources.push({
        source: 'anikoto',
        url: embedUrl as string,
        quality: normalizeQuality(''),
        headers: HEADERS,
        subtitles: [],
        sourceType: isHls ? 'hls' as const : detectSourceType(embedUrl as string),
      });
    }
  }

  // 3. Script mp4
  if (sources.length === 0) {
    const mp4 = html.match(/["'`](https?:\/\/[^"'`\s]+\.mp4[^"'`\s]*)["'`]/);
    if (mp4) {
      sources.push({ source: 'anikoto', url: mp4[1], quality: normalizeQuality(''), headers: HEADERS, subtitles: [], sourceType: 'mp4' as const });
    }
  }

  return sources;
}

const provider: StreamProvider = {
  name: 'anikoto',
  async single(opts: SourceOptions): Promise<SourceResult[]> {
    try {
      const queries = buildSearchQueries(opts.titles);
      const anime = await searchAnime(queries);
      if (!anime) return [];
      const epId = await getEpisodeId(anime.id, opts.episode ?? 1);
      if (!epId) return [];
      return extractSources(epId);
    } catch { return []; }
  },
};
export default provider;
