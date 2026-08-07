/**
 * Community leaderboard hooks
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type LeaderboardType = 'watched' | 'rated' | 'comments' | 'active' | 'followers' | 'streak';

export interface LeaderboardEntry {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  score: number;
  rank: number;
  total_episodes?: number;
  metadata?: Record<string, any>;
}

/**
 * Get leaderboard data
 */
export function useLeaderboard(
  type: LeaderboardType = 'watched',
  limit = 50
) {
  return useQuery({
    queryKey: ['leaderboard', type, limit],
    queryFn: async (): Promise<LeaderboardEntry[]> => {
      let query: any;

      switch (type) {
        case 'watched':
          // Most anime watched (completed)
          query = supabase
            .from('watch_history')
            .select('user_id')
            .eq('completed', true)
            .limit(10000); // Get all to count
          break;

        case 'rated':
          // Most ratings given
          query = supabase
            .from('ratings')
            .select('user_id')
            .limit(10000);
          break;

        case 'comments':
          // Most comments posted
          query = supabase
            .from('comments')
            .select('user_id')
            .limit(10000);
          break;

        case 'active':
          // Most active (combination of watched, rated, commented)
          query = supabase.rpc('get_leaderboard_active', { p_limit: limit });
          break;

        case 'followers':
          // Most followers
          query = supabase
            .from('user_follows')
            .select('following_id')
            .limit(10000);
          break;

        case 'streak':
          // Longest watch streak – fetch all watch_history dates per user
          return await getStreakLeaderboard(limit);

        default:
          throw new Error(`Unknown leaderboard type: ${type}`);
      }

      const { data, error } = await query;

      if (error) {
        // Fallback for active if RPC doesn't exist
        if (type === 'active' && error.code === '42883') {
          return getActiveLeaderboardFallback(limit);
        }
        throw error;
      }

      // If active RPC worked, it already has profiles and scores
      if (type === 'active') {
        return (data || []).map((item: any, index: number) => ({
          ...item,
          rank: index + 1,
        }));
      }

      // Count occurrences
      const counts = new Map<string, number>();
      (data || []).forEach((item: any) => {
        const userId = item.user_id || item.following_id;
        if (!userId) return;
        counts.set(userId, (counts.get(userId) || 0) + 1);
      });

      // Get top user IDs
      const topEntries = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit);

      const topUserIds = topEntries.map(([userId]) => userId);

      if (topUserIds.length === 0) return [];

      // Fetch profiles for these users
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('user_id, display_name, username, avatar_url')
        .in('user_id', topUserIds);

      if (profileError) throw profileError;

      const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || []);

      // Convert to leaderboard entries
      return topEntries.map(([userId, count], index) => {
        const profile = profileMap.get(userId);
        return {
          user_id: userId,
          display_name: profile?.display_name || null,
          username: profile?.username || null,
          avatar_url: profile?.avatar_url || null,
          score: count,
          rank: index + 1,
        };
      });
    },
    staleTime: 300000, // 5 minutes cache
  });
}

/**
 * Compute streak leaderboard from watch_history
 */
async function getStreakLeaderboard(limit: number): Promise<LeaderboardEntry[]> {
  // Fetch distinct (user_id, date) pairs
  const { data, error } = await supabase
    .from('watch_history')
    .select('user_id, watched_at')
    .order('watched_at', { ascending: true })
    .limit(100000);

  if (error) throw error;

  // Group by user
  const byUser = new Map<string, Set<string>>();
  (data || []).forEach((item: any) => {
    const uid = item.user_id;
    if (!uid) return;
    if (!byUser.has(uid)) byUser.set(uid, new Set());
    const day = new Date(item.watched_at).toISOString().slice(0, 10);
    byUser.get(uid)!.add(day);
  });

  // Compute longest streak per user
  const userStreaks: { userId: string; streak: number }[] = [];
  byUser.forEach((days, userId) => {
    const sorted = [...days].sort();
    let longest = 1, temp = 1;
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1]);
      prev.setDate(prev.getDate() + 1);
      if (prev.toISOString().slice(0, 10) === sorted[i]) {
        temp++;
        if (temp > longest) longest = temp;
      } else {
        temp = 1;
      }
    }
    userStreaks.push({ userId, streak: sorted.length === 1 ? 1 : longest });
  });

  const top = userStreaks.sort((a, b) => b.streak - a.streak).slice(0, limit);
  const topIds = top.map(u => u.userId);
  if (topIds.length === 0) return [];

  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('user_id, display_name, username, avatar_url')
    .in('user_id', topIds);
  if (pErr) throw pErr;

  const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));

  return top.map(({ userId, streak }, idx) => {
    const profile = profileMap.get(userId) as any;
    return {
      user_id: userId,
      display_name: profile?.display_name ?? null,
      username: profile?.username ?? null,
      avatar_url: profile?.avatar_url ?? null,
      score: streak,
      rank: idx + 1,
    };
  });
}

/**
 * Fallback for active leaderboard if RPC doesn't exist
 */
async function getActiveLeaderboardFallback(limit: number): Promise<LeaderboardEntry[]> {
  // Get counts from multiple sources
  const [watchedData, ratedData, commentsData] = await Promise.all([
    supabase
      .from('watch_history')
      .select('user_id')
      .eq('completed', true),
    supabase
      .from('ratings')
      .select('user_id'),
    supabase
      .from('comments')
      .select('user_id'),
  ]);

  const scores = new Map<string, number>();

  // Combine scores (weighted)
  (watchedData.data || []).forEach((item) => {
    scores.set(item.user_id, (scores.get(item.user_id) || 0) + 3);
  });

  (ratedData.data || []).forEach((item) => {
    scores.set(item.user_id, (scores.get(item.user_id) || 0) + 2);
  });

  (commentsData.data || []).forEach((item) => {
    scores.set(item.user_id, (scores.get(item.user_id) || 0) + 1);
  });

  // Get profiles for top users
  const topUserIds = Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([userId]) => userId);

  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id, display_name, username, avatar_url')
    .in('user_id', topUserIds);

  const profileMap = new Map(profiles?.map((p) => [p.user_id, p]) || []);

  return topUserIds.map((userId, index) => ({
    user_id: userId,
    display_name: profileMap.get(userId)?.display_name || null,
    username: profileMap.get(userId)?.username || null,
    avatar_url: profileMap.get(userId)?.avatar_url || null,
    score: scores.get(userId) || 0,
    rank: index + 1,
  }));
}

/**
 * Get current user's rank
 */
export function useUserRank(type: LeaderboardType = 'watched', userId?: string) {
  const { data: leaderboard } = useLeaderboard(type, 1000);

  return useQuery({
    queryKey: ['user_rank', type, userId],
    queryFn: () => {
      if (!userId || !leaderboard) return null;

      const userEntry = leaderboard.find((entry) => entry.user_id === userId);
      return userEntry
        ? {
          rank: userEntry.rank,
          score: userEntry.score,
          totalUsers: leaderboard.length,
        }
        : null;
    },
    enabled: !!userId && !!leaderboard,
  });
}
