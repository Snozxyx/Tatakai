import { apiGet } from "@/lib/api/api-client";
import { HomeData, SearchResult, AnimeCard } from "@/types/anime";

// Home Service
export async function fetchHome(): Promise<HomeData> {
  return apiGet<HomeData>("/home");
}

// Search Service
export async function searchAnime(
  query: string,
  page: number = 1
): Promise<SearchResult> {
  return apiGet(`/search?q=${encodeURIComponent(query)}&page=${page}`);
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
