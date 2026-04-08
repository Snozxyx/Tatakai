/**
 * Machine Learning-based Recommendation Engine
 * Analyzes user taste and provides personalized recommendations
 */

import { fetchAnimeInfo, AnimeCard } from '@/lib/api';

type CachedAnimeInfo = {
  data: any;
  expiresAt: number;
};

const ANIME_INFO_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const animeInfoCache = new Map<string, CachedAnimeInfo>();

async function getAnimeInfoCached(animeId: string): Promise<any | null> {
  const now = Date.now();
  const cached = animeInfoCache.get(animeId);
  if (cached && cached.expiresAt > now) return cached.data;

  const data = await fetchAnimeInfo(animeId);
  animeInfoCache.set(animeId, { data, expiresAt: now + ANIME_INFO_CACHE_TTL_MS });
  return data;
}

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

  // Analyze watch history in chunks to prevent blocking and respect rate limits.
  // Deduplicate by anime_id so we only fetch metadata once per anime.
  const CHUNK_SIZE = 8;
  const historyToProcess = watchHistory.slice(0, 80);
  const perAnimeAgg = new Map<string, {
    completedHits: number;
    watchHits: number;
    totalProgress: number;
    totalDuration: number;
  }>();

  historyToProcess.forEach((item) => {
    const agg = perAnimeAgg.get(item.anime_id) || {
      completedHits: 0,
      watchHits: 0,
      totalProgress: 0,
      totalDuration: 0,
    };

    agg.watchHits += 1;
    if (item.completed) agg.completedHits += 1;
    agg.totalProgress += item.progress_seconds || 0;
    agg.totalDuration += item.duration_seconds || 0;
    perAnimeAgg.set(item.anime_id, agg);
  });

  const uniqueAnimeIds = Array.from(perAnimeAgg.keys());

  for (let i = 0; i < uniqueAnimeIds.length; i += CHUNK_SIZE) {
    const chunk = uniqueAnimeIds.slice(i, i + CHUNK_SIZE);

    await Promise.all(chunk.map(async (animeId) => {
      try {
        const statsAgg = perAnimeAgg.get(animeId);
        if (!statsAgg) return;

        const info = await getAnimeInfoCached(animeId);
        if (!info?.anime) return;

        const anime = info.anime;
        const moreInfo = anime.moreInfo as any || {};

        // Genres - weighted more for completed and repeated viewing.
        const completionRatio = statsAgg.completedHits / Math.max(1, statsAgg.watchHits);
        const repeatBoost = Math.min(2, statsAgg.watchHits / 3);
        const weight = 1 + completionRatio + repeatBoost * 0.4;
        (moreInfo.genres || []).forEach((genre: string) => {
          genreCounts.set(genre, (genreCounts.get(genre) || 0) + weight);
        });

        // Type
        const type = anime.info.stats?.type || 'TV';
        typeCounts.set(type, (typeCounts.get(type) || 0) + 1);

        // Studios
        if (moreInfo.studios) {
          const studioList = Array.isArray(moreInfo.studios) ? moreInfo.studios : [moreInfo.studios];
          studioList.forEach((studio: string) => {
            studioCounts.set(studio, (studioCounts.get(studio) || 0) + 1);
          });
        }

        // Rating
        if (anime.info.stats?.rating) {
          const rating = parseFloat(anime.info.stats.rating);
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
        const episodes = anime.info.stats?.episodes?.sub || anime.info.stats?.episodes?.dub || 0;
        if (episodes > 0) episodeCounts.push(episodes);

        // Completion
        if (statsAgg.completedHits > 0) completedCount += 1;
        totalWatchTime += statsAgg.totalProgress;
      } catch (e) {
        console.warn(`[ML] Failed to analyze anime ${animeId}:`, e);
      }
    }));
  }

  // Calculate weights (normalized)
  const totalWeight = Array.from(genreCounts.values()).reduce((a, b) => a + b, 0) || 1;
  const preferredGenres = Array.from(genreCounts.entries())
    .map(([genre, weight]) => ({
      genre,
      weight: weight / totalWeight,
    }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 12);

  const totalTypes = Array.from(typeCounts.values()).reduce((a, b) => a + b, 0) || 1;
  const preferredTypes = Array.from(typeCounts.entries())
    .map(([type, count]) => ({
      type,
      weight: count / totalTypes,
    }))
    .sort((a, b) => b.weight - a.weight);

  const preferredStudios = Array.from(studioCounts.entries())
    .map(([studio, count]) => ({
      studio,
      weight: count / (historyToProcess.length || 1),
    }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 8);

  // Calculate diversity score
  const uniqueGenres = genreCounts.size;
  const uniqueTypes = typeCounts.size;
  const diversityScore = Math.min(1, (uniqueGenres / 15 + uniqueTypes / 4) / 2);

  const avgRating = ratings.length > 0
    ? ratings.reduce((a, b) => a + b, 0) / ratings.length
    : 7.5;
  const avgYear = years.length > 0
    ? years.reduce((a, b) => a + b, 0) / years.length
    : new Date().getFullYear() - 3;
  const avgEpisodes = episodeCounts.length > 0
    ? episodeCounts.reduce((a, b) => a + b, 0) / episodeCounts.length
    : 12;

  // Determine watch patterns
  const completionRate = completedCount / (uniqueAnimeIds.length || 1);
  const avgWatchTime = totalWatchTime / (historyToProcess.length || 1);
  const prefersCompleted = completionRate > 0.6;
  const bingeWatcher = avgWatchTime > 3000;

  return {
    preferredGenres,
    preferredTypes,
    preferredRatings: {
      min: Math.max(0, avgRating - 2.5),
      max: Math.min(10, 10), // We want to show everything up to 10
      average: avgRating,
    },
    preferredYears: {
      min: years.length > 0 ? Math.min(...years) - 2 : avgYear - 15,
      max: years.length > 0 ? Math.max(...years) + 1 : avgYear + 5,
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

  // Genre matching (primary signal)
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

  // Rating matching
  const ratingSource = anime.rating || info?.stats?.rating || undefined;
  if (ratingSource) {
    const rating = parseFloat(ratingSource);
    if (!isNaN(rating)) {
      const { min, max, average } = tasteProfile.preferredRatings;
      if (rating >= min && rating <= max) {
        const distance = Math.abs(rating - average);
        factors.ratingMatch = 1 - distance / 2; // Closer to average = higher score
        reasons.push(`Rating matches your preferences (${rating.toFixed(1)})`);
      }
    }
  }

  // Type matching + episode length alignment
  const animeType = info.type || anime.type || 'TV';
  const typePref = tasteProfile.preferredTypes.find(
    (t) => t.type.toLowerCase() === animeType.toLowerCase()
  );
  if (typePref) {
    factors.typeMatch = typePref.weight;
    reasons.push(`You like ${animeType} anime`);
  }

  const episodeSub = Number(info?.stats?.episodes?.sub || anime?.episodes?.sub || 0);
  const episodeDub = Number(info?.stats?.episodes?.dub || anime?.episodes?.dub || 0);
  const episodeCount = episodeSub || episodeDub || 0;
  if (episodeCount > 0) {
    const distance = Math.abs(episodeCount - tasteProfile.watchPatterns.averageEpisodeCount);
    const episodeMatch = Math.max(0, 1 - distance / Math.max(12, tasteProfile.watchPatterns.averageEpisodeCount));
    factors.typeMatch = Math.min(1, factors.typeMatch + episodeMatch * 0.25);
    if (episodeMatch > 0.7) reasons.push('Episode count matches your viewing style');
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

  // Popularity + quality boost
  if (ratingSource && parseFloat(ratingSource) > 8) {
    factors.popularityBoost = 0.5;
    reasons.push('Highly rated by community');
  }

  const qualityTag = String(info?.stats?.quality || '').toUpperCase();
  if (qualityTag.includes('HD')) {
    factors.popularityBoost = Math.min(1, factors.popularityBoost + 0.1);
  }

  // Recency + novelty boost
  if (moreInfo.aired) {
    const yearMatch = moreInfo.aired.match(/\d{4}/);
    if (yearMatch) {
      const year = parseInt(yearMatch[0]);
      const currentYear = new Date().getFullYear();
      if (year >= currentYear - 2) {
        factors.recencyBoost = 0.3;
        reasons.push('Recent release');
      } else if (year >= currentYear - 5) {
        factors.recencyBoost = 0.18;
      }
    }
  }

  if (tasteProfile.diversityScore > 0.6 && animeGenres.length >= 3) {
    factors.recencyBoost = Math.min(1, factors.recencyBoost + 0.08);
    reasons.push('Strong genre blend for your diverse taste');
  }

  // Calculate final score
  const score =
    factors.genreMatch * 0.38 +
    factors.ratingMatch * 0.18 +
    factors.typeMatch * 0.16 +
    factors.studioMatch * 0.12 +
    factors.popularityBoost * 0.10 +
    factors.recencyBoost * 0.06;

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
  const CHUNK_SIZE = 12;
  const processedIds = new Set<string>();

  // Process unique candidates not in history
  const filteredCandidates = candidateAnime
    .filter(a => !excludeIds.has(a.id))
    .slice(0, 100); // Sample up to 100 candidates

  for (let i = 0; i < filteredCandidates.length; i += CHUNK_SIZE) {
    const chunk = filteredCandidates.slice(i, i + CHUNK_SIZE);

    const results = await Promise.all(chunk.map(async (anime) => {
      try {
        if (processedIds.has(anime.id)) return null;
        processedIds.add(anime.id);

        const info = await getAnimeInfoCached(anime.id);
        if (!info?.anime) return null;

        const recommendation = calculateMLScore(anime, info, tasteProfile);
        return recommendation.score >= 25 ? recommendation : null;
      } catch {
        return null;
      }
    }));

    results.forEach(res => {
      if (res) recommendations.push(res);
    });

    // If we have enough high quality results, we can stop early
    if (recommendations.filter(r => r.score > 60).length >= limit) break;
    if (recommendations.length >= limit * 3) break;
  }

  const sorted = recommendations
    .sort((a, b) => {
      // Sort by score first, then confidence
      if (Math.abs(b.score - a.score) > 5) return b.score - a.score;
      return b.confidence - a.confidence;
    });

  // Diversity-aware reranking: avoid over-clustering a single anime type.
  const typeCounts = new Map<string, number>();
  const reranked: MLRecommendation[] = [];
  const maxPerType = tasteProfile.diversityScore > 0.65 ? 4 : 6;
  for (const rec of sorted) {
    const t = String(rec.anime.type || 'TV').toUpperCase();
    const c = typeCounts.get(t) || 0;
    if (c >= maxPerType && reranked.length < limit) continue;
    reranked.push(rec);
    typeCounts.set(t, c + 1);
    if (reranked.length >= limit) break;
  }

  if (reranked.length < limit) {
    for (const rec of sorted) {
      if (reranked.some((r) => r.anime.id === rec.anime.id)) continue;
      reranked.push(rec);
      if (reranked.length >= limit) break;
    }
  }

  return reranked.slice(0, limit);
}
