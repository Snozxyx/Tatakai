import { apiGet } from "@/lib/api/api-client";
import { HomeData, SearchResult, AnimeCard } from "@/types/anime";

export type AnimeSearchFilters = Record<string, string | number | boolean | undefined | null>;

// Home Service
export async function fetchHome(): Promise<HomeData> {
  return apiGet<HomeData>("/home");
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
