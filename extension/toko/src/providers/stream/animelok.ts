/**
 * Animelok — full-featured stream adapter for https://animelok.xyz
 *
 * Ported from extension/A1/src/providers/animelok/animelok.ts.
 * Key differences from the A1 version:
 *   - Uses __tatakai_fetch__ / __tatakai_parse_html__ instead of node-fetch / cheerio
 *   - Returns SourceResult[] (Toko shape) instead of Animelok API response
 *   - AniList ID resolution used for reliable slug building
 *   - Language normalisation via utils/language.ts
 *
 * Requirements: 3.1, 3.4, 3.5, 3.6, 3.7
 */
import { normalizeQuality, detectSourceType } from '../../utils/quality.js';
import { buildSearchQueries } from '../../utils/titleNorm.js';
import { normalizeLangCode, normalizeLanguage } from '../../utils/language.js';
import type { StreamProvider, SourceOptions, SourceResult, LanguageCapability } from '../../types.js';

declare const __tatakai_fetch__: (url: string, init?: RequestInit) => Promise<Response>;
declare const __tatakai_parse_html__: (html: string) => any;

const BASE = 'https://animelok.xyz';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';
const COMPAT_REFERER = `${BASE}/watch/589da512247b`;
const COMPAT_COOKIE = '_ga=GA1.1.353903388.1775793817; _ga_21XGK270WM=GS2.1.s1775793816$o1$g1$t1775793819$j57$l0$h0';

const HEADERS_HTML: Record<string, string> = {
  'User-Agent': UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  Referer: `${BASE}/home`,
  Origin: BASE,
};

const HEADERS_API = (referer = `${BASE}/home`): Record<string, string> => ({
  'User-Agent': UA,
  Accept: '*/*',
  'Accept-Encoding': 'gzip, deflate',
  'Accept-Language': 'en-US,en;q=0.6',
  Connection: 'keep-alive',
  Host: 'animelok.xyz',
  Referer: referer,
  Origin: BASE,
  'X-Requested-With': 'XMLHttpRequest',
  'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Brave";v="146"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'Sec-Fetch-Dest': 'empty',
  'Sec-Fetch-Site': 'same-origin',
  'Sec-Fetch-Mode': 'cors',
  'Sec-GPC': '1',
  Cookie: COMPAT_COOKIE,
});

// ── Slug helpers ──────────────────────────────────────────────────────────────

