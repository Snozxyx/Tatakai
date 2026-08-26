/**
 * AniZone — scraper adapter (https://anizone.to)
 *
 * Search is Livewire-driven: GET /anime?search={query} then POST
 * /livewire/update (empty calls) to receive Alpine `items` JSON in effects.html.
 * Episode: /anime/{shortId}/{ep} → vidstackPlayer m3u8.
 */
import { normalizeQuality, detectSourceType } from '../../utils/scraping/quality.js';
import { buildSearchQueries, scoreMatch } from '../../utils/scraping/title-normalizer.js';
import type { StreamProvider, SourceOptions, SourceResult } from '../../types/index.js';
import { fetchResponse, loadHtml } from '../../utils/http/fetch.js';

const BASES = ['https://anizone.to', 'https://anizone.net', 'https://anizone.pw'];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

const anizoneIdCache = new Map<number, { shortId: string; base: string }>();

interface CookieJar {
  [key: string]: string;
}

function storeCookies(jar: CookieJar, res: Response): void {
  const lines = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  for (const line of lines) {
    const [kv] = line.split(';');
    const eq = kv.indexOf('=');
    if (eq > 0) jar[kv.slice(0, eq).trim()] = kv.slice(eq + 1).trim();
  }
}

function cookieHeader(jar: CookieJar): string {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}

function xsrfToken(jar: CookieJar): string | null {
  const raw = jar['XSRF-TOKEN'];
  return raw ? decodeURIComponent(raw) : null;
}

