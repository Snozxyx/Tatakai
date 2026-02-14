import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { updateMalAnimeStatus } from '@/lib/mal';
import { updateAniListAnimeStatus, mapTatakaiStatusToAniList } from '@/lib/externalIntegrations';

interface WatchHistoryItem {
  id: string;
  user_id: string;
  anime_id: string;
  anime_name: string;
  anime_poster: string | null;
  episode_id: string;
  episode_number: number;
  progress_seconds: number;
  duration_seconds: number | null;
  completed: boolean;
  watched_at: string;
  mal_id?: number | null;
  anilist_id?: number | null;
}

export function useWatchHistory(limit?: number) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['watch_history', user?.id, limit],
    queryFn: async () => {
      let query = supabase
        .from('watch_history')
        .select('*')
        .eq('user_id', user!.id)
        .order('watched_at', { ascending: false });

      if (limit) {
        query = query.limit(limit);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as WatchHistoryItem[];
    },
    enabled: !!user,
  });
}

export function useContinueWatching() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['continue_watching', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('watch_history')
        .select('*')
        .eq('user_id', user!.id)
        .eq('completed', false)
        .order('watched_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return data as WatchHistoryItem[];
    },
    enabled: !!user,
  });
}

export function useUpdateWatchHistory() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  return useMutation({
    mutationFn: async ({
      animeId,
      animeName,
      animePoster,
      episodeId,
      episodeNumber,
      progressSeconds,
      durationSeconds,
      completed = false,
      malId,
      anilistId,
    }: {
      animeId: string;
      animeName: string;
      animePoster?: string;
      episodeId: string;
      episodeNumber: number;
      progressSeconds: number;
      durationSeconds?: number;
      completed?: boolean;
      malId?: number | null;
      anilistId?: number | null;
      isLastEpisode?: boolean;
    }) => {
      // Build upsert object dynamically to only include mal_id/anilist_id if provided
      const upsertData: any = {
        user_id: user!.id,
        anime_id: animeId,
        anime_name: animeName,
        anime_poster: animePoster,
        episode_id: episodeId,
        episode_number: episodeNumber,
        progress_seconds: progressSeconds,
        duration_seconds: durationSeconds,
        completed,
        watched_at: new Date().toISOString(),
      };

      console.debug('[useUpdateWatchHistory] Received IDs:', { malId, anilistId });

      // Only update MAL/AniList IDs if they're provided (avoid overwriting with null)
      if (malId !== undefined && malId !== null) {
        upsertData.mal_id = malId;
      }
      if (anilistId !== undefined && anilistId !== null) {
        upsertData.anilist_id = anilistId;
      }

      console.debug('[useUpdateWatchHistory] Upserting data with IDs:', {
        mal_id: upsertData.mal_id,
        anilist_id: upsertData.anilist_id
      });

      const { data, error } = await supabase
        .from('watch_history')
        .upsert(upsertData, { onConflict: 'user_id,episode_id' })
        .select()
        .single();

      if (error) throw error;

      // Also update the watchlist table if we have MAL/AniList IDs
      // This ensures that even if an anime was added to watchlist without IDs,
      // it gets enriched once the user starts watching it.
      if (malId || anilistId) {
        const watchlistUpdate: any = {};
        if (malId) watchlistUpdate.mal_id = malId;
        if (anilistId) watchlistUpdate.anilist_id = anilistId;

        await supabase
          .from('watchlist')
          .update(watchlistUpdate)
          .eq('user_id', user!.id)
          .eq('anime_id', animeId);
      }

      return data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['watch_history'] });
      queryClient.invalidateQueries({ queryKey: ['continue_watching'] });

      // Auto-sync to MAL if linked
      if (profile?.mal_access_token) {
        // Only sync to MAL if:
        // 1. It's the start of an episode (progress < 10s to catch initial clicks)
        // 2. The episode is completed
        const isStart = (variables.progressSeconds || 0) < 10;
        const isEnd = variables.completed;

        if (isStart || isEnd) {
          // If it's the end of the episode, we mark as completed ONLY if it's actually the last episode
          // Otherwise, we stay in 'watching' status but with the updated count.
          const syncStatus = (isEnd && variables.isLastEpisode) ? 'completed' : 'watching';

          // CRITICAL: User wants "add 1 ep" when starting Ep 1, then "add 2nd ep" for Ep 2.
          // So we always send the current episode number.
          const episodeToSync = variables.episodeNumber;

          console.log('[useWatchHistory] Automatic MAL sync starting. Mode:', isEnd ? 'completed' : 'started', {
            animeId: variables.animeId,
            malId: variables.malId,
            episode: episodeToSync,
            syncStatus,
            isLast: variables.isLastEpisode
          });

          updateMalAnimeStatus(
            variables.malId || variables.animeId,
            syncStatus,
            undefined,
            episodeToSync
          ).then(() => console.log('[useWatchHistory] Automatic MAL sync successful'))
            .catch(err => console.error('[useWatchHistory] Automatic MAL sync failed:', err));
        } else {
          console.log('[useWatchHistory] Mid-episode progress detected; skipping automatic MAL sync');
        }
      } else {
        console.log('[useWatchHistory] MAL not linked, skipping auto-sync');
      }

      // Auto-sync to AniList if linked
      if (profile?.anilist_access_token) {
        const isStart = (variables.progressSeconds || 0) < 10;
        const isEnd = variables.completed;

        if (isStart || isEnd) {
          const syncStatus = (isEnd && variables.isLastEpisode) ? 'completed' : 'watching';
          const episodeToSync = variables.episodeNumber;
          const aniListStatus = mapTatakaiStatusToAniList(syncStatus);

          // AniList needs the MEDIA ID. We hopefully have it in variables.anilistId
          // If not, we might fail to sync unless we look it up, but for now let's rely on the ID being present
          // or provided.
          if (variables.anilistId) {
            console.log('[useWatchHistory] Automatic AniList sync starting.', {
              mediaId: variables.anilistId,
              status: aniListStatus,
              progress: episodeToSync
            });

            updateAniListAnimeStatus(
              profile.anilist_access_token,
              variables.anilistId,
              aniListStatus,
              episodeToSync
            ).then(() => console.log('[useWatchHistory] Automatic AniList sync successful'))
              .catch(err => console.error('[useWatchHistory] Automatic AniList sync failed:', err));
          } else {
            console.warn('[useWatchHistory] Cannot sync to AniList: Missing AniList ID');
          }
        }
      }
    },
  });
}

export function useClearAllWatchHistory() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('watch_history')
        .delete()
        .eq('user_id', user!.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watch_history'] });
      queryClient.invalidateQueries({ queryKey: ['continue_watching'] });
    },
  });
}
