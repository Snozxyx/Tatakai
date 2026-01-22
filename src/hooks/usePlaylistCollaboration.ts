/**
 * Playlist collaboration hooks
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export type CollaboratorRole = 'viewer' | 'editor' | 'admin';

interface Collaborator {
  id: string;
  playlist_id: string;
  user_id: string;
  role: CollaboratorRole;
  added_by: string;
  added_at: string;
  profile?: {
    user_id: string;
    display_name: string | null;
    username: string | null;
    avatar_url: string | null;
  };
}

/**
 * Get collaborators for a playlist
 */
export function usePlaylistCollaborators(playlistId: string | undefined) {
  return useQuery({
    queryKey: ['playlist_collaborators', playlistId],
    queryFn: async () => {
      if (!playlistId) return [];

      const { data, error } = await supabase
        .from('playlist_collaborators')
        .select(`
          *,
          profiles:user_id(user_id, display_name, username, avatar_url)
        `)
        .eq('playlist_id', playlistId)
        .order('added_at', { ascending: true });

      if (error) throw error;
      return (data || []) as Collaborator[];
    },
    enabled: !!playlistId,
  });
}

/**
 * Check if user can edit a playlist
 */
export function useCanEditPlaylist(playlistId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['can_edit_playlist', playlistId, user?.id],
    queryFn: async () => {
      if (!playlistId || !user) return false;

      // Check if owner
      const { data: playlist } = await supabase
        .from('playlists')
        .select('user_id')
        .eq('id', playlistId)
        .single();

      if (playlist?.user_id === user.id) return true;

      // Check if collaborator with edit rights
      const { data: collab } = await supabase
        .from('playlist_collaborators')
        .select('role')
        .eq('playlist_id', playlistId)
        .eq('user_id', user.id)
        .single();

      return collab?.role === 'editor' || collab?.role === 'admin';
    },
    enabled: !!playlistId && !!user,
  });
}

/**
 * Add a collaborator to a playlist
 */
export function useAddCollaborator() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      playlistId,
      userId,
      role = 'editor',
    }: {
      playlistId: string;
      userId: string;
      role?: CollaboratorRole;
    }) => {
      if (!user) throw new Error('Not logged in');

      const { data, error } = await supabase
        .from('playlist_collaborators')
        .insert({
          playlist_id: playlistId,
          user_id: userId,
          role,
          added_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data as Collaborator;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['playlist_collaborators', variables.playlistId],
      });
      queryClient.invalidateQueries({
        queryKey: ['can_edit_playlist', variables.playlistId],
      });
      toast.success('Collaborator added');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add collaborator');
    },
  });
}

/**
 * Update collaborator role
 */
export function useUpdateCollaborator() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      collaboratorId,
      role,
    }: {
      collaboratorId: string;
      role: CollaboratorRole;
    }) => {
      const { error } = await supabase
        .from('playlist_collaborators')
        .update({ role })
        .eq('id', collaboratorId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playlist_collaborators'] });
      toast.success('Collaborator updated');
    },
    onError: () => {
      toast.error('Failed to update collaborator');
    },
  });
}

/**
 * Remove a collaborator
 */
export function useRemoveCollaborator() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (collaboratorId: string) => {
      const { error } = await supabase
        .from('playlist_collaborators')
        .delete()
        .eq('id', collaboratorId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['playlist_collaborators'] });
      toast.success('Collaborator removed');
    },
    onError: () => {
      toast.error('Failed to remove collaborator');
    },
  });
}
