/**
 * AnimeSalt — scraper adapter (https://animesalt.link)
 *
 * WordPress-style site with series at `/series/{slug}/`, movies at
 * `/movies/{slug}/`, and episodes at `/episode/{slug}-{season}x{episode}/`.
 * Search is `/?s=<query>`. The watch page embeds the HLS/MP4 URL inside a
 * `<video>` / `<iframe>` or an inline script.
 */
import { normalizeQuality, detectSourceType } from '../../utils/quality.js';
import { buildSearchQueries, scoreMatch } from '../../utils/titleNorm.js';
import type { StreamProvider, SourceOptions, SourceResult } from '../../types.js';

import { fetchResponse, loadHtml } from '../../utils/http.js';

const BASES = ['https://animesalt.link', 'https://animesalt.com'];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36';

async function fetchHtml(url: string): Promise<{ html: string; base: string } | null> {
  for (const base of BASES) {
    try {
      const candidate = url.startsWith('http') ? url : `${base}${url}`;
      const res = await fetchResponse(candidate, {
        headers: { 'User-Agent': UA, Accept: 'text/html', Referer: `${base}/` },
      });
      if (!res.ok) continue;
      const html = await res.text();
      if (html.length < 200) continue;
      return { html, base };
    } catch { /* try next mirror */ }
  }
  return null;
}

interface SearchHit {
  slug: string;
  kind: 'series' | 'movies';
  title: string;
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
      hits.push({ ...parsed, title });
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

  return results;
}

const provider: StreamProvider = {
  name: 'animesalt',

  async single(opts: SourceOptions): Promise<SourceResult[]> {
    try {
      const targetEp = opts.episode ?? 1;
      const hit = await searchAnime(opts.titles);
      if (!hit) return [];

      // searchAnime already selected a working base implicitly; re-resolve base.
      const base = BASES[0];
      const epUrl = await findEpisodeUrl(hit, targetEp, base);
      if (!epUrl) return [];

      const page = await fetchHtml(epUrl);
      if (!page) return [];

      return extractStreams(page.html, epUrl);
    } catch {
      return [];
    }
  },
};

export default provider;
