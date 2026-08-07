/**
 * AniZone — scraper adapter (https://anizone.to)
 *
 * AniZone is a single-page app. Anime detail pages live at `/anime/{shortId}`
 * (e.g. /anime/p0w89at4) and episodes at `/anime/{shortId}/{number}`. The
 * homepage and `/anime` listing expose anchors with those short IDs. We map a
 * title to a short ID by:
 *
 *   1. Trying the site search at `/anime?keyword=<title>`.
 *   2. Falling back to the paginated anime index `/anime?page=N`.
 *
 * Once we have the short ID we fetch the episode page and pull any m3u8/mp4
 * URL or iframe out of its (server-rendered) HTML/JSON island.
 */
import { normalizeQuality, detectSourceType } from '../../utils/quality.js';
import { buildSearchQueries, scoreMatch } from '../../utils/titleNorm.js';
import type { StreamProvider, SourceOptions, SourceResult } from '../../types.js';

declare const __tatakai_fetch__: (url: string, init?: RequestInit) => Promise<Response>;
declare const __tatakai_parse_html__: (html: string) => any;

const BASE = 'https://anizone.to';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

const HEADERS = {
  'User-Agent': UA,
  Referer: `${BASE}/`,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await __tatakai_fetch__(url, { headers: HEADERS });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

interface Candidate {
  id: string;
  title: string;
}

interface ScoredCandidate extends Candidate {
  score: number;
}

function collectAnimeLinks(html: string, query: string): ScoredCandidate[] {
  const $ = __tatakai_parse_html__(html);
  const out: ScoredCandidate[] = [];
  const seen = new Set<string>();

  $.find('a[href*="/anime/"]').each((_: number, el: any) => {
    const href: string = el.attr?.('href') ?? '';
    // Skip episode links (they contain a trailing /{number}).
    const m = href.match(/\/anime\/([a-z0-9]+)(?:\/(\d+))?\/?(?:[?#].*)?$/i);
    if (!m || m[2]) return;
    const id = m[1];
    if (seen.has(id)) return;
    const title: string = (el.attr?.('title') ?? el.text?.() ?? '').trim();
    if (!title || title.length < 2) return;
    seen.add(id);
    out.push({ id, title, score: scoreMatch(query, title) });
  });

  return out.sort((a, b) => b.score - a.score);
}

async function findAnimeId(titles: string[]): Promise<string | null> {
  for (const query of buildSearchQueries(titles)) {
    // 1. Site search
    const searchHtml = await fetchText(`${BASE}/anime?keyword=${encodeURIComponent(query)}`);
    if (searchHtml) {
      const hits = collectAnimeLinks(searchHtml, query);
      if (hits.length > 0 && hits[0].score >= 0.4) return hits[0].id;
    }

    // 2. Fallback: walk the first couple of index pages.
    for (let page = 1; page <= 2; page++) {
      const listHtml = await fetchText(`${BASE}/anime?page=${page}`);
      if (!listHtml) continue;
      const hits = collectAnimeLinks(listHtml, query);
      if (hits.length > 0) return hits[0].id;
    }
  }
  return null;
}

function extractStreams(html: string, epUrl: string): SourceResult[] {
  const headers = { Referer: epUrl, 'User-Agent': UA };
  const results: SourceResult[] = [];

  // 1. Inline m3u8 (may be inside a JSON island or a <script>).
  const m3u8 = html.match(/["'`](https?:\/\/[^"'`\s]+\.m3u8[^"'`\s]*)["'`]/i);
  if (m3u8) {
    results.push({
      source: 'anizone',
      url: m3u8[1],
      quality: normalizeQuality(''),
      headers,
      subtitles: [],
      sourceType: 'hls',
    });
  }

  // 2. Inline mp4.
  if (results.length === 0) {
    const mp4 =
      html.match(/<source[^>]+src=["']([^"']+\.mp4[^"']*)["']/i) ||
      html.match(/["'`](https?:\/\/[^"'`\s]+\.mp4[^"'`\s]*)["'`]/i);
    if (mp4) {
      results.push({
        source: 'anizone',
        url: mp4[1],
        quality: normalizeQuality(''),
        headers,
        subtitles: [],
        sourceType: 'mp4',
      });
    }
  }

  // 3. iframe / embed as custom source.
  if (results.length === 0) {
    const $ = __tatakai_parse_html__(html);
    let embed: string | null = null;
    $.find('iframe[src], iframe[data-src], video source[src]').each((_: number, el: any) => {
      if (embed) return;
      const src: string = el.attr?.('src') ?? el.attr?.('data-src') ?? '';
      if (src && !/googletagmanager|recaptcha|a-ads/i.test(src)) embed = src;
    });
    if (embed) {
      results.push({
        source: 'anizone',
        url: embed,
        quality: normalizeQuality(''),
        headers,
        subtitles: [],
        sourceType: detectSourceType(embed),
      });
    }
  }

  return results;
}

const provider: StreamProvider = {
  name: 'anizone',

  async single(opts: SourceOptions): Promise<SourceResult[]> {
    try {
      const targetEp = opts.episode ?? 1;
      const id = await findAnimeId(opts.titles);
      if (!id) return [];

      const epUrl = `${BASE}/anime/${id}/${targetEp}`;
      const html = await fetchText(epUrl);
      if (!html) return [];

      return extractStreams(html, epUrl);
    } catch {
      return [];
    }
  },
};

export default provider;
