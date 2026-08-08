import { externalApiGet } from "@/lib/api/api-client";
import { AnimeCard } from "@/types/anime";

const JIKAN_API_URL = "https://api.jikan.moe/v4";

export interface JikanAnime {
  mal_id: number;
  url: string;
  images: {
    jpg: { image_url: string; small_image_url: string; large_image_url: string };
    webp: { image_url: string; small_image_url: string; large_image_url: string };
  };
  airing?: boolean | null;
  title: string;
  title_english: string | null;
  title_japanese: string | null;
  type: string | null;
  episodes: number | null;
  status: string;
  score: number | null;
  scored_by: number | null;
  rank: number | null;
  popularity: number | null;
  members: number;
  favorites: number;
  synopsis: string | null;
  rating: string | null;
  season: string | null;
  year: number | null;
  broadcast?: {
    day?: string | null;
    time?: string | null;
    timezone?: string | null;
    string?: string | null;
  };
}

export interface JikanEpisode {
  mal_id: number;
  title?: string | null;
  title_japanese?: string | null;
  title_romanji?: string | null;
  aired?: string | null;
  filler?: boolean | null;
  recap?: boolean | null;
  forum_url?: string | null;
}

export interface JikanEpisodeResponse {
  data: JikanEpisode[];
  pagination: {
    last_visible_page: number;
    has_next_page: boolean;
    current_page: number;
    items?: { count: number; total: number; per_page: number };
  };
}

export interface JikanSeasonResponse {
  data: JikanAnime[];
  pagination: {
    last_visible_page: number;
    has_next_page: boolean;
    current_page: number;
    items: { count: number; total: number; per_page: number };
  };
}

export interface JikanCharacter {
  mal_id: number;
  url: string;
  images: {
    jpg: { image_url: string; small_image_url?: string };
    webp: { image_url: string; small_image_url?: string };
  };
  name: string;
  name_kanji: string | null;
  nicknames: string[];
  favorites: number;
  about: string | null;
}

export interface JikanCharacterFullResponse {
  data: JikanCharacter & {
    anime?: Array<{
      role: string;
      anime: { mal_id: number; title: string; images: { jpg: { image_url: string } } };
    }>;
    voices?: Array<{
      language: string;
      person: { mal_id: number; name: string; images: { jpg: { image_url: string } } };
    }>;
  };
}

export function jikanToAnimeCard(jikanAnime: JikanAnime): AnimeCard {
  return {
    id: `mal:${jikanAnime.mal_id}`,
    name: jikanAnime.title_english || jikanAnime.title,
    jname: jikanAnime.title_japanese || undefined,
    poster: jikanAnime.images.jpg.large_image_url || jikanAnime.images.jpg.image_url,
    type: jikanAnime.type || 'TV',
    rating: jikanAnime.rating || undefined,
    episodes: {
      sub: jikanAnime.episodes || 0,
      dub: 0,
    },
  };
}

export async function fetchJikanSeasonNow(page = 1): Promise<JikanSeasonResponse> {
  return externalApiGet<JikanSeasonResponse>(JIKAN_API_URL, `/seasons/now?page=${page}&limit=24`);
}

export async function fetchJikanSeason(year: number, season: 'winter' | 'spring' | 'summer' | 'fall', page = 1): Promise<JikanSeasonResponse> {
  return externalApiGet<JikanSeasonResponse>(JIKAN_API_URL, `/seasons/${year}/${season}?page=${page}&limit=24`);
}

export async function fetchJikanSeasonUpcoming(page = 1): Promise<JikanSeasonResponse> {
  return externalApiGet<JikanSeasonResponse>(JIKAN_API_URL, `/seasons/upcoming?page=${page}&limit=24`);
}

export async function fetchJikanAnime(malId: number): Promise<{ data: JikanAnime }> {
  return externalApiGet<{ data: JikanAnime }>(JIKAN_API_URL, `/anime/${malId}`);
}

export async function fetchJikanEpisodes(malId: number, page = 1): Promise<JikanEpisodeResponse> {
  return externalApiGet<JikanEpisodeResponse>(JIKAN_API_URL, `/anime/${malId}/episodes?page=${page}`);
}

export async function fetchJikanCharacter(malCharId: number): Promise<JikanCharacterFullResponse> {
  return externalApiGet<JikanCharacterFullResponse>(JIKAN_API_URL, `/characters/${malCharId}/full`);
}

export async function searchJikanCharacters(query: string, page = 1): Promise<{ data: JikanCharacter[]; pagination: { has_next_page: boolean } }> {
  return externalApiGet<{ data: JikanCharacter[]; pagination: { has_next_page: boolean } }>(JIKAN_API_URL, `/characters?q=${encodeURIComponent(query)}&page=${page}&limit=10`);
}

export async function searchJikanAnime(query: string, page = 1): Promise<{ data: JikanAnime[]; pagination: { has_next_page: boolean } }> {
  return externalApiGet<{ data: JikanAnime[]; pagination: { has_next_page: boolean } }>(JIKAN_API_URL, `/anime?q=${encodeURIComponent(query)}&page=${page}&limit=10`);
}
