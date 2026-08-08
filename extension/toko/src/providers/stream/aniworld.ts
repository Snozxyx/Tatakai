/**
 * AniWorld — scraper adapter (https://aniworld.to)
 *
 * German-language anime site. Series live at
 *   /anime/stream/{slug}/staffel-{season}/episode-{episode}
 * and expose hoster links as `/redirect/{id}` buttons (VOE, Doodstream,
 * Filemoon, Vidmoly, …). The `/redirect/{id}` URL 302-redirects to the hoster
 * embed page; we then pull an m3u8/master playlist out of it.
 *
 * Search is a POST to `/ajax/search` with `keyword=<query>`.
 */
import { normalizeQuality, detectSourceType } from '../../utils/quality.js';
import type { StreamProvider, SourceOptions, SourceResult } from '../../types.js';

import { fetchResponse } from '../../utils/http.js';

const BASE_URL = 'https://aniworld.to';

interface AniWorldSearchItem {
  link: string;
  title: string;
}

async function search(query: string): Promise<AniWorldSearchItem[]> {
  try {
    const cleanQuery = query.replace(/season\s+\d+/i, '').replace(/\bmovie\b/i, '').trim();
    const res = await fetchResponse(`${BASE_URL}/ajax/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
        Referer: `${BASE_URL}/`,
      },
      body: `keyword=${encodeURIComponent(cleanQuery)}`,
    });
    const text = await res.text();
    if (!text || text.startsWith('<!DOCTYPE')) return [];
    const data = JSON.parse(text);
    if (!Array.isArray(data)) return [];
    return data.filter((item: AniWorldSearchItem) => item.link?.startsWith('/anime/stream/'));
  } catch {
    return [];
  }
}

interface EpisodeRef {
  season: number;
  episode: number;
  url: string;
}

function buildEpisodeUrls(slug: string, season: number, episode: number): string[] {
  // AniWorld uses German "staffel-N/episode-M". Try common structures.
  const candidates: string[] = [];
  for (const s of [season, 1]) {
    candidates.push(`${BASE_URL}/anime/stream/${slug}/staffel-${s}/episode-${episode}`);
  }
  candidates.push(`${BASE_URL}/anime/stream/${slug}/filme/episode-${episode}`);
  candidates.push(`${BASE_URL}/anime/stream/${slug}/episode-${episode}`);
  return candidates;
}

async function findEpisodePage(slug: string, epNumber: number): Promise<string | null> {
  // Fetch the series page to discover seasons/episodes.
  const seriesUrls = [
    `${BASE_URL}/anime/stream/${slug}`,
    `${BASE_URL}/anime/stream/${slug}/staffel-1`,
  ];
  for (const url of seriesUrls) {
    try {
      const res = await fetchResponse(url, { headers: { Referer: `${BASE_URL}/` } });
      if (!res.ok) continue;
      const html = await res.text();

      // Direct link to the specific episode?
      const exact = new RegExp(
        `href="(/anime/stream/${slug.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/staffel-\\d+/episode-${epNumber})"`,
      ).exec(html);
      if (exact) return `${BASE_URL}${exact[1]}`;
    } catch { /* try next */ }
  }
  // Fall back to constructed URLs — the first that returns 200 wins.
  for (const candidate of buildEpisodeUrls(slug, 1, epNumber)) {
    try {
      const res = await fetchResponse(candidate, { method: 'HEAD', headers: { Referer: `${BASE_URL}/` } });
      if (res.ok) return candidate;
    } catch { /* keep trying */ }
  }
  return null;
}

interface RedirectLink {
  id: string;
  hoster: string;
}

function extractRedirectLinks(html: string): RedirectLink[] {
  const links: RedirectLink[] = [];
  const seen = new Set<string>();

  // Modern markup: <a href="/redirect/12345"> ... <strong>VOE</strong>
  const pattern = /href="\/redirect\/(\d+)"[^>]*>[\s\S]*?<strong>\s*([^<]+?)\s*<\/strong>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const id = match[1];
    const hoster = match[2].trim();
    if (!seen.has(id)) {
      seen.add(id);
      links.push({ id, hoster });
    }
  }

  // Fallback: plain /redirect/{id} anchors with hoster name in the link text.
  if (links.length === 0) {
    const simple = /href="\/redirect\/(\d+)"[^>]*>([\s\S]{0,80}?)<\/a>/gi;
    while ((match = simple.exec(html)) !== null) {
      const id = match[1];
      const hoster = (match[2].replace(/<[^>]+>/g, '').trim() || 'unknown').split('\n')[0].trim();
      if (!seen.has(id)) {
        seen.add(id);
        links.push({ id, hoster });
      }
    }
  }

  return links;
}

const HOSTER_PRIORITY = ['vidmoly', 'filemoon', 'voe', 'doodstream', 'dood', 'streamtape', 'vidoza'];

function pickRedirect(links: RedirectLink[]): RedirectLink | null {
  if (links.length === 0) return null;
  const ranked = [...links].sort((a, b) => {
    const score = (name: string) => {
      const lower = name.toLowerCase();
      const idx = HOSTER_PRIORITY.findIndex(h => lower.includes(h));
      return idx === -1 ? HOSTER_PRIORITY.length : idx;
    };
    return score(a.hoster) - score(b.hoster);
  });
  return ranked[0];
}

async function followRedirect(id: string, referer: string): Promise<string | null> {
  try {
    const res = await fetchResponse(`${BASE_URL}/redirect/${id}`, {
      // Do not follow redirects automatically; inspect the Location header.
      redirect: 'manual' as any,
      headers: { Referer: referer },
    });
    const loc = res.headers.get('location') || (res as any).headers.get('Location');
    if (loc) {
      return loc.startsWith('http') ? loc : `${BASE_URL}${loc}`;
    }
    // If the worker already followed the redirect, return the final URL.
    if ((res as any).url && (res as any).url !== `${BASE_URL}/redirect/${id}`) {
      return (res as any).url;
    }
    return null;
  } catch {
    return null;
  }
}

async function extractStreamFromHoster(hosterUrl: string, hosterName: string): Promise<string | null> {
  try {
    const origin = new URL(hosterUrl).origin;
    const res = await fetchResponse(hosterUrl, {
      headers: {
        Referer: BASE_URL,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      },
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Master m3u8 (preferred)
    const master = html.match(/["'](https?:\/\/[^"']+\/master\.m3u8[^"']*)["']/i)
      || html.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/i);
    if (master) return master[1];

    // Hoster-specific sources:
    // - Vidmoly/Filemoon: sources: [{file:"...m3u8"}]
    const sourcesMatch = html.match(/sources\s*:\s*\[([\s\S]*?)\]/);
    if (sourcesMatch) {
      const file = sourcesMatch[1].match(/file\s*:\s*["']([^"']+)["']/);
      if (file?.[1]) return file[1];
    }

    // - VOE: meta redirect or `let/const source = "..."`
    const voeMatch = html.match(/(?:source|file|hls)\s*[:=]\s*["']([^"']+\.m3u8[^"']*)["']/i);
    if (voeMatch) return voeMatch[1];

    // Doodstream: often passes a `/pass_md5/...` URL that yields an mp4.
    const doodMatch = html.match(/\/pass_md5\/[a-z0-9\/]+/i);
    if (doodMatch) return `${origin}${doodMatch[0]}`;

    return null;
  } catch {
    return null;
  }
}

const provider: StreamProvider = {
  name: 'aniworld',

  async single(opts: SourceOptions): Promise<SourceResult[]> {
    const title = opts.titles[0] ?? '';
    const targetEp = opts.episode ?? 1;

    const searchResults = await search(title);
    if (searchResults.length === 0) return [];

    // link looks like "/anime/stream/{slug}"
    const slugMatch = searchResults[0].link.match(/\/anime\/stream\/([^/?#]+)/);
    if (!slugMatch) return [];
    const slug = slugMatch[1];

    const episodePage = await findEpisodePage(slug, targetEp);
    if (!episodePage) return [];

    let html: string;
    try {
      const res = await fetchResponse(episodePage, { headers: { Referer: `${BASE_URL}/` } });
      if (!res.ok) return [];
      html = await res.text();
    } catch {
      return [];
    }

    const redirects = extractRedirectLinks(html);
    if (redirects.length === 0) return [];

    // Try each hoster in priority order until one yields a stream.
    for (const link of [pickRedirect(redirects), ...redirects].filter(Boolean) as RedirectLink[]) {
      const hosterUrl = await followRedirect(link.id, episodePage);
      if (!hosterUrl) continue;
      const stream = await extractStreamFromHoster(hosterUrl, link.hoster);
      if (stream) {
        return [{
          source: 'aniworld',
          url: stream,
          quality: normalizeQuality(''),
          headers: {
            Referer: hosterUrl,
            Origin: new URL(hosterUrl).origin,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          },
          subtitles: [],
          audioLanguage: 'de',
          sourceType: detectSourceType(stream),
        }];
      }
    }

    return [];
  },
};

export default provider;
