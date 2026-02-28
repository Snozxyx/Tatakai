import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useWatchHistory } from '@/hooks/useWatchHistory';
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

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function useWatchStreaks() {
  const { data: history = [] } = useWatchHistory();
  const { profile } = useAuth();

  // Manual admin grants
  const { data: manualGrants = [] } = useQuery({
    queryKey: ['user_achievements', profile?.user_id],
    enabled: !!profile?.user_id,
    queryFn: async () => {
      const { data, error } = await (supabase
        .from('user_achievements' as any)
        .select('achievement_id')
        .eq('user_id', profile!.user_id)) as any;
      if (error) return [];
      return (data ?? []).map((r: any) => r.achievement_id as string);
    },
  });

  const manualSet = useMemo(() => new Set(manualGrants), [manualGrants]);

  const streak = useMemo((): WatchStreak => {
    if (!history.length) {
      return { currentStreak: 0, longestStreak: 0, lastWatchDate: null, totalDaysWatched: 0, isActiveToday: false };
    }

    // Get unique days
    const days = [...new Set(history.map(h => dayKey(new Date(h.watched_at))))].sort();
    const totalDaysWatched = days.length;
    const today = dayKey(new Date());
    const yesterday = dayKey(new Date(Date.now() - 86400000));
    const isActiveToday = days.includes(today);
    const lastWatchDate = days[days.length - 1];

    // Calculate current streak
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

    // If not active today or yesterday, streak is 0
    if (!isActiveToday && lastWatchDate !== yesterday) {
      currentStreak = 0;
    }

    // Calculate longest streak
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
  }, [history]);

  const achievements = useMemo((): WatchAchievement[] => {
    const totalEpisodes = history.length;
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
  }, [history, streak, manualSet]);

  const stats = useMemo(() => {
    const totalEpisodes = history.length;
    const completedEpisodes = history.filter(h => h.completed).length;
    const uniqueAnime = new Set(history.map(h => h.anime_id)).size;
    const totalMinutes = history.reduce((sum, h) => sum + Math.floor((h.duration_seconds || 0) / 60), 0);
    const totalHours = Math.floor(totalMinutes / 60);

    return { totalEpisodes, completedEpisodes, uniqueAnime, totalMinutes, totalHours };
  }, [history]);

  return { streak, achievements, stats };
}
