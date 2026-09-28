// Backwards-compatible facade over the real recommendation engine.
//
// Older callers (FavoritesPage, the recommendations page) import
// `useTasteProfile` / `useMLRecommendations` and expect the shapes below. Both
// now delegate to `useRecommendationEngine`, so the heuristic/stubbed logic that
// used to live here is gone — these are thin adapters.

import { useMemo } from 'react';
import type { AnimeCard } from '@/types/anime';
import type { RecommendationFactors } from '@/core/recommendations/types';
import { useRecommendationEngine } from './useRecommendationEngine';
import type { AnimeMeta } from '@/core/recommendations/types';

export type TasteProfile = {
  diversityScore: number;
  preferredGenres: Array<{ genre: string; weight: number }>;
  preferredRatings: { min: number; max: number; average: number };
  preferredTypes: Array<{ type: string; weight: number }>;
};

export type MLRecommendation = {
  anime: AnimeCard;
  score: number;
  confidence: number;
  reasons: string[];
  factors: RecommendationFactors;
};

function metaToAnimeCard(meta: AnimeMeta): AnimeCard {
  return {
    id: meta.id,
    name: meta.title,
    poster: meta.poster ?? '',
    type: meta.format ?? undefined,
    rating: meta.averageScore != null ? (meta.averageScore / 10).toFixed(1) : undefined,
    episodes: { sub: 0, dub: 0 },
    anilistId: meta.anilistId ?? undefined,
    malId: meta.malId ?? undefined,
  };
}

/** Real taste profile, adapted to the legacy shape. */
export function useTasteProfile() {
  const { profile, isLoading } = useRecommendationEngine();
  const data = useMemo<TasteProfile | null>(() => {
    if (!profile) return null;
    return {
      diversityScore: profile.diversityScore,
      preferredGenres: profile.topGenres,
      preferredRatings: profile.ratingRange,
      preferredTypes: Object.entries(profile.formats)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([type, weight]) => ({ type, weight })),
    };
  }, [profile]);
  return { data, isLoading };
}

/** Real recommendations, adapted to the legacy MLRecommendation shape. */
export function useMLRecommendations(limit = 20) {
  const { recommendations, isLoading } = useRecommendationEngine({ limit });
  const data = useMemo<MLRecommendation[]>(
    () =>
      recommendations.map((r) => ({
        anime: metaToAnimeCard(r.anime),
        score: r.score,
        confidence: r.confidence,
        reasons: r.reasons,
        factors: r.factors,
      })),
    [recommendations],
  );
  return { data, isLoading };
}
