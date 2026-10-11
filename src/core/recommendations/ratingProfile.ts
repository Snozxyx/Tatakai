// Rating-weighted preference profile (spec Steps 2–4).
// Pure and unit-testable: no fetching happens here.
//
// Step 2: genres accumulate the user's personal rating per title; tags
// accumulate rating × per-title relevance (AniList rank/100 or MangaBaka
// core/defining/incidental weight). Tag groups and studios accumulate the
// same way (studios use the primary/supporting authorship weight).
// Step 3: uncertain preferences (few titles, below-average score) are
// down-weighted and pruned. Step 4: optional least-squares trend lines for
// release-year vs rating and community-score vs personal rating.

import { computeAffinity, clamp } from './scoring';
import type { AnimeMeta, TasteProfile, TrendLine, UserAnimeSignal, WeightMap } from './types';

export const TREND_MIN_SAMPLES = 8;

function tagRelevance(meta: AnimeMeta, tagName: string): number {
  const detailed = meta.tagsDetailed?.find((t) => t.name === tagName);
  if (detailed) return clamp(detailed.relevance, 0, 1);
  return 1;
}

function tagGroupOf(meta: AnimeMeta, tagName: string): string | null {
  const detailed = meta.tagsDetailed?.find((t) => t.name === tagName);
  return detailed?.group ?? null;
}

/** Personal rating 1–10, falling back to affinity mapped onto the same scale. */
export function signalRating(signal: UserAnimeSignal): number | null {
  if (signal.userRating != null) return clamp(signal.userRating, 1, 10);
  if (signal.disliked) return null;
  const affinity = computeAffinity(signal);
  if (affinity <= 0) return null;
  // Map affinity (0,1] onto a 5.5–10 rating so unrated positives still count.
  return clamp(5.5 + affinity * 4.5, 1, 10);
}

/** Least-squares fit of y = slope * x + intercept. Returns null when degenerate. */
export function fitTrend(xs: number[], ys: number[]): TrendLine | null {
  const n = xs.length;
  if (n < TREND_MIN_SAMPLES || n !== ys.length) return null;
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) { sumX += xs[i]; sumY += ys[i]; }
  const meanX = sumX / n;
  const meanY = sumY / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (ys[i] - meanY);
    den += (xs[i] - meanX) * (xs[i] - meanX);
  }
  if (den === 0) return null;
  const slope = num / den;
  return { slope, intercept: meanY - slope * meanX, samples: n };
}

export function predictTrend(line: TrendLine | null | undefined, x: number): number | null {
  if (!line) return null;
  return line.slope * x + line.intercept;
}

function normalizeMap(map: WeightMap): WeightMap {
  const max = Math.max(0, ...Object.values(map));
  if (max === 0) return map;
  const out: WeightMap = {};
  for (const key in map) out[key] = map[key] / max;
  return out;
}

/**
 * Step 3: down-weight uncertain preferences. Counts below the mean title-count
 * scale proportionally; scores below the mean score are penalized further.
 * Only attributes passing both thresholds carry forward — unless that would
 * empty the map, in which case the unpruned map is kept (small histories).
 */
export function prunePreferences(
  scores: WeightMap,
  counts: Record<string, number>,
): WeightMap {
  const keys = Object.keys(scores);
  if (keys.length === 0) return {};
  const meanCount = keys.reduce((s, k) => s + (counts[k] ?? 0), 0) / keys.length;
  const meanScore = keys.reduce((s, k) => s + scores[k] / Math.max(1, counts[k] ?? 1), 0) / keys.length;
  const out: WeightMap = {};
  for (const k of keys) {
    const count = counts[k] ?? 0;
    const meanPerTitle = scores[k] / Math.max(1, count);
    let w = scores[k];
    if (meanCount > 0 && count < meanCount) w *= count / meanCount;
    if (meanScore > 0 && meanPerTitle < meanScore) w *= meanPerTitle / meanScore;
    // Carry forward only attributes passing both thresholds.
    if (count >= meanCount && meanPerTitle >= meanScore) out[k] = w;
  }
  if (Object.keys(out).length === 0) {
    // Small or flat history: keep the down-weighted (not dropped) scores.
    const fallback: WeightMap = {};
    for (const k of keys) {
      const count = counts[k] ?? 0;
      const meanPerTitle = scores[k] / Math.max(1, count);
      let w = scores[k];
      if (meanCount > 0 && count < meanCount) w *= count / meanCount;
      if (meanScore > 0 && meanPerTitle < meanScore) w *= meanPerTitle / meanScore;
      if (w > 0) fallback[k] = w;
    }
    return fallback;
  }
  return out;
}

/**
 * Build a rating-weighted taste profile from the user's signals (Steps 2–4).
 * Dislikes/drops (no usable rating) never contribute to the positive profile.
 */
