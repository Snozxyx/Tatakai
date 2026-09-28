import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useWatchHistory } from '@/hooks/user/useWatchHistory';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface WatchStreak {
  currentStreak: number;
  longestStreak: number;
  lastWatchDate: string | null;
  totalDaysWatched: number;
  isActiveToday: boolean;
}

export interface WatchAchievement {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
  progress?: number;
  total?: number;
  color: string;
}

/** Minimal shape the streak/achievement math needs from a watch_history row. */
export interface StreakHistoryRow {
  anime_id: string;
  watched_at: string;
  duration_seconds?: number | null;
  completed?: boolean | null;
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Pure streak computation from watch_history rows. Shared by the auth-user hook
 * and the public (viewed-user) hook so both derive streaks identically.
 */
export function computeStreak(history: StreakHistoryRow[]): WatchStreak {
  if (!history.length) {
    return { currentStreak: 0, longestStreak: 0, lastWatchDate: null, totalDaysWatched: 0, isActiveToday: false };
  }

  const days = [...new Set(history.map(h => dayKey(new Date(h.watched_at))))].sort();
  const totalDaysWatched = days.length;
  const today = dayKey(new Date());
  const yesterday = dayKey(new Date(Date.now() - 86400000));
  const isActiveToday = days.includes(today);
  const lastWatchDate = days[days.length - 1];

  let currentStreak = 0;
  let checkDay = isActiveToday ? today : yesterday;
  for (let i = days.length - 1; i >= 0; i--) {
    if (days[i] === checkDay) {
      currentStreak++;
      const prev = new Date(checkDay);
      prev.setDate(prev.getDate() - 1);
      checkDay = dayKey(prev);
    } else if (days[i] < checkDay) {
      break;
    }
  }

  if (!isActiveToday && lastWatchDate !== yesterday) {
    currentStreak = 0;
  }

  let longestStreak = 1;
  let tempStreak = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = new Date(days[i - 1]);
    prev.setDate(prev.getDate() + 1);
    if (dayKey(prev) === days[i]) {
      tempStreak++;
      longestStreak = Math.max(longestStreak, tempStreak);
    } else {
      tempStreak = 1;
    }
  }

  return { currentStreak, longestStreak, lastWatchDate, totalDaysWatched, isActiveToday };
}

/**
 * Pure achievement computation. `totalEpisodesOverride` lets callers pass an
 * accurate episode count (e.g. an exact COUNT for a viewed user) when the row
 * set handed in is capped for payload reasons.
 */
export function computeAchievements(
  history: StreakHistoryRow[],
  streak: WatchStreak,
  manualSet: Set<string>,
  totalEpisodesOverride?: number,
): WatchAchievement[] {
  const totalEpisodes = totalEpisodesOverride ?? history.length;
  const uniqueAnime = new Set(history.map(h => h.anime_id)).size;
  const totalMinutes = history.reduce((sum, h) => sum + Math.floor((h.duration_seconds || 0) / 60), 0);

  return [
    {
      id: 'filler-watcher',
      title: 'Filler Watcher',
      description: 'Watch your very first episode',
      unlocked: totalEpisodes >= 1 || manualSet.has('filler-watcher'),
      color: 'text-gray-400',
    },
    {
      id: 'genin',
      title: 'Genin',
      description: 'Watch 5 episodes — the journey begins',
      unlocked: totalEpisodes >= 5 || manualSet.has('genin'),
      progress: Math.min(totalEpisodes, 5),
      total: 5,
      color: 'text-gray-300',
    },
    {
      id: 'chunin',
      title: 'Chunin',
      description: 'Reach 10 episodes watched',
      unlocked: totalEpisodes >= 10 || manualSet.has('chunin'),
      progress: Math.min(totalEpisodes, 10),
      total: 10,
      color: 'text-green-400',
    },
    {
      id: 'week-warrior',
      title: 'Jonin',
      description: 'Maintain a 7-day watch streak',
      unlocked: streak.longestStreak >= 7 || manualSet.has('week-warrior'),
      progress: Math.min(streak.longestStreak, 7),
      total: 7,
      color: 'text-green-500',
    },
    {
      id: 'plus-ultra',
      title: 'Plus Ultra',
      description: 'Watch 35 episodes — go beyond!',
      unlocked: totalEpisodes >= 35 || manualSet.has('plus-ultra'),
      progress: Math.min(totalEpisodes, 35),
      total: 35,
      color: 'text-teal-400',
    },
    {
      id: 'pro-hero',
      title: 'Pro Hero',
      description: 'Watch 50 episodes — you\'re a hero',
      unlocked: totalEpisodes >= 50 || manualSet.has('pro-hero'),
      progress: Math.min(totalEpisodes, 50),
      total: 50,
      color: 'text-cyan-400',
    },
    {
      id: 'soul-reaper',
      title: 'Soul Reaper',
      description: 'Explore 25 different anime series',
      unlocked: uniqueAnime >= 25 || manualSet.has('soul-reaper'),
      progress: Math.min(uniqueAnime, 25),
      total: 25,
      color: 'text-blue-400',
    },
    {
      id: 'bankai',
      title: 'Bankai',
      description: 'Reach 100 total episodes watched',
      unlocked: totalEpisodes >= 100 || manualSet.has('bankai'),
      progress: Math.min(totalEpisodes, 100),
      total: 100,
      color: 'text-blue-500',
    },
    {
      id: 'survey-corps',
      title: 'Survey Corps',
      description: 'Explore 50 different anime series',
      unlocked: uniqueAnime >= 50 || manualSet.has('survey-corps'),
      progress: Math.min(uniqueAnime, 50),
      total: 50,
      color: 'text-indigo-400',
    },
    {
      id: 'month-legend',
      title: 'Titan Shifter',
      description: 'Maintain a 30-day watch streak',
      unlocked: streak.longestStreak >= 30 || manualSet.has('month-legend'),
      progress: Math.min(streak.longestStreak, 30),
      total: 30,
      color: 'text-purple-400',
    },
    {
      id: 'demon-slayer',
      title: 'Demon Slayer',
      description: 'Accumulate 5000+ watch minutes',
      unlocked: totalMinutes >= 5000 || manualSet.has('demon-slayer'),
      progress: Math.min(totalMinutes, 5000),
      total: 5000,
      color: 'text-purple-500',
    },
    {
      id: 'hashira',
      title: 'Hashira',
      description: 'Watch 600 total episodes — a true Pillar',
      unlocked: totalEpisodes >= 600 || manualSet.has('hashira'),
      progress: Math.min(totalEpisodes, 600),
      total: 600,
      color: 'text-pink-400',
    },
  ];
}

