import { useQuery } from "@tanstack/react-query";

export interface JikanAnime {
  mal_id: number;
  title: string;
  title_english: string | null;
  title_japanese: string | null;
  images: {
    jpg: {
      image_url: string;
      small_image_url: string;
      large_image_url: string;
    };
    webp?: {
      image_url: string;
      small_image_url: string;
      large_image_url: string;
    };
  };
  type: string | null;
  source: string | null;
  episodes: number | null;
  status: string;
  aired: {
    from: string | null;
    to: string | null;
    string: string;
  };
  duration: string | null;
  rating: string | null;
  score: number | null;
  scored_by: number | null;
  rank: number | null;
  popularity: number | null;
  members: number | null;
  favorites: number | null;
  synopsis: string | null;
  season: string | null;
  year: number | null;
  studios: Array<{ mal_id: number; name: string }>;
  genres: Array<{ mal_id: number; name: string }>;
}

interface JikanResponse {
  data: JikanAnime[];
  pagination: {
    last_visible_page: number;
    has_next_page: boolean;
    current_page: number;
    items: {
      count: number;
      total: number;
      per_page: number;
    };
  };
}

async function fetchUpcomingAnime(page: number = 1): Promise<JikanResponse> {
  const response = await fetch(
    `https://api.jikan.moe/v4/seasons/upcoming?page=${page}&limit=12`,
    {
      headers: {
        'Accept': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch upcoming anime: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export function useUpcomingAnime(page: number = 1) {
  return useQuery({
    queryKey: ["upcoming_anime", page],
    queryFn: () => fetchUpcomingAnime(page),
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: 2,
  });
}
