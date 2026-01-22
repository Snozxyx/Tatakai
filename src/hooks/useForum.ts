import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { moderateContent, getViolationMessage } from '@/lib/autoModeration';

export interface ForumPost {
  id: string;
  user_id: string;
  title: string;
  content: string;
  content_type: 'text' | 'image' | 'link' | 'poll';
  image_url?: string;
  anime_id?: string;
  anime_name?: string;
  anime_poster?: string;
  playlist_id?: string;
  tierlist_id?: string;
  character_id?: string;
  character_name?: string;
  flair?: string;
  is_pinned: boolean;
  is_locked: boolean;
  is_spoiler: boolean;
  is_nsfw: boolean;
  upvotes: number;
  downvotes: number;
  comments_count: number;
  views_count: number;
  created_at: string;
  updated_at: string;
  profiles?: {
    user_id: string;
    display_name: string | null;
    avatar_url: string | null;
    username: string | null;
  };
  user_vote?: 1 | -1 | null;
}

export interface ForumComment {
  id: string;
  post_id: string;
  user_id: string;
  parent_id?: string;
  content: string;
  is_spoiler: boolean;
  is_pinned: boolean;
  upvotes: number;
  downvotes: number;
  created_at: string;
  updated_at: string;
  profiles?: {
    user_id: string;
    display_name: string | null;
    avatar_url: string | null;
    username: string | null;
  };
  user_vote?: 1 | -1 | null;
  replies?: ForumComment[];
}

