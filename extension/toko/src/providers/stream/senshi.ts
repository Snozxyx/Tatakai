import { normalizeQuality, detectSourceType } from '../../utils/scraping/quality.js';
import type { StreamProvider, SourceOptions, SourceResult } from '../../types/index.js';

import { fetchResponse } from '../../utils/http/fetch.js';

const BASE_URL = 'https://senshi.live';

interface SenshiAnime {
  id: string;
  public_id: string;
  title?: string;
  title_english?: string;
}

interface SenshiEpisode {
  mal_id: string;
  ep_id: number;
  ep_title?: string;
}

interface SenshiSource {
  url: string;
  status: string; // "HardSub" | "Dub"
}

async function search(query: string): Promise<SenshiAnime[]> {
  if (!query) return [];
  try {
    const res = await fetchResponse(`${BASE_URL}/anime/filter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ searchTerm: query, page: 1, limit: 5 }),
    });
    if (!res.ok) return [];
    const json = await res.json() as { data?: SenshiAnime[] } | SenshiAnime[];
    const data = Array.isArray(json) ? json : ((json as { data?: SenshiAnime[] }).data ?? []);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function findEpisodes(animeId: string): Promise<SenshiEpisode[]> {
  try {
    const res = await fetchResponse(`${BASE_URL}/episodes/${animeId}`);
    if (!res.ok) return [];
    const data = await res.json() as SenshiEpisode[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function findEpisodeServer(malId: string, epId: number): Promise<SenshiSource[]> {
  try {
    const res = await fetchResponse(`${BASE_URL}/episode-embeds/${malId}/${epId}`);
    if (!res.ok) return [];
    const data = await res.json() as SenshiSource[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/** Map Senshi status to language info */
function resolveLanguage(status: string): { audioLanguage: string; language: string } {
  const s = String(status).toLowerCase();
  if (s === 'dub' || s.includes('dub')) return { audioLanguage: 'en', language: 'English Dub' };
  // HardSub / SoftSub / default → Japanese sub
  return { audioLanguage: 'ja', language: 'Japanese' };
}

const provider: StreamProvider = {
  name: 'senshi',
  sites: [BASE_URL],
  async single(opts: SourceOptions): Promise<SourceResult[]> {
    const title = opts.titles[0] ?? '';
    // Guard: skip if title is empty — avoids useless search + 502 spam
    if (!title) return [];

    try {
      const animes = await search(title);
      if (animes.length === 0) return [];

      const anime = animes[0];
      const episodes = await findEpisodes(anime.id);
      if (episodes.length === 0) return [];

      const targetEp = opts.episode ?? 1;
      const episode = episodes.find(ep => ep.ep_id === targetEp) ?? episodes[0];

      const sources = await findEpisodeServer(episode.mal_id, episode.ep_id);
      if (sources.length === 0) return [];

      return sources
        .filter(s => !!s.url)
        .map(s => {
          const { audioLanguage, language } = resolveLanguage(s.status);
          return {
            source: `senshi-${s.status.toLowerCase()}`,
            url: s.url,
            quality: normalizeQuality(''),
            headers: { Referer: `${BASE_URL}/` },
            subtitles: [],
            audioLanguage,
            language,
            sourceType: detectSourceType(s.url),
          };
        });
    } catch {
      return [];
    }
  },
};

export default provider;
