import { normalizeQuality, detectSourceType } from '../../utils/quality.js';
import type { StreamProvider, SourceOptions, SourceResult } from '../../types.js';

declare const __tatakai_fetch__: (url: string, init?: RequestInit) => Promise<Response>;

const BASE_URL = 'https://aniworld.to';

interface AniWorldSearchItem {
  link: string;
  title: string;
}

async function search(query: string): Promise<AniWorldSearchItem[]> {
  try {
    const cleanQuery = query.replace(/season\s+\d+/i, '').replace(/\bmovie\b/i, '').trim();
    const res = await __tatakai_fetch__(`${BASE_URL}/ajax/search`, {
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

interface AniWorldEpisode {
  id: string;
  number: number;
  url: string;
}

async function findEpisodes(slug: string): Promise<AniWorldEpisode[]> {
  try {
    const res = await __tatakai_fetch__(`${BASE_URL}/anime/stream/${slug}`);
    if (!res.ok) return [];
    const html = await res.text();

    const episodes: AniWorldEpisode[] = [];
    const epRegex = /<tr[^>]*data-episode-id="(\d+)"[^>]*>.*?<meta itemprop="episodeNumber" content="(\d+)".*?<a itemprop="url" href="([^"]+)">/gs;
    let match: RegExpExecArray | null;
    while ((match = epRegex.exec(html)) !== null) {
      episodes.push({
        id: match[1],
        number: parseInt(match[2]),
        url: `${BASE_URL}${match[3]}`,
      });
    }
    return episodes;
  } catch {
    return [];
  }
}

async function getRedirectUrl(episodeUrl: string): Promise<string | null> {
  try {
    const res = await __tatakai_fetch__(episodeUrl);
    if (!res.ok) return null;
    const html = await res.text();

    // Priority: lang-key 3 (dub), 1 (sub), 2 — looking for VidMoly icon
    const langPriority = ['3', '1', '2'];
    const liBlocks = html.split(/<li/g);

    for (const key of langPriority) {
      for (const block of liBlocks) {
        if (block.includes(`data-lang-key="${key}"`) && block.toLowerCase().includes('icon vidmoly')) {
          const urlMatch = block.match(/data-link-target="([^"]+)"/);
          if (urlMatch) return `${BASE_URL}${urlMatch[1]}`;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function extractM3u8(hosterUrl: string): Promise<string | null> {
  try {
    const res = await __tatakai_fetch__(hosterUrl);
    if (!res.ok) return null;
    const html = await res.text();

    // Try explicit file: '...' pattern first (VidMoly pattern)
    const fileMatch = html.match(/file\s*:\s*["'](https?:\/\/[^"']+\/master\.m3u8[^"']*)["']/);
    if (fileMatch) return fileMatch[1];

    // Fallback: any m3u8 URL
    const m3u8Match = html.match(/["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/);
    return m3u8Match ? m3u8Match[1] : null;
  } catch {
    return null;
  }
}

const provider: StreamProvider = {
  name: 'aniworld',
  async single(opts: SourceOptions): Promise<SourceResult[]> {
    try {
      const title = opts.titles[0] ?? '';
      const targetEp = opts.episode ?? 1;

      // 1. Search
      const searchResults = await search(title);
      if (searchResults.length === 0) return [];
      const slug = searchResults[0].link.replace('/anime/stream/', '');

      // 2. Get episode list
      const episodes = await findEpisodes(slug);
      if (episodes.length === 0) return [];
      const episode = episodes.find(e => e.number === targetEp) ?? episodes[0];

      // 3. Get server redirect URL from episode page
      const redirectUrl = await getRedirectUrl(episode.url);
      if (!redirectUrl) return [];

      // 4. Extract m3u8 from hoster page
      const m3u8Url = await extractM3u8(redirectUrl);
      if (!m3u8Url) return [];

      return [{
        source: 'aniworld',
        url: m3u8Url,
        quality: normalizeQuality(''),
        headers: { Referer: `${BASE_URL}/` },
        subtitles: [],
        sourceType: 'hls' as const,
      }];
    } catch {
      return [];
    }
  },
};

export default provider;
