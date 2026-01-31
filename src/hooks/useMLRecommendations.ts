/**
 * ML-based recommendations hook
 */

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useWatchHistory } from './useWatchHistory';
import { useWatchlist } from './useWatchlist';
import { fetchHome, searchAnime, fetchAnimeInfo } from '@/lib/api';
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

      // Check Supabase Cache first
      const queryParams = {
        userId: user.id,
        genreWeight: tasteProfile.diversityScore,
        limit
      };

      const { data: cached } = await supabase
        .from('ai_recommendation_cache')
        .select('result, expires_at')
        .eq('query_params', JSON.stringify(queryParams))
        .single();

      if (cached && new Date(cached.expires_at) > new Date()) {
        return cached.result as MLRecommendation[];
      }

      // Get candidate anime from various sources
      const topGenres = tasteProfile.preferredGenres.slice(0, 4).map((g) => g.genre);
      const watchedIds = new Set([
        ...(watchHistory.map((h) => h.anime_id)),
        ...(watchlist?.map((w) => w.anime_id) || []),
      ]);

      const candidateAnime: any[] = [];

      // 1. Search by top genres
      const searchPromises = topGenres.map(genre => searchAnime(genre).catch(() => null));
      const searchResults = await Promise.all(searchPromises);
      searchResults.forEach(res => {
        if (res?.animes) candidateAnime.push(...res.animes.slice(0, 25));
      });

      // 2. Get trending and popular anime
      try {
        const homepage = await fetchHome();
        if (homepage) {
          if (homepage.spotlightAnimes) candidateAnime.push(...homepage.spotlightAnimes);
          if (homepage.trendingAnimes) candidateAnime.push(...homepage.trendingAnimes);
          if (homepage.mostPopularAnimes) candidateAnime.push(...homepage.mostPopularAnimes);
        }
      } catch (e) {
        console.warn('[ML] Failed to fetch homepage candidates:', e);
      }

      // 3. Get related anime from top watch history
      const topHistory = watchHistory.slice(0, 5);
      const relatedPromises = topHistory.map(h => fetchAnimeInfo(h.anime_id).catch(() => null));
      const relatedResults = await Promise.all(relatedPromises);
      relatedResults.forEach(res => {
        if (res?.recommendedAnimes) candidateAnime.push(...res.recommendedAnimes);
        if (res?.relatedAnimes) candidateAnime.push(...res.relatedAnimes);
      });

      // Remove duplicates and ensure objects are valid AnimeCard
      const uniqueMap = new Map();
      candidateAnime.filter(Boolean).forEach(a => {
        if (!uniqueMap.has(a.id)) {
          uniqueMap.set(a.id, {
            id: a.id,
            name: a.name || a.title || 'Unknown',
            poster: a.poster || a.image || '',
            type: a.type || 'TV',
            episodes: a.episodes || { sub: 0, dub: 0 },
            rating: a.rating || undefined
          });
        }
      });

      const uniqueAnimeList = Array.from(uniqueMap.values());

      // Generate ML recommendations
      const resultData = await generateMLRecommendations(
        tasteProfile,
        uniqueAnimeList,
        watchedIds,
        limit
      );

      // Store in Supabase Cache
      try {
        await supabase.from('ai_recommendation_cache').upsert({
          query_params: JSON.stringify(queryParams),
          result: resultData,
          expires_at: new Date(Date.now() + 86400000).toISOString(), // 24 hour cache
        });
      } catch (e) {
        console.warn('[ML] Failed to cache recommendations:', e);
      }

      return resultData;
    },
    enabled: !!user && !!tasteProfile && !!watchHistory,
    staleTime: 1800000, // 30 minutes cache
  });
}
