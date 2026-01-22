import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface CommentProfile {
  display_name: string | null;
  avatar_url: string | null;
  username: string | null;
}

interface TierListComment {
  id: string;
  user_id: string;
  tier_list_id: string;
  content: string;
  parent_id: string | null;
  likes_count: number;
  created_at: string;
  updated_at: string;
  profile?: CommentProfile;
  user_liked?: boolean;
}

export function useTierListComments(tierListId: string | undefined) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['tier_list_comments', tierListId],
    queryFn: async () => {
      const { data: comments, error } = await supabase
        .from('tier_list_comments')
        .select('*')
        .eq('tier_list_id', tierListId!)
        .is('parent_id', null)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      if (!comments || comments.length === 0) return [] as TierListComment[];
      
      // Fetch profiles for all commenters
      const userIds = [...new Set(comments.map(c => c.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url, username')
        .in('user_id', userIds);
      
      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
      
      // Check if user has liked each comment
      let likedIds = new Set<string>();
      if (user) {
        const { data: likes } = await supabase
          .from('tier_list_comment_likes')
          .select('comment_id')
          .eq('user_id', user.id)
          .in('comment_id', comments.map(c => c.id));
        
        likedIds = new Set(likes?.map(l => l.comment_id) || []);
      }
      
      return comments.map(c => ({
        ...c,
        profile: profileMap.get(c.user_id),
        user_liked: likedIds.has(c.id),
      })) as TierListComment[];
    },
    enabled: !!tierListId,
  });
}

export function useTierListCommentReplies(parentId: string | undefined) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['tier_list_comment_replies', parentId],
    queryFn: async () => {
      const { data: replies, error } = await supabase
        .from('tier_list_comments')
        .select('*')
        .eq('parent_id', parentId!)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      if (!replies || replies.length === 0) return [] as TierListComment[];
      
      const userIds = [...new Set(replies.map(r => r.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url, username')
        .in('user_id', userIds);
      
      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
      
      let likedIds = new Set<string>();
      if (user) {
        const { data: likes } = await supabase
          .from('tier_list_comment_likes')
          .select('comment_id')
          .eq('user_id', user.id)
          .in('comment_id', replies.map(r => r.id));
        
        likedIds = new Set(likes?.map(l => l.comment_id) || []);
      }
      
      return replies.map(r => ({
        ...r,
        profile: profileMap.get(r.user_id),
        user_liked: likedIds.has(r.id),
      })) as TierListComment[];
    },
    enabled: !!parentId,
  });
}

export function useAddTierListComment() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async ({ tierListId, content, parentId }: { 
      tierListId: string; 
      content: string;
      parentId?: string;
    }) => {
      if (!user) throw new Error('Must be logged in');
      
      const { data, error } = await supabase
        .from('tier_list_comments')
        .insert({
          tier_list_id: tierListId,
          user_id: user.id,
          content,
          parent_id: parentId || null,
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['tier_list_comments', variables.tierListId] });
      if (variables.parentId) {
        queryClient.invalidateQueries({ queryKey: ['tier_list_comment_replies', variables.parentId] });
      }
      toast.success('Comment added');
    },
    onError: () => {
      toast.error('Failed to add comment');
    },
  });
}

export function useDeleteTierListComment() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (commentId: string) => {
      const { error } = await supabase
        .from('tier_list_comments')
        .delete()
        .eq('id', commentId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tier_list_comments'] });
      queryClient.invalidateQueries({ queryKey: ['tier_list_comment_replies'] });
      toast.success('Comment deleted');
    },
    onError: () => {
      toast.error('Failed to delete comment');
    },
  });
}

export function useLikeTierListComment() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  
  return useMutation({
    mutationFn: async ({ commentId, liked }: { commentId: string; liked: boolean }) => {
      if (!user) throw new Error('Must be logged in');
      
      if (liked) {
        // Unlike
        const { error } = await supabase
          .from('tier_list_comment_likes')
          .delete()
          .eq('comment_id', commentId)
          .eq('user_id', user.id);
        
        if (error) throw error;
        
        // Decrement likes count
        await supabase.rpc('decrement_tier_list_comment_likes', { comment_id: commentId });
      } else {
        // Like
        const { error } = await supabase
          .from('tier_list_comment_likes')
          .insert({ comment_id: commentId, user_id: user.id });
        
        if (error) throw error;
        
        // Increment likes count
        await supabase.rpc('increment_tier_list_comment_likes', { comment_id: commentId });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tier_list_comments'] });
      queryClient.invalidateQueries({ queryKey: ['tier_list_comment_replies'] });
    },
  });
}
