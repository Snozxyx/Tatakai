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
      queryClient.invalidateQueries({ queryKey: ['external-ids', variables.animeId] }); // Refresh external IDs cache
      toast.success('Updated watchlist');

      console.log('[Watchlist Sync] ===== SYNC DEBUG START =====');
      console.log('[Watchlist Sync] Anime:', variables.animeName);
      console.log('[Watchlist Sync] Anime ID:', variables.animeId);
      console.log('[Watchlist Sync] Status:', variables.status);
      console.log('[Watchlist Sync] Provided MAL ID:', variables.malId);
      console.log('[Watchlist Sync] Provided AniList ID:', variables.anilistId);
      console.log('[Watchlist Sync] DB Response mal_id:', data?.mal_id);
      console.log('[Watchlist Sync] DB Response anilist_id:', data?.anilist_id);
      console.log('[Watchlist Sync] MAL Token exists:', !!profile?.mal_access_token);
      console.log('[Watchlist Sync] AniList Token exists:', !!profile?.anilist_access_token);

      // Auto-sync to MAL if linked
      if (profile?.mal_access_token) {
        // Use malId from variables first, then from DB response
        const targetMalId = variables.malId || data?.mal_id;
        
        if (targetMalId) {
          console.log('[Watchlist Sync] ✓ Starting MAL sync with MAL ID:', targetMalId);
          updateMalAnimeStatus(targetMalId, variables.status || 'plan_to_watch')
            .then(() => {
              console.log('[Watchlist Sync] ✓ MAL sync SUCCESSFUL for MAL ID:', targetMalId);
              toast.success('Synced to MyAnimeList');
            })
            .catch(err => {
              console.error('[Watchlist Sync] ✗ MAL sync FAILED:', err);
              toast.error('Failed to sync to MyAnimeList');
            });
        } else {
          console.warn('[Watchlist Sync] ✗ Skipping MAL sync: No MAL ID available, falling back to animeId');
          // Fallback to animeId - the updateMalAnimeStatus will try to resolve it
          updateMalAnimeStatus(variables.animeId, variables.status || 'plan_to_watch')
            .then(() => console.log('[Watchlist Sync] ✓ MAL sync (via fallback) SUCCESSFUL'))
            .catch(err => console.warn('[Watchlist Sync] ✗ MAL sync (via fallback) FAILED:', err));
        }
      } else {
        console.log('[Watchlist Sync] - MAL not linked, skipping sync');
      }

      // Auto-sync to AniList if linked
      if (profile?.anilist_access_token) {
        // Use anilistId from variables first, then from DB response
        const targetAnilistId = variables.anilistId || data?.anilist_id;

        if (targetAnilistId) {
          console.log('[Watchlist Sync] ✓ Starting AniList sync with AniList ID:', targetAnilistId);
          const aniStatus = mapTatakaiStatusToAniList(variables.status || 'plan_to_watch');
          console.log('[Watchlist Sync] AniList status mapped to:', aniStatus);

          updateAniListAnimeStatus(profile.anilist_access_token, Number(targetAnilistId), aniStatus)
            .then(() => {
              console.log('[Watchlist Sync] ✓ AniList sync SUCCESSFUL for AniList ID:', targetAnilistId);
              toast.success('Synced to AniList');
            })
            .catch(err => {
              console.error('[Watchlist Sync] ✗ AniList sync FAILED:', err);
              toast.error('Failed to sync to AniList');
            });
        } else {
          console.warn('[Watchlist Sync] ✗ Skipping AniList sync: No AniList ID available');
        }
      } else {
        console.log('[Watchlist Sync] - AniList not linked, skipping sync');
      }
      
      console.log('[Watchlist Sync] ===== SYNC DEBUG END =====');
    },
    onError: (error: any) => {
      console.error('[useWatchlist] Mutation failed:', error);
      toast.error(`Failed to update watchlist: ${error?.message || 'Unknown error'}`);
    },
  });
}

export function useRemoveFromWatchlist() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

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
      queryClient.invalidateQueries({ queryKey: ['external-ids', animeId] }); // Refresh external IDs cache

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