// Fetch forum posts
export function useForumPosts(options?: {
  animeId?: string;
  playlistId?: string;
  tierlistId?: string;
  sortBy?: 'hot' | 'new' | 'top';
  limit?: number;
}) {
  const { user } = useAuth();
  const sortBy = options?.sortBy || 'hot';
  const limit = options?.limit || 20;

  return useQuery({
    queryKey: ['forum_posts', options?.animeId, options?.playlistId, options?.tierlistId, sortBy, limit],
    queryFn: async () => {
      let query = supabase
        .from('forum_posts')
        .select('*')
        .eq('is_approved', true) // Only show approved posts
        .limit(limit);

      // Filter by content references
      if (options?.animeId) {
        query = query.eq('anime_id', options.animeId);
      }
      if (options?.playlistId) {
        query = query.eq('playlist_id', options.playlistId);
      }
      if (options?.tierlistId) {
        query = query.eq('tierlist_id', options.tierlistId);
      }

      // Sort
      if (sortBy === 'hot') {
        query = query.order('is_pinned', { ascending: false }).order('upvotes', { ascending: false });
      } else if (sortBy === 'new') {
        query = query.order('is_pinned', { ascending: false }).order('created_at', { ascending: false });
      } else if (sortBy === 'top') {
        query = query.order('is_pinned', { ascending: false }).order('upvotes', { ascending: false });
      }

      const { data, error } = await query;
      if (error) throw error;

      if (!data || data.length === 0) return [];

      // Fetch profiles
      const userIds = [...new Set(data.map(p => p.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url, username')
        .in('user_id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      // Fetch user votes if logged in
      const voteMap = new Map<string, 1 | -1>();
      if (user && data.length > 0) {
        const { data: votes } = await supabase
          .from('forum_votes')
          .select('post_id, vote_type')
          .eq('user_id', user.id)
          .in('post_id', data.map(p => p.id));

        votes?.forEach(v => {
          if (v.post_id) voteMap.set(v.post_id, v.vote_type as 1 | -1);
        });
      }

      return data.map(post => ({
        ...post,
        profiles: profileMap.get(post.user_id) || null,
        user_vote: voteMap.get(post.id) || null,
      })) as ForumPost[];
    },
  });
}

// Fetch single forum post
export function useForumPost(postId: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['forum_post', postId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('forum_posts')
        .select('*')
        .eq('id', postId)
        .single();

      if (error) throw error;

      // Increment view count with session-based rate limiting
      const viewedKey = `forum_view_${postId}`;
      const lastViewed = sessionStorage.getItem(viewedKey);
      const now = Date.now();

      // Only increment if not viewed in this session or viewed more than 30 minutes ago
      if (!lastViewed || (now - parseInt(lastViewed)) > 30 * 60 * 1000) {
        await supabase.rpc('increment_forum_post_views', { post_id: postId });
        sessionStorage.setItem(viewedKey, now.toString());
      }

      // Fetch profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url, username')
        .eq('user_id', data.user_id)
        .single();

      // Fetch user vote if logged in
      let userVote: 1 | -1 | null = null;
      if (user) {
        const { data: vote } = await supabase
          .from('forum_votes')
          .select('vote_type')
          .eq('user_id', user.id)
          .eq('post_id', postId)
          .single();

        userVote = vote?.vote_type as 1 | -1 | null;
      }

      return {
        ...data,
        profiles: profile,
        user_vote: userVote,
      } as ForumPost;
    },
    enabled: !!postId,
  });
}

// Fetch comments for a post
export function useForumComments(postId: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['forum_comments', postId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('forum_comments')
        .select('*')
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      if (!data || data.length === 0) return [];

      // Fetch profiles
      const userIds = [...new Set(data.map(c => c.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url, username')
        .in('user_id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      // Fetch user votes if logged in
      const voteMap = new Map<string, 1 | -1>();
      if (user && data.length > 0) {
        const { data: votes } = await supabase
          .from('forum_votes')
          .select('comment_id, vote_type')
          .eq('user_id', user.id)
          .in('comment_id', data.map(c => c.id));

        votes?.forEach(v => {
          if (v.comment_id) voteMap.set(v.comment_id, v.vote_type as 1 | -1);
        });
      }

      // Build comment tree
      const comments = data.map(comment => ({
        ...comment,
        profiles: profileMap.get(comment.user_id) || null,
        user_vote: voteMap.get(comment.id) || null,
        replies: [],
      })) as ForumComment[];

      // Nest replies
      const commentMap = new Map(comments.map(c => [c.id, c]));
      const rootComments: ForumComment[] = [];

      comments.forEach(comment => {
        if (comment.parent_id) {
          const parent = commentMap.get(comment.parent_id);
          if (parent) {
            if (!parent.replies) parent.replies = [];
            parent.replies.push(comment);
          }
        } else {
          rootComments.push(comment);
        }
      });

      return rootComments;
    },
    enabled: !!postId,
  });
}

// Create forum post
export function useCreateForumPost() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (post: {
      title: string;
      content: string;
      content_type?: 'text' | 'image' | 'link' | 'poll';
      image_url?: string;
      anime_id?: string;
      anime_name?: string;
      anime_poster?: string;
      playlist_id?: string;
      tierlist_id?: string;
      character_id?: string;
      character_name?: string;
      flair?: string;
      is_spoiler?: boolean;
    }) => {
      if (!user) throw new Error('Must be logged in');

      // Auto-moderate content
      const titleModeration = moderateContent(post.title);
      const contentModeration = moderateContent(post.content);

      // Block if critical violations found
      if (!titleModeration.isAllowed || !contentModeration.isAllowed) {
        const allViolations = [...titleModeration.violations, ...contentModeration.violations];
        throw new Error(getViolationMessage(allViolations));
      }

      // Posts with images require admin approval
      const requiresApproval = !!post.image_url;

      const { data, error } = await supabase
        .from('forum_posts')
        .insert({
          user_id: user.id,
          ...post,
          title: titleModeration.sanitizedContent,
          content: contentModeration.sanitizedContent,
          is_approved: !requiresApproval, // Auto-approve text posts, require approval for image posts
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forum_posts'] });
    },
  });
}

// Create forum comment
export function useCreateForumComment() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      postId,
      content,
      parentId,
      isSpoiler = false,
    }: {
      postId: string;
      content: string;
      parentId?: string;
      isSpoiler?: boolean;
    }) => {
      if (!user) throw new Error('Must be logged in');

      // Auto-moderate content
      const moderation = moderateContent(content);

      if (!moderation.isAllowed) {
        throw new Error(getViolationMessage(moderation.violations));
      }

      const { data, error } = await supabase
        .from('forum_comments')
        .insert({
          user_id: user.id,
          post_id: postId,
          parent_id: parentId,
          content: moderation.sanitizedContent,
          is_spoiler: isSpoiler,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: async (_, variables) => {
      // Refetch without scroll jump by using setQueryData instead of invalidate
      await queryClient.refetchQueries({
        queryKey: ['forum_comments', variables.postId],
        type: 'active'
      });
    },
  });
}

// Vote on post or comment
export function useForumVote() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      postId,
      commentId,
      voteType,
      currentVote,
    }: {
      postId?: string;
      commentId?: string;
      voteType: 1 | -1;
      currentVote?: 1 | -1 | null;
    }) => {
      if (!user) throw new Error('Must be logged in');

      // If same vote, remove it
      if (currentVote === voteType) {
        if (postId) {
          const { error } = await supabase
            .from('forum_votes')
            .delete()
            .eq('user_id', user.id)
            .eq('post_id', postId);
          if (error) throw error;
        } else if (commentId) {
          const { error } = await supabase
            .from('forum_votes')
            .delete()
            .eq('user_id', user.id)
            .eq('comment_id', commentId);
          if (error) throw error;
        }
        return null;
      }

      // Upsert vote
      const { data, error } = await supabase
        .from('forum_votes')
        .upsert({
          user_id: user.id,
          post_id: postId || null,
          comment_id: commentId || null,
          vote_type: voteType,
        }, {
          onConflict: postId ? 'user_id,post_id' : 'user_id,comment_id',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      if (variables.postId) {
        queryClient.invalidateQueries({ queryKey: ['forum_post', variables.postId] });
        queryClient.invalidateQueries({ queryKey: ['forum_posts'] });
      }
      if (variables.commentId) {
        queryClient.invalidateQueries({ queryKey: ['forum_comments'] });
      }
    },
  });
}

