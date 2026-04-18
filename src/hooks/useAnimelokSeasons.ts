import { useQuery } from "@tanstack/react-query";
import { TATAKAI_API_URL, unwrapApiData } from "@/lib/api/api-client";

async function fetchAnimelok<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${TATAKAI_API_URL}/animelok${endpoint}`, {
    headers: {
      "Accept": "application/json",
    },
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) {
    throw new Error(`Animelok API error: ${response.status}`);
  }

  const json = await response.json();
  return unwrapApiData<T>(json as any);
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
