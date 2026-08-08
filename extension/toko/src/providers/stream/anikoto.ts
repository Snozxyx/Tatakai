/**
 * AniKoto — scraper adapter (https://anikoto.cz)
 *
 * AniKoto is a Gogoanime/HiAnime-style site. Search returns `/watch/{slug}`
 * links; each watch page carries a numeric anime id (`#watch-main[data-id]`).
 * The episode list and streaming servers are loaded via AJAX:
 *
 *   GET /ajax/episode/list/{animeId}            → episode HTML (data-ids)
 *   GET /ajax/server/list?servers={epIds}       → server HTML (data-link-id)
 *   GET /ajax/server?get={linkId}               → { result: "<json string>" }
 *
 * The final `result.url` is either a direct m3u8/mp4 or an embed (Vidstreaming/
 * VidCloud) that needs its own extraction. We try common embed resolvers for the
 * well-known hosts and otherwise return the embed as a custom source.
 */
import { normalizeQuality, detectSourceType } from '../../utils/quality.js';
import { buildSearchQueries, scoreMatch } from '../../utils/titleNorm.js';
import type { StreamProvider, SourceOptions, SourceResult } from '../../types.js';

import { fetchResponse, loadHtml } from '../../utils/http.js';

const BASES = ['https://anikoto.cz', 'https://anikoto.me', 'https://anikoto.to'];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

const AJAX_HEADERS = {
  'User-Agent': UA,
  Accept: '*/*',
  'X-Requested-With': 'XMLHttpRequest',
};

interface SearchCandidate {
  slug: string;
  title: string;
  base: string;
}

