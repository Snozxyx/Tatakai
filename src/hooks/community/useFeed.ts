import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { ForumPost } from './useForum';
import type { WatchRoom } from '@/hooks/media/useWatchRoom';
import { WATCH_ROOM_COLUMNS } from '@/hooks/media/useWatchRoom';
import { tallyPoll, type PostPoll } from './usePostPolls';
import { resolveBadges, type BadgeDef } from '@/lib/badges';
import { deriveIsAdmin, deriveIsModerator } from '@/lib/roles';

export type FeedTab = 'foryou' | 'following' | 'news';

export interface FeedPost extends ForumPost {
  poll?: PostPoll | null;
  gif_url?: string | null;
  images?: string[] | null;
  watch_room_id?: string | null;
  quoted_post_id?: string | null;
  media_type?: string | null;
  community_id?: string | null;
  /** Lightweight summary of the post's community, for the global-feed attribution chip. */
  community?: { id: string; name: string; slug: string; icon_url: string | null; banner_url: string | null; is_verified: boolean } | null;
  repost_count?: number;
  reposted?: boolean;
  bookmarked?: boolean;
  /** Resolved poster badges (stored grants + derived admin/mod). */
  badges?: BadgeDef[];
  /** Anime-episode proxy rank score for the author's name gradient / RankBadge. */
  author_rank_score?: number;
  /** True when the author's profile is flagged official/verified (News bot). */
  author_is_official?: boolean;
  /** Source label for News posts (metadata.source), e.g. "Anime News Network". */
  news_source?: string | null;
}

export type FeedItem =
  | { kind: 'post'; sortAt: number; post: FeedPost }
  | { kind: 'watchroom'; sortAt: number; room: WatchRoom };

export type FeedPostType = 'watchroom' | 'tierlist' | 'playlist';

export interface FeedOptions {
  tag?: string;
  communityId?: string;
  /** Restrict the feed to posts carrying a given embed type. */
  postType?: FeedPostType;
  /** Free-text filter over post title/content (community search takeover). */
  search?: string;
}

const PAGE_SIZE = 20;
const PROFILE_COLS = 'user_id, display_name, avatar_url, username';

/**
 * Unified, paginated community feed. Merges approved forum posts (with polls,
 * embeds, repost/bookmark state) and public watchroom lobbies. Watchroom
 * lobbies are attached to the first page only. Supports tab / hashtag /
 * community filters. Social/poll batches are guarded so the feed still renders
 * before the feed migrations are applied.
 */
