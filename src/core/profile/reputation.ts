// Pure helper: a real, bounded reputation score (0–100) derived from actual
// activity signals. Replaces the old near-constant vanity heuristic.
//
// Each sub-score is log-scaled against a soft target so early activity moves the
// needle a lot and heavy users don't saturate the whole scale. Weights sum to
// 100. `breakdown` is returned so the UI can show how the score is composed.

export interface ReputationSignals {
  episodes?: number;
  longestStreak?: number;
  ratingsCount?: number;
  commentsCount?: number;
  forumPosts?: number;
  forumUpvotes?: number;
  followers?: number;
}

export interface ReputationTerm {
  key: string;
  label: string;
  value: number; // points earned for this term
  weight: number; // max points for this term
}

export interface ReputationResult {
  score: number; // 0..100
  breakdown: ReputationTerm[];
}

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);

/** log10(x+1) / log10(target+1), clamped to 0..1. */
function logScore(value: number, target: number): number {
  const v = Math.max(0, Number(value) || 0);
  if (target <= 0) return 0;
  return clamp01(Math.log10(v + 1) / Math.log10(target + 1));
}

export function computeReputation(signals: ReputationSignals = {}): ReputationResult {
  const {
    episodes = 0,
    longestStreak = 0,
    ratingsCount = 0,
    commentsCount = 0,
    forumPosts = 0,
    forumUpvotes = 0,
    followers = 0,
  } = signals;

  const terms: ReputationTerm[] = [
    { key: 'consumption', label: 'Watch activity', weight: 25, value: 25 * logScore(episodes, 500) },
    { key: 'consistency', label: 'Consistency', weight: 15, value: 15 * clamp01(longestStreak / 30) },
    { key: 'curation', label: 'Ratings', weight: 15, value: 15 * logScore(ratingsCount, 100) },
    { key: 'discussion', label: 'Comments', weight: 15, value: 15 * logScore(commentsCount, 200) },
    { key: 'contribution', label: 'Forum posts', weight: 15, value: 15 * logScore(forumPosts, 50) },
    { key: 'recognition', label: 'Upvotes', weight: 10, value: 10 * logScore(forumUpvotes, 200) },
    { key: 'social', label: 'Followers', weight: 5, value: 5 * logScore(followers, 100) },
  ];

  const rawScore = terms.reduce((sum, t) => sum + t.value, 0);

  return {
    score: Math.round(clamp01(rawScore / 100) * 100),
    breakdown: terms.map((t) => ({ ...t, value: Math.round(t.value * 10) / 10 })),
  };
}
