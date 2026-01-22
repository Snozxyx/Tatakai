/**
 * ML-based recommendations hook
 */

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useWatchHistory } from './useWatchHistory';
import { useWatchlist } from './useWatchlist';
import { fetchHome, searchAnime } from '@/lib/api';
import {
  analyzeTaste,
  generateMLRecommendations,
  TasteProfile,
  MLRecommendation,
} from '@/lib/mlRecommendations';

/**
 * Analyze user's taste profile
 */
export function useTasteProfile() {
  const { user } = useAuth();
  const { data: watchHistory } = useWatchHistory(100);
  const { data: watchlist } = useWatchlist();

  return useQuery({
    queryKey: ['taste_profile', user?.id, watchHistory?.length, watchlist?.length],
    queryFn: async (): Promise<TasteProfile | null> => {
      if (!user || !watchHistory || watchHistory.length === 0) {
        return null;
      }

      return analyzeTaste(watchHistory, watchlist || []);
    },
    enabled: !!user && !!watchHistory && watchHistory.length > 0,
    staleTime: 3600000, // 1 hour cache
  });
}

/**
 * Get ML-based recommendations
 */
export function useMLRecommendations(limit = 20) {
  const { user } = useAuth();
  const { data: watchHistory } = useWatchHistory(100);
  const { data: watchlist } = useWatchlist();
  const { data: tasteProfile } = useTasteProfile();

  return useQuery({
    queryKey: ['ml_recommendations', user?.id, tasteProfile?.diversityScore, limit],
    queryFn: async (): Promise<MLRecommendation[]> => {
      if (!user || !tasteProfile || !watchHistory) {
        // Fallback to trending
        const homepage = await fetchHome();
        return (homepage?.spotlightAnimes || []).slice(0, limit).map((anime) => ({
          anime: {
            id: anime.id,
            name: anime.name,
            poster: anime.poster,
            type: 'TV',
            episodes: { sub: 0, dub: 0 },
            rating: undefined,
          },
          score: 50,
          confidence: 0.5,
          reasons: ['Popular anime'],
          factors: {
            genreMatch: 0,
            ratingMatch: 0,
            typeMatch: 0,
            studioMatch: 0,
            popularityBoost: 0.5,
            recencyBoost: 0,
          },
        }));
      }

      // Get candidate anime from top genres
      const topGenres = tasteProfile.preferredGenres.slice(0, 3).map((g) => g.genre);
      const watchedIds = new Set([
        ...(watchHistory.map((h) => h.anime_id)),
        ...(watchlist?.map((w) => w.anime_id) || []),
      ]);

      const candidateAnime: any[] = [];

      // Search by top genres
      for (const genre of topGenres) {
        try {
          const results = await searchAnime(genre);
          if (results?.animes) {
            candidateAnime.push(...results.animes.slice(0, 30));
          }
        } catch {
          // Skip on error
        }
      }

      // Also get trending anime as candidates
      try {
        const homepage = await fetchHome();
        if (homepage?.spotlightAnimes) {
          candidateAnime.push(...homepage.spotlightAnimes.slice(0, 20));
        }
      } catch {
        // Skip on error
      }

      // Remove duplicates
      const uniqueAnime = Array.from(
        new Map(candidateAnime.map((a) => [a.id, a])).values()
      );

      // Generate ML recommendations
      return generateMLRecommendations(
        tasteProfile,
        uniqueAnime,
        watchedIds,
        limit
      );
    },
    enabled: !!user && !!tasteProfile && !!watchHistory,
    staleTime: 1800000, // 30 minutes cache
  });
}
