import { useQuery } from "@tanstack/react-query";

const TATAKAI_API_URL = import.meta.env.VITE_TATAKAI_API_URL || "https://api.tatakai.me/api/v1";

async function fetchAnimelok<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${TATAKAI_API_URL}/animelok${endpoint}`, {
    headers: {
      "Accept": "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Animelok API error: ${response.status}`);
  }

  const json = await response.json();
  return json.data;
}

export interface AnimelokSeason {
  id: string;
  anilistId?: number;
  title: string;
  poster?: string;
  url?: string;
}

export function useAnimelokSeasons(animeId: string | undefined) {
  return useQuery<{ id: string; seasons: AnimelokSeason[] }>({
    queryKey: ["animelok", "seasons", animeId],
    queryFn: () => fetchAnimelok<{ id: string; seasons: AnimelokSeason[] }>(`/anime/${animeId}/seasons`),
    enabled: !!animeId,
    staleTime: 60 * 60 * 1000, // 1 hour
  });
}
