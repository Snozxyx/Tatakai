import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { tallyPoll, type PostPoll } from './usePostPolls';
import type { FeedPost } from './useFeed';

const PROFILE_COLS = 'user_id, display_name, avatar_url, username';

/** The current user's bookmarked posts, shaped as feed posts. */
export function useBookmarkedPosts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['post-bookmarks', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<FeedPost[]> => {
      if (!user) return [];
      const db = supabase as any;
      let bookmarks: any[] = [];
      try {
        const { data, error } = await db
          .from('post_bookmarks')
          .select('post_id, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(50);
        if (error) throw error;
        bookmarks = data || [];
      } catch {
        return []; // pre-migration
      }
      const ids = bookmarks.map((b) => b.post_id);
      if (!ids.length) return [];

      const { data: rawPosts } = await supabase.from('forum_posts').select('*').in('id', ids);
      const posts = (rawPosts || []) as any[];

      const authorIds = [...new Set(posts.map((p) => p.user_id))];
      const { data: profiles } = authorIds.length
        ? await supabase.from('profiles').select(PROFILE_COLS).in('user_id', authorIds)
        : { data: [] as any[] };
      const profileMap = new Map((profiles || []).map((p: any) => [p.user_id, p]));

      const pollMap = new Map<string, PostPoll>();
      try {
        const { data: polls } = await db.from('post_polls').select('*').in('post_id', ids);
        const pollList = (polls || []) as any[];
        if (pollList.length) {
          const { data: pollVotes } = await db.from('post_poll_votes').select('poll_id, user_id, option_index').in('poll_id', pollList.map((p) => p.id));
          const byPoll = new Map<string, any[]>();
          (pollVotes || []).forEach((v: any) => { const a = byPoll.get(v.poll_id) || []; a.push(v); byPoll.set(v.poll_id, a); });
          pollList.forEach((poll: any) => pollMap.set(poll.post_id, tallyPoll(poll, byPoll.get(poll.id) || [], user.id)));
        }
      } catch { /* pre-migration */ }

      const order = new Map(ids.map((id, i) => [id, i]));
      return posts
        .map((p) => {
          const metadata = (p.metadata || {}) as Record<string, any>;
          const images: string[] | null = Array.isArray(metadata.images) && metadata.images.length ? metadata.images : p.image_url ? [p.image_url] : null;
          return {
            ...p,
            profiles: profileMap.get(p.user_id) || null,
            poll: pollMap.get(p.id) || null,
            gif_url: metadata.gif_url || null,
            images,
            watch_room_id: metadata.watch_room_id || null,
            quoted_post_id: metadata.quoted_post_id || null,
            media_type: metadata.media_type || (p.anime_id ? 'anime' : null),
            bookmarked: true,
          } as FeedPost;
        })
        .sort((a, b) => (order.get(a.id)! - order.get(b.id)!));
    },
  });
}

/** Toggle a repost on a post. */
export function useToggleRepost() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ postId, reposted }: { postId: string; reposted: boolean }) => {
      if (!user) throw new Error('Must be logged in');
      const db = supabase as any;
      if (reposted) {
        const { error } = await db.from('post_reposts').delete().eq('post_id', postId).eq('user_id', user.id);
        if (error) throw error;
        return false;
      }
      const { error } = await db.from('post_reposts').insert({ post_id: postId, user_id: user.id });
      if (error) throw error;
      return true;
    },
    onSuccess: (reposted) => {
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      toast.success(reposted ? 'Reposted' : 'Repost removed');
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : 'Failed to repost'),
  });
}

/** Toggle a bookmark on a post. */
export function useToggleBookmark() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ postId, bookmarked }: { postId: string; bookmarked: boolean }) => {
      if (!user) throw new Error('Must be logged in');
      const db = supabase as any;
      if (bookmarked) {
        const { error } = await db.from('post_bookmarks').delete().eq('post_id', postId).eq('user_id', user.id);
        if (error) throw error;
        return false;
      }
      const { error } = await db.from('post_bookmarks').insert({ post_id: postId, user_id: user.id });
      if (error) throw error;
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['post-bookmarks'] });
    },
  });
}