function decodeWireSnapshot(raw: string): unknown {
  return JSON.parse(raw.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#039;/g, "'"));
}

function unwireSnapshot(raw: string): string {
  return raw.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#039;/g, "'");
}

interface AnizoneSearchItem {
  slug?: string;
  main_title?: string;
  title_list?: Record<string, string>;
}

function parseSearchItems(html: string): AnizoneSearchItem[] {
  // AniZone embeds items in x-data Alpine attribute as JSON.parse('[...]')
  // Pattern: items: JSON.parse('[...json...]')
  // The outer x-data uses double-quoted attribute, so inner JSON uses single-quoted parse call
  const patterns = [
    /items:\s*JSON\.parse\('((?:\\'|[^'])*)'\)/,
    /items:\s*JSON\.parse\("((?:\\"|[^"])*)"\)/,
  ];

  for (const re of patterns) {
    const match = html.match(re);
    if (!match) continue;
    try {
      const json = match[1]
        .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/\\\//g, '/')
        .replace(/\\'/g, "'")
        .replace(/\\"/g, '"');
      const items = JSON.parse(json) as AnizoneSearchItem[];
      if (Array.isArray(items)) return items;
    } catch {
      continue;
    }
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

function titlesForItem(item: AnizoneSearchItem): string[] {
  const out = new Set<string>();
  if (item.main_title) out.add(item.main_title);
  for (const t of Object.values(item.title_list ?? {})) {
    if (typeof t === 'string' && t.trim()) out.add(t.trim());
  }
  return [...out];
}

async function fetchText(url: string, base: string, jar?: CookieJar): Promise<string | null> {
  try {
    const headers: Record<string, string> = {
      'User-Agent': UA,
      Referer: `${base}/`,
      Accept: 'text/html',
    };
    if (jar && Object.keys(jar).length > 0) headers.Cookie = cookieHeader(jar);
    const res = await fetchResponse(url, { headers, timeoutMs: 6000 });
    if (jar) storeCookies(jar, res);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function livewireSearch(base: string, query: string): Promise<AnizoneSearchItem[]> {
  const jar: CookieJar = {};
  const searchUrl = `${base}/anime?search=${encodeURIComponent(query)}`;
  const html = await fetchText(searchUrl, base, jar);
  if (!html) return [];

  // AniZone embeds results directly in the initial HTML via Alpine x-data.
  // Parse them without a Livewire round-trip when present.
  const directItems = parseSearchItems(html);
  if (directItems.length > 0) return directItems;

  const csrf = html.match(/<meta name="csrf-token" content="([^"]+)"/)?.[1];
  if (!csrf) return [];

  let rawSnapshot: string | null = null;
  const re = /wire:snapshot="([^"]+)"[^>]*wire:id="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const snap = decodeWireSnapshot(m[1]) as { memo?: { name?: string } };
    if (snap.memo?.name === 'pages.anime-index') {
      rawSnapshot = unwireSnapshot(m[1]);
      break;
    }
  }
  if (!rawSnapshot) return [];

  try {
    const res = await fetchResponse(`${base}/livewire/update`, {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-CSRF-TOKEN': xsrfToken(jar) ?? csrf,
        'X-Livewire': 'true',
        Referer: searchUrl,
        Origin: base,
        Cookie: cookieHeader(jar),
      },
      body: JSON.stringify({
        _token: csrf,
        components: [{ snapshot: rawSnapshot, updates: {}, calls: [] }],
      }),
      timeoutMs: 8000,
    });
    storeCookies(jar, res);
    if (!res.ok) return directItems;
    const payload = await res.json() as { components?: Array<{ effects?: { html?: string } }> };
    const effectsHtml = payload.components?.[0]?.effects?.html ?? '';
    const livewireItems = parseSearchItems(effectsHtml);
    return livewireItems.length > 0 ? livewireItems : directItems;
  } catch {
    return directItems;
  }
}

async function searchAnimeId(titles: string[]): Promise<{ shortId: string; base: string } | null> {
  const queries = buildSearchQueries(titles).slice(0, 3);

  const attempts = await Promise.allSettled(
    queries.flatMap((query) =>
      BASES.map(async (base) => {
        const items = await livewireSearch(base, query);
        if (items.length === 0) throw new Error('no items');

        let best: { slug: string; score: number } | null = null;
        for (const item of items) {
          const slug = item.slug?.trim();
          if (!slug) continue;
          for (const title of titlesForItem(item)) {
            const score = scoreMatch(query, title);
            if (!best || score > best.score) best = { slug, score };
          }
        }
        if (!best || best.score < 0.35) throw new Error('weak match');
        return { shortId: best.slug, base, score: best.score };
      }),
    ),
  );

  let winner: { shortId: string; base: string; score: number } | null = null;
  for (const attempt of attempts) {
    if (attempt.status !== 'fulfilled') continue;
    if (!winner || attempt.value.score > winner.score) {
      winner = attempt.value;
    }
  }
  return winner ? { shortId: winner.shortId, base: winner.base } : null;
}

function decodeVidstackJson(raw: string): { src?: string; subtitles?: Array<{ file?: string; language?: string; title?: string; default?: boolean }> } {
  const unescaped = raw
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\\//g, '/');
  return JSON.parse(unescaped);
}

function extractVidstackSources(html: string, epUrl: string): SourceResult[] {
  const headers = { Referer: epUrl, 'User-Agent': UA };
  const out: SourceResult[] = [];

  const playerMatch = html.match(/vidstackPlayer\s*\(\s*JSON\.parse\s*\(\s*'((?:\\'|[^'])*)'\s*\)/);
  if (playerMatch) {
    try {
      const config = decodeVidstackJson(playerMatch[1]);
      if (config.src) {
        const src = config.src.replace(/\\\//g, '/');
        if (/\.m3u8|\.mp4/i.test(src)) {
          out.push({
            source: 'anizone',
            url: src,
            quality: normalizeQuality('HD'),
            headers,
            subtitles: (config.subtitles ?? [])
              .filter(t => t.file)
              .map(t => ({
                url: (t.file ?? '').replace(/\\\//g, '/'),
                language: t.language ?? t.title ?? 'en',
                label: t.title ?? t.language ?? 'Unknown',
                default: t.default ?? false,
              })),
            audioLanguage: 'ja',
            sourceType: src.includes('.m3u8') ? 'hls' : 'mp4',
          });
          return out;
        }
      }
    } catch { /* fall through */ }
  }

  const m3u8 = html.match(/https?:\\\/\\\/[^"'`\s]+master\.m3u8[^"'`\s]*/i)
    ?? html.match(/https?:\/\/[^"'`\s]+\.m3u8[^"'`\s]*/i);
  if (m3u8) {
    const url = m3u8[0].replace(/\\\//g, '/');
    out.push({
      source: 'anizone',
      url,
      quality: normalizeQuality('HD'),
      headers,
      subtitles: [],
      audioLanguage: 'ja',
      sourceType: 'hls',
    });
  }

  return out;
}

function extractStreams(html: string, epUrl: string): SourceResult[] {
  const vidstack = extractVidstackSources(html, epUrl);
  if (vidstack.length > 0) return vidstack;

  const headers = { Referer: epUrl, 'User-Agent': UA };
  const out: SourceResult[] = [];

  const mp4 = html.match(/<source[^>]+src=["']([^"']+\.mp4[^"']*)['"]/i)
    ?? html.match(/["'`](https?:\/\/[^"'`\s]+\.mp4[^"'`\s]*)['"` ]/i);
  if (mp4) {
    out.push({
      source: 'anizone',
      url: mp4[1],
      quality: normalizeQuality(''),
      headers,
      subtitles: [],
      audioLanguage: 'ja',
      sourceType: 'mp4',
    });
    return out;
  }

  const $ = loadHtml(html);
  $.find('iframe[src], iframe[data-src]').each((_: number, el: any) => {
    const src: string = el.attr?.('src') ?? el.attr?.('data-src') ?? '';
    if (src && !/googletagmanager|recaptcha|a-ads/i.test(src)) {
      out.push({
        source: 'anizone',
        url: src,
        quality: normalizeQuality(''),
        headers,
        subtitles: [],
        audioLanguage: 'ja',
        sourceType: detectSourceType(src),
      });
    }
  });

  return out;
}

const provider: StreamProvider = {
  name: 'anizone',
  sites: BASES,

  async single(opts: SourceOptions): Promise<SourceResult[]> {
    try {
      const ep = opts.episode ?? 1;
      const anilistId = opts.anilistId;

      let cached = anilistId ? anizoneIdCache.get(anilistId) : undefined;
      if (!cached) {
        const found = await searchAnimeId(opts.titles);
        if (!found) return [];
        cached = found;
        if (anilistId) anizoneIdCache.set(anilistId, cached);
      }

      const { shortId, base } = cached;
      const epUrl = `${base}/anime/${shortId}/${ep}`;
      const html = await fetchText(epUrl, base);
      if (!html) return [];

      return extractStreams(html, epUrl);
    } catch {
      return [];
    }
  },
};

export default provider;
