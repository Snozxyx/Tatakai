/**
 * ToonStream — native scraper adapter
 * Site: https://toonstream.co
 */
import { normalizeQuality } from '../../utils/quality.js';
import { buildSearchQueries } from '../../utils/titleNorm.js';
import type { StreamProvider, SourceOptions, SourceResult } from '../../types.js';

import { fetchResponse, loadHtml } from '../../utils/http.js';

const BASE = 'https://toon-stream.site';

async function search(titles: string[]): Promise<{ slug: string } | null> {
  for (const title of buildSearchQueries(titles)) {
    try {
      const res = await fetchResponse(
        `${BASE}/?s=${encodeURIComponent(title)}`,
        { headers: { Referer: `${BASE}/` } },
      );
      if (!res.ok) continue;
      const html = await res.text();
      const $ = loadHtml(html);
      let slug: string | null = null;
      $.find('a[href*="/anime/"], a[href*="/series/"]').each((_: number, el: any) => {
        if (slug) return;
        const href: string = el.attr?.('href') ?? '';
        const m = href.match(/\/(anime|series)\/([^/?#]+)/);
        if (m) slug = `${m[1]}/${m[2]}`;
      });
      if (slug) return { slug };
    } catch { continue; }
  }
  return null;
}

async function getEpisodeUrl(slug: string, epNumber: number): Promise<string | null> {
  try {
    const res = await fetchResponse(`${BASE}/${slug}/`, { headers: { Referer: `${BASE}/` } });
    if (!res.ok) return null;
    const html = await res.text();
    const $ = loadHtml(html);
    let epUrl: string | null = null;
    $.find(`a[href*="episode-${epNumber}"], a[href*="ep-${epNumber}"]`).each((_: number, el: any) => {
      if (epUrl) return;
      const href: string = el.attr?.('href') ?? '';
      if (href) epUrl = href.startsWith('http') ? href : `${BASE}${href}`;
    });
    return epUrl;
  } catch { return null; }
}

async function extractSources(pageUrl: string): Promise<SourceResult[]> {
  try {
    const res = await fetchResponse(pageUrl, { headers: { Referer: `${BASE}/` } });
    if (!res.ok) return [];
    const html = await res.text();
    const sources: SourceResult[] = [];
    const m3u8 = html.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/);
    if (m3u8) sources.push({ source: 'toonstream', url: m3u8[1], quality: normalizeQuality(''), headers: { Referer: `${BASE}/` }, subtitles: [], sourceType: 'hls' as const });
    const mp4 = html.match(/["'](https?:\/\/[^"']+\.mp4[^"']*)["']/);
    if (mp4 && !sources.length) sources.push({ source: 'toonstream', url: mp4[1], quality: normalizeQuality(''), headers: { Referer: `${BASE}/` }, subtitles: [], sourceType: 'mp4' as const });
    return sources;
  } catch { return []; }
}

const provider: StreamProvider = {
  name: 'toonstream',
  async single(opts: SourceOptions): Promise<SourceResult[]> {
    try {
      const anime = await search(opts.titles);
      if (!anime) return [];
      const epUrl = await getEpisodeUrl(anime.slug, opts.episode ?? 1);
      if (!epUrl) return [];
      return extractSources(epUrl);
    } catch { return []; }
  },
};
export default provider;
