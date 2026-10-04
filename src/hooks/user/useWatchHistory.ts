import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { updateMalAnimeStatus } from '@/lib/mal';
import { updateAniListAnimeStatus, mapTatakaiStatusToAniList } from '@/lib/externalIntegrations';
import { db } from '@/core/db';
import { getLocalContinueWatching } from '@/lib/localStorage';

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
      // Merge the local (Dexie) rows written on this device with the account's
      // Supabase rows, newest-wins per episode. This makes Continue Watching sync
      // across devices instead of "whatever this device happens to have locally".
      const byEpisode = new Map<string, WatchHistoryItem>();

      // 1. Local DB (Dexie) — updated most frequently on this device.
      try {
        const local = await db.watchProgress
          .orderBy('updatedAt')
          .reverse()
          .limit(30)
          .toArray();

        for (const item of local) {
          if (item.completed) continue;
          let cachedMedia: any = null;
          try {
            cachedMedia = await db.cachedMedia.get(item.mediaId);
          } catch {
            cachedMedia = null;
          }

          byEpisode.set(item.episodeId, {
            id: item.id,
            user_id: user?.id || 'guest',
            anime_id: item.mediaId,
            anime_name: item.animeName || cachedMedia?.title || 'Unknown',
            anime_poster: item.animePoster || cachedMedia?.poster || null,
            episode_id: item.episodeId,
            episode_number: item.episodeNumber ?? 0,
            progress_seconds: item.progress,
            duration_seconds: item.duration,
            completed: item.completed,
            watched_at: item.updatedAt,
          });
        }
      } catch (err) {
        console.warn('[useContinueWatching] Local DB error:', err);
      }

      // 1b. localStorage mirror — written synchronously on every progress tick, so
      // it survives an abrupt tab/window close that drops in-flight Dexie/Supabase
      // writes. Newest-wins against the Dexie row so the exact stop position sticks.
      try {
        for (const it of getLocalContinueWatching()) {
          const existing = byEpisode.get(it.episodeId);
          if (existing && new Date(it.watchedAt).getTime() <= new Date(existing.watched_at).getTime()) {
            continue;
          }
          byEpisode.set(it.episodeId, {
            id: `${it.animeId}:${it.episodeId}`,
            user_id: user?.id || 'guest',
            anime_id: it.animeId,
            anime_name: it.animeName || 'Unknown',
            anime_poster: it.animePoster || null,
            episode_id: it.episodeId,
            episode_number: it.episodeNumber ?? 0,
            progress_seconds: it.progressSeconds,
            duration_seconds: it.durationSeconds,
            completed: false,
            watched_at: it.watchedAt,
          });
        }
      } catch (err) {
        console.warn('[useContinueWatching] localStorage mirror error:', err);
      }

      // 2. Supabase — merge in cross-device progress; keep whichever is newer.
      if (user) {
        try {
          const { data, error } = await supabase
            .from('watch_history')
            .select('*')
            .eq('user_id', user.id)
            .order('watched_at', { ascending: false })
            .limit(30);

          if (error) throw error;

          for (const row of ((data as WatchHistoryItem[]) || [])) {
            const existing = byEpisode.get(row.episode_id);
            if (
              !existing ||
              new Date(row.watched_at).getTime() > new Date(existing.watched_at).getTime()
            ) {
              byEpisode.set(row.episode_id, row);
            }
          }
        } catch (err) {
          console.warn('[useContinueWatching] Supabase error:', err);
        }
      }

      const merged = Array.from(byEpisode.values())
        .filter((it) => !it.completed)
        .sort(
          (a, b) => new Date(b.watched_at).getTime() - new Date(a.watched_at).getTime(),
        );

      // One card per anime: show only the most recently watched episode. The list
      // is already sorted newest-first, so the first row seen for an anime is the
      // one the user last opened — keep it and drop the rest (e.g. Gintama EP
      // 97/98/99 collapse to whichever episode was touched most recently).
      const byAnime = new Map<string, WatchHistoryItem>();
      for (const it of merged) {
        if (!byAnime.has(it.anime_id)) byAnime.set(it.anime_id, it);
      }

      return Array.from(byAnime.values()).slice(0, 10) as WatchHistoryItem[];
    },
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
      // Netflix-style completion: an episode watched to >=90% counts as finished, so
      // it drops out of Continue Watching even if the user never hit the exact end.
      const _dur = durationSeconds != null ? durationSeconds : 0;
      const reachedEnd = _dur > 0 && progressSeconds / _dur >= 0.9;
      const effectiveCompleted = completed || reachedEnd;

      // Build upsert object dynamically to only include mal_id/anilist_id if provided
      const upsertData: any = {
        user_id: user!.id,
        anime_id: animeId,
        anime_name: animeName,
        anime_poster: animePoster,
        episode_id: episodeId,
        episode_number: episodeNumber,
        progress_seconds: Math.round(progressSeconds),
        duration_seconds: durationSeconds != null ? Math.round(durationSeconds) : durationSeconds,
        completed: effectiveCompleted,
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

      // Local DB Upsert (Dexie) - Offline first!
      try {
        await db.watchProgress.put({
          id: `${animeId}:${episodeId}`,
          mediaId: animeId,
          episodeId: episodeId,
          animeName,
          animePoster,
          episodeNumber,
          progress: progressSeconds,
          duration: durationSeconds || 0,
          updatedAt: new Date().toISOString(),
          completed: effectiveCompleted,
        });
      } catch (err) {
        console.warn('[useUpdateWatchHistory] Local DB save failed:', err);
      }

      if (!user) return null;

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

export interface SavedProgress {
  progress: number;
  duration: number;
  completed: boolean;
  updatedAt: string;
}

/**
 * Newest-wins lookup of a single episode's saved position across every store this
 * device can see: the local Dexie row, the localStorage mirror, and (when signed in)
 * the Supabase row. Used to auto-resume on ANY entry point, not just `?t=` links.
 */
export async function getSavedProgress(
  animeId: string,
  episodeId: string,
  userId?: string,
): Promise<SavedProgress | null> {
  const candidates: SavedProgress[] = [];

  try {
    const row = await db.watchProgress.get(`${animeId}:${episodeId}`);
    if (row) {
      candidates.push({
        progress: row.progress || 0,
        duration: row.duration || 0,
        completed: !!row.completed,
        updatedAt: row.updatedAt,
      });
    }
  } catch {
    /* ignore */
  }

  try {
    const local = getLocalContinueWatching().find((i) => i.episodeId === episodeId);
    if (local) {
      candidates.push({
        progress: local.progressSeconds || 0,
        duration: local.durationSeconds || 0,
        completed: false,
        updatedAt: local.watchedAt,
      });
    }
  } catch {
    /* ignore */
  }

  if (userId) {
    try {
      const { data } = await supabase
        .from('watch_history')
        .select('progress_seconds, duration_seconds, completed, watched_at')
        .eq('user_id', userId)
        .eq('episode_id', episodeId)
        .maybeSingle();
      if (data) {
        candidates.push({
          progress: data.progress_seconds || 0,
          duration: data.duration_seconds || 0,
          completed: !!data.completed,
          updatedAt: data.watched_at,
        });
      }
    } catch {
      /* ignore */
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
  return candidates[0];
}

/**
 * One-shot reconciliation when a guest signs in: push this device's local watch
 * progress (Dexie) up to Supabase so their history follows the account. Newest-wins —
 * a local row is only pushed when it is newer than what the server already has.
 */
export async function migrateGuestProgressToAccount(userId: string): Promise<void> {
  const flagKey = `tatakai_progress_migrated_${userId}`;
  try {
    if (localStorage.getItem(flagKey)) return;
  } catch {
    /* ignore */
  }

  let localRows: any[] = [];
  try {
    localRows = await db.watchProgress.orderBy('updatedAt').reverse().limit(200).toArray();
  } catch {
    localRows = [];
  }
  if (localRows.length === 0) {
    try {
      localStorage.setItem(flagKey, '1');
    } catch {
      /* ignore */
    }
    return;
  }

  const episodeIds = localRows.map((r) => r.episodeId);
  const existing = new Map<string, string>();
  try {
    const { data } = await supabase
      .from('watch_history')
      .select('episode_id, watched_at')
      .eq('user_id', userId)
      .in('episode_id', episodeIds);
    (data || []).forEach((r: any) => existing.set(r.episode_id, r.watched_at));
  } catch {
    /* treat as none present */
  }

  const upserts = localRows
    .filter((r) => {
      const prev = existing.get(r.episodeId);
      return !prev || new Date(r.updatedAt).getTime() > new Date(prev).getTime();
    })
    .map((r) => ({
      user_id: userId,
      anime_id: r.mediaId,
      anime_name: r.animeName || 'Unknown',
      anime_poster: r.animePoster || null,
      episode_id: r.episodeId,
      episode_number: r.episodeNumber ?? 0,
      progress_seconds: Math.round(r.progress || 0),
      duration_seconds: r.duration ? Math.round(r.duration) : null,
      completed: !!r.completed,
      watched_at: r.updatedAt,
    }));

  if (upserts.length > 0) {
    try {
      await supabase
        .from('watch_history')
        .upsert(upserts, { onConflict: 'user_id,episode_id' });
    } catch (e) {
      console.warn('[migrateGuestProgress] upsert failed:', e);
      return; // don't set the flag — retry on next sign-in
    }
  }

  try {
    localStorage.setItem(flagKey, '1');
  } catch {
    /* ignore */
  }
}
