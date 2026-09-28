// Pure scoring math for the recommendation engine. No app/Supabase imports so
// this stays deterministic and unit-testable. Higher-level orchestration
// (fetching signals, candidates, persistence) lives in the hooks layer.

import type {
  AnimeMeta,
  RecommendationFactors,
  ScoredRecommendation,
  ScoringOptions,
  UserAnimeSignal,
  WeightMap,
  WatchlistStatus,
} from './types';

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Base affinity contributed by a watchlist status. */
const STATUS_AFFINITY: Record<WatchlistStatus, number> = {
  completed: 1,
  watching: 0.85,
  on_hold: 0.45,
  plan_to_watch: 0.35,
  dropped: -0.4,
};

/**
 * Collapse everything we know about a user's relationship to one anime into a
 * single affinity in [-1, 1]. Positive values feed the taste profile; strong
 * negatives (dislikes, drops) both stay out of the profile and are used to
 * penalize similar candidates later.
 */
export function computeAffinity(signal: UserAnimeSignal): number {
  if (signal.disliked) return -1;

  let sum = 0;
  let parts = 0;

  if (signal.status && STATUS_AFFINITY[signal.status] !== undefined) {
    sum += STATUS_AFFINITY[signal.status];
    parts += 1;
  }
  if (signal.userRating != null) {
    // 1–10 rating centered near the neutral 5.5 mark, scaled to [-1, 1].
    sum += clamp((signal.userRating - 5.5) / 4.5, -1, 1);
    parts += 1;
  }
  if (signal.engagement != null) {
    sum += clamp(signal.engagement / 100, 0, 1);
    parts += 1;
  }
  if (signal.liked) {
    sum += 1;
    parts += 1;
  }

  if (parts === 0) return 0.4; // known to the user but no strong signal
  let affinity = sum / parts;
  if (signal.completed) affinity = Math.max(affinity, 0.6);
  return clamp(affinity, -1, 1);
}

/** Cosine similarity between two sparse weight maps. */
export function cosineSimilarity(a: WeightMap, b: WeightMap): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const key in a) {
    normA += a[key] * a[key];
    if (key in b) dot += a[key] * b[key];
  }
  for (const key in b) normB += b[key] * b[key];
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Turn a list of category values into a uniform-weight vector. */
export function toUniformVector(values: string[]): WeightMap {
  const vec: WeightMap = {};
  for (const v of values) {
    if (!v) continue;
    vec[v] = 1;
  }
  return vec;
}

export function decadeBucket(year?: number | null): string | null {
  if (!year || year < 1900) return null;
  return `${Math.floor(year / 10) * 10}s`;
}

/**
 * Score a single candidate against a taste profile, returning an interpretable
 * factor breakdown plus a blended 0–100 score. Every factor is a real quantity
 * so the UI's "Why" bars reflect actual contributions.
 */