export function buildRatingProfile(
  signals: UserAnimeSignal[],
  metaById: Map<string, AnimeMeta>,
): TasteProfile {
  const genreScores: WeightMap = {};
  const tagScores: WeightMap = {};
  const groupScores: WeightMap = {};
  const studioScores: WeightMap = {};
  const formatScores: WeightMap = {};
  const eraScores: WeightMap = {};
  const genreCounts: Record<string, number> = {};
  const tagCounts: Record<string, number> = {};

  const ratings: number[] = [];
  const yearXs: number[] = [];
  const yearYs: number[] = [];
  const commXs: number[] = [];
  const commYs: number[] = [];
  let sampleSize = 0;
  let scoredSum = 0;
  let scoredCount = 0;

  for (const signal of signals) {
    const meta = metaById.get(signal.animeId);
    if (signal.userRating != null) {
      ratings.push(signal.userRating);
      scoredSum += signal.userRating;
      scoredCount += 1;
    }
    if (!meta) continue;
    const rating = signalRating(signal);
    if (rating == null) continue;
    sampleSize += 1;

    for (const g of meta.genres) {
      if (!g) continue;
      genreScores[g] = (genreScores[g] ?? 0) + rating;
      genreCounts[g] = (genreCounts[g] ?? 0) + 1;
    }
    const tagNames = meta.tagsDetailed?.map((t) => t.name) ?? meta.tags;
    for (const t of tagNames) {
      if (!t) continue;
      tagScores[t] = (tagScores[t] ?? 0) + rating * tagRelevance(meta, t);
      tagCounts[t] = (tagCounts[t] ?? 0) + 1;
      const group = tagGroupOf(meta, t);
      if (group) groupScores[group] = (groupScores[group] ?? 0) + rating * tagRelevance(meta, t);
    }
    // Tag-group fallback: pre-aggregated groups on the meta (MangaBaka merge).
    if (!meta.tagsDetailed && meta.tagGroups) {
      for (const g of meta.tagGroups) {
        if (!g) continue;
        groupScores[g] = (groupScores[g] ?? 0) + rating * 0.5;
      }
    }
    meta.studios.forEach((s, i) => {
      if (!s) return;
      const authorship = meta.studioWeights?.[i] ?? 1;
      studioScores[s] = (studioScores[s] ?? 0) + rating * authorship;
    });
    if (meta.format) formatScores[meta.format] = (formatScores[meta.format] ?? 0) + rating;
    if (meta.year && meta.year >= 1900) {
      const era = `${Math.floor(meta.year / 10) * 10}s`;
      eraScores[era] = (eraScores[era] ?? 0) + rating;
    }

    // Trend samples need both a personal rating and the x value.
    if (signal.userRating != null) {
      if (meta.year && meta.year >= 1900) {
        yearXs.push(meta.year);
        yearYs.push(signal.userRating);
      }
      if (meta.averageScore != null) {
        commXs.push(meta.averageScore / 10);
        commYs.push(signal.userRating);
      }
    }
  }

  const prunedGenres = prunePreferences(genreScores, genreCounts);
  const prunedTags = prunePreferences(tagScores, tagCounts);

  const average = ratings.length
    ? ratings.reduce((s, r) => s + r, 0) / ratings.length
    : 7;
  const avgOnTen = clamp(average, 0, 10);
  const spread = ratings.length ? 1.2 : 2;

  const normGenres = normalizeMap(prunedGenres);
  const normStudios = normalizeMap(studioScores);
  const topGenres = Object.entries(normGenres)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([genre, weight]) => ({ genre, weight }));
  const topStudios = Object.entries(normStudios)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([studio, weight]) => ({ studio, weight }));

  // Shannon entropy of the (pruned) genre distribution.
  const values = Object.values(prunedGenres).filter((v) => v > 0);
  const total = values.reduce((s, v) => s + v, 0);
  let diversityScore = 0;
  if (total > 0 && values.length > 1) {
    let entropy = 0;
    for (const v of values) {
      const p = v / total;
      entropy -= p * Math.log2(p);
    }
    const maxEntropy = Math.log2(values.length);
    diversityScore = maxEntropy > 0 ? clamp(entropy / maxEntropy, 0, 1) : 0;
  }

  return {
    genres: normGenres,
    tags: normalizeMap(prunedTags),
    tagGroups: normalizeMap(groupScores),
    studios: normStudios,
    formats: normalizeMap(formatScores),
    eras: normalizeMap(eraScores),
    ratingRange: {
      min: clamp(avgOnTen - spread, 0, 10),
      max: clamp(avgOnTen + spread, 0, 10),
      average: avgOnTen,
    },
    diversityScore,
    sampleSize,
    topGenres,
    topStudios,
    userScoredMean: scoredCount ? scoredSum / scoredCount : undefined,
    ratingTrend: fitTrend(yearXs, yearYs),
    communityTrend: fitTrend(commXs, commYs),
  };
}

/**
 * Step 1: collapse franchise duplicates. The user's rated titles are sorted by
 * personal rating (then raw signal order); titles connected through
 * `relationIds` (sequel/prequel/spin-off/adaptation/alternative) form a
 * component and only the most representative entry is kept.
 */
export function dedupeFranchiseSignals(
  signals: UserAnimeSignal[],
  metaById: Map<string, AnimeMeta>,
): UserAnimeSignal[] {
  // Union-find over signal ids linked by relationIds.
  const parent = new Map<string, string>();
  const idSet = new Set(signals.map((s) => s.animeId));
  const find = (x: string): string => {
    let p = parent.get(x) ?? x;
    if (p !== x) {
      p = find(p);
      parent.set(x, p);
    }
    return p;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };
  for (const s of signals) {
    const meta = metaById.get(s.animeId);
    if (!meta?.relationIds) continue;
    for (const rel of meta.relationIds) {
      if (idSet.has(rel)) union(s.animeId, rel);
    }
  }
  // Group, then keep the highest-rated entry per multi-member component.
  const groups = new Map<string, UserAnimeSignal[]>();
  for (const s of signals) {
    const root = find(s.animeId);
    const arr = groups.get(root) ?? [];
    arr.push(s);
    groups.set(root, arr);
  }
  const out: UserAnimeSignal[] = [];
  for (const arr of groups.values()) {
    if (arr.length === 1) {
      out.push(arr[0]);
      continue;
    }
    arr.sort((a, b) => (b.userRating ?? -1) - (a.userRating ?? -1));
    out.push(arr[0]);
  }
  return out;
}
