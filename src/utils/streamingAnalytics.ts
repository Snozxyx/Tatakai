/**
 * Streaming and download analytics computation utilities.
 * Requirements: 6.2, 6.3, 6.5, 6.6, 6.7
 */

/**
 * Peak concurrent viewer estimate.
 *
 * Buckets start timestamps into 1-hour windows using `floor(ts_ms / 3_600_000)`.
 * Returns the max count in any single bucket, or 0 if the input is empty.
 *
 * Requirements: 6.2
 *
 * @param startTimestamps - Array of session-start Unix timestamps in milliseconds.
 * @returns The highest viewer count recorded in any 1-hour window.
 */
export function peakConcurrentViewers(startTimestamps: number[]): number {
  if (startTimestamps.length === 0) return 0;
  const buckets = new Map<number, number>();
  for (const ts of startTimestamps) {
    const bucket = Math.floor(ts / 3_600_000);
    buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
  }
  return Math.max(...buckets.values());
}

/**
 * Stream duration histogram.
 *
 * Classifies each session's `watch_duration_seconds` into one of four fixed
 * time-range buckets:
 * - `"0–5 min"`   → [0, 299] seconds
 * - `"5–20 min"`  → [300, 1199] seconds
 * - `"20–60 min"` → [1200, 3599] seconds
 * - `"60+ min"`   → [3600, ∞) seconds
 *
 * Always returns exactly 4 `{ label, count }` objects in the order listed above.
 *
 * Requirements: 6.3
 *
 * @param sessions - Array of session objects with a `watch_duration_seconds` field.
 * @returns Array of 4 histogram bucket objects.
 */
export function durationHistogram(
  sessions: { watch_duration_seconds: number }[]
): { label: string; count: number }[] {
  const buckets = [
    { label: '0–5 min',   min: 0,    max: 299,        count: 0 },
    { label: '5–20 min',  min: 300,  max: 1199,       count: 0 },
    { label: '20–60 min', min: 1200, max: 3599,       count: 0 },
    { label: '60+ min',   min: 3600, max: Infinity,   count: 0 },
  ];
  for (const s of sessions) {
    const b = buckets.find(
      b => s.watch_duration_seconds >= b.min && s.watch_duration_seconds <= b.max
    );
    if (b) b.count++;
  }
  return buckets.map(({ label, count }) => ({ label, count }));
}

/**
 * Top N content items by completed download count, sorted descending.
 *
 * Returns at most `n` items. The original array is not mutated.
 *
 * Requirements: 6.5
 *
 * @param downloads - Array of content items with their completed download counts.
 * @param n         - Maximum number of items to return.
 * @returns Sorted slice of up to `n` items with the highest `completedCount`.
 */
export function topNContent(
  downloads: { content_id: string; title?: string; completedCount: number }[],
  n: number
): { content_id: string; title?: string; completedCount: number }[] {
  return [...downloads]
    .sort((a, b) => b.completedCount - a.completedCount)
    .slice(0, n);
}

/**
 * Download completion rate as a one-decimal percentage.
 *
 * Only records where `watch_duration_seconds > 0` contribute to the
 * denominator (i.e. downloads that were actually started). Returns `null`
 * when the denominator is zero so callers can distinguish "no data" from
 * a genuine 0 % rate.
 *
 * Formula: `Math.round((completed / denominator) * 1000) / 10`
 *
 * Requirements: 6.6, 6.7
 *
 * @param records - Array of download records with completion flag and duration.
 * @returns Completion rate (0–100, one decimal place), or `null` if no started downloads.
 */
export function downloadCompletionRate(
  records: { completed: boolean; watch_duration_seconds: number }[]
): number | null {
  const withDuration = records.filter(r => r.watch_duration_seconds > 0);
  if (withDuration.length === 0) return null;
  const completed = withDuration.filter(r => r.completed).length;
  return Math.round((completed / withDuration.length) * 1000) / 10;
}
