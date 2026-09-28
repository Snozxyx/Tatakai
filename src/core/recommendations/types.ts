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

/** Normalized metadata for a single anime, used for both seeds and candidates. */
export interface AnimeMeta {
  id: string; // content-graph id (the `anime_id` the rest of the app uses)
  anilistId?: number | null;
  malId?: number | null;
  title: string;
  poster?: string | null;
  genres: string[];
  tags: string[];
  studios: string[];
  format?: string | null; // AniList MediaFormat, e.g. TV / MOVIE / OVA
  year?: number | null;
  averageScore?: number | null; // 0–100 (AniList scale)
  popularity?: number | null;
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
  studios: WeightMap;
  formats: WeightMap;
  eras: WeightMap; // decade bucket ("2010s") -> weight
  ratingRange: { min: number; max: number; average: number };
  diversityScore: number; // 0–1, normalized genre entropy
  sampleSize: number; // # of positively-signaled anime the profile is built from
  topGenres: Array<{ genre: string; weight: number }>;
  topStudios: Array<{ studio: string; weight: number }>;
}

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
}
