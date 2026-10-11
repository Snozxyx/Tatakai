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

export interface DauVisit {
  user_id: string | null;
  /** Guest fallback — distinct sessions count as distinct actives when logged out. */
  session_id?: string | null;
  created_at: string;
}

export interface ComputeDauOptions {
  /** Inclusive start day (any time-of-day ok — truncated to day). Zero-fills from here. */
  rangeStart?: Date;
  /** Inclusive end day. Defaults to today when rangeStart is given. */
  rangeEnd?: Date;
}

/**
 * Computes DAU series from page_visits records.
 *
 * An "active" identity per day is:
 * - `user:<user_id>` when logged in, else
 * - `session:<session_id>` for guests (logged-out traffic still counts).
 *
 * Rows with neither are skipped. When `rangeStart` is supplied, every calendar
 * day in [rangeStart, rangeEnd ?? today] is present in the output (zero-filled),
 * so "Today" never disappears from the chart.
 *
 * Requirement 4.3 — DAU count accuracy.
 */
export function computeDau(
  pageVisits: DauVisit[],
  opts?: ComputeDauOptions,
): DauPoint[] {
  // day-key → Set<identity>
  const dailyUsers = new Map<string, Set<string>>();

  for (const visit of pageVisits) {
    const identity = visit.user_id
      ? `u:${visit.user_id}`
      : visit.session_id
        ? `s:${visit.session_id}`
        : null;
    if (!identity) continue;

    let day: string;
    try {
      day = format(parseISO(visit.created_at), 'yyyy-MM-dd');
    } catch {
      continue;
    }
    if (!dailyUsers.has(day)) {
      dailyUsers.set(day, new Set());
    }
    dailyUsers.get(day)!.add(identity);
  }

  // Zero-fill the requested window so the series is continuous.
  if (opts?.rangeStart) {
    const start = startOfDay(opts.rangeStart);
    const end = startOfDay(opts.rangeEnd ?? new Date());
    for (let d = start; !isAfter(d, end); d = addDays(d, 1)) {
      const key = format(d, 'yyyy-MM-dd');
      if (!dailyUsers.has(key)) dailyUsers.set(key, new Set());
    }
  }

  return Array.from(dailyUsers.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, users]) => ({ date, dau: users.size }));
}

/**
 * Counts distinct active identities (logged-in users + guest sessions) in a
 * set of page_visits rows. Used for headline DAU/WAU figures.
 */
export function countDistinctActives(
  pageVisits: DauVisit[],
): { total: number; members: number; guests: number } {
  const total = new Set<string>();
  const members = new Set<string>();
  const guests = new Set<string>();
  for (const visit of pageVisits) {
    if (visit.user_id) {
      total.add(`u:${visit.user_id}`);
      members.add(visit.user_id);
    } else if (visit.session_id) {
      total.add(`s:${visit.session_id}`);
      guests.add(visit.session_id);
    }
  }
  return { total: total.size, members: members.size, guests: guests.size };
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
// country aggregation (traffic-based: page_visits.country by unique session)
// ---------------------------------------------------------------------------

export interface CountryTraffic {
  name: string;
  /** Unique sessions seen from this country. */
  value: number;
}

/**
 * Aggregates page_visits rows into per-country unique-session counts, sorted
 * descending. Null/blank countries are excluded (counted separately by callers
 * as "Unknown" when needed).
 */
export function aggregateCountrySessions(
  visits: { country?: string | null; session_id?: string | null }[],
): CountryTraffic[] {
  const byCountry = new Map<string, Set<string>>();
  const noSessionCount = new Map<string, number>();
  for (const v of visits) {
    const name = (v.country ?? '').trim();
    if (!name) continue;
    if (v.session_id) {
      if (!byCountry.has(name)) byCountry.set(name, new Set());
      byCountry.get(name)!.add(v.session_id);
    } else {
      noSessionCount.set(name, (noSessionCount.get(name) ?? 0) + 1);
    }
  }
  const out: CountryTraffic[] = [];
  for (const [name, sessions] of byCountry) out.push({ name, value: sessions.size });
  for (const [name, n] of noSessionCount) {
    if (!byCountry.has(name)) out.push({ name, value: n });
  }
  return out.sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
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