export function scoreCandidate(
  candidate: AnimeMeta,
  profile: {
    genres: WeightMap;
    tags: WeightMap;
    studios: WeightMap;
    formats: WeightMap;
    eras: WeightMap;
    ratingRange: { min: number; max: number; average: number };
  },
  options: ScoringOptions = {},
): { factors: RecommendationFactors; score: number; confidence: number; reasons: string[] } {
  const nicheBoost = clamp(options.nicheBoost ?? 0.3, 0, 1);
  const collaborative = clamp(options.collaborative ?? 0, 0, 1);
  const collaborativeWeight = clamp(options.collaborativeWeight ?? 0.35, 0, 1);

  const genreMatch = cosineSimilarity(toUniformVector(candidate.genres), profile.genres);
  const tagMatch = cosineSimilarity(toUniformVector(candidate.tags), profile.tags);

  // Studio: best single overlap, since one loved studio is a strong signal.
  let studioMatch = 0;
  for (const s of candidate.studios) {
    if (profile.studios[s] != null) studioMatch = Math.max(studioMatch, profile.studios[s]);
  }
  const maxStudio = Math.max(0, ...Object.values(profile.studios));
  studioMatch = maxStudio > 0 ? studioMatch / maxStudio : 0;

  const typeMatch = candidate.format ? clamp(profile.formats[candidate.format] ?? 0, 0, 1) : 0;

  // Rating fit: Gaussian around the user's average preferred rating.
  const candRating = candidate.averageScore != null ? candidate.averageScore / 10 : null;
  let ratingMatch = 0;
  if (candRating != null) {
    const diff = candRating - profile.ratingRange.average;
    ratingMatch = Math.exp(-(diff * diff) / (2 * 1.5 * 1.5)); // sigma ≈ 1.5 on a 0–10 scale
  }

  // Recency: era familiarity plus a mild bonus for recent titles.
  const era = decadeBucket(candidate.year);
  const maxEra = Math.max(0, ...Object.values(profile.eras));
  const eraMatch = era && maxEra > 0 ? clamp((profile.eras[era] ?? 0) / maxEra, 0, 1) : 0;
  const currentYear = new Date().getFullYear();
  const freshness = candidate.year ? clamp(1 - (currentYear - candidate.year) / 25, 0, 1) : 0;
  const recencyBoost = clamp(eraMatch * 0.7 + freshness * 0.3, 0, 1);

  // Popularity, remapped by the niche knob: nicheBoost=0 rewards popular titles,
  // nicheBoost=1 rewards less-popular ones.
  const maxPop = options.maxPopularity ?? 0;
  const popNorm = maxPop > 0 && candidate.popularity ? clamp(candidate.popularity / maxPop, 0, 1) : 0;
  const popularityBoost = clamp((1 - nicheBoost) * popNorm + nicheBoost * (1 - popNorm), 0, 1);

  const factors: RecommendationFactors = {
    genreMatch,
    tagMatch,
    ratingMatch,
    typeMatch,
    studioMatch,
    popularityBoost,
    recencyBoost,
    collaborative,
  };

  // Content term: weighted blend of the content factors (weights sum to 1).
  const contentScore =
    genreMatch * 0.34 +
    tagMatch * 0.14 +
    ratingMatch * 0.18 +
    studioMatch * 0.12 +
    typeMatch * 0.07 +
    recencyBoost * 0.08 +
    popularityBoost * 0.07;

  const blended = collaborative > 0
    ? contentScore * (1 - collaborativeWeight) + collaborative * collaborativeWeight
    : contentScore;

  const score = Math.round(clamp(blended, 0, 1) * 100);

  // Confidence rises with how many independent factors actually fired.
  const active = [genreMatch, tagMatch, ratingMatch, studioMatch, typeMatch, collaborative]
    .filter((v) => v > 0.05).length;
  const confidence = clamp(active / 6, 0, 1);

  const reasons = buildReasons(candidate, factors);

  return { factors, score, confidence, reasons };
}

/** Human-readable "why we picked this" lines from the top factors. */
function buildReasons(candidate: AnimeMeta, factors: RecommendationFactors): string[] {
  const reasons: string[] = [];
  const ranked = (
    [
      ['genreMatch', factors.genreMatch],
      ['collaborative', factors.collaborative],
      ['studioMatch', factors.studioMatch],
      ['ratingMatch', factors.ratingMatch],
      ['tagMatch', factors.tagMatch],
      ['recencyBoost', factors.recencyBoost],
    ] as Array<[keyof RecommendationFactors, number]>
  )
    .filter(([, v]) => v > 0.15)
    .sort((a, b) => b[1] - a[1]);

  for (const [key] of ranked.slice(0, 3)) {
    switch (key) {
      case 'genreMatch':
        if (candidate.genres.length) reasons.push(`Matches genres you enjoy (${candidate.genres.slice(0, 2).join(', ')})`);
        break;
      case 'collaborative':
        reasons.push('Fans with similar taste rated this highly');
        break;
      case 'studioMatch':
        if (candidate.studios.length) reasons.push(`From ${candidate.studios[0]}, a studio you like`);
        break;
      case 'ratingMatch':
        reasons.push('Sits in your preferred rating range');
        break;
      case 'tagMatch':
        reasons.push('Shares themes with your favorites');
        break;
      case 'recencyBoost':
        reasons.push('From an era you watch a lot of');
        break;
    }
  }
  if (reasons.length === 0) reasons.push('A popular pick you have not seen yet');
  return reasons;
}

/**
 * Rank a set of candidates against the profile. Excludes anything the user has
 * already interacted with and any hard-disliked ids.
 */
export function rankCandidates(
  candidates: AnimeMeta[],
  profile: Parameters<typeof scoreCandidate>[1],
  opts: {
    excludeIds: Set<string>;
    collaborativeById?: Map<string, number>;
    nicheBoost?: number;
    collaborativeWeight?: number;
    limit?: number;
  },
): ScoredRecommendation[] {
  const maxPopularity = candidates.reduce((m, c) => Math.max(m, c.popularity ?? 0), 0);
  const scored: ScoredRecommendation[] = [];

  for (const candidate of candidates) {
    if (opts.excludeIds.has(candidate.id)) continue;
    const { factors, score, confidence, reasons } = scoreCandidate(candidate, profile, {
      nicheBoost: opts.nicheBoost,
      collaborative: opts.collaborativeById?.get(candidate.id),
      collaborativeWeight: opts.collaborativeWeight,
      maxPopularity,
    });
    scored.push({ animeId: candidate.id, score, confidence, factors, reasons });
  }

  scored.sort((a, b) => b.score - a.score || b.confidence - a.confidence);
  return typeof opts.limit === 'number' ? scored.slice(0, opts.limit) : scored;
}
