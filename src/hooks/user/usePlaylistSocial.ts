import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { useWatchlist } from './useWatchlist';
import { useMangaReadlist } from './useMangaReadlist';
import type { Playlist, PlaylistItem } from './usePlaylist';

// ---------------------------------------------------------------------------
// Likes
// ---------------------------------------------------------------------------

// Whether the current user has liked a given playlist (drives the filled heart).
export function usePlaylistLikeState(playlistId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['playlist-like', playlistId, user?.id],
    queryFn: async () => {
      if (!user || !playlistId) return false;
      const { data, error } = await supabase
        .from('playlist_likes')
        .select('id')
        .eq('playlist_id', playlistId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
    enabled: !!user && !!playlistId,
  });
}

export function useTogglePlaylistLike() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ playlistId, liked }: { playlistId: string; liked: boolean }) => {
      if (!user) throw new Error('You must be signed in to like playlists.');
      if (liked) {
        const { error } = await supabase
          .from('playlist_likes')
          .delete()
          .eq('playlist_id', playlistId)
          .eq('user_id', user.id);
        if (error) throw error;
        return false;
      }
      const { error } = await supabase
        .from('playlist_likes')
        .insert({ playlist_id: playlistId, user_id: user.id });
      if (error) throw error;
      return true;
    },
    onSuccess: (_res, { playlistId }) => {
      queryClient.invalidateQueries({ queryKey: ['playlist-like', playlistId] });
      queryClient.invalidateQueries({ queryKey: ['playlist', playlistId] });
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      queryClient.invalidateQueries({ queryKey: ['user-playlists'] });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Could not update like.');
    },
  });
}

// ---------------------------------------------------------------------------
// Saved playlists ("Follow" → library / Inventory)
// ---------------------------------------------------------------------------

export function useIsPlaylistSaved(playlistId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['playlist-saved', playlistId, user?.id],
    queryFn: async () => {
      if (!user || !playlistId) return false;
      const { data, error } = await supabase
        .from('saved_playlists')
        .select('id')
        .eq('playlist_id', playlistId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
    enabled: !!user && !!playlistId,
  });
}

export function useToggleSavePlaylist() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ playlistId, saved }: { playlistId: string; saved: boolean }) => {
      if (!user) throw new Error('You must be signed in to save playlists.');
      if (saved) {
        const { error } = await supabase
          .from('saved_playlists')
          .delete()
          .eq('playlist_id', playlistId)
          .eq('user_id', user.id);
        if (error) throw error;
        return false;
      }
      const { error } = await supabase
        .from('saved_playlists')
        .insert({ playlist_id: playlistId, user_id: user.id });
      if (error) throw error;
      return true;
    },
    onSuccess: (saved, { playlistId }) => {
      queryClient.invalidateQueries({ queryKey: ['playlist-saved', playlistId] });
      queryClient.invalidateQueries({ queryKey: ['saved-playlists'] });
      toast.success(saved ? 'Added to your library.' : 'Removed from your library.');
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : 'Could not update your library.');
    },
  });
}

// The current user's saved playlists, resolved to full playlist rows (RLS drops
// any that are no longer visible).
export function useSavedPlaylists() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['saved-playlists', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('saved_playlists')
        .select('id, created_at, playlist:playlists(*)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ((data || []) as Array<{ playlist: Playlist | null }>)
        .map((row) => row.playlist)
        .filter((p): p is Playlist => !!p);
    },
    enabled: !!user,
  });
}

// ---------------------------------------------------------------------------
// Progress — % of a playlist's items the user has completed
// ---------------------------------------------------------------------------

export interface PlaylistProgress {
  total: number;
  completed: number;
  percent: number;
}

export function usePlaylistProgress(items: PlaylistItem[] | undefined): PlaylistProgress {
  const { user } = useAuth();
  const { data: watchlist } = useWatchlist();
  const { data: completedManga } = useMangaReadlist(['completed']);

  return useMemo(() => {
    const list = items || [];
    const total = list.length;
    if (!user || total === 0) return { total, completed: 0, percent: 0 };

    // Completed anime — match by any id variant the row exposes.
    const completedAnime = new Set<string>();
    (watchlist || []).forEach((w) => {
      if (w.status !== 'completed') return;
      const row = w as Record<string, unknown>;
      if (w.anime_id) completedAnime.add(String(w.anime_id));
      if (row.anilist_id != null) completedAnime.add(String(row.anilist_id));
      if (row.mal_id != null) completedAnime.add(String(row.mal_id));
    });

    // Completed manga — same tolerance across manga_id / anilist_id / mal_id.
    const completedMangaSet = new Set<string>();
    (completedManga || []).forEach((m) => {
      if (m.manga_id) completedMangaSet.add(String(m.manga_id));
      if (m.anilist_id != null) completedMangaSet.add(String(m.anilist_id));
      if (m.mal_id != null) completedMangaSet.add(String(m.mal_id));
    });

    let completed = 0;
    for (const item of list) {
      const ref = item.anime_id;
      const isManga = ref.startsWith('manga:');
      const id = ref.replace(/^manga:/, '').replace(/^anime:/, '');
      if (isManga) {
        if (completedMangaSet.has(id) || completedMangaSet.has(ref)) completed += 1;
      } else if (completedAnime.has(id) || completedAnime.has(ref)) {
        completed += 1;
      }
    }

    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, percent };
  }, [items, user, watchlist, completedManga]);
}
