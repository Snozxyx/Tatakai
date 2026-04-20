import { apiGet } from "@/lib/api/api-client";
import { HomeData, SearchResult, AnimeCard, ProducerAnimeResult } from "@/types/anime";

export interface AnimeSearchFilters {
  type?: string;
  status?: string;
  rated?: string;
  score?: string;
  season?: string;
  language?: string;
  start_date?: string;
  end_date?: string;
  sort?: string;
  genres?: string;
  [key: string]: string | number | boolean | undefined | null;
}

// Home Service
export async function fetchHome(): Promise<HomeData> {
  return apiGet<HomeData>("/home", {
    retries: 1,
    timeoutMs: 10000,
    retryDelayBaseMs: 250,
  });
}

// Search Service
export async function searchAnime(
  query: string,
  page: number = 1,
  filters: AnimeSearchFilters = {}
): Promise<SearchResult> {
  const params = new URLSearchParams({
    q: query,
    page: String(page),
  });

  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "" || value === false) return;
    params.set(key, String(value));
  });

  return apiGet(`/search?${params.toString()}`);
}

export async function fetchGenreAnimes(
  genre: string,
  page: number = 1
): Promise<{
  genreName: string;
  animes: AnimeCard[];
  currentPage: number;
  totalPages: number;
  hasNextPage: boolean;
}> {
  return apiGet(`/genre/${genre}?page=${page}`);
}

export async function fetchProducerAnimes(
  producerName: string,
  page: number = 1
): Promise<ProducerAnimeResult> {
  const trimmed = producerName.trim();
  if (!trimmed) {
    throw new Error("Producer name is required");
  }

  return apiGet(`/producer/${encodeURIComponent(trimmed)}?page=${page}`);
}
