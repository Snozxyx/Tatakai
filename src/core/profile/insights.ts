// Pure helper: turns already-computed analytics into short factual observations.
// Every line is threshold-guarded so nothing fabricated ever renders — if the
// data doesn't support a statement, that statement is simply omitted.

import type { LibraryDistribution } from './libraryDistribution';
import type { WatchingHabits } from './watchingHabits';
import type { RatingDistribution } from './ratingStats';
import type { GrowthSeries } from './growthSeries';

export interface InsightContext {
  distribution?: LibraryDistribution;
  habits?: WatchingHabits;
  ratings?: RatingDistribution;
  growth?: GrowthSeries;
  topGenre?: string | null;
  currentStreak?: number;
  longestStreak?: number;
}

export interface Insight {
  id: string;
  text: string;
}

export function deriveInsights(ctx: InsightContext = {}): Insight[] {
  const out: Insight[] = [];
  const { distribution, habits, ratings, growth, topGenre, currentStreak = 0, longestStreak = 0 } = ctx;

  if (topGenre) {
    out.push({ id: 'top-genre', text: `${topGenre} is your most-watched genre.` });
  }

  if (habits?.mostActiveDay && habits.totalEvents >= 5) {
    out.push({ id: 'active-day', text: `Your activity peaks on ${habits.mostActiveDay}s.` });
  }

  if (habits?.peakHourLabel && habits.totalEvents >= 5) {
    out.push({ id: 'peak-hour', text: `You watch most between ${habits.peakHourLabel}.` });
  }

  if (distribution && distribution.animeCounts.completed >= 1) {
    out.push({
      id: 'completed',
      text: `You've completed ${distribution.animeCounts.completed} ${
        distribution.animeCounts.completed === 1 ? 'series' : 'series'
      }.`,
    });
  }

  if (longestStreak >= 3) {
    out.push({ id: 'longest-streak', text: `Your longest watching streak is ${longestStreak} days.` });
  }

  if (currentStreak >= 3) {
    out.push({ id: 'current-streak', text: `You're on a ${currentStreak}-day streak right now.` });
  }

  if (ratings && ratings.total >= 5) {
    out.push({
      id: 'avg-rating',
      text: `You rate titles ${ratings.average.toFixed(1)}/10 on average.`,
    });
  }

  // Month-over-month episode change, only when both months have real activity.
  if (growth && growth.monthly.length >= 2) {
    const last = growth.monthly[growth.monthly.length - 1];
    const prev = growth.monthly[growth.monthly.length - 2];
    if (prev.episodes >= 3 && last.episodes >= 1) {
      const delta = Math.round(((last.episodes - prev.episodes) / prev.episodes) * 100);
      if (Math.abs(delta) >= 15) {
        out.push({
          id: 'month-delta',
          text:
            delta > 0
              ? `You watched ${delta}% more this month than last.`
              : `You watched ${Math.abs(delta)}% less this month than last.`,
        });
      }
    }
  }

  return out;
}