export function useFeed(tab: FeedTab, opts: FeedOptions = {}) {
  const { user } = useAuth();
  const { tag, communityId, postType, search } = opts;
  const searchTerm = search?.trim().replace(/[,()%*\\]/g, ' ').trim() || '';

  return useInfiniteQuery({
    queryKey: ['feed', tab, tag ?? null, communityId ?? null, postType ?? null, searchTerm || null, user?.id],
    initialPageParam: null as string | null,
    refetchOnWindowFocus: false,
    getNextPageParam: (lastPage: FeedItem[]) => {
      const posts = lastPage.filter((i) => i.kind === 'post');
      if (posts.length < PAGE_SIZE) return undefined;
      return new Date(posts[posts.length - 1].sortAt).toISOString();
    },
    queryFn: async ({ pageParam }): Promise<FeedItem[]> => {
      const db = supabase as any;
      const firstPage = pageParam === null;

      let followingIds: string[] = [];
      if (tab === 'following') {
        if (!user) return [];
        const { data: follows } = await supabase
          .from('user_follows')
          .select('following_id')
          .eq('follower_id', user.id);
        followingIds = [...new Set((follows || []).map((f: any) => f.following_id))];
        if (followingIds.length === 0) return [];
      }

      // ---- Posts ----
      let postIds: string[] | null = null;
      if (tag) {
        const { data: tagged } = await db
          .from('post_hashtags')
          .select('post_id')
          .eq('tag', tag.toLowerCase())
          .order('created_at', { ascending: false })
          .limit(200);
        postIds = [...new Set((tagged || []).map((t: any) => t.post_id))];
        if (postIds.length === 0) return [];
      }

      let postQuery = supabase
        .from('forum_posts')
        .select('*')
        .eq('is_approved', true)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (pageParam) postQuery = postQuery.lt('created_at', pageParam);
      if (tab === 'news') postQuery = postQuery.eq('flair', 'News');
      if (tab === 'following') postQuery = postQuery.in('user_id', followingIds);
      if (communityId) postQuery = postQuery.eq('community_id', communityId);
      if (postIds) postQuery = postQuery.in('id', postIds);
      if (searchTerm) postQuery = postQuery.or(`title.ilike.%${searchTerm}%,content.ilike.%${searchTerm}%`);

      // Post-type filter (item 11): playlist / tier list share a column; a
      // watchroom share lives in metadata.watch_room_id.
      if (postType === 'playlist') postQuery = postQuery.not('playlist_id', 'is', null);
      else if (postType === 'tierlist') postQuery = postQuery.not('tierlist_id', 'is', null);
      else if (postType === 'watchroom') postQuery = postQuery.not('metadata->>watch_room_id', 'is', null);

      const { data: rawPosts, error: postErr } = await postQuery;
      if (postErr) throw postErr;
      const posts = (rawPosts || []) as any[];
      const ids = posts.map((p) => p.id);

      // Profiles
      const authorIds = [...new Set(posts.map((p) => p.user_id))];
      const { data: authorProfiles } = authorIds.length
        ? await supabase.from('profiles').select(PROFILE_COLS).in('user_id', authorIds)
        : { data: [] as any[] };
      const profileMap = new Map((authorProfiles || []).map((p: any) => [p.user_id, p]));

      // Community summaries for attribution chips (posts made inside a community
      // surface in the global feed labeled with their community + a join card).
      const communityMap = new Map<string, { id: string; name: string; slug: string; icon_url: string | null; banner_url: string | null; is_verified: boolean }>();
      const communityIds = [...new Set(posts.map((p) => p.community_id).filter(Boolean))] as string[];
      if (communityIds.length) {
        try {
          const { data: comm, error } = await db
            .from('communities')
            .select('id, name, slug, icon_url, banner_url, is_verified')
            .in('id', communityIds);
          if (error) throw error;
          ((comm as any[]) || []).forEach((c: any) =>
            communityMap.set(c.id, { id: c.id, name: c.name, slug: c.slug, icon_url: c.icon_url ?? null, banner_url: c.banner_url ?? null, is_verified: !!c.is_verified }),
          );
        } catch { /* pre-migration */ }
      }

      // Author badges (stored grants + derived admin/mod) + episode-count rank proxy.
      const badgeMap = new Map<string, BadgeDef[]>();
      const rankScoreMap = new Map<string, number>();
      if (authorIds.length) {
        const [{ data: badgeRows }, { data: roleRows }, { data: watchRows }] = await Promise.all([
          supabase.from('user_badges' as any).select('user_id, badge_key').in('user_id', authorIds),
          supabase.from('profiles').select('user_id, is_admin, is_moderator, role').in('user_id', authorIds),
          supabase.from('watch_history').select('user_id').in('user_id', authorIds),
        ]);
        const keysByUser = new Map<string, string[]>();
        ((badgeRows as any[]) || []).forEach((r: any) => {
          const list = keysByUser.get(r.user_id) || [];
          list.push(r.badge_key);
          keysByUser.set(r.user_id, list);
        });
        const roleByUser = new Map<string, any>();
        ((roleRows as any[]) || []).forEach((r: any) => roleByUser.set(r.user_id, r));
        ((watchRows as any[]) || []).forEach((w: any) =>
          rankScoreMap.set(w.user_id, (rankScoreMap.get(w.user_id) || 0) + 1),
        );
        for (const id of authorIds) {
          const role = roleByUser.get(id);
          badgeMap.set(
            id,
            resolveBadges(keysByUser.get(id) || [], {
              isAdmin: deriveIsAdmin(role),
              isModerator: deriveIsModerator(role),
            }),
          );
        }
      }

      // Official/verified authors (guarded — is_official ships with community_phase_b).
      const officialSet = new Set<string>();
      if (authorIds.length) {
        try {
          const { data: offRows, error } = await db
            .from('profiles')
            .select('user_id, is_official')
            .in('user_id', authorIds);
          if (error) throw error;
          ((offRows as any[]) || []).forEach((r: any) => {
            if (r.is_official) officialSet.add(r.user_id);
          });
        } catch { /* pre-migration */ }
      }

      // Viewer votes
      const voteMap = new Map<string, 1 | -1>();
      if (user && ids.length) {
        const { data: votes } = await supabase
          .from('forum_votes')
          .select('post_id, vote_type')
          .eq('user_id', user.id)
          .in('post_id', ids);
        (votes || []).forEach((v: any) => v.post_id && voteMap.set(v.post_id, v.vote_type));
      }

      // Polls (guarded)
      const pollMap = new Map<string, PostPoll>();
      if (ids.length) {
        try {
          const { data: polls, error } = await db.from('post_polls').select('*').in('post_id', ids);
          if (error) throw error;
          const pollList = (polls || []) as any[];
          if (pollList.length) {
            const { data: pollVotes } = await db
              .from('post_poll_votes')
              .select('poll_id, user_id, option_index')
              .in('poll_id', pollList.map((p) => p.id));
            const byPoll = new Map<string, any[]>();
            (pollVotes || []).forEach((v: any) => {
              const arr = byPoll.get(v.poll_id) || [];
              arr.push(v);
              byPoll.set(v.poll_id, arr);
            });
            pollList.forEach((poll: any) => pollMap.set(poll.post_id, tallyPoll(poll, byPoll.get(poll.id) || [], user?.id)));
          }
        } catch { /* pre-migration */ }
      }

      // Reposts + bookmarks (guarded)
      const repostCount = new Map<string, number>();
      const repostedSet = new Set<string>();
      const bookmarkedSet = new Set<string>();
      if (ids.length) {
        try {
          const { data: reposts, error } = await db.from('post_reposts').select('post_id, user_id').in('post_id', ids);
          if (error) throw error;
          (reposts || []).forEach((r: any) => {
            repostCount.set(r.post_id, (repostCount.get(r.post_id) || 0) + 1);
            if (user && r.user_id === user.id) repostedSet.add(r.post_id);
          });
        } catch { /* pre-migration */ }
        if (user) {
          try {
            const { data: bms, error } = await db
              .from('post_bookmarks')
              .select('post_id')
              .eq('user_id', user.id)
              .in('post_id', ids);
            if (error) throw error;
            (bms || []).forEach((b: any) => bookmarkedSet.add(b.post_id));
          } catch { /* pre-migration */ }
        }
      }

      const feedPosts: FeedItem[] = posts.map((p) => {
        const metadata = (p.metadata || {}) as Record<string, any>;
        const images: string[] | null = Array.isArray(metadata.images) && metadata.images.length
          ? metadata.images
          : p.image_url
            ? [p.image_url]
            : null;
        const post: FeedPost = {
          ...p,
          profiles: profileMap.get(p.user_id) || null,
          user_vote: voteMap.get(p.id) || null,
          poll: pollMap.get(p.id) || null,
          gif_url: metadata.gif_url || null,
          images,
          watch_room_id: metadata.watch_room_id || null,
          quoted_post_id: metadata.quoted_post_id || null,
          media_type: metadata.media_type || (p.anime_id ? 'anime' : null),
          community: p.community_id ? communityMap.get(p.community_id) ?? null : null,
          repost_count: repostCount.get(p.id) || 0,
          reposted: repostedSet.has(p.id),
          bookmarked: bookmarkedSet.has(p.id),
          badges: badgeMap.get(p.user_id) || [],
          author_rank_score: rankScoreMap.get(p.user_id) || 0,
          author_is_official: officialSet.has(p.user_id),
          news_source: (metadata.source as string) || null,
        };
        return { kind: 'post', sortAt: new Date(p.created_at).getTime(), post };
      });

      // ---- For You personalization (guarded) ----
      // Boost each post by the viewer's interest in its hashtags, so the page
      // re-ranks by recency + Σ(interest.weight for matching tags). Falls back to
      // pure recency pre-migration or when the viewer has no recorded interests.
      const boostByPost = new Map<string, number>();
      if (tab === 'foryou' && user && ids.length) {
        try {
          const [{ data: interests }, { data: tagRows }] = await Promise.all([
            db.from('user_tag_interests').select('tag, weight').eq('user_id', user.id),
            db.from('post_hashtags').select('post_id, tag').in('post_id', ids),
          ]);
          const weightByTag = new Map<string, number>(
            ((interests as any[]) || []).map((r: any) => [String(r.tag).toLowerCase(), Number(r.weight) || 0]),
          );
          ((tagRows as any[]) || []).forEach((r: any) => {
            const w = weightByTag.get(String(r.tag).toLowerCase());
            if (w) boostByPost.set(r.post_id, (boostByPost.get(r.post_id) || 0) + w);
          });
        } catch { /* pre-migration */ }
      }
      // Each interest point floats a post ~6h up the recency axis.
      const INTEREST_MS = 6 * 60 * 60 * 1000;
      // In For You, News posts stay in the mix but are pushed ~1.5d down the
      // recency axis so genuine user posts of similar age always rank above them
      // (item 5: "mix some news in For You but prioritise user posts").
      const NEWS_PENALTY_MS = tab === 'foryou' ? 36 * 60 * 60 * 1000 : 0;
      const rankOf = (item: FeedItem) => {
        if (item.kind !== 'post') return item.sortAt;
        let r = item.sortAt + (boostByPost.get(item.post.id) || 0) * INTEREST_MS;
        if (item.post.flair === 'News') r -= NEWS_PENALTY_MS;
        return r;
      };
      // Pinned posts float to the top of the view they belong to. Inside a
      // community (communityId set) any pinned post floats; in the global feed
      // only GENERAL pins (no community_id) float — a community pin never leaks
      // into the aggregate feed (item 8: "global ones ... show that those are global").
      const isPinned = (item: FeedItem) =>
        item.kind === 'post' && !!item.post.is_pinned && (communityId ? true : !item.post.community_id);

      // ---- Watchrooms (first page only, not on news/tag/community/type views) ----
      let feedRooms: FeedItem[] = [];
      if (firstPage && tab !== 'news' && !tag && !communityId && !postType && !searchTerm) {
        const { data: rawRooms } = await supabase
          .from('watch_rooms')
          .select(WATCH_ROOM_COLUMNS)
          .eq('is_active', true)
          .in('access_type', ['public', 'password'])
          .order('created_at', { ascending: false })
          .limit(20);
        let rooms = (rawRooms || []) as any[];
        if (tab === 'following') rooms = rooms.filter((r) => followingIds.includes(r.host_id));

        if (rooms.length) {
          const roomIds = rooms.map((r) => r.id);
          const { data: participants } = await supabase
            .from('watch_room_participants')
            .select('room_id')
            .in('room_id', roomIds);
          const countMap = new Map<string, number>();
          (participants || []).forEach((p: any) => countMap.set(p.room_id, (countMap.get(p.room_id) || 0) + 1));

          const hostIds = [...new Set(rooms.map((r) => r.host_id))];
          const { data: hostProfiles } = await supabase
            .from('profiles')
            .select('user_id, username, display_name, avatar_url')
            .in('user_id', hostIds);
          const hostMap = new Map((hostProfiles || []).map((p: any) => [p.user_id, p]));

          feedRooms = rooms.map((room) => ({
            kind: 'watchroom' as const,
            sortAt: new Date(room.created_at).getTime(),
            room: { ...room, participant_count: countMap.get(room.id) || 0, host_profile: hostMap.get(room.host_id) } as WatchRoom,
          }));
        }
      }

      return [...feedPosts, ...feedRooms].sort((a, b) => {
        // Pinned posts always float to the top; then rank score (recency + interest).
        const pa = isPinned(a) ? 1 : 0;
        const pb = isPinned(b) ? 1 : 0;
        if (pa !== pb) return pb - pa;
        return rankOf(b) - rankOf(a);
      });
    },
  });
}
