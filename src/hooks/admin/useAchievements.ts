import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
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
  { id: 'filler-watcher', get title() { return uiI18n.t('app.filler_watcher_0e1c3113'); }, get description() { return uiI18n.t('app.watch_your_very_first_episode_4b56fb89'); }, rank: 1 },
  { id: 'genin', get title() { return uiI18n.t('app.genin_2413cc6b'); }, get description() { return uiI18n.t('app.watch_5_episodes_the_journey_begins_83941e08'); }, rank: 2 },
  { id: 'chunin', get title() { return uiI18n.t('app.chunin_b4f5c7c2'); }, get description() { return uiI18n.t('app.reach_10_episodes_watched_26030e87'); }, rank: 3 },
  { id: 'week-warrior', get title() { return uiI18n.t('app.jonin_47d17d37'); }, get description() { return uiI18n.t('app.maintain_a_7_day_watch_streak_b15b426b'); }, rank: 4 },
  { id: 'plus-ultra', get title() { return uiI18n.t('app.plus_ultra_6132df1c'); }, get description() { return uiI18n.t('app.watch_35_episodes_go_beyond_f518153d'); }, rank: 5 },
  { id: 'pro-hero', get title() { return uiI18n.t('app.pro_hero_127d94b4'); }, get description() { return uiI18n.t('app.watch_50_episodes_you_re_a_hero_e2077666'); }, rank: 6 },
  { id: 'soul-reaper', get title() { return uiI18n.t('app.soul_reaper_989e2cc9'); }, get description() { return uiI18n.t('app.explore_25_different_anime_series_f8659885'); }, rank: 7 },
  { id: 'bankai', get title() { return uiI18n.t('app.bankai_364abdb8'); }, get description() { return uiI18n.t('app.reach_100_total_episodes_watched_d67ae764'); }, rank: 8 },
  { id: 'survey-corps', get title() { return uiI18n.t('app.survey_corps_facfd0c9'); }, get description() { return uiI18n.t('app.explore_50_different_anime_series_0361332e'); }, rank: 9 },
  { id: 'month-legend', get title() { return uiI18n.t('app.titan_shifter_cba657eb'); }, get description() { return uiI18n.t('app.maintain_a_30_day_watch_streak_c0f24734'); }, rank: 10 },
  { id: 'demon-slayer', get title() { return uiI18n.t('app.demon_slayer_08007ef2'); }, get description() { return uiI18n.t('app.accumulate_5000_watch_minutes_cd286bd7'); }, rank: 11 },
  { id: 'hashira', get title() { return uiI18n.t('app.hashira_c094eb38'); }, get description() { return uiI18n.t('app.watch_600_total_episodes_a_true_pillar_0346bf9b'); }, rank: 12 },
];

export interface UserAchievementRow {
  achievement_id: string;
  granted_at: string | null;
  note: string | null;
}

/** A user's manually-granted achievements. Fail-soft to [] if table absent. */
export function useUserAchievements(userId: string | undefined) {
  useUiTranslation();
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
  useUiTranslation();
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
  useUiTranslation();
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
