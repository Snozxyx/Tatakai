/**
 * userStats.ts — Pure utility functions for User Statistics Panel
 *
 * Covers: Requirements 4.2, 4.3, 4.4, 4.6
 *
 * Uses date-fns for all date arithmetic.
 */

import {
  parseISO,
  startOfDay,
  startOfWeek,
  startOfMonth,
  format,
  isWithinInterval,
  addDays,
  isBefore,
  isAfter,
} from 'date-fns';

import type { TimeRange, SignupGroup, DauPoint, CountrySignup } from '../types/admin-dashboard';

// ---------------------------------------------------------------------------
// groupSignupsByPeriod
// ---------------------------------------------------------------------------

/**
 * Groups an array of ISO timestamp strings by period (day / week / month).
 *
 * Each timestamp is assigned to exactly one bucket.
 * Only timestamps within [rangeStart, rangeEnd] are included; if bounds are
 * omitted the full array is grouped without date filtering.
 *
 * Requirement 4.2 — signup time-series grouping invariant.
 */
export function groupSignupsByPeriod(
  timestamps: string[],
  period: TimeRange,
  rangeStart?: Date,
  rangeEnd?: Date,
): SignupGroup[] {
  const buckets = new Map<string, number>();

  for (const ts of timestamps) {
    const date = parseISO(ts);

    // Filter to the selected time range when bounds are supplied
    if (rangeStart && isBefore(date, rangeStart)) continue;
    if (rangeEnd && isAfter(date, rangeEnd)) continue;

    const bucketDate = getBucketStart(date, period);
    const key = formatBucketKey(bucketDate, period);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  // Return sorted ascending by date key
  return Array.from(buckets.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, count]) => ({ date, count }));
}

/** Returns the start of the bucket that `date` belongs to. */
function getBucketStart(date: Date, period: TimeRange): Date {
  switch (period) {
    case 'day':
      return startOfDay(date);
    case 'week':
      // ISO week starts on Monday
      return startOfWeek(date, { weekStartsOn: 1 });
    case 'month':
      return startOfMonth(date);
  }
}

/** Formats a bucket start date as a canonical string key. */
function formatBucketKey(date: Date, period: TimeRange): string {
  switch (period) {
    case 'day':
      return format(date, 'yyyy-MM-dd');
    case 'week':
      return format(date, 'yyyy-MM-dd'); // ISO week start date
    case 'month':
      return format(date, 'yyyy-MM');
  }
}

// ---------------------------------------------------------------------------
// computeDau
// ---------------------------------------------------------------------------

/**
 * Computes DAU series from page_visits records.
 *
 * Returns the count of distinct non-null `user_id` values per calendar day,
 * sorted ascending by date.
 *
 * Requirement 4.3 — DAU count accuracy.
 */
export function computeDau(
  pageVisits: { user_id: string | null; created_at: string }[],
): DauPoint[] {
  // day-key → Set<user_id>
  const dailyUsers = new Map<string, Set<string>>();

  for (const visit of pageVisits) {
    if (visit.user_id === null) continue;

    const day = format(parseISO(visit.created_at), 'yyyy-MM-dd');
    if (!dailyUsers.has(day)) {
      dailyUsers.set(day, new Set());
    }
    dailyUsers.get(day)!.add(visit.user_id);
  }

  return Array.from(dailyUsers.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, users]) => ({ date, dau: users.size }));
}

// ---------------------------------------------------------------------------
// computeRetention
// ---------------------------------------------------------------------------

/**
 * Computes 7-day retention percentage.
 *
 * For each user in the cohort, checks whether they have at least one activity
 * record whose `created_at` falls within the 7-day window starting on their
 * signup date (inclusive start, exclusive day 8).
 *
 * Result = (users_with_activity_in_7_days / cohort_size) * 100
 * Returns 0 when the cohort is empty.
 *
 * Requirement 4.4 — 7-day retention formula.
 */
export function computeRetention(
  cohortSignups: { user_id: string; created_at: string }[],
  activityRecords: { user_id: string; created_at: string }[],
): number {
  const cohortSize = cohortSignups.length;
  if (cohortSize === 0) return 0;

  // Build a lookup: user_id → sorted activity timestamps (epoch ms)
  const activityByUser = new Map<string, number[]>();
  for (const record of activityRecords) {
    const ms = parseISO(record.created_at).getTime();
    if (!activityByUser.has(record.user_id)) {
      activityByUser.set(record.user_id, []);
    }
    activityByUser.get(record.user_id)!.push(ms);
  }

  let retainedCount = 0;

  for (const signup of cohortSignups) {
    const signupDate = parseISO(signup.created_at);
    const windowStart = startOfDay(signupDate);
    const windowEnd = addDays(windowStart, 7); // exclusive: day 8 00:00

    const activities = activityByUser.get(signup.user_id);
    if (!activities) continue;

    const hasActivity = activities.some((ms) =>
      isWithinInterval(ms, { start: windowStart, end: windowEnd }),
    );
    if (hasActivity) retainedCount++;
  }

  const pct = (retainedCount / cohortSize) * 100;
  // Clamp to [0, 100] for safety
  return Math.min(100, Math.max(0, pct));
}

// ---------------------------------------------------------------------------
// topCountries
// ---------------------------------------------------------------------------

/**
 * Returns the top `n` countries by signup count, sorted descending.
 *
 * Null country values are excluded from the result.
 *
 * Requirement 4.6 — top-N countries selection.
 */
export function topCountries(
  signups: { country: string | null }[],
  n: number,
): CountrySignup[] {
  const counts = new Map<string, number>();

  for (const signup of signups) {
    if (signup.country === null) continue;
    counts.set(signup.country, (counts.get(signup.country) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => b.count - a.count || a.country.localeCompare(b.country))
    .slice(0, n);
}
