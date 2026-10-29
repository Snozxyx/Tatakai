import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useUserBadges } from '@/hooks/community/useUserBadges';
import { useFollow } from '@/hooks/community/useFollow';
import { useWatchStreaks } from '@/hooks/user/useWatchStreaks';
import { useProfileWatchTime } from '@/hooks/user/useProfileWatchTime';
import { DEFAULT_CUSTOM_THEME, type CustomProfileTheme } from '@/lib/profileTemplate';
import type { ProfileThemeData, ThemeMediaItem } from '@/components/profile/themes/types';

export function useCustomProfileTheme(userId?: string | null, enabled = true) {
  const { user } = useAuth();
  return useQuery<CustomProfileTheme>({
    queryKey: ['profile-custom-code', user?.id, userId], enabled: !!userId && enabled, staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('profile_custom_code' as never).select('version,theme_name,enabled,html,css').eq('user_id', userId!).maybeSingle();
      if (error) throw error;
      return (data as CustomProfileTheme | null) ?? DEFAULT_CUSTOM_THEME;
    },
  });
}

/** The store preview uses the signed-in owner's actual data, never arbitrary profile JSON. */
export function useCustomThemePreviewData() {
  const { user, profile } = useAuth();
  const badges = useUserBadges(user?.id);
  const follows = useFollow(user?.id);
  const watchTime = useProfileWatchTime(user?.id);
  const { streak } = useWatchStreaks();
  const query = useQuery({ queryKey: ['custom-theme-preview', user?.id], enabled: !!user, staleTime: 60_000,
    queryFn: async () => {
      const results = await Promise.all([
        supabase.from('watchlist').select('id,anime_id,anime_name,anime_poster,status', { count: 'exact' }).eq('user_id', user!.id).limit(12),
        supabase.from('manga_readlist').select('id,manga_id,manga_title,manga_poster,format,status', { count: 'exact' }).eq('user_id', user!.id).or('format.neq.novel,format.is.null').limit(12),
        supabase.from('watch_history').select('id,anime_id,anime_name,anime_poster,episode_number', { count: 'exact' }).eq('user_id', user!.id).order('watched_at', { ascending: false }).limit(12),
        supabase.from('watchlist').select('id', { count: 'exact', head: true }).eq('user_id', user!.id).eq('status', 'completed'),
        supabase.from('manga_readlist').select('id,manga_id,manga_title,manga_poster,format,status', { count: 'exact' }).eq('user_id', user!.id).eq('format', 'novel').limit(12),
      ]);
      for (const result of results) if (result.error) throw result.error;
      return results;
    },
  });
  const [anime, reading, history, completed, novels] = query.data ?? [];
  const animeItems: ThemeMediaItem[] = (anime?.data ?? []).map((item: any) => ({ id: item.id, title: item.anime_name, image: item.anime_poster, href: `/anime/${encodeURIComponent(item.anime_id)}`, detail: item.status }));
  const readingItems: ThemeMediaItem[] = (reading?.data ?? []).map((item: any) => ({ id: item.id, title: item.manga_title, image: item.manga_poster, href: `/${item.format === 'novel' ? 'novel' : 'manga'}/${encodeURIComponent(item.manga_id)}`, status: item.format }));
  const novelItems: ThemeMediaItem[] = (novels?.data ?? []).map((item: any) => ({ id: item.id, title: item.manga_title, image: item.manga_poster, href: `/novel/${encodeURIComponent(item.manga_id)}` }));
  const data: ProfileThemeData = {
    owner: profile ?? { user_id: user?.id ?? '', display_name: 'Your profile' }, isOwner: true,
    canViewLibrary: true, canViewHistory: true, canViewCalendar: true, badges: badges.data ?? [],
    library: animeItems, activity: (history?.data ?? []).map((item: any) => ({ id: item.id, title: item.anime_name, image: item.anime_poster, href: `/anime/${encodeURIComponent(item.anime_id)}`, detail: `Episode ${item.episode_number}` })), favorites: [], links: [],
    stats: { anime: anime?.count ?? 0, manga: reading?.count ?? 0, novels: novels?.count ?? 0, episodes: history?.count ?? 0, hours: Math.floor((watchTime.data ?? 0) / 3600),
      completed: completed?.count ?? 0, streak: streak.currentStreak, longestStreak: streak.longestStreak },
    sections: { watchlist: animeItems, manga: readingItems.filter(item => item.status !== 'novel'), novels: novelItems, readingHistory: [] },
    following: false, followers: follows.followStats?.followers ?? 0, followPending: false, onFollow: () => {}, loading: query.isLoading, error: query.isError,
  };
  return { data, followingCount: follows.followStats?.following ?? 0, isLoading: query.isLoading, isError: query.isError };
}
