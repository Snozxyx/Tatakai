import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { moderateContent, getViolationMessage } from '@/lib/autoModeration';
import { getRankTier } from '@/lib/rankUtils';

export interface ForumPost {
  id: string;
  user_id: string;
  title: string;
  content: string;
  content_type: 'text' | 'image' | 'link' | 'poll' | 'magnet' | 'url';
  image_url?: string;
  magnet_link?: string;
  external_url?: string;
  language?: string;
  metadata?: Record<string, any>;
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
  is_deleted?: boolean;
  deleted_by?: string | null;
  deleted_by_role?: string | null;
  community_id?: string | null;
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

// Create forum post
export function useCreateForumPost() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (post: {
      title: string;
      content: string;
      content_type?: 'text' | 'image' | 'link' | 'poll' | 'magnet' | 'url';
      image_url?: string;
      magnet_link?: string;
      external_url?: string;
      language?: string;
      metadata?: Record<string, any>;
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

      // Posts with images require admin approval — but authors ranked above
      // Chunin (rank > 3, i.e. Jonin+) bypass it. The rank proxy mirrors the
      // feed's author_rank_score: episodes watched (watch_history row count).
      let authorScore = 0;
      try {
        const { count } = await supabase
          .from('watch_history')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id);
        authorScore = count ?? 0;
      } catch { /* fail-soft: treat as rank 0 */ }
      const rankOk = getRankTier(authorScore).rank > 3;
      const requiresApproval = !!post.image_url && !rankOk;

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

// Edit a forum post (author only — RLS gates auth.uid() = user_id). Sets edited_at.
export function useUpdateForumPost() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      id,
      content,
      metadata,
      flair,
      is_spoiler,
    }: {
      id: string;
      content?: string;
      metadata?: Record<string, any>;
      flair?: string | null;
      is_spoiler?: boolean;
    }) => {
      if (!user) throw new Error('Must be logged in');

      const patch: Record<string, any> = { edited_at: new Date().toISOString() };
      if (content !== undefined) {
        const moderation = moderateContent(content);
        if (!moderation.isAllowed) throw new Error(getViolationMessage(moderation.violations));
        patch.content = moderation.sanitizedContent;
      }
      if (metadata !== undefined) patch.metadata = metadata;
      if (flair !== undefined) patch.flair = flair;
      if (is_spoiler !== undefined) patch.is_spoiler = is_spoiler;

      const { error } = await supabase
        .from('forum_posts')
        .update(patch as any)
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;
      return id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ['forum_posts'] });
      queryClient.invalidateQueries({ queryKey: ['forum_post', id] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

// Pin/unpin via SECURITY DEFINER RPC (moderator/admin gated server-side).
export function useSetPinned() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ postId, pinned }: { postId: string; pinned: boolean }) => {
      const { error } = await (supabase as any).rpc('set_post_pinned', {
        p_post_id: postId,
        p_pinned: pinned,
      });
      if (error) throw error;
      return postId;
    },
    onSuccess: (postId) => {
      queryClient.invalidateQueries({ queryKey: ['forum_posts'] });
      queryClient.invalidateQueries({ queryKey: ['forum_post', postId] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

// Delete forum post (role-aware soft-delete → tombstone). Routes through the
// soft_delete_post RPC (authorizes author | community owner/mod | platform
// staff, and stamps deleted_by_role for the tombstone). Falls back to a direct
// soft-delete, then a hard delete, if the RPC isn't deployed yet.
export function useDeleteForumPost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (postId: string) => {
      const { error: rpcErr } = await (supabase as any).rpc('soft_delete_post', { p_post_id: postId });
      if (!rpcErr) return;

      // RPC missing (migration not applied yet) — fall back to the direct write.
      if (rpcErr.code === 'PGRST202' || /function .*soft_delete_post/i.test(rpcErr.message || '')) {
        const { error } = await supabase
          .from('forum_posts')
          .update({ is_deleted: true, deleted_at: new Date().toISOString() } as any)
          .eq('id', postId);
        if (error) {
          const { error: delErr } = await supabase.from('forum_posts').delete().eq('id', postId);
          if (delErr) throw delErr;
        }
        return;
      }
      throw rpcErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forum_posts'] });
      queryClient.invalidateQueries({ queryKey: ['forum_post'] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
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

      // Attach the author profile so the reused feed PostCard can render the
      // header (author name / avatar / link). Every row here shares one user_id.
      const { data: profile } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url, username')
        .eq('user_id', userId)
        .maybeSingle();

      return (data || []).map((post) => ({
        ...post,
        profiles: profile || null,
      })) as (ForumPost & { is_approved: boolean })[];
    },
    enabled: !!userId,
  });
}

// Fetch a user's forum posts for STAFF surfaces — includes pending/unapproved
// posts regardless of who is viewing (admin user page). Distinct queryKey so it
// never collides with the own-profile-gated useUserForumPosts cache.
export function useUserForumPostsStaff(userId?: string) {
  return useQuery({
    queryKey: ['user_forum_posts_staff', userId],
    queryFn: async () => {
      if (!userId) return [];

      const { data, error } = await supabase
        .from('forum_posts')
        .select('*, is_approved')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const { data: profile } = await supabase
        .from('profiles')
        .select('user_id, display_name, avatar_url, username')
        .eq('user_id', userId)
        .maybeSingle();

      return (data || []).map((post) => ({
        ...post,
        profiles: profile || null,
      })) as (ForumPost & { is_approved: boolean })[];
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
