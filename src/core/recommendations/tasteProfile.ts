// Builds a user's taste profile from their signals + per-anime metadata.
// Pure and unit-testable: no fetching happens here.

import { computeAffinity, clamp, decadeBucket } from './scoring';
import type { AnimeMeta, TasteProfile, UserAnimeSignal, WeightMap } from './types';

function addWeighted(map: WeightMap, keys: string[], weight: number): void {
  for (const key of keys) {
    if (!key) continue;
    map[key] = (map[key] ?? 0) + weight;
  }
}

/** Scale every entry so the largest weight is 1. Keeps cosine comparisons stable. */
function normalizeMap(map: WeightMap): WeightMap {
  const max = Math.max(0, ...Object.values(map));
  if (max === 0) return map;
  const out: WeightMap = {};
  for (const key in map) out[key] = map[key] / max;
  return out;
}

/** Shannon-entropy-based diversity of the genre distribution, normalized to 0–1. */
function genreDiversity(genres: WeightMap): number {
  const values = Object.values(genres).filter((v) => v > 0);
  const total = values.reduce((s, v) => s + v, 0);
  if (total === 0 || values.length <= 1) return 0;
  let entropy = 0;
  for (const v of values) {
    const p = v / total;
    entropy -= p * Math.log2(p);
  }
  const maxEntropy = Math.log2(values.length);
  return maxEntropy > 0 ? clamp(entropy / maxEntropy, 0, 1) : 0;
}

function topN(map: WeightMap, n: number): Array<[string, number]> {
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

/**
 * Build a taste profile from the user's signals. Only positively-signaled anime
 * (affinity > 0) contribute to the category vectors, weighted by that affinity;
 * ratings across all rated anime define the preferred rating range.
 */
export function buildTasteProfile(
  signals: UserAnimeSignal[],
  metaById: Map<string, AnimeMeta>,
): TasteProfile {
  const genres: WeightMap = {};
  const tags: WeightMap = {};
  const studios: WeightMap = {};
  const formats: WeightMap = {};
  const eras: WeightMap = {};

  const ratings: number[] = [];
  let sampleSize = 0;

  for (const signal of signals) {
    const meta = metaById.get(signal.animeId);
    if (signal.userRating != null) ratings.push(signal.userRating);
    if (!meta) continue;

    const affinity = computeAffinity(signal);
    if (affinity <= 0) continue; // dislikes/drops don't shape positive taste
    sampleSize += 1;

    addWeighted(genres, meta.genres, affinity);
    addWeighted(tags, meta.tags, affinity * 0.6); // tags are noisier than genres
    addWeighted(studios, meta.studios, affinity);
    if (meta.format) addWeighted(formats, [meta.format], affinity);
    const era = decadeBucket(meta.year);
    if (era) addWeighted(eras, [era], affinity);
  }

  const average = ratings.length
    ? ratings.reduce((s, r) => s + r, 0) / ratings.length / 1 // keep on 1–10 scale
    : 7; // sensible default for a user with no explicit ratings
  // Convert the user's 1–10 average to the 0–10 candidate-score scale used by
  // scoreCandidate (AniList averageScore/10). They already share a 0–10 range.
  const avgOnTen = clamp(average, 0, 10);
  const spread = ratings.length ? 1.2 : 2;

  const normGenres = normalizeMap(genres);
  const normStudios = normalizeMap(studios);

  return {
    genres: normGenres,
    tags: normalizeMap(tags),
    studios: normStudios,
    formats: normalizeMap(formats),
    eras: normalizeMap(eras),
    ratingRange: {
      min: clamp(avgOnTen - spread, 0, 10),
      max: clamp(avgOnTen + spread, 0, 10),
      average: avgOnTen,
    },
    diversityScore: genreDiversity(genres),
    sampleSize,
    topGenres: topN(normGenres, 8).map(([genre, weight]) => ({ genre, weight })),
    topStudios: topN(normStudios, 6).map(([studio, weight]) => ({ studio, weight })),
  };
}
