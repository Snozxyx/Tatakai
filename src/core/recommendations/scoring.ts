// Pure scoring math for the recommendation engine. No app/Supabase imports so
// this stays deterministic and unit-testable. Higher-level orchestration
// (fetching signals, candidates, persistence) lives in the hooks layer.

import type {
  AnimeMeta,
  RecommendationFactors,
  RecommendationTier,
  ScoredRecommendation,
  ScoringOptions,
  TrendLine,
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

/** Turn weighted tags into a relevance-weighted vector (Step 2). */
export function toRelevanceVector(
  detailed: Array<{ name: string; relevance: number }> | undefined,
  fallback: string[],
): WeightMap {
  const vec: WeightMap = {};
  if (detailed?.length) {
    for (const t of detailed) {
      if (!t.name) continue;
      vec[t.name] = clamp(t.relevance, 0, 1);
    }
    return vec;
  }
  return toUniformVector(fallback);
}

/** Format group for the Step-6 per-format community-average penalty. */
export function formatGroup(format?: string | null): 'manga' | 'anime' {
  const f = String(format ?? '').toUpperCase();
  if (
    f === 'MANGA' || f === 'MANHWA' || f === 'MANHUA' || f === 'OEL' ||
    f === 'ONE_SHOT' || f === 'NOVEL' || f === 'LIGHT_NOVEL' || f === 'COMICS'
  ) return 'manga';
  return 'anime';
}

function predictTrendValue(
  line: { slope: number; intercept: number } | null | undefined,
  x: number,
): number | null {
  if (!line) return null;
  const y = line.slope * x + line.intercept;
  return Number.isFinite(y) ? y : null;
}

/**
 * Step 7: classify a 0–100 score into a tier. Scores above the user's own
 * scored-mean (converted to the 0–100 scale) are strong matches; scores above
 * the catalogue mean are possible matches; the rest are weak.
 */
export function classifyTier(
  score: number,
  userScoredMean: number | undefined,
  catalogueMean: number | undefined,
  fallbackAverage: number,
): RecommendationTier {
  const userCutoff = userScoredMean != null ? clamp(userScoredMean, 0, 10) * 10 : fallbackAverage * 10;
  if (score > userCutoff) return 'strong';
  if (catalogueMean != null && score > catalogueMean) return 'possible';
  if (catalogueMean == null && score > fallbackAverage * 10 * 0.7) return 'possible';
  return 'weak';
}

/**
 * Step 8: mean absolute error of predicted (0–100) vs actual (1–10) ratings,
 * as a percentage of the 10-point rating scale. Lower is better.
 */
export function computeAccuracy(predictedScores: number[], actualRatings: number[]): number | null {
  if (!predictedScores.length || predictedScores.length !== actualRatings.length) return null;
  let sum = 0;
  for (let i = 0; i < predictedScores.length; i++) {
    sum += Math.abs(predictedScores[i] / 10 - actualRatings[i]);
  }
  return (sum / predictedScores.length / 10) * 100;
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
export interface ScoreProfile {
  genres: WeightMap;
  tags: WeightMap;
  tagGroups?: WeightMap;
  studios: WeightMap;
  formats: WeightMap;
  eras: WeightMap;
  ratingRange: { min: number; max: number; average: number };
  ratingTrend?: TrendLine | null;
  communityTrend?: TrendLine | null;
}

export function scoreCandidate(
  candidate: AnimeMeta,
  profile: ScoreProfile,
  options: ScoringOptions = {},
): { factors: RecommendationFactors; score: number; confidence: number; reasons: string[] } {
  const nicheBoost = clamp(options.nicheBoost ?? 0.3, 0, 1);
  const collaborative = clamp(options.collaborative ?? 0, 0, 1);
  const collaborativeWeight = clamp(options.collaborativeWeight ?? 0.35, 0, 1);

  const genreMatch = cosineSimilarity(toUniformVector(candidate.genres), profile.genres);
  // Step 2: candidate tags carry per-title relevance; tag groups add a coarser signal.
  const tagCos = cosineSimilarity(toRelevanceVector(candidate.tagsDetailed, candidate.tags), profile.tags);
  let groupCos = 0;
  if (profile.tagGroups && Object.keys(profile.tagGroups).length) {
    groupCos = cosineSimilarity(toUniformVector(candidate.tagGroups ?? []), profile.tagGroups);
  }
  const tagMatch = clamp(tagCos * 0.7 + groupCos * 0.3, 0, 1);

  // Studio: best single overlap weighted by primary/supporting authorship.
  let studioMatch = 0;
  candidate.studios.forEach((s, i) => {
    if (profile.studios[s] != null) {
      const authorship = candidate.studioWeights?.[i] ?? 1;
      studioMatch = Math.max(studioMatch, profile.studios[s] * authorship);
    }
  });
  const maxStudio = Math.max(0, ...Object.values(profile.studios));
  studioMatch = maxStudio > 0 ? clamp(studioMatch / maxStudio, 0, 1) : 0;

  const typeMatch = candidate.format ? clamp(profile.formats[candidate.format] ?? 0, 0, 1) : 0;

  // Rating fit: Gaussian around the user's average preferred rating.
  const candRating = candidate.averageScore != null ? candidate.averageScore / 10 : null;
  let ratingMatch = 0;
  if (candRating != null) {
    const diff = candRating - profile.ratingRange.average;
    ratingMatch = Math.exp(-(diff * diff) / (2 * 1.5 * 1.5)); // sigma ≈ 1.5 on a 0–10 scale
  }

  // Recency: era familiarity plus a mild bonus for recent titles, adjusted by
  // release status / trending / next-episode signals.
  const era = decadeBucket(candidate.year);
  const maxEra = Math.max(0, ...Object.values(profile.eras));
  const eraMatch = era && maxEra > 0 ? clamp((profile.eras[era] ?? 0) / maxEra, 0, 1) : 0;
  const currentYear = new Date().getFullYear();
  const freshness = candidate.year ? clamp(1 - (currentYear - candidate.year) / 25, 0, 1) : 0;
  let recencyBoost = clamp(eraMatch * 0.7 + freshness * 0.3, 0, 1);
  const status = String(candidate.status ?? '').toUpperCase();
  if (status === 'CANCELLED') recencyBoost *= 0.5;
  else if (status === 'NOT_YET_RELEASED') recencyBoost *= 0.7;
  if (candidate.trendingRank != null && candidate.trendingRank > 0) {
    recencyBoost = clamp(recencyBoost + clamp(1 - candidate.trendingRank / 100, 0, 1) * 0.2, 0, 1);
  }
  if (candidate.nextAiringAt != null && status === 'RELEASING') {
    const daysOut = (candidate.nextAiringAt * 1000 - Date.now()) / (24 * 60 * 60 * 1000);
    if (daysOut >= 0 && daysOut <= 7) recencyBoost = clamp(recencyBoost + 0.1, 0, 1);
  }

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
    genreMatch * 0.32 +
    tagMatch * 0.16 +
    ratingMatch * 0.16 +
    studioMatch * 0.12 +
    typeMatch * 0.07 +
    recencyBoost * 0.10 +
    popularityBoost * 0.07;

  // Step 4/5 quality signal: trend models predict the user's rating for this
  // candidate; the prediction maps to a 0.6–1.0 multiplier on the content term.
  let qualityMult = 1;
  const preds: number[] = [];
  if (candidate.year && candidate.year >= 1900) {
    const p = predictTrendValue(profile.ratingTrend, candidate.year);
    if (p != null) preds.push(p);
  }
  if (candRating != null) {
    const p = predictTrendValue(profile.communityTrend, candRating);
    if (p != null) preds.push(p);
  }
  if (preds.length) {
    const avgPred = clamp(preds.reduce((s, v) => s + v, 0) / preds.length, 1, 10);
    qualityMult = clamp(0.6 + (avgPred / 10) * 0.4, 0.6, 1);
  }
  let raw = contentScore * qualityMult;

  // Step 6: penalize obscure titles and below-format-average community scores.
  if (
    options.medianPopularity != null && options.medianPopularity > 0 &&
    candidate.popularity != null && candidate.popularity < options.medianPopularity
  ) {
    raw *= clamp(candidate.popularity / options.medianPopularity, 0.2, 1);
  }
  const fmtAvg = options.formatAverages?.[formatGroup(candidate.format)];
  if (fmtAvg != null && fmtAvg > 0 && candidate.averageScore != null && candidate.averageScore < fmtAvg) {
    raw *= clamp(candidate.averageScore / fmtAvg, 0.3, 1);
  }

  const blended = collaborative > 0
    ? raw * (1 - collaborativeWeight) + collaborative * collaborativeWeight
    : raw;

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
    /** Step 7 strong-match cutoff: mean of titles the user personally scored (1–10). */
    userScoredMean?: number;
  },
): ScoredRecommendation[] {
  const maxPopularity = candidates.reduce((m, c) => Math.max(m, c.popularity ?? 0), 0);
  // Step 6 helpers: median popularity (obscurity penalty) + per-format
  // community averages (anime vs manga/novel compared separately).
  const pops = candidates
    .map((c) => c.popularity ?? 0)
    .filter((p) => p > 0)
    .sort((a, b) => a - b);
  const medianPopularity = pops.length ? pops[Math.floor(pops.length / 2)] : undefined;
  const fmtSum: Record<string, number> = {};
  const fmtCount: Record<string, number> = {};
  for (const c of candidates) {
    if (c.averageScore == null) continue;
    const g = formatGroup(c.format);
    fmtSum[g] = (fmtSum[g] ?? 0) + c.averageScore;
    fmtCount[g] = (fmtCount[g] ?? 0) + 1;
  }
  const formatAverages: Record<string, number> = {};
  for (const g of Object.keys(fmtSum)) {
    if (fmtCount[g] > 0) formatAverages[g] = fmtSum[g] / fmtCount[g];
  }

  const scored: ScoredRecommendation[] = [];

  for (const candidate of candidates) {
    if (opts.excludeIds.has(candidate.id)) continue;
    const { factors, score, confidence, reasons } = scoreCandidate(candidate, profile, {
      nicheBoost: opts.nicheBoost,
      collaborative: opts.collaborativeById?.get(candidate.id),
      collaborativeWeight: opts.collaborativeWeight,
      maxPopularity,
      medianPopularity,
      formatAverages,
    });
    scored.push({ animeId: candidate.id, score, confidence, factors, reasons });
  }

  scored.sort((a, b) => b.score - a.score || b.confidence - a.confidence);
  // Step 7: tier classification against the user's scored-mean and the
  // candidate-set (catalogue-sample) mean.
  const catalogueMean = scored.length
    ? scored.reduce((s, r) => s + r.score, 0) / scored.length
    : undefined;
  for (const r of scored) {
    r.tier = classifyTier(r.score, opts.userScoredMean, catalogueMean, profile.ratingRange.average);
  }
  return typeof opts.limit === 'number' ? scored.slice(0, opts.limit) : scored;
}
