/**
 * AnimeSalt — scraper adapter (https://animesalt.link)
 *
 * WordPress-style site with series at `/series/{slug}/`, movies at
 * `/movies/{slug}/`, and episodes at `/episode/{slug}-{season}x{episode}/`.
 * Search is `/?s=<query>`. The watch page embeds the HLS/MP4 URL inside a
 * `<video>` / `<iframe>` or an inline script.
 */
import { normalizeQuality, detectSourceType } from '../../utils/scraping/quality.js';
import { buildSearchQueries, scoreMatch } from '../../utils/scraping/title-normalizer.js';
import type { StreamProvider, SourceOptions, SourceResult } from '../../types/index.js';

import { fetchResponse, loadHtml } from '../../utils/http/fetch.js';

const BASES = ['https://animesalt.link', 'https://animesalt.top', 'https://animesalt.com', 'https://animesalt.net'];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

async function fetchHtml(url: string): Promise<{ html: string; base: string } | null> {
  // If absolute URL, try it directly
  if (url.startsWith('http')) {
    const base = new URL(url).origin;
    try {
      const res = await fetchResponse(url, {
        headers: { 'User-Agent': UA, Accept: 'text/html', Referer: `${base}/` },
        signal: AbortSignal.timeout(3000),
      } as RequestInit);
      if (res.ok) {
        const html = await res.text();
        if (html.length >= 200) return { html, base };
      }
    } catch { /* fall through */ }
    return null;
  }
  // Relative path — try all bases in parallel
  const results = await Promise.all(
    BASES.map(async (base) => {
      try {
        const res = await fetchResponse(`${base}${url}`, {
          headers: { 'User-Agent': UA, Accept: 'text/html', Referer: `${base}/` },
          signal: AbortSignal.timeout(3000),
        } as RequestInit);
        if (!res.ok) return null;
        const html = await res.text();
        if (html.length < 200) return null;
        return { html, base };
      } catch { return null; }
    })
  );
  return results.find(r => r !== null) ?? null;
}

interface SearchHit {
  slug: string;
  kind: 'series' | 'movies';
  title: string;
  base: string;
}