// Delete forum post
export function useDeleteForumPost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (postId: string) => {
      const { error } = await supabase
        .from('forum_posts')
        .delete()
        .eq('id', postId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forum_posts'] });
    },
  });
}

// Delete forum comment
export function useDeleteForumComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ commentId, postId }: { commentId: string; postId: string }) => {
      const { error } = await supabase
        .from('forum_comments')
        .delete()
        .eq('id', commentId);

      if (error) throw error;
      return postId;
    },
    onSuccess: (postId) => {
      queryClient.invalidateQueries({ queryKey: ['forum_comments', postId] });
      queryClient.invalidateQueries({ queryKey: ['forum_posts'] });
    },
  });
}

// Fetch pending forum posts (admin only)
export function usePendingForumPosts() {
  const { user, isAdmin } = useAuth();

  return useQuery({
    queryKey: ['pending_forum_posts'],
    queryFn: async () => {
      console.log('[PendingForumPosts] Fetching... user:', user?.id, 'isAdmin:', isAdmin);

      // First get the posts
      const { data: posts, error } = await supabase
        .from('forum_posts')
        .select('id, title, content, image_url, flair, is_spoiler, is_approved, created_at, user_id')
        .eq('is_approved', false)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[PendingForumPosts] Error:', error);
        return [];
      }

      if (!posts || posts.length === 0) {
        console.log('[PendingForumPosts] No pending posts found');
        return [];
      }

      // Then fetch profiles separately
      const userIds = [...new Set(posts.map(p => p.user_id).filter(Boolean))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, username, display_name, avatar_url')
        .in('user_id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      const result = posts.map(post => ({
        ...post,
        profiles: profileMap.get(post.user_id) || null,
      }));

      console.log('[PendingForumPosts] Found:', result.length, 'posts');
      return result;
    },
    enabled: !!user,
    staleTime: 1000 * 30,
    refetchInterval: 1000 * 60,
  });
}

// Approve forum post
export function useApproveForumPost() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ postId }: { postId: string }) => {
      if (!user) throw new Error('Must be logged in');

      const { error } = await supabase
        .from('forum_posts')
        .update({ is_approved: true })
        .eq('id', postId);

      if (error) throw error;

      // Log admin action
      await supabase.from('admin_logs').insert({
        user_id: user.id,
        action: 'approve_forum_post',
        entity_type: 'forum_post',
        entity_id: postId,
      });

      return postId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending_forum_posts'] });
      queryClient.invalidateQueries({ queryKey: ['forum_posts'] });
      queryClient.invalidateQueries({ queryKey: ['admin_logs'] });
    },
  });
}

