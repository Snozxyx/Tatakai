/**
 * Enhanced ML-driven recommendations
 * Builds on useRecommendations.ts with more sophisticated algorithms
 */

import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { useWatchlist } from './useWatchlist';
import { useWatchHistory } from './useWatchHistory';
import { fetchAnimeInfo, fetchHome, searchAnime, AnimeCard } from '@/lib/api';
import { usePersonalizedRecommendations, useGenrePreferences } from './useRecommendations';

interface EnhancedRecommendation {
  anime: AnimeCard;
  score: number;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
  factors: string[];
}

/**
 * Collaborative filtering: Find users with similar taste
 */
async function findSimilarUsers(
  userId: string,
  watchlist: Array<{ anime_id: string; status: string }>,
  history: Array<{ anime_id: string; completed: boolean }>
): Promise<string[]> {
  // This would typically query a database for users with overlapping watchlists
  // For now, return empty array - can be enhanced with Supabase RPC
  return [];
}

/**
 * Content-based filtering: Find similar anime based on features
 */
async function findSimilarAnime(
  animeId: string,
  limit = 10
): Promise<AnimeCard[]> {
  try {
    const info = await fetchAnimeInfo(animeId);
    if (!info?.anime?.moreInfo?.genres) return [];

    const genres = info.anime.moreInfo.genres;
    const topGenre = genres[0];

    if (topGenre) {
      const results = await searchAnime(topGenre);
      return (results?.animes || [])
        .filter((a) => a.id !== animeId)
        .slice(0, limit)
        .map((anime) => ({
          id: anime.id,
          name: anime.name,
          poster: anime.poster,
          type: anime.type || 'TV',
          episodes: anime.episodes,
          rating: anime.rating,
        }));
    }
  } catch {
    // Fallback
  }
  return [];
}

/**
 * Calculate recommendation score with multiple factors
 */
function calculateScore(
  anime: AnimeCard,
  userPreferences: {
    genres: string[];
    preferredRatings: number[];
    preferredTypes: string[];
  },
  factors: {
    genreMatch: number;
    ratingScore: number;
    popularityScore: number;
    recencyScore: number;
  }
): { score: number; confidence: 'high' | 'medium' | 'low'; reason: string; factors: string[] } {
  let score = 0;
  const factorList: string[] = [];

  // Genre matching (40% weight)
  if (factors.genreMatch > 0) {
    score += factors.genreMatch * 40;
    factorList.push('Genre match');
  }

  // Rating (30% weight)
  if (anime.rating) {
    const rating = parseFloat(anime.rating);
    score += (rating / 10) * 30;
    factorList.push('High rating');
  }

  // Popularity (20% weight)
  score += factors.popularityScore * 20;
  if (factors.popularityScore > 0.5) {
    factorList.push('Popular');
  }

  // Recency (10% weight)
  score += factors.recencyScore * 10;
  if (factors.recencyScore > 0.7) {
    factorList.push('Recent release');
  }

  // Determine confidence
  let confidence: 'high' | 'medium' | 'low' = 'low';
  if (score > 70) confidence = 'high';
  else if (score > 50) confidence = 'medium';

  // Generate reason
  const reasons = [];
  if (factors.genreMatch > 0.7) reasons.push('matches your favorite genres');
  if (anime.rating && parseFloat(anime.rating) > 8) reasons.push('highly rated');
  if (factors.popularityScore > 0.7) reasons.push('trending now');
  if (reasons.length === 0) reasons.push('similar to your preferences');

  return {
    score: Math.min(100, Math.round(score)),
    confidence,
    reason: `Because it ${reasons.join(' and ')}`,
    factors: factorList,
  };
}

/**
 * Enhanced personalized recommendations with ML
 */
export function useEnhancedRecommendations(limit = 20) {
  const { user } = useAuth();
  const { data: watchlist } = useWatchlist();
  const { data: history } = useWatchHistory(50);
  const { data: preferences } = useGenrePreferences();
  const { data: baseRecommendations } = usePersonalizedRecommendations(limit * 2);

  return useQuery({
    queryKey: ['enhanced_recommendations', user?.id, preferences?.length, watchlist?.length],
    queryFn: async (): Promise<EnhancedRecommendation[]> => {
      if (!user || !preferences || preferences.length === 0) {
        // Fallback to base recommendations
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
          reason: 'Popular anime',
          confidence: 'medium',
          factors: ['Popular'],
        }));
      }

      const recommendations: EnhancedRecommendation[] = [];
      const watchedIds = new Set([
        ...(watchlist?.map((w) => w.anime_id) || []),
        ...(history?.map((h) => h.anime_id) || []),
      ]);

      // Process base recommendations with enhanced scoring
      for (const rec of baseRecommendations || []) {
        if (watchedIds.has(rec.anime.id)) continue;

        try {
          const animeInfo = await fetchAnimeInfo(rec.anime.id);
          const animeGenres = animeInfo?.anime?.moreInfo?.genres || [];

          // Calculate genre match
          const genreMatch = preferences.reduce((acc, pref) => {
            if (animeGenres.some((g) => g.toLowerCase() === pref.genre.toLowerCase())) {
              return acc + pref.weight / preferences.length;
            }
            return acc;
          }, 0);

          // Calculate popularity (simplified - would use actual metrics)
          const popularityScore = rec.anime.rating ? parseFloat(rec.anime.rating) / 10 : 0.5;

          // Calculate recency (simplified)
          const recencyScore = 0.5; // Would use actual release date

          const { score, confidence, reason, factors } = calculateScore(
            rec.anime,
            {
              genres: preferences.map((p) => p.genre),
              preferredRatings: [],
              preferredTypes: [],
            },
            {
              genreMatch,
              ratingScore: rec.anime.rating ? parseFloat(rec.anime.rating) / 10 : 0,
              popularityScore,
              recencyScore,
            }
          );

          recommendations.push({
            anime: rec.anime,
            score,
            reason,
            confidence,
            factors,
          });
        } catch {
          // Skip on error
        }
      }

      // Add "more like this" recommendations from watchlist
      if (watchlist && watchlist.length > 0) {
        const sampleAnime = watchlist[0];
        const similar = await findSimilarAnime(sampleAnime.anime_id, 5);

        for (const anime of similar) {
          if (watchedIds.has(anime.id)) continue;
          if (recommendations.some((r) => r.anime.id === anime.id)) continue;

          recommendations.push({
            anime,
            score: 60,
            reason: `Similar to ${sampleAnime.anime_id}`,
            confidence: 'medium',
            factors: ['Similar content'],
          });
        }
      }

      // Sort by score and return top results
      return recommendations
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
    },
    enabled: !!user && (!!watchlist?.length || !!history?.length),
    staleTime: 600000, // 10 minutes
  });
}

/**
 * Continuation recommendations - what to watch next
 */
export function useContinuationRecommendations() {
  const { user } = useAuth();
  const { data: history } = useWatchHistory(10);

  return useQuery({
    queryKey: ['continuation_recommendations', user?.id, history?.length],
    queryFn: async (): Promise<AnimeCard[]> => {
      if (!history || history.length === 0) return [];

      // Get the most recently watched anime
      const recent = history[0];
      if (!recent.completed) {
        // Continue watching current anime
        return [];
      }

      // Find similar anime to continue the journey
      const similar = await findSimilarAnime(recent.anime_id, 5);
      return similar;
    },
    enabled: !!user && !!history?.length,
    staleTime: 300000, // 5 minutes
  });
}