function extractSlugFromHref(href: string): { slug: string; kind: 'series' | 'movies' } | null {
  const m = href.match(/\/(series|movies)\/([^/?#]+)\/?(?:[?#].*)?$/);
  if (!m) return null;
  return { kind: m[1] as 'series' | 'movies', slug: m[2] };
}

async function searchAnime(titles: string[]): Promise<SearchHit | null> {
  for (const query of buildSearchQueries(titles)) {
    const page = await fetchHtml(`/?s=${encodeURIComponent(query)}`);
    if (!page) continue;
    const $ = loadHtml(page.html);

    const hits: SearchHit[] = [];
    $.find('a[href*="/series/"], a[href*="/movies/"]').each((_: number, el: any) => {
      const href: string = el.attr?.('href') ?? '';
      const parsed = extractSlugFromHref(href);
      if (!parsed) return;
      const title: string = (el.attr?.('title') ?? el.text?.() ?? '').trim();
      if (!title) return;
      hits.push({ ...parsed, title, base: page.base });
    });

    if (hits.length === 0) continue;

    const scored = hits
      .map(h => ({ ...h, score: scoreMatch(query, h.title) }))
      .sort((a, b) => b.score - a.score);

    if (scored[0].score >= 0.4) return scored[0];
  }
  return null;
}

async function findEpisodeUrl(hit: SearchHit, episode: number, base: string): Promise<string | null> {
  if (hit.kind === 'movies') {
    return `${base}/movies/${hit.slug}/`;
  }

  // TV series: AnimeSalt numbers episodes continuously per season, but the URL
  // uses the SxxExx pattern. Start with season 1 and probe; the detail page
  // exposes First/Latest links we can use to discover the season mapping.
  const detail = await fetchHtml(`/${hit.kind}/${hit.slug}/`);
  if (detail) {
    const firstMatch = detail.html.match(/\/episode\/[^"']+?(\d+)x1\//i);
    const latestMatch = detail.html.match(/\/episode\/[^"']+?(\d+)x(\d+)\//gi);
    if (latestMatch) {
      // Find the last (season, ep) pair on the page.
      let best: { season: number; ep: number } | null = null;
      for (const link of latestMatch) {
        const m = link.match(/(\d+)x(\d+)/i);
        if (m) best = { season: parseInt(m[1], 10), ep: parseInt(m[2], 10) };
      }
      if (best) {
        // If requested episode > latest season's count, walk back seasons.
        let { season, ep } = best;
        while (season > 0 && ep < episode) {
          season--;
          if (season === 0) break;
          // Probe previous season's last episode via the season slug if possible.
          ep = episode;
        }
        const useEp = season === best.season ? episode : episode;
        return `${base}/episode/${hit.slug}-${season}x${useEp}/`;
      }
    }
    if (firstMatch) {
      const season = parseInt(firstMatch[1], 10) || 1;
      return `${base}/episode/${hit.slug}-${season}x${episode}/`;
    }
  }

  return `${base}/episode/${hit.slug}-1x${episode}/`;
}

async function resolvePageSources(html: string, pageUrl: string, base: string): Promise<SourceResult[]> {
  const initial = extractStreams(html, pageUrl);

  // If we got a WordPress AJAX marker, resolve it
  const ajaxResult = initial.find(s => s.url.includes('admin-ajax.php|nonce='));
  if (ajaxResult) {
    const [ajaxUrl, nonceParam, postIdParam] = ajaxResult.url.split('|');
    const nonce = nonceParam?.split('=')[1];
    const postId = postIdParam?.split('=')[1];
    if (nonce && postId) {
      try {
        const res = await fetchResponse(ajaxUrl, {
          method: 'POST',
          headers: {
            'User-Agent': UA,
            'Content-Type': 'application/x-www-form-urlencoded',
            Referer: pageUrl,
            Origin: base,
          },
          body: `action=get_player_src&nonce=${nonce}&post_id=${postId}&type=series`,
          timeoutMs: 8000,
        });
        if (res.ok) {
          const text = await res.text();
          try {
            const data = JSON.parse(text) as { success?: boolean; data?: string | { url?: string; embed?: string } };
            const raw = typeof data.data === 'string' ? data.data : (data.data?.url ?? data.data?.embed ?? '');
            if (raw && /^https?:\/\//.test(raw)) {
              return [{
                source: 'animesalt',
                url: raw,
                quality: normalizeQuality('HD'),
                headers: { Referer: pageUrl, 'User-Agent': UA },
                subtitles: [],
                sourceType: detectSourceType(raw),
              }];
            }
            // Could be raw HTML with iframe
            const iframeMatch = raw.match(/src=["']([^"']+)["']/i);
            if (iframeMatch) {
              return [{
                source: 'animesalt',
                url: iframeMatch[1],
                quality: normalizeQuality('HD'),
                headers: { Referer: pageUrl, 'User-Agent': UA },
                subtitles: [],
                sourceType: detectSourceType(iframeMatch[1]),
              }];
            }
          } catch { /* not JSON — maybe raw iframe HTML */ }
          const m3u8 = text.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/i);
          if (m3u8) {
            return [{
              source: 'animesalt',
              url: m3u8[0],
              quality: normalizeQuality('HD'),
              headers: { Referer: pageUrl, 'User-Agent': UA },
              subtitles: [],
              sourceType: 'hls',
            }];
          }
        }
      } catch { /* fall through */ }
    }
    // Return the non-AJAX results (minus the AJAX marker)
    return initial.filter(s => !s.url.includes('admin-ajax.php|nonce='));
  }

  return initial;
}

function extractStreams(html: string, pageUrl: string): SourceResult[] {
  const headers = { Referer: pageUrl, 'User-Agent': UA };
  const results: SourceResult[] = [];

  const m3u8 = html.match(/["'`](https?:\/\/[^"'`\s]+\.m3u8[^"'`\s]*)["'`]/i);
  if (m3u8) {
    results.push({ source: 'animesalt', url: m3u8[1], quality: normalizeQuality('HD'), headers, subtitles: [], sourceType: 'hls' });
  }

  if (results.length === 0) {
    const mp4 =
      html.match(/<source[^>]+src=["']([^"']+\.mp4[^"']*)["']/i) ||
      html.match(/["'`](https?:\/\/[^"'`\s]+\.mp4[^"'`\s]*)["'`]/i);
    if (mp4) {
      results.push({ source: 'animesalt', url: mp4[1], quality: normalizeQuality('HD'), headers, subtitles: [], sourceType: 'mp4' });
    }
  }

  if (results.length === 0) {
    const $ = loadHtml(html);
    let embed: string | null = null;
    $.find('iframe[src], iframe[data-src]').each((_: number, el: any) => {
      if (embed) return;
      const src: string = el.attr?.('src') ?? el.attr?.('data-src') ?? '';
      if (src && !/googletagmanager|recaptcha|a-ads/i.test(src)) embed = src;
    });
    if (embed) {
      results.push({
        source: 'animesalt',
        url: embed,
        quality: normalizeQuality('HD'),
        headers,
        subtitles: [],
        sourceType: detectSourceType(embed),
      });
    }
  }

  // WordPress torofilm theme: player loaded via admin-ajax.php with nonce.
  // Extract post ID and nonce from the page then call the AJAX endpoint.
  if (results.length === 0) {
    const nonceMatch = html.match(/["']nonce["']\s*:\s*["']([a-f0-9]+)["']/i);
    const ajaxUrlMatch = html.match(/["']url["']\s*:\s*["'](https?:\/\/[^"']+admin-ajax\.php)["']/i);
    const postIdMatch = html.match(/["'](?:post_id|postId|trid)["']\s*:\s*["']?(\d+)["']?/i);
    if (nonceMatch && ajaxUrlMatch && postIdMatch) {
      // Return a marker — the caller will do the async AJAX call
      results.push({
        source: 'animesalt',
        url: `${ajaxUrlMatch[1]}|nonce=${nonceMatch[1]}|postId=${postIdMatch[1]}`,
        quality: normalizeQuality('HD'),
        headers,
        subtitles: [],
        sourceType: 'custom',
      });
    }
  }

  return results;
}

const provider: StreamProvider = {
  name: 'animesalt',
  sites: BASES,

  async single(opts: SourceOptions): Promise<SourceResult[]> {
    try {
      const targetEp = opts.episode ?? 1;

      // Strategy 1: Direct episode URL using slugified title — probe primary domain first
      for (const title of buildSearchQueries(opts.titles).slice(0, 2)) {
        const slug = title.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').replace(/-+/g, '-');
        if (!slug) continue;
        for (const season of [1, 2]) {
          const epUrl = `${BASES[0]}/episode/${slug}-${season}x${targetEp}/`;
          const page = await fetchHtml(epUrl);
          if (!page) continue;
          const sources = await resolvePageSources(page.html, epUrl, page.base);
          if (sources.length > 0) return sources;
        }
      }

      // Strategy 2: Search → find slug → construct episode URL
      const hit = await searchAnime(opts.titles);
      if (!hit) return [];

      const base = hit.base ?? BASES[0];
      const epUrl = await findEpisodeUrl(hit, targetEp, base);
      if (!epUrl) return [];

      const page = await fetchHtml(epUrl);
      if (!page) return [];

      return resolvePageSources(page.html, epUrl, page.base ?? base);
    } catch {
      return [];
    }
  },
};

export default provider;
