// Pure helper: turns a user's anime ratings (1–5 integer scale, per the
// `ratings` table CHECK constraint) into a distribution for the bar chart.

export interface RatingRow {
  rating: number;
  anime_id?: string;
  review?: string | null;
  created_at?: string;
}

export interface RatingBucket {
  rating: number; // 1..5
  count: number;
}

export interface RatingDistribution {
  buckets: RatingBucket[]; // always length 5, rating 1..5
  total: number;
  average: number; // 0 when no ratings
  mode: number | null; // most common score, null when no ratings
}

export function computeRatingDistribution(ratings: RatingRow[] = []): RatingDistribution {
  const counts = new Array(6).fill(0); // index 1..5
  let sum = 0;
  let total = 0;

  for (const row of ratings || []) {
    const r = Math.round(Number(row?.rating));
    if (!Number.isFinite(r) || r < 1 || r > 5) continue;
    counts[r] += 1;
    sum += r;
    total += 1;
  }

  const buckets: RatingBucket[] = [];
  for (let r = 1; r <= 5; r++) {
    buckets.push({ rating: r, count: counts[r] });
  }

  let mode: number | null = null;
  let modeCount = 0;
  for (let r = 1; r <= 5; r++) {
    if (counts[r] > modeCount) {
      modeCount = counts[r];
      mode = r;
    }
  }

  return {
    buckets,
    total,
    average: total > 0 ? sum / total : 0,
    mode,
  };
}