async function fetchText(url: string, init?: RequestInit): Promise<string | null> {
  try {
    const res = await fetchResponse(url, init);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function searchAnime(titles: string[]): Promise<SearchCandidate | null> {
  for (const base of BASES) {
    for (const query of buildSearchQueries(titles)) {
      const html = await fetchText(`${base}/filter?keyword=${encodeURIComponent(query)}`, {
        headers: { 'User-Agent': UA, Accept: 'text/html' },
      });
      if (!html) continue;

      const $ = loadHtml(html);
      const candidates: Array<{ slug: string; title: string; score: number }> = [];

      $.find('a[href*="/watch/"]').each((_: number, el: any) => {
        const href: string = el.attr?.('href') ?? '';
        const title: string = (el.attr?.('title') ?? el.text?.() ?? '').trim();
        const m = href.match(/\/watch\/([^/?#]+)/);
        if (!m || !title) return;
        if (title.length < 2) return;
        candidates.push({ slug: m[1], title, score: scoreMatch(query, title) });
      });

      if (candidates.length === 0) continue;
      candidates.sort((a, b) => b.score - a.score);
      return { ...candidates[0], base };
    }
  }
  return null;
}

/** Resolve numeric anime id from the watch page. */
async function resolveAnimeId(slug: string, base: string): Promise<number | null> {
  const html = await fetchText(`${base}/watch/${slug}`, {
    headers: { 'User-Agent': UA, Accept: 'text/html' },
  });
  if (!html) return null;

  const idMatch =
    html.match(/id=["']watch-main["'][^>]*data-id=["'](\d+)["']/) ||
    html.match(/data-id=["'](\d+)["'][^>]*id=["']watch-main["']/) ||
    html.match(/data-[a-z-]*id=["'](\d+)["'][^>]*class=["'][^"']*watch/i);
  if (idMatch) return parseInt(idMatch[1], 10);

  const $ = loadHtml(html);
  let found: string | null = null;
  $.find('#watch-main, [data-id]').each((_: number, el: any) => {
    if (found) return;
    const id = el.attr?.('data-id');
    if (id && /^\d+$/.test(id)) found = id;
  });
  return found ? parseInt(found, 10) : null;
}

interface EpisodeRef {
  number: number;
  ids: string;
}

async function getEpisodeRefs(animeId: number, base: string): Promise<EpisodeRef[]> {
  const raw = await fetchText(`${base}/ajax/episode/list/${animeId}`, {
    headers: { ...AJAX_HEADERS, Referer: `${base}/home` },
  });
  if (!raw) return [];

  let html = raw;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'string') html = parsed;
    else if (parsed?.result) html = parsed.result;
    else if (parsed?.html) html = parsed.html;
  } catch { /* keep raw */ }

  const $ = loadHtml(html);
  const episodes: EpisodeRef[] = [];
  $.find('a[data-ids][data-num], li[data-ids][data-num], a[data-ids], li[data-ids]').each((_: number, el: any) => {
    const ids: string = (el.attr?.('data-ids') ?? '').replace(/^['"]|['"]$/g, '');
    const numRaw = el.attr?.('data-num') ?? el.attr?.('data-episode-number');
    const num = parseInt(numRaw, 10);
    if (ids && Number.isFinite(num) && num > 0) episodes.push({ number: num, ids });
  });
  return episodes;
}

interface ServerRef {
  type: string;
  name: string;
  linkId: string;
}

async function getServers(ids: string, base: string): Promise<ServerRef[]> {
  const raw = await fetchText(`${base}/ajax/server/list?servers=${encodeURIComponent(ids)}`, {
    headers: { ...AJAX_HEADERS, Referer: `${base}/home` },
  });
  if (!raw) return [];

  let html = raw;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'string') html = parsed;
    else if (parsed?.result) html = parsed.result;
    else if (parsed?.html) html = parsed.html;
  } catch { /* keep raw */ }

  const $ = loadHtml(html);
  const servers: ServerRef[] = [];
  $.find('.type, .servers .type, [data-type]').each((_: number, typeEl: any) => {
    const type: string = typeEl.attr?.('data-type') ?? typeEl.attr?.('data-server-type') ?? 'sub';
    typeEl.find('li[data-link-id], a[data-link-id]').each((__: number, li: any) => {
      const linkId: string = li.attr?.('data-link-id') ?? '';
      const name: string = (li.find?.('.btn')?.text?.() ?? li.text?.() ?? '').trim();
      if (linkId) servers.push({ type, name, linkId });
    });
  });

  // Fallback: some skins render the li elements directly without .type wrappers.
  if (servers.length === 0) {
    $.find('li[data-link-id], a[data-link-id]').each((_: number, li: any) => {
      const linkId: string = li.attr?.('data-link-id') ?? '';
      if (linkId) {
        servers.push({
          type: li.attr?.('data-type') ?? 'sub',
          name: (li.text?.() ?? '').trim(),
          linkId,
        });
      }
    });
  }
  return servers;
}

interface ResolvedServer {
  url: string;
  skipData?: unknown;
}

async function resolveServer(linkId: string, base: string): Promise<ResolvedServer | null> {
  const raw = await fetchText(`${base}/ajax/server?get=${encodeURIComponent(linkId)}`, {
    headers: { ...AJAX_HEADERS, Referer: `${base}/home` },
  });
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    let result = parsed?.result;
    if (typeof result === 'string') {
      try { result = JSON.parse(result); } catch { /* keep string */ }
    }
    if (result && typeof result === 'object' && result.url) {
      return { url: result.url, skipData: result.skip_data ?? result.skipData };
    }
    if (typeof result === 'string' && result.startsWith('http')) {
      return { url: result };
    }
  } catch { /* not JSON */ }
  return null;
}

async function resolveEmbedToStream(embedUrl: string, referer: string): Promise<{ url: string; type: 'hls' | 'mp4' | 'custom' } | null> {
  // 1. Direct m3u8/mp4 already?
  const direct = detectSourceType(embedUrl);
  if (direct !== 'custom') return { url: embedUrl, type: direct };

  // 2. Try the embed page and look for an obvious m3u8/mp4.
  const html = await fetchText(embedUrl, { headers: { 'User-Agent': UA, Referer: referer } });
  if (!html) return null;

  const m3u8 = html.match(/https?:\/\/[^"'`\s]+\.m3u8[^"'`\s]*/i);
  if (m3u8) return { url: m3u8[0], type: 'hls' };
  const mp4 = html.match(/https?:\/\/[^"'`\s]+\.mp4[^"'`\s]*/i);
  if (mp4) return { url: mp4[0], type: 'mp4' };

  // 3. Rapid-cloud / Megacloud sources endpoint (VidCloud / Vidstreaming family).
  try {
    const u = new URL(embedUrl);
    const sourceId = u.pathname.split('/').filter(Boolean).pop() ?? '';
    if (sourceId) {
      const sourcesUrl = `${u.origin}/getSources?id=${encodeURIComponent(sourceId)}`;
      const srcRaw = await fetchText(sourcesUrl, {
        headers: {
          'User-Agent': UA,
          Referer: embedUrl,
          'X-Requested-With': 'XMLHttpRequest',
        },
      });
      if (srcRaw) {
        const src = JSON.parse(srcRaw);
        const file: string | undefined =
          src?.sources?.[0]?.file ?? src?.sources?.['480']?.[0]?.file ?? src?.source;
        if (file && /^https?:\/\//.test(file)) {
          return { url: file, type: detectSourceType(file) as any };
        }
      }
    }
  } catch { /* ignore */ }

  return null;
}

/**
 * Fallback: the Anikoto watch page exposes direct "DL" (download) links to the
 * pahe CDN (`pahe.nekostream.site/...`) even when the numeric anime id / AJAX
 * endpoints can't be resolved from static HTML. These are real m3u8 playlists.
 */
async function extractDirectFromWatchPage(slug: string, base: string, ep: number): Promise<SourceResult[]> {
  try {
    const url = ep > 1 ? `${base}/watch/${slug}/ep-${ep}` : `${base}/watch/${slug}`;
    const res = await fetchResponse(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html', Referer: `${base}/home` },
    });
    if (!res.ok) return [];
    const html = await res.text();

    const out: SourceResult[] = [];
    const seen = new Set<string>();

    const paheRe = /https?:\/\/pahe\.nekostream\.site\/[A-Za-z0-9_-]+/gi;
    let m: RegExpExecArray | null;
    while ((m = paheRe.exec(html))) {
      const u = m[0];
      if (seen.has(u)) continue;
      seen.add(u);
      out.push({
        source: 'anikoto-pahe',
        url: u,
        quality: 'auto',
        headers: { Referer: base, 'User-Agent': UA, Origin: base },
        subtitles: [],
        audioLanguage: 'ja',
        sourceType: 'hls',
      });
    }

    const m3u8Re = /https?:\/\/[^"'\s)]+\.m3u8[^"'\s)]*/gi;
    while ((m = m3u8Re.exec(html))) {
      const u = m[0];
      if (seen.has(u)) continue;
      seen.add(u);
      out.push({
        source: 'anikoto',
        url: u,
        quality: 'auto',
        headers: { Referer: base, 'User-Agent': UA },
        subtitles: [],
        audioLanguage: 'ja',
        sourceType: 'hls',
      });
    }

    return out;
  } catch {
    return [];
  }
}

const provider: StreamProvider = {
  name: 'anikoto',

  async single(opts: SourceOptions): Promise<SourceResult[]> {
    const targetEp = opts.episode ?? 1;
    const anime = await searchAnime(opts.titles);

    // Try direct watch-page pahe m3u8 extraction first (works without JS-only
    // data-id/AJAX), then fall back to the server resolution path.
    if (anime) {
      const direct = await extractDirectFromWatchPage(anime.slug, anime.base, targetEp);
      if (direct.length > 0) return direct;
    }

    if (!anime) return [];

    const animeId = await resolveAnimeId(anime.slug, anime.base);
    if (!animeId) return [];

    const episodes = await getEpisodeRefs(animeId, anime.base);
    if (episodes.length === 0) return [];

    const episode = episodes.find(e => e.number === targetEp);
    if (!episode) return [];

    const servers = await getServers(episode.ids, anime.base);
    if (servers.length === 0) return [];

    // Prefer sub, then HD-1/Vidstreaming-2, then any.
    const sub = servers.filter(s => (s.type || 'sub').toLowerCase() === 'sub');
    const pool = sub.length > 0 ? sub : servers;
    const ranked = [...pool].sort((a, b) => {
      const score = (s: ServerRef) => {
        const n = s.name.toLowerCase();
        if (n.includes('hd-1') || n.includes('vidstreaming-2')) return 0;
        if (n.includes('hd-2') || n.includes('vidcloud-1')) return 1;
        return 2;
      };
      return score(a) - score(b);
    });

    for (const server of ranked) {
      const resolved = await resolveServer(server.linkId, anime.base);
      if (!resolved?.url) continue;

      const direct = await resolveEmbedToStream(resolved.url, `${anime.base}/`);
      const finalUrl = direct?.url || resolved.url;
      const type = direct?.type || 'custom';

      return [{
        source: 'anikoto',
        url: finalUrl,
        quality: normalizeQuality('HD'),
        headers: {
          Referer: `${anime.base}/`,
          'User-Agent': UA,
        },
        subtitles: [],
        audioLanguage: (server.type || '').toLowerCase() === 'dub' ? 'en' : 'ja',
        sourceType: type,
      }];
    }

    // Last resort: direct watch-page extraction.
    return extractDirectFromWatchPage(anime.slug, anime.base, targetEp);
  },
};

export default provider;
