import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Manual-achievement ("badge") catalog + grant/revoke bindings, extracted from
 * AchievementManager so both the manager panel and the /admin/user/:id Badges
 * tab share one source of truth. "Tags" in the admin console == these badges.
 *
 * user_achievements rows are { user_id, achievement_id, granted_by, note }.
 * Some achievements are auto-unlocked from watch stats (see AchievementManager's
 * computeAutoUnlocked); those live nowhere until an admin force-grants them.
 */
export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  rank: number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'filler-watcher', title: 'Filler Watcher', description: 'Watch your very first episode', rank: 1 },
  { id: 'genin', title: 'Genin', description: 'Watch 5 episodes — the journey begins', rank: 2 },
  { id: 'chunin', title: 'Chunin', description: 'Reach 10 episodes watched', rank: 3 },
  { id: 'week-warrior', title: 'Jonin', description: 'Maintain a 7-day watch streak', rank: 4 },
  { id: 'plus-ultra', title: 'Plus Ultra', description: 'Watch 35 episodes — go beyond!', rank: 5 },
  { id: 'pro-hero', title: 'Pro Hero', description: "Watch 50 episodes — you're a hero", rank: 6 },
  { id: 'soul-reaper', title: 'Soul Reaper', description: 'Explore 25 different anime series', rank: 7 },
  { id: 'bankai', title: 'Bankai', description: 'Reach 100 total episodes watched', rank: 8 },
  { id: 'survey-corps', title: 'Survey Corps', description: 'Explore 50 different anime series', rank: 9 },
  { id: 'month-legend', title: 'Titan Shifter', description: 'Maintain a 30-day watch streak', rank: 10 },
  { id: 'demon-slayer', title: 'Demon Slayer', description: 'Accumulate 5000+ watch minutes', rank: 11 },
  { id: 'hashira', title: 'Hashira', description: 'Watch 600 total episodes — a true Pillar', rank: 12 },
];

export interface UserAchievementRow {
  achievement_id: string;
  granted_at: string | null;
  note: string | null;
}

/** A user's manually-granted achievements. Fail-soft to [] if table absent. */
export function useUserAchievements(userId: string | undefined) {
  return useQuery({
    queryKey: ['admin_user_achievements', userId],
    enabled: !!userId,
    queryFn: async (): Promise<UserAchievementRow[]> => {
      const { data, error } = await (supabase as any)
        .from('user_achievements')
        .select('achievement_id, granted_at, note')
        .eq('user_id', userId as string);
      if (error) return [];
      return (data ?? []) as UserAchievementRow[];
    },
  });
}

/** Grant (upsert) one achievement to a user, actor = current admin. */
export function useGrantAchievement() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (args: { userId: string; achievementId: string; note?: string | null }) => {
      const { error } = await supabase.from('user_achievements' as any).upsert({
        user_id: args.userId,
        achievement_id: args.achievementId,
        granted_by: profile?.user_id ?? null,
        note: args.note?.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: (_r, args) => {
      queryClient.invalidateQueries({ queryKey: ['admin_user_achievements', args.userId] });
      queryClient.invalidateQueries({ queryKey: ['user_achievements', args.userId] });
    },
  });
}

/** Revoke a manually-granted achievement from a user. */
export function useRevokeAchievement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (args: { userId: string; achievementId: string }) => {
      const { error } = await (supabase as any)
        .from('user_achievements')
        .delete()
        .eq('user_id', args.userId)
        .eq('achievement_id', args.achievementId);
      if (error) throw error;
    },
    onSuccess: (_r, args) => {
      queryClient.invalidateQueries({ queryKey: ['admin_user_achievements', args.userId] });
      queryClient.invalidateQueries({ queryKey: ['user_achievements', args.userId] });
    },
  });
}
