/**
 * Machine Learning-based Recommendation Engine
 * Analyzes user taste and provides personalized recommendations
 */

import { fetchAnimeInfo, AnimeCard } from '@/lib/api';

export interface TasteProfile {
  preferredGenres: Array<{ genre: string; weight: number }>;
  preferredTypes: Array<{ type: string; weight: number }>;
  preferredRatings: { min: number; max: number; average: number };
  preferredYears: { min: number; max: number; average: number };
  preferredStudios: Array<{ studio: string; weight: number }>;
  watchPatterns: {
    averageEpisodeCount: number;
    prefersCompleted: boolean;
    bingeWatcher: boolean;
  };
  diversityScore: number; // 0-1, higher = more diverse taste
}

export interface MLRecommendation {
  anime: AnimeCard;
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
}

/**
 * Analyze user's watch history to build taste profile
 */
export async function analyzeTaste(
  watchHistory: Array<{
    anime_id: string;
    anime_name: string;
    completed: boolean;
    progress_seconds?: number;
    duration_seconds?: number;
  }>,
  watchlist: Array<{
    anime_id: string;
    status: string;
  }>
): Promise<TasteProfile> {
  const genreCounts = new Map<string, number>();
  const typeCounts = new Map<string, number>();
  const studioCounts = new Map<string, number>();
  const ratings: number[] = [];
  const years: number[] = [];
  const episodeCounts: number[] = [];
  let completedCount = 0;
  let totalWatchTime = 0;

  // Analyze watch history
  for (const item of watchHistory.slice(0, 50)) {
    try {
      const info = await fetchAnimeInfo(item.anime_id);
      if (!info?.anime) continue;

      const anime = info.anime;
      const moreInfo = anime.moreInfo || {};

      // Genres
      (moreInfo.genres || []).forEach((genre: string) => {
        genreCounts.set(genre, (genreCounts.get(genre) || 0) + 1);
      });

      // Type
      const type = anime.info.type || 'TV';
      typeCounts.set(type, (typeCounts.get(type) || 0) + 1);

      // Studios
      (moreInfo.studios || []).forEach((studio: string) => {
        studioCounts.set(studio, (studioCounts.get(studio) || 0) + 1);
      });

      // Rating
      if (anime.info.rating) {
        const rating = parseFloat(anime.info.rating);
        if (!isNaN(rating)) ratings.push(rating);
      }

      // Year
      if (moreInfo.aired) {
        const yearMatch = moreInfo.aired.match(/\d{4}/);
        if (yearMatch) {
          const year = parseInt(yearMatch[0]);
          if (year > 1900 && year <= new Date().getFullYear()) {
            years.push(year);
          }
        }
      }

      // Episodes
      const episodes = anime.info.episodes?.sub || anime.info.episodes?.dub || 0;
      if (episodes > 0) episodeCounts.push(episodes);

      // Completion
      if (item.completed) completedCount++;
      if (item.progress_seconds) totalWatchTime += item.progress_seconds;
    } catch {
      // Skip on error
    }
  }

  // Calculate weights (normalized)
  const totalItems = watchHistory.length || 1;
  const preferredGenres = Array.from(genreCounts.entries())
    .map(([genre, count]) => ({
      genre,
      weight: count / totalItems,
    }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 10);

  const preferredTypes = Array.from(typeCounts.entries())
    .map(([type, count]) => ({
      type,
      weight: count / totalItems,
    }))
    .sort((a, b) => b.weight - a.weight);

  const preferredStudios = Array.from(studioCounts.entries())
    .map(([studio, count]) => ({
      studio,
      weight: count / totalItems,
    }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5);

  // Calculate diversity score (based on unique genres/types)
  const uniqueGenres = genreCounts.size;
  const uniqueTypes = typeCounts.size;
  const diversityScore = Math.min(1, (uniqueGenres / 20 + uniqueTypes / 5) / 2);

  // Calculate averages
  const avgRating = ratings.length > 0
    ? ratings.reduce((a, b) => a + b, 0) / ratings.length
    : 7.0;
  const avgYear = years.length > 0
    ? years.reduce((a, b) => a + b, 0) / years.length
    : new Date().getFullYear() - 5;
  const avgEpisodes = episodeCounts.length > 0
    ? episodeCounts.reduce((a, b) => a + b, 0) / episodeCounts.length
    : 12;

  // Determine watch patterns
  const completionRate = completedCount / totalItems;
  const avgWatchTime = totalWatchTime / totalItems;
  const prefersCompleted = completionRate > 0.7;
  const bingeWatcher = avgWatchTime > 3600; // More than 1 hour average

  return {
    preferredGenres,
    preferredTypes,
    preferredRatings: {
      min: Math.max(0, avgRating - 2),
      max: Math.min(10, avgRating + 2),
      average: avgRating,
    },
    preferredYears: {
      min: years.length > 0 ? Math.min(...years) : avgYear - 10,
      max: years.length > 0 ? Math.max(...years) : avgYear + 5,
      average: avgYear,
    },
    preferredStudios,
    watchPatterns: {
      averageEpisodeCount: avgEpisodes,
      prefersCompleted,
      bingeWatcher,
    },
    diversityScore,
  };
}

/**
 * Calculate ML recommendation score for an anime
 */
export function calculateMLScore(
  anime: AnimeCard,
  animeInfo: any,
  tasteProfile: TasteProfile
): MLRecommendation {
  const moreInfo = animeInfo?.anime?.moreInfo || {};
  const info = animeInfo?.anime?.info || {};

  const factors = {
    genreMatch: 0,
    ratingMatch: 0,
    typeMatch: 0,
    studioMatch: 0,
    popularityBoost: 0,
    recencyBoost: 0,
  };

  const reasons: string[] = [];

  // Genre matching (40% weight)
  const animeGenres = moreInfo.genres || [];
  let genreScore = 0;
  animeGenres.forEach((genre: string) => {
    const pref = tasteProfile.preferredGenres.find(
      (p) => p.genre.toLowerCase() === genre.toLowerCase()
    );
    if (pref) {
      genreScore += pref.weight;
      reasons.push(`Matches your interest in ${genre}`);
    }
  });
  factors.genreMatch = Math.min(1, genreScore);

  // Rating matching (20% weight)
  if (anime.rating) {
    const rating = parseFloat(anime.rating);
    if (!isNaN(rating)) {
      const { min, max, average } = tasteProfile.preferredRatings;
      if (rating >= min && rating <= max) {
        const distance = Math.abs(rating - average);
        factors.ratingMatch = 1 - distance / 2; // Closer to average = higher score
        reasons.push(`Rating matches your preferences (${rating.toFixed(1)})`);
      }
    }
  }

  // Type matching (15% weight)
  const animeType = info.type || anime.type || 'TV';
  const typePref = tasteProfile.preferredTypes.find(
    (t) => t.type.toLowerCase() === animeType.toLowerCase()
  );
  if (typePref) {
    factors.typeMatch = typePref.weight;
    reasons.push(`You like ${animeType} anime`);
  }

  // Studio matching (10% weight)
  const studios = moreInfo.studios || [];
  studios.forEach((studio: string) => {
    const studioPref = tasteProfile.preferredStudios.find(
      (s) => s.studio.toLowerCase() === studio.toLowerCase()
    );
    if (studioPref) {
      factors.studioMatch = Math.max(factors.studioMatch, studioPref.weight);
      reasons.push(`From ${studio}, a studio you enjoy`);
    }
  });

  // Popularity boost (10% weight)
  if (anime.rating && parseFloat(anime.rating) > 8) {
    factors.popularityBoost = 0.5;
    reasons.push('Highly rated by community');
  }

  // Recency boost (5% weight)
  if (moreInfo.aired) {
    const yearMatch = moreInfo.aired.match(/\d{4}/);
    if (yearMatch) {
      const year = parseInt(yearMatch[0]);
      const currentYear = new Date().getFullYear();
      if (year >= currentYear - 2) {
        factors.recencyBoost = 0.3;
        reasons.push('Recent release');
      }
    }
  }

  // Calculate final score
  const score =
    factors.genreMatch * 0.4 +
    factors.ratingMatch * 0.2 +
    factors.typeMatch * 0.15 +
    factors.studioMatch * 0.1 +
    factors.popularityBoost * 0.1 +
    factors.recencyBoost * 0.05;

  // Calculate confidence based on data quality
  const dataPoints = [
    factors.genreMatch > 0,
    factors.ratingMatch > 0,
    factors.typeMatch > 0,
    factors.studioMatch > 0,
  ].filter(Boolean).length;

  const confidence = Math.min(1, dataPoints / 3);

  return {
    anime,
    score: Math.round(score * 100),
    confidence,
    reasons: reasons.slice(0, 3), // Top 3 reasons
    factors,
  };
}

/**
 * Generate ML-based recommendations
 */
export async function generateMLRecommendations(
  tasteProfile: TasteProfile,
  candidateAnime: AnimeCard[],
  excludeIds: Set<string> = new Set(),
  limit = 20
): Promise<MLRecommendation[]> {
  const recommendations: MLRecommendation[] = [];

  for (const anime of candidateAnime) {
    if (excludeIds.has(anime.id)) continue;

    try {
      const info = await fetchAnimeInfo(anime.id);
      if (!info?.anime) continue;

      const recommendation = calculateMLScore(anime, info, tasteProfile);

      if (recommendation.score > 30) {
        // Only include if score is above threshold
        recommendations.push(recommendation);
      }
    } catch {
      // Skip on error
    }

    // Limit processing to prevent too many API calls
    if (recommendations.length >= limit * 2) break;
  }

  // Sort by score and return top results
  return recommendations
    .sort((a, b) => {
      // Sort by score first, then confidence
      if (b.score !== a.score) return b.score - a.score;
      return b.confidence - a.confidence;
    })
    .slice(0, limit);
}
