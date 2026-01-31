import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { moderateContent, getViolationMessage } from '@/lib/autoModeration';
import { sanitizeComment } from '@/lib/sanitize';

interface CommentProfile {
  display_name: string | null;
  avatar_url: string | null;
  username: string | null;
  is_admin: boolean | null;
  role: string | null;
}

interface Comment {
  id: string;
  user_id: string;
  anime_id: string;
  episode_id: string | null;
  content: string;
  parent_id: string | null;
  likes_count: number;
  is_spoiler: boolean;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
  profile?: CommentProfile;
  user_liked?: boolean;
}

export function useComments(animeId: string | undefined, episodeId?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['comments', animeId, episodeId],
    queryFn: async () => {
      let query = supabase
        .from('comments')
        .select('*')
        .eq('anime_id', animeId!)
        .is('parent_id', null)
        .order('created_at', { ascending: false });

      if (episodeId) {
        query = query.eq('episode_id', episodeId);
      }

      const { data: comments, error } = await query;

      if (error) throw error;
      if (!comments || comments.length === 0) return [] as Comment[];

      // Fetch profiles for all commenters
      const userIds = [...new Set(comments.map(c => c.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url, username, is_admin, role')
        .in('user_id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      // Check if user has liked each comment
      let likedIds = new Set<string>();
      if (user) {
        const { data: likes } = await supabase
          .from('comment_likes')
          .select('comment_id')
          .eq('user_id', user.id)
          .in('comment_id', comments.map(c => c.id));

        likedIds = new Set(likes?.map(l => l.comment_id) || []);
      }

      return comments.map(c => ({
        ...c,
        profile: profileMap.get(c.user_id),
        user_liked: likedIds.has(c.id),
      })) as Comment[];
    },
    enabled: !!animeId,
  });
}

export function useReplies(parentId: string | undefined) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['replies', parentId],
    queryFn: async () => {
      const { data: comments, error } = await supabase
        .from('comments')
        .select('*')
        .eq('parent_id', parentId!)
        .order('created_at', { ascending: true });

      if (error) throw error;
      if (!comments || comments.length === 0) return [] as Comment[];

      const userIds = [...new Set(comments.map(c => c.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url, username, is_admin, role')
        .in('user_id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      let likedIds = new Set<string>();
      if (user) {
        const { data: likes } = await supabase
          .from('comment_likes')
          .select('comment_id')
          .eq('user_id', user.id)
          .in('comment_id', comments.map(c => c.id));

        likedIds = new Set(likes?.map(l => l.comment_id) || []);
      }

      return comments.map(c => ({
        ...c,
        profile: profileMap.get(c.user_id),
        user_liked: likedIds.has(c.id),
      })) as Comment[];
    },
    enabled: !!parentId,
  });
}

export function useAddComment() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      animeId,
      episodeId,
      content,
      parentId,
      isSpoiler = false,
    }: {
      animeId: string;
      episodeId?: string;
      content: string;
      parentId?: string;
      isSpoiler?: boolean;
    }) => {
      // Sanitize first
      const sanitized = sanitizeComment(content);

      // Auto-moderate content
      const moderation = moderateContent(sanitized);

      if (!moderation.isAllowed) {
        throw new Error(getViolationMessage(moderation.violations));
      }

      const { data, error } = await supabase
        .from('comments')
        .insert({
          user_id: user!.id,
          anime_id: animeId,
          episode_id: episodeId,
          content: moderation.sanitizedContent,
          parent_id: parentId,
          is_spoiler: isSpoiler,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['comments', variables.animeId] });
      if (variables.parentId) {
        queryClient.invalidateQueries({ queryKey: ['replies', variables.parentId] });
      }
      toast.success('Comment posted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to post comment');
    },
  });
}

export function useDeleteComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (commentId: string) => {
      const { error } = await supabase
        .from('comments')
        .delete()
        .eq('id', commentId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments'] });
      queryClient.invalidateQueries({ queryKey: ['replies'] });
      toast.success('Comment deleted');
    },
    onError: () => {
      toast.error('Failed to delete comment');
    },
  });
}

export function useLikeComment() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ commentId, liked }: { commentId: string; liked: boolean }) => {
      if (liked) {
        const { error } = await supabase
          .from('comment_likes')
          .delete()
          .eq('comment_id', commentId)
          .eq('user_id', user!.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('comment_likes')
          .insert({
            user_id: user!.id,
            comment_id: commentId,
          });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments'] });
      queryClient.invalidateQueries({ queryKey: ['replies'] });
    },
  });
}

// Pin/Unpin comment (admin only)
export function usePinComment() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ commentId, isPinned, isAdmin }: { commentId: string; isPinned: boolean; isAdmin: boolean }) => {
      if (!user || !isAdmin) throw new Error('Admin access required');

      const { error } = await supabase
        .from('comments')
        .update({ is_pinned: isPinned })
        .eq('id', commentId);

      if (error) throw error;

      // Log admin action
      await supabase.from('admin_logs').insert({
        user_id: user.id,
        action: isPinned ? 'pin_comment' : 'unpin_comment',
        entity_type: 'comment',
        entity_id: commentId,
      });

      return commentId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments'] });
      queryClient.invalidateQueries({ queryKey: ['replies'] });
      queryClient.invalidateQueries({ queryKey: ['admin_logs'] });
      toast.success('Comment pin status updated');
    },
    onError: () => {
      toast.error('Failed to update comment pin status');
    },
  });
}
