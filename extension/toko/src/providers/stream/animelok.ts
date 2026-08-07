/**
 * Animelok — direct-stream adapter for animelok.live.
 *
 * Animelok rebranded from animelok.xyz to animelok.live (Next.js app). The site
 * exposes a JSON API for episodes and their sources:
 *
 *   GET /api/anime/{slug}/episodes/{n}             → episode + servers + subs
 *   GET /api/anime/{slug}/episodes-range?page=0&lang=JAPANESE&pageSize=1000
 *
 * The canonical slug embeds the AniList id (e.g. `naruto-20`,
 * `one-piece-21`), so we prefer `{title}-{anilistId}` derived from the AniList
 * GraphQL title. Slug candidates are probed and the first that returns an
 * `episode` object wins.
 *
 * Servers carry a direct `url` which is either:
 *   - an m3u8 master playlist (bato/pahe/anixl), used directly;
 *   - a short.icu/abyss link that 302-redirects to the embed;
 *   - a JSON-encoded array of {url, quality} variants (pahe);
 *   - a generic embed URL.
 *
 * We always prefer direct m3u8 sources and fall back to best-effort embeds.
 */
import { normalizeQuality, detectSourceType } from '../../utils/quality.js';
import { buildSearchQueries } from '../../utils/titleNorm.js';
import { getLanguageCode } from '../../utils/language.js';
import type { StreamProvider, SourceOptions, SourceResult, SubtitleTrack } from '../../types.js';

declare const __tatakai_fetch__: (url: string, init?: RequestInit) => Promise<Response>;

const BASE = 'https://animelok.live';
const ANILIST_GRAPHQL = 'https://graphql.anilist.co';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

// A static cookie/UA combo the site expects for API calls. The extension worker
// does not persist cookies, so we send a minimal session hint.
const COMPAT_COOKIE = '_ga=GA1.1.353903388.1775793817';

interface RawServer {
  id?: number;
  name?: string;
  tip?: string;
  languages?: string[];
  langCode?: string;
  url?: string;
  isM3U8?: boolean;
  type?: string;
}

interface RawSubtitle {
  name?: string;
  label?: string;
  url?: string;
  src?: string;
}

interface EpisodeResponse {
  anime?: {
    id?: number;
    anilistId?: number;
    slug?: string;
    title?: string;
  };
  episode?: {
    id?: number;
    number?: number;
    name?: string;
    servers?: RawServer[];
    subtitles?: RawSubtitle[];
  };
}

const LANG_PRIORITY = ['JAPANESE', 'ENGLISH', 'HINDI', 'TAMIL', 'TELUGU', 'MALAYALAM', 'KANNADA', 'BENGALI'];

// ── HTTP helpers ────────────────────────────────────────────────────────────

async function apiGet(url: string, referer: string = `${BASE}/home`): Promise<EpisodeResponse | null> {
  try {
    const res = await __tatakai_fetch__(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.6',
        Referer: referer,
        Origin: BASE,
        'X-Requested-With': 'XMLHttpRequest',
        Cookie: COMPAT_COOKIE,
      },
      signal: AbortSignal.timeout(12000),
    } as RequestInit);
    if (!res.ok) return null;
    const text = await res.text();
    const trimmed = text.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try { return JSON.parse(trimmed); } catch { /* fall through */ }
    }
    const fb = trimmed.indexOf('{');
    const lb = trimmed.lastIndexOf('}');
    if (fb !== -1 && lb !== -1 && lb > fb) {
      try { return JSON.parse(trimmed.substring(fb, lb + 1)); } catch { /* ignore */ }
    }
    return null;
  } catch {
    return null;
  }
}

// ── Slug resolution ─────────────────────────────────────────────────────────

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/["'`]/g, '')
    .replace(/&amp;/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function fetchAniListTitle(anilistId: number): Promise<string | null> {
  try {
    const res = await __tatakai_fetch__(ANILIST_GRAPHQL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        query: `query ($id: Int) { Media(id: $id, type: ANIME) { title { english romaji userPreferred native } } }`,
        variables: { id: anilistId },
      }),
      signal: AbortSignal.timeout(5000),
    } as RequestInit);
    if (!res.ok) return null;
    const payload = await res.json() as any;
    const t = payload?.data?.Media?.title;
    return t?.english || t?.romaji || t?.userPreferred || t?.native || null;
  } catch {
    return null;
  }
}

