import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { updateMalAnimeStatus } from '@/lib/mal';
import { updateAniListAnimeStatus, mapTatakaiStatusToAniList, disconnectAniList } from '@/lib/externalIntegrations';

export type WatchlistStatus = 'watching' | 'completed' | 'plan_to_watch' | 'dropped' | 'on_hold';

interface WatchlistItem {
  id: string;
  user_id: string;
  anime_id: string;
  anime_name: string;
  anime_poster: string | null;
  status: WatchlistStatus;
  created_at: string;
  updated_at: string;
}

export function useWatchlist() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['watchlist', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('watchlist')
        .select('*')
        .eq('user_id', user!.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return data as WatchlistItem[];
    },
    enabled: !!user,
  });
}

export function useWatchlistItem(animeId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['watchlist', user?.id, animeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('watchlist')
        .select('*')
        .eq('user_id', user!.id)
        .eq('anime_id', animeId!)
        .maybeSingle();

      if (error) throw error;
      return data as WatchlistItem | null;
    },
    enabled: !!user && !!animeId,
  });
}

export function useAddToWatchlist() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  return useMutation({
    mutationFn: async ({
      animeId,
      animeName,
      animePoster,
      status = 'plan_to_watch',
      malId,
      anilistId
    }: {
      animeId: string;
      animeName: string;
      animePoster?: string;
      status?: WatchlistStatus;
      malId?: number | null;
      anilistId?: number | null;
    }) => {
      // Ensure numeric IDs are actually numbers (not NaN or strings)
      const cleanMalId = malId ? Number(malId) : null;
      const cleanAnilistId = anilistId ? Number(anilistId) : null;

      const upsertData: any = {
        user_id: user!.id,
        anime_id: animeId,
        anime_name: animeName,
        anime_poster: animePoster,
        status,
        updated_at: new Date().toISOString()
      };

      if (!isNaN(cleanMalId as number) && cleanMalId !== null) upsertData.mal_id = cleanMalId;
      if (!isNaN(cleanAnilistId as number) && cleanAnilistId !== null) upsertData.anilist_id = cleanAnilistId;

      console.log('[useWatchlist] Upserting to watchlist:', upsertData);

      const { data, error } = await supabase
        .from('watchlist')
        .upsert(upsertData, { onConflict: 'user_id,anime_id' })
        .select()
        .single();

      if (error) {
        console.error('[useWatchlist] Supabase error adding to watchlist:', error);
        throw error;
      }
      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      toast.success('Updated watchlist');

      // Auto-sync to MAL if linked
      if (profile?.mal_access_token) {
        console.log('[useWatchlist] Automatic MAL sync starting for animeId:', variables.animeId);
        updateMalAnimeStatus(variables.animeId, variables.status || 'plan_to_watch')
          .then(() => console.log('[useWatchlist] Automatic MAL sync successful'))
          .catch(err => console.warn('[useWatchlist] Automatic MAL sync background fail:', err));
      }

      // Auto-sync to AniList if linked
      if (profile?.anilist_access_token) {
        // We need an AniList ID. If we don't have one in variables, we check the query cache or the response
        const targetAnilistId = variables.anilistId || data?.anilist_id;

        if (targetAnilistId) {
          console.log('[useWatchlist] Automatic AniList sync starting for:', targetAnilistId);
          const aniStatus = mapTatakaiStatusToAniList(variables.status || 'plan_to_watch');

          updateAniListAnimeStatus(profile.anilist_access_token, Number(targetAnilistId), aniStatus)
            .then(() => console.log('[useWatchlist] Automatic AniList sync successful'))
            .catch(err => console.warn('[useWatchlist] Automatic AniList sync failed:', err));
        } else {
          console.warn('[useWatchlist] Skipping AniList sync: No AniList ID available for this item');
        }
      }
    },
    onError: (error: any) => {
      console.error('[useWatchlist] Mutation failed:', error);
      toast.error(`Failed to update watchlist: ${error?.message || 'Unknown error'}`);
    },
  });
}

export function useRemoveFromWatchlist() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (animeId: string) => {
      const { error } = await supabase
        .from('watchlist')
        .delete()
        .eq('user_id', user!.id)
        .eq('anime_id', animeId);

      if (error) throw error;
    },
    onSuccess: (_, animeId) => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });
      // Explicitly invalidate the specific item query as well
      queryClient.invalidateQueries({ queryKey: ['watchlist', user?.id, animeId] });

      // Sync removal to MAL if linked AND auto-delete is enabled (Dangerous feature)
      if (profile?.mal_access_token && profile?.mal_auto_delete) {
        import('@/lib/mal').then(({ deleteMalAnimeStatus }) => {
          deleteMalAnimeStatus(animeId).catch(err => console.error('[Watchlist] MAL removal failed:', err));
        });
      }

      toast.success('Removed from watchlist');
    },
    onError: () => {
      toast.error('Failed to remove from watchlist');
    },
  });
}

// Bulk remove multiple anime ids from watchlist (used for multi-select delete)
export function useBulkRemoveFromWatchlist() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (animeIds: string[]) => {
      if (!animeIds || animeIds.length === 0) return;
      const { error } = await supabase
        .from('watchlist')
        .delete()
        .in('anime_id', animeIds);
      if (error) throw error;
    },
    onSuccess: (_, animeIds) => {
      queryClient.invalidateQueries({ queryKey: ['watchlist'] });

      // Sync removal to MAL if linked AND auto-delete is enabled
      if (profile?.mal_access_token && profile?.mal_auto_delete) {
        import('@/lib/mal').then(({ deleteMalAnimeStatus }) => {
          animeIds.forEach(id => {
            deleteMalAnimeStatus(id).catch(err => console.error(`[Watchlist] Bulk MAL removal failed for ${id}:`, err));
          });
        });
      }

      toast.success('Removed items from watchlist');
    },
    onError: (error: any) => {
      toast.error(`Failed to remove: ${error?.message || String(error)}`);
    },
  });
}
