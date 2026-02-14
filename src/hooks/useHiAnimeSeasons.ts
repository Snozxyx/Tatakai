import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api';

export interface HiAnimeSeason {
  id: string;
  name: string;
  title: string;
  poster: string;
  isCurrent: boolean;
}

export interface HiAnimeInfo {
  id: string;
  anilistId: number | null;
  malId: number | null;
  name: string;
  poster: string;
  description: string;
  stats: {
    rating: string;
    quality: string;
    episodes: {
      sub: number;
      dub: number;
    };
    type: string;
    duration: string;
  };
}

export interface HiAnimeData {
  anime: {
    info: HiAnimeInfo;
    moreInfo: {
      japanese: string;
      synonyms: string;
      aired: string;
      premiered: string;
      duration: string;
      status: string;
      malscore: string;
      genres: string[];
      studios: string;
      producers: string[];
    };
  };
  seasons: HiAnimeSeason[];
}

// Use the existing apiGet which already handles CORS proxying
async function fetchHiAnimeData(animeId: string): Promise<HiAnimeData | null> {
  try {
    console.log('[HiAnime] Fetching anime data for:', animeId);
    
    // apiGet already handles the proxy logic - just pass the path
    const data = await apiGet<any>(`/anime/${animeId}`);
    
    console.log('[HiAnime] API Response:', { 
      hasData: !!data,
      malId: data?.anime?.info?.malId,
      anilistId: data?.anime?.info?.anilistId,
      seasonsCount: data?.seasons?.length || 0
    });
    
    return data as HiAnimeData;
  } catch (error) {
    console.error('[HiAnime] Error fetching anime data:', error);
    return null;
  }
}

export function useHiAnimeSeasons(animeId: string | undefined) {
  return useQuery({
    queryKey: ['hianime-seasons', animeId],
    queryFn: () => fetchHiAnimeData(animeId!),
    enabled: !!animeId,
    staleTime: 1000 * 60 * 60, // 1 hour
    gcTime: 1000 * 60 * 60 * 24, // 24 hours cache
    retry: 2,
    select: (data) => data?.seasons || [],
  });
}

export function useHiAnimeInfo(animeId: string | undefined) {
  return useQuery({
    queryKey: ['hianime-info', animeId],
    queryFn: () => fetchHiAnimeData(animeId!),
    enabled: !!animeId,
    staleTime: 1000 * 60 * 60, // 1 hour
    gcTime: 1000 * 60 * 60 * 24, // 24 hours cache
    retry: 2,
  });
}

// Helper function to get MAL/AniList IDs from HiAnime
export async function getExternalIds(animeId: string): Promise<{ anilistId: number | null; malId: number | null }> {
  try {
    const data = await fetchHiAnimeData(animeId);
    if (data?.anime?.info) {
      return {
        anilistId: data.anime.info.anilistId,
        malId: data.anime.info.malId,
      };
    }
    return { anilistId: null, malId: null };
  } catch {
    return { anilistId: null, malId: null };
  }
}
