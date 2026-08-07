import { normalizeQuality, detectSourceType } from '../../utils/quality.js';
import type { StreamProvider, SourceOptions, SourceResult } from '../../types.js';

declare const __tatakai_fetch__: (url: string, init?: RequestInit) => Promise<Response>;

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
  try {
    console.log('[Senshi.search] Fetching:', `${BASE_URL}/anime/filter`);
    const res = await __tatakai_fetch__(`${BASE_URL}/anime/filter`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ searchTerm: query, page: 1, limit: 5 }),
    });
    console.log('[Senshi.search] Response status:', res.status, res.ok);
    if (!res.ok) return [];
    const json = await res.json() as { data?: SenshiAnime[] } | SenshiAnime[];
    const data = Array.isArray(json) ? json : ((json as { data?: SenshiAnime[] }).data ?? []);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.error('[Senshi.search] Error:', err);
    return [];
  }
}

async function findEpisodes(animeId: string): Promise<SenshiEpisode[]> {
  try {
    const res = await __tatakai_fetch__(`${BASE_URL}/episodes/${animeId}`);
    if (!res.ok) return [];
    const data = await res.json() as SenshiEpisode[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function findEpisodeServer(malId: string, epId: number): Promise<SenshiSource[]> {
  try {
    const res = await __tatakai_fetch__(`${BASE_URL}/episode-embeds/${malId}/${epId}`);
    if (!res.ok) return [];
    const data = await res.json() as SenshiSource[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

const provider: StreamProvider = {
  name: 'senshi',
  async single(opts: SourceOptions): Promise<SourceResult[]> {
    console.log('[Senshi] Starting search for:', opts.titles[0]);
    try {
      const title = opts.titles[0] ?? '';
      console.log('[Senshi] Calling search with:', title);
      const animes = await search(title);
      console.log('[Senshi] Search returned:', animes.length, 'results');
      if (animes.length === 0) return [];

      const anime = animes[0];
      console.log('[Senshi] Getting episodes for anime:', anime.id);
      const episodes = await findEpisodes(anime.id);
      console.log('[Senshi] Got', episodes.length, 'episodes');
      if (episodes.length === 0) return [];

      const targetEp = opts.episode ?? 1;
      const episode = episodes.find(ep => ep.ep_id === targetEp) ?? episodes[0];
      console.log('[Senshi] Finding sources for episode:', episode.ep_id);

      const sources = await findEpisodeServer(episode.mal_id, episode.ep_id);
      console.log('[Senshi] Got', sources.length, 'sources');
      if (sources.length === 0) return [];

      // Prefer HardSub, fallback to all
      const filtered = sources.filter(s => s.status === 'HardSub');
      const pool = filtered.length > 0 ? filtered : sources;

      return pool
        .filter(s => !!s.url)
        .map(s => ({
          source: 'senshi',
          url: s.url,
          quality: normalizeQuality(''),
          headers: { Referer: `${BASE_URL}/` },
          subtitles: [],
          sourceType: detectSourceType(s.url),
        }));
    } catch (err) {
      console.error('[Senshi] Error:', err);
      return [];
    }
  },
};

export default provider;