// Reject forum post (delete)
export function useRejectForumPost() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ postId }: { postId: string }) => {
      if (!user) throw new Error('Must be logged in');

      const { error } = await supabase
        .from('forum_posts')
        .delete()
        .eq('id', postId);

      if (error) throw error;

      // Log admin action
      await supabase.from('admin_logs').insert({
        user_id: user.id,
        action: 'reject_forum_post',
        entity_type: 'forum_post',
        entity_id: postId,
      });

      return postId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending_forum_posts'] });
      queryClient.invalidateQueries({ queryKey: ['forum_posts'] });
      queryClient.invalidateQueries({ queryKey: ['admin_logs'] });
    },
  });
}

// Fetch user's forum posts (including pending posts for the owner)
export function useUserForumPosts(userId?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['user_forum_posts', userId],
    queryFn: async () => {
      if (!userId) return [];

      // If viewing own profile, include pending posts
      const isOwnProfile = user?.id === userId;

      let query = supabase
        .from('forum_posts')
        .select('*, is_approved')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);

      // Only filter by is_approved if viewing someone else's profile
      if (!isOwnProfile) {
        query = query.eq('is_approved', true);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as (ForumPost & { is_approved: boolean })[];
    },
    enabled: !!userId,
  });
}

// Pin/Unpin forum post (admin only)
export function usePinForumPost() {
  const queryClient = useQueryClient();
  const { user, isAdmin } = useAuth();

  return useMutation({
    mutationFn: async ({ postId, isPinned }: { postId: string; isPinned: boolean }) => {
      if (!user || !isAdmin) throw new Error('Admin access required');

      const { error } = await supabase
        .from('forum_posts')
        .update({ is_pinned: isPinned })
        .eq('id', postId);

      if (error) throw error;

      // Log admin action
      await supabase.from('admin_logs').insert({
        user_id: user.id,
        action: isPinned ? 'pin_forum_post' : 'unpin_forum_post',
        entity_type: 'forum_post',
        entity_id: postId,
      });

      return postId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forum_posts'] });
      queryClient.invalidateQueries({ queryKey: ['forum_post'] });
      queryClient.invalidateQueries({ queryKey: ['admin_logs'] });
    },
    onError: (error: Error) => {
      console.error('Failed to update pin status:', error);
      // Toast error is handled in the component calling this
      throw error;
    },
  });
}

// Pin/Unpin forum comment (admin only)
export function usePinForumComment() {
  const queryClient = useQueryClient();
  const { user, isAdmin } = useAuth();

  return useMutation({
    mutationFn: async ({ commentId, postId, isPinned }: { commentId: string; postId: string; isPinned: boolean }) => {
      if (!user || !isAdmin) throw new Error('Admin access required');

      const { error } = await supabase
        .from('forum_comments')
        .update({ is_pinned: isPinned })
        .eq('id', commentId);

      if (error) throw error;

      // Log admin action
      await supabase.from('admin_logs').insert({
        user_id: user.id,
        action: isPinned ? 'pin_forum_comment' : 'unpin_forum_comment',
        entity_type: 'forum_comment',
        entity_id: commentId,
      });

      return postId;
    },
    onSuccess: (postId) => {
      queryClient.invalidateQueries({ queryKey: ['forum_comments', postId] });
      queryClient.invalidateQueries({ queryKey: ['admin_logs'] });
    },
    onError: (error: Error) => {
      console.error('Failed to update comment pin status:', error);
      // Toast error is handled in the component calling this
      throw error;
    },
  });
}

// Fetch community stats
export function useCommunityStats() {
  return useQuery({
    queryKey: ['community_stats'],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Fetch member count
      const { count: memberCount, error: memberError } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true });

      if (memberError) throw memberError;

      // Fetch new posts today
      const { count: newPostsCount, error: postsError } = await supabase
        .from('forum_posts')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', today.toISOString());

      if (postsError) throw postsError;

      return {
        activeMembers: memberCount || 0,
        newPostsToday: newPostsCount || 0
      };
    },
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
  });
}