function buildSlugCandidates(opts: SourceOptions, anilistTitle: string | null): string[] {
  const candidates = new Set<string>();
  const anilistId = opts.anilistId;

  // Preferred: AniList-derived canonical slug "{slug}-{id}".
  if (anilistTitle && anilistId) {
    candidates.add(`${slugify(anilistTitle)}-${anilistId}`);
  }

  // Title-derived slugs with the anilist id tail.
  if (anilistId) {
    for (const title of buildSearchQueries(opts.titles)) {
      const s = slugify(title);
      if (s) candidates.add(`${s}-${anilistId}`);
    }
  }

  // Bare slugs / provided ids (watch hashes, legacy slugs).
  for (const title of buildSearchQueries(opts.titles)) {
    const s = slugify(title);
    if (s) candidates.add(s);
  }

  return Array.from(candidates).filter(Boolean);
}

async function probeEpisode(slug: string, ep: number): Promise<{ data: EpisodeResponse; slug: string } | null> {
  const url = `${BASE}/api/anime/${encodeURIComponent(slug)}/episodes/${ep}`;
  const referer = /^[a-f0-9]{8,}$/i.test(slug) ? `${BASE}/watch/${slug}` : `${BASE}/home`;
  const data = await apiGet(url, referer);
  if (data?.episode) return { data, slug };
  return null;
}

// ── Server → Source mapping ─────────────────────────────────────────────────

interface ResolvedVariant {
  url: string;
  quality: string;
}

/** A server url can itself be a JSON array of quality variants (pahe). */
function parseServerVariants(rawUrl: string): ResolvedVariant[] | null {
  const trimmed = rawUrl.trim();
  if (!trimmed.startsWith('[')) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return null;
    const out: ResolvedVariant[] = [];
    for (const entry of parsed) {
      const url = entry?.url || entry?.file || entry?.src;
      if (typeof url === 'string' && url) out.push({ url, quality: entry?.quality || '' });
    }
    return out.length ? out : null;
  } catch {
    return null;
  }
}

function mapLanguage(server: RawServer): string {
  const lang = server.languages?.[0] || server.langCode || '';
  return getLanguageCode(String(lang));
}

