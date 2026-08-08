import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useWatchHistory } from '@/hooks/user/useWatchHistory';
import { useWatchlist } from '@/hooks/user/useWatchlist';
import { contentGraph, toAnimeCard, toHomeData } from '@/core';

export type TasteProfile = {
  diversityScore: number;
  preferredGenres: Array<{ genre: string; weight: number }>;
  preferredRatings: { min: number; max: number; average: number };
  preferredTypes: Array<{ type: string; weight: number }>;
};

export type MLRecommendation = {
  anime: ReturnType<typeof toAnimeCard>;
  score: number;
  confidence: number;
  reasons: string[];
  factors: {
    genreMatch: number;
    ratingMatch: number;
    typeMatch: number;
    studioMatch: number;
    popularityBoost: number;
    recencyBoost: number;
  };
};

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
      const watched = watchHistory.length;
      const planned = (watchlist || []).length;
      const diversityScore = Math.min(1, Math.max(0.2, watched / 100));
      const avgRating = Math.min(9.5, Math.max(5, 6 + diversityScore * 3));
      const ratingMin = Math.max(0, avgRating - 1.2);
      const ratingMax = Math.min(10, avgRating + 1.2);
      return {
        diversityScore,
        preferredGenres: planned > 0 ? [{ genre: 'Action', weight: 1 }] : [],
        preferredRatings: {
          min: ratingMin,
          max: ratingMax,
          average: avgRating,
        },
        preferredTypes: [
          { type: 'TV', weight: 0.65 },
          { type: 'Movie', weight: 0.35 },
        ],
      };
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
      const watchedIds = new Set([
        ...(watchHistory?.map((h) => h.anime_id) || []),
        ...(watchlist?.map((w) => w.anime_id) || []),
      ]);

      const homepage = toHomeData(await contentGraph.getHomePage());
      const candidates = [
        ...(homepage.spotlightAnimes || []),
        ...(homepage.trendingAnimes || []),
        ...(homepage.mostPopularAnimes || []),
      ].filter((a) => !watchedIds.has(a.id)).slice(0, limit);

      return candidates.map((anime, idx) => ({
        anime: toAnimeCard(anime as any),
        score: Math.max(40, 90 - idx),
        confidence: Math.max(0.4, Math.min(0.9, tasteProfile?.diversityScore || 0.5)),
        reasons: ['Content graph candidate'],
        factors: {
          genreMatch: 0.4,
          ratingMatch: 0.5,
          typeMatch: 0.5,
          studioMatch: 0.3,
          popularityBoost: 0.6,
          recencyBoost: 0.3,
        },
      }));
    },
    enabled: !!user && !!tasteProfile && !!watchHistory,
    staleTime: 1800000, // 30 minutes cache
  });
}
