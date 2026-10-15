import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface TrackedShow {
  id: string;
  user_id: string;
  anime_id: string;
  anilist_id: number | null;
  title: string | null;
  image_url: string | null;
  created_at: string;
}

/** The shows a user has pinned to their Tatakai Calendar, newest first. */
export function useTrackedShows() {
  useUiTranslation();
  const { user } = useAuth();

  return useQuery<TrackedShow[]>({
    queryKey: ['tracked-shows', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await (supabase
        .from('tracked_shows' as any)
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }) as any);
      if (error) throw error;
      return (data ?? []) as TrackedShow[];
    },
    enabled: !!user,
  });
}

/**
 * The tracked shows of *another* user, for their public profile calendar. Reads
 * are allowed by the "Public can read calendar of public profiles" RLS policy
 * (20260922170000) only when that user's profile is public and show_calendar is
 * on; the query is disabled unless both flags are passed true, so we never fire a
 * request that RLS will just filter to zero rows.
 */
export function usePublicTrackedShows(
  userId: string | undefined,
  isPublic: boolean,
  showCalendar: boolean = true,
) {
  useUiTranslation();
  return useQuery<TrackedShow[]>({
    queryKey: ['public-tracked-shows', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await (supabase
        .from('tracked_shows' as any)
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false }) as any);
      if (error) throw error;
      return (data ?? []) as TrackedShow[];
    },
    enabled: !!userId && isPublic && showCalendar,
  });
}

/**
 * Pin/unpin a show identified by its AniList id — used by the calendar's
 * right-click "Add to calendar", where only the AniList id is known (not the
 * internal Tatakai anime id). Keyed on `anilist_id` so it can't duplicate a row
 * added from the anime page, and stores a synthetic `anime_id` for the UNIQUE.
 */
export function useToggleTrackedShowByAnilist() {
  useUiTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      anilistId,
      title,
      imageUrl,
      tracked,
    }: {
      anilistId: number;
      title?: string | null;
      imageUrl?: string | null;
      tracked: boolean;
    }) => {
      if (!user) throw new Error(uiI18n.t('app.sign_in_to_track_shows_17e52289'));
      if (tracked) {
        const { error } = await (supabase
          .from('tracked_shows' as any)
          .delete()
          .eq('user_id', user.id)
          .eq('anilist_id', anilistId) as any);
        if (error) throw error;
        return false;
      }
      const { error } = await (supabase.from('tracked_shows' as any).insert({
        user_id: user.id,
        anime_id: `anilist:${anilistId}`,
        anilist_id: anilistId,
        title: title ?? null,
        image_url: imageUrl ?? null,
      }) as any);
      if (error) throw error;
      return true;
    },
    onSuccess: (nowTracked) => {
      queryClient.invalidateQueries({ queryKey: ['tracked-shows'] });
      toast.success(nowTracked ? uiI18n.t('app.added_to_your_calendar_68b0044b') : uiI18n.t('app.removed_from_your_calendar_46801188'));
    },
    onError: (error: Error) => {
      toast.error(error.message || uiI18n.t('app.failed_to_update_calendar_20622e7d'));
    },
  });
}

/** Pin/unpin a single show for the calendar. */
export function useToggleTrackedShow() {
  useUiTranslation();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      animeId,
      anilistId,
      title,
      imageUrl,
      tracked,
    }: {
      animeId: string;
      anilistId?: number | null;
      title?: string | null;
      imageUrl?: string | null;
      tracked: boolean;
    }) => {
      if (!user) throw new Error(uiI18n.t('app.sign_in_to_track_shows_17e52289'));
      if (tracked) {
        const { error } = await (supabase
          .from('tracked_shows' as any)
          .delete()
          .eq('user_id', user.id)
          .eq('anime_id', animeId) as any);
        if (error) throw error;
        return false;
      }
      const { error } = await (supabase.from('tracked_shows' as any).insert({
        user_id: user.id,
        anime_id: animeId,
        anilist_id: anilistId ?? null,
        title: title ?? null,
        image_url: imageUrl ?? null,
      }) as any);
      if (error) throw error;
      return true;
    },
    onSuccess: (nowTracked) => {
      queryClient.invalidateQueries({ queryKey: ['tracked-shows'] });
      toast.success(nowTracked ? uiI18n.t('app.added_to_your_calendar_68b0044b') : uiI18n.t('app.removed_from_your_calendar_46801188'));
    },
    onError: (error: Error) => {
      toast.error(error.message || uiI18n.t('app.failed_to_update_calendar_20622e7d'));
    },
  });
}