function isDirectHls(url: string): boolean {
  return /\.m3u8($|[?#/])/i.test(url);
}

function isShortLink(url: string): boolean {
  return /^https?:\/\/(short\.icu|as-cdn\d*\.top)\//i.test(url);
}

async function resolveShortLink(url: string): Promise<string | null> {
  try {
    const res = await __tatakai_fetch__(url, {
      headers: { 'User-Agent': UA, Referer: BASE },
      redirect: 'manual' as any,
      signal: AbortSignal.timeout(8000),
    } as RequestInit);
    const loc = res.headers.get('location');
    if (loc) return loc.startsWith('http') ? loc : null;
    const finalUrl = (res as any).url;
    if (finalUrl && finalUrl !== url) return finalUrl;
    return null;
  } catch {
    return null;
  }
}

function mapSubtitles(raw: RawSubtitle[] | undefined): SubtitleTrack[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: SubtitleTrack[] = [];
  for (const sub of raw) {
    const url = sub.url || sub.src;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({
      url,
      label: sub.name || sub.label || 'Subtitles',
      language: sub.name || sub.label || 'und',
      default: false,
    });
  }
  return out;
}

function scoreServer(server: RawServer, resolved: string): number {
  let score = 0;
  const url = (resolved || '').toLowerCase();
  const name = String(server.name || '').toLowerCase();

  // Direct HLS is always best.
  if (isDirectHls(url)) score += 100;
  // Known-good multi-quality CDNs.
  if (url.includes('anvod.pro') || url.includes('uwucdn')) score += 50;
  // Abyss/short links are embeds — lower priority.
  if (isShortLink(url)) score -= 20;

  // Prefer Japanese subs, then English, then regional dubs.
  const lang = String(server.languages?.[0] || '').toUpperCase();
  const langIdx = LANG_PRIORITY.indexOf(lang);
  if (langIdx !== -1) score += (LANG_PRIORITY.length - langIdx) * 2;

  if (name.includes('pahe') || name.includes('bato')) score += 5;
  if (server.tip?.toLowerCase().includes('soft sub')) score += 2;

  return score;
}

// ── Provider ─────────────────────────────────────────────────────────────────

export const animelok: StreamProvider = {
  name: 'animelok',

  async single(opts: SourceOptions): Promise<SourceResult[]> {
    const ep = opts.episode ?? 1;

    // 1. Resolve the canonical AniList title (best slug source).
    const anilistTitleText = opts.anilistId ? await fetchAniListTitle(opts.anilistId) : null;

    // 2. Probe slug candidates against the episode API.
    const candidates = buildSlugCandidates(opts, anilistTitleText);
    let resolved: { data: EpisodeResponse; slug: string } | null = null;
    for (const slug of candidates) {
      resolved = await probeEpisode(slug, ep);
      if (resolved) break;
    }

    // 3. If the direct slug probes failed, try the dub/sub language variants.
    if (!resolved) {
      for (const slug of candidates.slice(0, 3)) {
        for (const lang of ['', '?lang=sub', '?lang=dub']) {
          const url = `${BASE}/api/anime/${encodeURIComponent(slug)}/episodes/${ep}${lang}`;
          const data = await apiGet(url);
          if (data?.episode) { resolved = { data, slug }; break; }
        }
        if (resolved) break;
      }
    }

    if (!resolved?.data?.episode) return [];
    const { data, slug } = resolved;
    const episode = data.episode!;
    const subtitles = mapSubtitles(episode.subtitles);

    // 4. Flatten servers into scored candidates.
    interface Candidate {
      server: RawServer;
      url: string;
      quality: string;
      score: number;
    }
    const candidates2: Candidate[] = [];

    for (const server of episode.servers || []) {
      const rawUrl = (server.url || '').trim();
      if (!rawUrl) continue;

      const variants = parseServerVariants(rawUrl);
      if (variants) {
        for (const v of variants) {
          candidates2.push({ server, url: v.url, quality: v.quality, score: scoreServer(server, v.url) });
        }
      } else {
        candidates2.push({ server, url: rawUrl, quality: '', score: scoreServer(server, rawUrl) });
      }
    }

    if (candidates2.length === 0) return [];
    candidates2.sort((a, b) => b.score - a.score);

    // 5. Try to resolve short/embed links, but always emit at least the best.
    const results: SourceResult[] = [];
    const seen = new Set<string>();

    for (const cand of candidates2) {
      if (seen.has(cand.url)) continue;
      seen.add(cand.url);

      let finalUrl = cand.url;
      let sourceType = detectSourceType(finalUrl);

      // Short links redirect to the actual CDN/embed. Resolve when possible.
      if (isShortLink(finalUrl)) {
        const direct = await resolveShortLink(finalUrl);
        if (direct) {
          finalUrl = direct;
          sourceType = detectSourceType(finalUrl);
        } else {
          sourceType = 'custom';
        }
      }

      const language = mapLanguage(cand.server);
      const referer = isDirectHls(finalUrl)
        ? (finalUrl.includes('anvod.pro') ? BASE : 'https://kwik.cx/')
        : `${BASE}/watch/${slug}?ep=${ep}`;

      results.push({
        source: `animelok-${cand.server.name || 'server'}`,
        url: finalUrl,
        quality: normalizeQuality(cand.quality || (isDirectHls(finalUrl) ? 'auto' : '')),
        headers: {
          Referer: referer,
          'User-Agent': UA,
          ...(isDirectHls(finalUrl) && finalUrl.includes('anvod.pro') ? { Origin: BASE } : {}),
        },
        subtitles,
        audioLanguage: language,
        sourceType,
      });

      // Return the best playable direct source right away; include subs once.
      if (isDirectHls(finalUrl)) return results;
    }

    // No direct HLS — return the first (highest-scored) embed/custom source.
    return results.slice(0, 1);
  },
};

export default animelok;