function slugify(title: string, anilistId: number): string {
  return title.toLowerCase()
    .replace(/["'`]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') + '-' + anilistId;
}

function extractAnilistIdFromSlug(slug: string): number | null {
  const m = slug.match(/(?:^|[^a-z0-9])(\d{1,6})$/i);
  const n = m ? parseInt(m[1], 10) : NaN;
  return Number.isFinite(n) && n > 0 && n < 100000 ? n : null;
}

async function getAniListTitle(anilistId: number): Promise<{ english?: string; romaji?: string } | null> {
  try {
    const res = await __tatakai_fetch__('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        query: `query($id:Int){Media(id:$id,type:ANIME){title{english romaji}}}`,
        variables: { id: anilistId },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json() as any;
    return data?.data?.Media?.title ?? null;
  } catch { return null; }
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function fetchApi(url: string): Promise<any | null> {
  try {
    const watchLike = url.match(/\/api\/anime\/([^/]+)\/episodes\/(\d+)/i);
    const watchId = watchLike?.[1] ?? '';
    const referer = watchLike && /^[a-f0-9]{8,}$/i.test(watchId)
      ? `${BASE}/watch/${watchId}`
      : COMPAT_REFERER;

    const res = await __tatakai_fetch__(url, { headers: HEADERS_API(referer) });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text || text.includes('Checking your connection') || text.includes('challenge-platform')) return null;

    // Loose JSON parse
    const trimmed = text.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try { return JSON.parse(trimmed); } catch { return null; }
    }
    const fb = trimmed.indexOf('{');
    const lb = trimmed.lastIndexOf('}');
    if (fb !== -1 && lb !== -1 && lb > fb) {
      try { return JSON.parse(trimmed.substring(fb, lb + 1)); } catch { return null; }
    }
    return null;
  } catch { return null; }
}

async function fetchHtml(url: string): Promise<string> {
  const res = await __tatakai_fetch__(url, { headers: HEADERS_HTML });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

// ── Slug resolution ───────────────────────────────────────────────────────────

async function resolveSlug(opts: SourceOptions): Promise<string | null> {
  // 1. Try AniList title → canonical slug pattern (<name>-<anilistId>)
  if (opts.anilistId) {
    const alTitle = await getAniListTitle(opts.anilistId);
    if (alTitle) {
      const title = alTitle.english || alTitle.romaji || '';
      if (title) {
        const slug = slugify(title, opts.anilistId);
        const probe = await fetchApi(`${BASE}/api/anime/${encodeURIComponent(slug)}/episodes/1`);
        if (probe?.episode) return slug;
      }
    }
  }

  // 2. Try site search with title variants
  for (const q of buildSearchQueries(opts.titles)) {
    try {
      const html = await fetchHtml(`${BASE}/search?keyword=${encodeURIComponent(q)}`);
      const $ = __tatakai_parse_html__(html);
      let found: string | null = null;
      $.find("a[href^='/anime/']").each((_: number, el: any) => {
        if (found) return;
        const href: string = el.attr?.('href') ?? '';
        const slug = href.split('/').filter(Boolean).pop() ?? '';

        // Prefer slug that ends with the AniList ID
        if (slug && opts.anilistId && slug.endsWith(`-${opts.anilistId}`)) {
          found = slug;
          return;
        }
        if (slug && !found) found = slug;
      });
      if (found) return found;
    } catch { continue; }
  }

  return null;
}

// ── Server / source parsing ───────────────────────────────────────────────────

function parseServers(raw: any): Array<{ name: string; url: string; language: string; isM3u8: boolean; langCode: string }> {
  let arr = raw;
  if (typeof arr === 'string') {
    try {
      const fb = arr.indexOf('[');
      const lb = arr.lastIndexOf(']');
      if (fb !== -1 && lb !== -1) arr = JSON.parse(arr.substring(fb, lb + 1));
      else return [];
    } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];

  const resolveUrl = (entry: any): string => {
    let url = entry?.url || entry?.directUrl || entry?.src || entry?.link || entry?.file || entry?.proxiedUrl || '';
    if (typeof url === 'string' && url.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(url);
        if (Array.isArray(parsed) && parsed[0]) {
          const first = parsed[0];
          url = first.url || first.file || first.src || first.link || url;
        }
      } catch { /* keep raw */ }
    }
    return typeof url === 'string' ? url.trim() : '';
  };

  const seen = new Set<string>();
  return arr.flatMap((server: any) => {
    const entries = Array.isArray(server?.sources) && server.sources.length > 0
      ? server.sources.map((s: any) => ({ ...server, ...s }))
      : [server];

    return entries.map((entry: any) => {
      const lc = String(entry.langCode || '');
      const langInfo = normalizeLangCode(lc || entry.language || entry.languages?.[0] || '');
      const url = resolveUrl(entry);
      const isM3u8 = Boolean(entry.isM3U8 || entry.type === 'hls') || url.toLowerCase().includes('.m3u8');
      return { name: entry.name || 'Server', url, language: langInfo.name, isM3u8, langCode: langInfo.code };
    });
  }).filter((s: any) => {
    if (!s.url || seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });
}

// ── Main provider ─────────────────────────────────────────────────────────────

const provider: StreamProvider = {
  name: 'animelok',

  async single(opts: SourceOptions): Promise<SourceResult[]> {
    try {
      const slug = await resolveSlug(opts);
      if (!slug) return [];

      const ep = opts.episode ?? 1;
      const v2Url = `${BASE}/api/v2/anime/animelok/watch/${encodeURIComponent(slug)}?ep=${ep}`;
      const epUrl = `${BASE}/api/anime/${encodeURIComponent(slug)}/episodes/${ep}`;

      let apiData = await fetchApi(v2Url);
      let rawServers = apiData?.servers;
      let rawSubtitles = apiData?.subtitles;

      if (!rawServers || rawServers.length === 0) {
        apiData = await fetchApi(epUrl);
        if (!apiData?.episode) {
          const [dubData, subData] = await Promise.all([
            fetchApi(`${epUrl}?lang=dub`),
            fetchApi(`${epUrl}?lang=sub`),
          ]);
          if (dubData?.episode || subData?.episode) {
            apiData = dubData?.episode ? dubData : subData;
          }
        }
        rawServers = apiData?.episode?.servers || apiData?.servers;
        rawSubtitles = apiData?.episode?.subtitles || apiData?.subtitles;
      }

      if (!rawServers) return [];

      const servers = parseServers(rawServers);
      if (servers.length === 0) return [];

      const subtitles = (rawSubtitles || [])
        .map((sub: any) => ({
          url: sub.url || sub.src || '',
          label: sub.label || sub.name || 'Subtitle',
          language: sub.label || sub.name || 'und',
          default: false,
        }))
        .filter((s: any) => Boolean(s.url));

      return servers
        .filter(s => !!s.url)
        .map(s => ({
          source: 'animelok',
          url: s.url,
          quality: normalizeQuality(''),
          headers: {
            Referer: `${BASE}/watch/${slug}?ep=${ep}`,
            'User-Agent': UA,
          },
          subtitles,
          sourceType: s.isM3u8 ? ('hls' as const) : detectSourceType(s.url),
          audioLanguage: s.langCode || undefined,
        }));
    } catch { return []; }
  },

  async getLanguages(opts: SourceOptions): Promise<LanguageCapability[]> {
    try {
      const slug = await resolveSlug(opts);
      if (!slug) return [];
      const ep = opts.episode ?? 1;
      const data = await fetchApi(`${BASE}/api/anime/${encodeURIComponent(slug)}/episodes/${ep}`);
      if (!data?.episode) return [];

      const servers = parseServers(data.episode.servers);
      const seen = new Set<string>();
      return servers
        .filter(s => s.langCode && !seen.has(s.langCode) && seen.add(s.langCode))
        .map(s => ({
          language: s.langCode,
          label: s.language,
          type: 'audio' as const,
        }));
    } catch { return []; }
  },
};

export default provider;
