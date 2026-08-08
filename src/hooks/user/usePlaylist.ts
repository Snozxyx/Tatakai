import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { sanitizeTitle, sanitizeDescription } from '@/lib/sanitize';

export interface Playlist {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  cover_image: string | null;
  is_public: boolean;
  items_count: number;
  share_slug?: string | null;
  share_description?: string | null;
  embed_allowed?: boolean | null;
  is_flagged?: boolean | null;
  flagged_by?: string | null;
  flagged_reason?: string | null;
  flagged_at?: string | null;
  flag_count?: number | null;
  admin_reviewed?: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface PlaylistItem {
  id: string;
  playlist_id: string;
  anime_id: string;
  anime_name: string;
  anime_poster: string | null;
  position: number;
  added_at: string;
}

// Get all playlists for the current user
export function usePlaylists() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['playlists', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('playlists')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return data as Playlist[];
    },
    enabled: !!user,
  });
}

// Get a single playlist by ID
export function usePlaylist(playlistId: string | undefined) {
  return useQuery({
    queryKey: ['playlist', playlistId],
    queryFn: async () => {
      if (!playlistId) return null;

      const { data, error } = await supabase
        .from('playlists')
        .select('*')
        .eq('id', playlistId)
        .single();

      if (error) throw error;
      return data as Playlist;
    },
    enabled: !!playlistId,
  });
}

// Get items in a playlist
export function usePlaylistItems(playlistId: string | undefined) {
  return useQuery({
    queryKey: ['playlist_items', playlistId],
    queryFn: async () => {
      if (!playlistId) return [];

      const { data, error } = await supabase
        .from('playlist_items')
        .select('*')
        .eq('playlist_id', playlistId)
        .order('position', { ascending: true });

      if (error) throw error;
      return data as PlaylistItem[];
    },
    enabled: !!playlistId,
  });
}

// Create a new playlist
export function useCreatePlaylist() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ name, description, isPublic }: { name: string; description?: string; isPublic?: boolean }) => {
      if (!user) throw new Error('Not logged in');

      // Sanitize inputs
      const sanitizedName = sanitizeTitle(name);
      const sanitizedDesc = description ? sanitizeDescription(description) : null;

      const { data, error } = await supabase
        .from('playlists')
        .insert({
          user_id: user.id,
          name: sanitizedName,
          description: sanitizedDesc,
          is_public: isPublic || false,
        })
        .select()
        .single();

      if (error) throw error;
      return data as Playlist;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      toast.success('Playlist created!');
    },
    onError: (error: any) => {
      toast.error(`Failed to create playlist: ${error.message}`);
    },
  });
}

// Update a playlist
export function useUpdatePlaylist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      id, 
      name, 
      description, 
      isPublic, 
      coverImage,
      shareSlug,
      shareDescription,
      embedAllowed
    }: { 
      id: string; 
      name?: string; 
      description?: string; 
      isPublic?: boolean; 
      coverImage?: string;
      shareSlug?: string | null;
      shareDescription?: string | null;
      embedAllowed?: boolean;
    }) => {
      const updates: any = { updated_at: new Date().toISOString() };
      if (name !== undefined) updates.name = sanitizeTitle(name);
      if (description !== undefined) updates.description = description ? sanitizeDescription(description) : null;
      if (isPublic !== undefined) updates.is_public = isPublic;
      if (coverImage !== undefined) updates.cover_image = coverImage;
      if (shareSlug !== undefined) updates.share_slug = shareSlug;
      if (shareDescription !== undefined) updates.share_description = shareDescription;
      if (embedAllowed !== undefined) updates.embed_allowed = embedAllowed;

      const { error } = await supabase
        .from('playlists')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      queryClient.invalidateQueries({ queryKey: ['playlist', variables.id] });
      toast.success('Playlist updated!');
    },
    onError: (error: any) => {
      toast.error(`Failed to update playlist: ${error.message}`);
    },
  });
}

// Delete a playlist
export function useDeletePlaylist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (playlistId: string) => {
      const { error } = await supabase
        .from('playlists')
        .delete()
        .eq('id', playlistId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      toast.success('Playlist deleted!');
    },
    onError: (error: any) => {
      toast.error(`Failed to delete playlist: ${error.message}`);
    },
  });
}

// Add anime to a playlist
export function useAddToPlaylist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      playlistId, 
      animeId, 
      animeName, 
      animePoster 
    }: { 
      playlistId: string; 
      animeId: string; 
      animeName: string; 
      animePoster?: string;
    }) => {
      // Get current max position
      const { data: items } = await supabase
        .from('playlist_items')
        .select('position')
        .eq('playlist_id', playlistId)
        .order('position', { ascending: false })
        .limit(1);

      const nextPosition = items && items.length > 0 ? items[0].position + 1 : 0;

      const { error } = await supabase
        .from('playlist_items')
        .insert({
          playlist_id: playlistId,
          anime_id: animeId,
          anime_name: animeName,
          anime_poster: animePoster || null,
          position: nextPosition,
        });

      if (error) {
        if (error.code === '23505') {
          throw new Error('Anime already in playlist');
        }
        throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['playlist_items', variables.playlistId] });
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      queryClient.invalidateQueries({ queryKey: ['playlist', variables.playlistId] });
      // Invalidate anime-in-playlists lookup so UI shows the "added" state quickly
      queryClient.invalidateQueries({ queryKey: ['anime_in_playlists', variables.animeId] });
      toast.success('Added to playlist!');
    },

    onError: (error: any) => {
      toast.error(error.message);
    },
  });
}

// Remove anime from a playlist
export function useRemoveFromPlaylist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ playlistId, animeId }: { playlistId: string; animeId: string }) => {
      const { error } = await supabase
        .from('playlist_items')
        .delete()
        .eq('playlist_id', playlistId)
        .eq('anime_id', animeId);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['playlist_items', variables.playlistId] });
      queryClient.invalidateQueries({ queryKey: ['playlists'] });
      queryClient.invalidateQueries({ queryKey: ['playlist', variables.playlistId] });
      toast.success('Removed from playlist!');
    },
    onError: (error: any) => {
      toast.error(`Failed to remove: ${error.message}`);
    },
  });
}

// Reorder playlist items
export function useReorderPlaylistItems() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ playlistId, itemIds }: { playlistId: string; itemIds: string[] }) => {
      // Update positions for all items
      const updates = itemIds.map((id, index) => 
        supabase
          .from('playlist_items')
          .update({ position: index })
          .eq('id', id)
      );

      await Promise.all(updates);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['playlist_items', variables.playlistId] });
    },
    onError: (error: any) => {
      toast.error(`Failed to reorder: ${error.message}`);
    },
  });
}

// Get public playlists by user ID
export function usePublicPlaylists(userId: string | undefined) {
  return useQuery({
    queryKey: ['public_playlists', userId],
    queryFn: async () => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from('playlists')
        .select('*')
        .eq('user_id', userId)
        .eq('is_public', true)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return data as Playlist[];
    },
    enabled: !!userId,
  });
}

// Check if anime is in any of user's playlists
export function useAnimeInPlaylists(animeId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['anime_in_playlists', animeId, user?.id],
    queryFn: async () => {
      if (!user || !animeId) return [];

      const { data, error } = await supabase
        .from('playlist_items')
        .select('playlist_id, playlists!inner(id, name, user_id)')
        .eq('anime_id', animeId)
        .eq('playlists.user_id', user.id);

      if (error) throw error;
      return data.map(item => item.playlist_id);
    },
    enabled: !!user && !!animeId,
  });
}