/** Aggregate stats derived from watch_history rows. */
export function computeStats(history: StreakHistoryRow[], totalEpisodesOverride?: number) {
  const totalEpisodes = totalEpisodesOverride ?? history.length;
  const completedEpisodes = history.filter(h => h.completed).length;
  const uniqueAnime = new Set(history.map(h => h.anime_id)).size;
  const totalMinutes = history.reduce((sum, h) => sum + Math.floor((h.duration_seconds || 0) / 60), 0);
  const totalHours = Math.floor(totalMinutes / 60);

  return { totalEpisodes, completedEpisodes, uniqueAnime, totalMinutes, totalHours };
}

async function fetchManualGrants(userId: string): Promise<string[]> {
  const { data, error } = (await supabase
    .from('user_achievements' as any)
    .select('achievement_id')
    .eq('user_id', userId)) as any;
  if (error) return [];
  return (data ?? []).map((r: any) => r.achievement_id as string);
}

/** Streaks/achievements for the signed-in user. */
export function useWatchStreaks() {
  const { data: history = [] } = useWatchHistory();
  const { profile } = useAuth();

  // Manual admin grants
  const { data: manualGrants = [] } = useQuery({
    queryKey: ['user_achievements', profile?.user_id],
    enabled: !!profile?.user_id,
    queryFn: () => fetchManualGrants(profile!.user_id),
  });

  const manualSet = useMemo(() => new Set(manualGrants), [manualGrants]);
  const streak = useMemo(() => computeStreak(history), [history]);
  const achievements = useMemo(
    () => computeAchievements(history, streak, manualSet),
    [history, streak, manualSet],
  );
  const stats = useMemo(() => computeStats(history), [history]);

  return { streak, achievements, stats };
}

/**
 * Streaks/achievements for a *viewed* (public) user. Fixes the bug where another
 * user's rank/achievement grid showed everything locked because the auth-user
 * hook was used regardless of whose profile was open. Gated on the viewed
 * profile being public + history visible.
 *
 * Fetches an exact episode COUNT (not capped) for the episode-threshold
 * achievements, plus a bounded row set for streak / unique-anime / minutes.
 */
export function usePublicWatchStreaks(userId?: string, isPublic = false, showHistory = true) {
  const enabled = !!userId && isPublic && showHistory;

  const { data: history = [] } = useQuery({
    queryKey: ['public_watch_streaks_rows', userId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('watch_history')
        .select('anime_id, watched_at, duration_seconds, completed')
        .eq('user_id', userId!)
        .order('watched_at', { ascending: false })
        .limit(2000);
      if (error) return [] as StreakHistoryRow[];
      return (data ?? []) as StreakHistoryRow[];
    },
  });

  const { data: totalEpisodes = 0 } = useQuery({
    queryKey: ['public_watch_streaks_count', userId],
    enabled,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('watch_history')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId!);
      if (error) return 0;
      return count ?? 0;
    },
  });

  const { data: manualGrants = [] } = useQuery({
    queryKey: ['user_achievements', userId],
    enabled,
    queryFn: () => fetchManualGrants(userId!),
  });

  const manualSet = useMemo(() => new Set(manualGrants), [manualGrants]);
  const streak = useMemo(() => computeStreak(history), [history]);
  const achievements = useMemo(
    () => computeAchievements(history, streak, manualSet, totalEpisodes),
    [history, streak, manualSet, totalEpisodes],
  );
  const stats = useMemo(() => computeStats(history, totalEpisodes), [history, totalEpisodes]);

  return { streak, achievements, stats };
}
