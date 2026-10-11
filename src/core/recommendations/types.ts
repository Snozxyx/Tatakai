// Shared types for the multi-signal recommendation engine.
//
// The engine blends a per-user *content* model (built from everything we know
// about a single user's taste) with a *collaborative* score that is trained on
// aggregate data from every user. These types are deliberately free of any app
// or Supabase imports so the scoring math stays pure and unit-testable.

export type WatchlistStatus =
  | 'watching'
  | 'completed'
  | 'plan_to_watch'
  | 'dropped'
  | 'on_hold';

/** A single descriptive tag with per-title relevance and its grouping. */
export interface TagWeight {
  name: string;
  /** 0–1 relevance of this tag to the specific title (AniList rank/100, MangaBaka weight map). */
  relevance: number;
  /** Higher-level category: AniList tag category or first MangaBaka path segment. */
  group?: string | null;
}

/** Normalized metadata for a single anime, used for both seeds and candidates. */
export interface AnimeMeta {
  id: string; // content-graph id (the `anime_id` the rest of the app uses)
  anilistId?: number | null;
  malId?: number | null;
  title: string;
  poster?: string | null;
  genres: string[];
  tags: string[];
  /** Per-title weighted tags (Step 2: rating × relevance). Falls back to `tags` when absent. */
  tagsDetailed?: TagWeight[];
  /** Higher-level tag groupings aggregated from tagsDetailed groups. */
  tagGroups?: string[];
  studios: string[];
  /** Per-studio authorship weight: primary/main = 1, supporting = 0.5. Parallel to `studios`. */
  studioWeights?: number[];
  format?: string | null; // AniList MediaFormat, e.g. TV / MOVIE / OVA
  year?: number | null;
  season?: string | null; // WINTER | SPRING | SUMMER | FALL
  status?: string | null; // FINISHED | RELEASING | NOT_YET_RELEASED | CANCELLED | HIATUS
  country?: string | null; // countryOfOrigin, e.g. JP / KR / CN
  averageScore?: number | null; // 0–100 (AniList scale)
  popularity?: number | null;
  favourites?: number | null;
  trendingRank?: number | null; // best MediaRanking rank, lower = hotter
  episodes?: number | null;
  totalChapters?: number | null;
  nextAiringAt?: number | null; // unix seconds of next episode, currently-airing only
  /** Franchise edge ids (sequel/prequel/spin-off/adaptation/alternative) for Step-1 dedup. */
  relationIds?: string[];
}

/** Everything we know about one user's relationship to one anime. */
export interface UserAnimeSignal {
  animeId: string;
  status?: WatchlistStatus;
  userRating?: number | null; // 1–10
  engagement?: number | null; // 0–100 (from useSmartFavorites)
  completed?: boolean;
  liked?: boolean; // recommendation_feedback = 'like'
  disliked?: boolean; // recommendation_feedback = 'dislike'
  lastActivity?: string | null; // ISO timestamp of most recent interaction
}

/** A weight vector keyed by a category value (genre name, studio name, ...). */
export type WeightMap = Record<string, number>;

export interface TasteProfile {
  genres: WeightMap;
  tags: WeightMap;
  tagGroups: WeightMap;
  studios: WeightMap;
  formats: WeightMap;
  eras: WeightMap; // decade bucket ("2010s") -> weight
  ratingRange: { min: number; max: number; average: number };
  diversityScore: number; // 0–1, normalized genre entropy
  sampleSize: number; // # of positively-signaled anime the profile is built from
  topGenres: Array<{ genre: string; weight: number }>;
  topStudios: Array<{ studio: string; weight: number }>;
  /** Mean catalogue score of titles the user personally scored (Step 7 strong-match cutoff). */
  userScoredMean?: number;
  /** Step 8: mean absolute prediction error as % of the 10-point scale (lower = better). */
  accuracy?: number | null;
  /** Optional trend lines (Step 4), fitted when n >= 8 rated titles. */
  ratingTrend?: TrendLine | null;
  communityTrend?: TrendLine | null;
}

/** Simple least-squares trend line y = slope * x + intercept. */
export interface TrendLine {
  slope: number;
  intercept: number;
  samples: number;
}

/** Step 7 tier classification. */
export type RecommendationTier = 'strong' | 'possible' | 'weak';

/** Per-factor contribution breakdown — drives the "Why" bars in the UI. */
export interface RecommendationFactors {
  genreMatch: number;
  tagMatch: number;
  ratingMatch: number;
  typeMatch: number; // format fit
  studioMatch: number;
  popularityBoost: number;
  recencyBoost: number;
  collaborative: number;
}

export interface ScoredRecommendation {
  animeId: string;
  score: number; // 0–100
  confidence: number; // 0–1
  factors: RecommendationFactors;
  reasons: string[];
  tier?: RecommendationTier;
}

/** Tunable knobs for a single scoring pass. */
export interface ScoringOptions {
  /**
   * Popularity/niche knob, 0–1. 0 = favor popular/mainstream titles,
   * 1 = strongly favor niche/less-popular titles. Mirrors sprout's slider.
   */
  nicheBoost?: number;
  /** Collaborative score for this candidate (0–1), if available. */
  collaborative?: number;
  /** Max popularity seen across the candidate set, for normalization. */
  maxPopularity?: number;
  /** Weight of the collaborative term relative to the content term (0–1). */
  collaborativeWeight?: number;
  /** Step 7 cutoffs: mean score of user's own rated titles + overall catalogue mean. */
  userScoredMean?: number;
  catalogueMean?: number;
  /** Step 6: per-format community averages (0–100 AniList scale) for the penalty. */
  formatAverages?: Record<string, number>;
  /** Median popularity across candidates, for the Step-6 obscurity penalty. */
  medianPopularity?: number;
}
