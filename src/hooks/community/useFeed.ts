import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { ForumPost } from './useForum';
import type { WatchRoom } from '@/hooks/media/useWatchRoom';
import { WATCH_ROOM_COLUMNS } from '@/hooks/media/useWatchRoom';
import { tallyPoll, type PostPoll } from './usePostPolls';
import { resolveBadges, type BadgeDef } from '@/lib/badges';
import type { ReactionCounts } from './useReactions';
import { nextFeedCursor, type FeedCursor } from '@/lib/communityFeedCursor';
import type { RawComment } from '@/hooks/user/useUserCommentsDetailed';
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
  /**
   * Batched reaction tallies for the page. Seeds each card's `useReactions`
   * so first paint costs no per-post request (the N+1 this replaced).
   */
  reaction_counts?: ReactionCounts | null;
}

export type FeedItem =
  | { kind: 'post'; sortAt: number; post: FeedPost }
  | { kind: 'comment'; sortAt: number; comment: RawComment }
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
    initialPageParam: null as FeedCursor | null,
    refetchOnWindowFocus: false,
    getNextPageParam: (lastPage: FeedItem[]) => {
      const posts = lastPage.filter((i) => i.kind === 'post');
      const comments = lastPage.filter((i) => i.kind === 'comment');
      return nextFeedCursor(
        posts.map(i => ({ createdAt: i.post.created_at, id: i.post.id })),
        comments.map(i => ({ createdAt: i.comment.created_at, id: i.comment.id })),
        PAGE_SIZE,
      );
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

      // Explicit columns: `select('*')` hauls full content/metadata blobs per
      // row. Every field below is read by PostCard or the mapping beneath
      // (column existence verified against generated Supabase types +
      // soft-delete migration; `deleted_by_role`/`is_deleted` come from the
      // tombstones migration whose types are stale).
      let postQuery = supabase
        .from('forum_posts')
        .select(
          'id, user_id, community_id, title, content, image_url, flair, metadata, anime_id, anime_name, anime_poster, playlist_id, tierlist_id, is_pinned, is_approved, is_deleted, is_spoiler, deleted_by_role, comments_count, created_at',
        )
        .eq('is_approved', true)
        .order('created_at', { ascending: false }).order('id', { ascending: false })
        .limit(PAGE_SIZE);

      if (pageParam?.posts) {
        const { createdAt, id } = pageParam.posts;
        postQuery = postQuery.or(`created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id})`);
      }
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

      const wantsComments = tab !== 'news' && !communityId && !tag && !postType && pageParam?.comments !== false;
      const loadComments = async (): Promise<RawComment[]> => {
        if (!wantsComments) return [];
        let query = db.from('comments')
          .select('id, user_id, entity_type, entity_id, episode_id, content, is_spoiler, created_at, attachments, embeds, source_title, source_kind, source_path')
          .in('entity_type', ['anime', 'manga'])
          .eq('is_deleted', false)
          .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(PAGE_SIZE);
        if (pageParam?.comments) {
          const { createdAt, id } = pageParam.comments;
          query = query.or(`created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id})`);
        }
        if (tab === 'following') query = query.in('user_id', followingIds);
        if (searchTerm) query = query.ilike('content', `%${searchTerm}%`);
        const { data, error } = await query;
        if (error) throw error;
        return (data || []) as RawComment[];
      };
      const [{ data: rawPosts, error: postErr }, commentRows] = await Promise.all([
        pageParam?.posts === false ? Promise.resolve({ data: [], error: null }) : postQuery,
        loadComments(),
      ]);
      if (postErr) throw postErr;
      const posts = (rawPosts || []) as any[];
      const ids = posts.map((p) => p.id);

      // Profiles
      const authorIds = [...new Set(posts.map((p) => p.user_id))];
      const { data: authorProfiles } = authorIds.length
        ? await supabase.from('profiles').select(PROFILE_COLS).in('user_id', authorIds)
        : { data: [] as any[] };
      const profileMap = new Map((authorProfiles || []).map((p: any) => [p.user_id, p]));

      // ---- Enrichment wave ----
      // Everything below derives only from `posts`/`authorIds`, so it fans out
      // in one concurrent wave instead of ~10 sequential round-trips. Each
      // guarded fetch keeps its pre-migration try/catch and resolves to empty
      // rows on failure, exactly as the sequential version did.
      const communityIds = [...new Set(posts.map((p) => p.community_id).filter(Boolean))] as string[];
      const wantsRooms =
        firstPage && tab !== 'news' && !tag && !communityId && !postType && !searchTerm;
      const wantsInterests = tab === 'foryou' && !!user && ids.length > 0;
      const [
        communityRows,
        badgeBundle,
        officialRows,
        voteRows,
        pollBundle,
        repostRows,
        bookmarkRows,
        reactionRows,
        interestBundle,
        roomsBundle,
      ] = await Promise.all([
        (async (): Promise<any[]> => {
          if (!communityIds.length) return [];
          try {
            const { data, error } = await db
              .from('communities')
              .select('id, name, slug, icon_url, banner_url, is_verified')
              .in('id', communityIds);
            if (error) throw error;
            return (data as any[]) || [];
          } catch { return []; /* pre-migration */ }
        })(),
        (async (): Promise<{ badgeRows: any[]; roleRows: any[]; watchRows: any[] }> => {
          if (!authorIds.length) return { badgeRows: [], roleRows: [], watchRows: [] };
          const [{ data: badgeRows }, { data: roleRows }, { data: watchRows }] = await Promise.all([
            supabase.from('user_badges' as any).select('user_id, badge_key').in('user_id', authorIds),
            supabase.from('profiles').select('user_id, is_admin, is_moderator, role').in('user_id', authorIds),
            supabase.from('watch_history').select('user_id').in('user_id', authorIds),
          ]);
          return {
            badgeRows: (badgeRows as any[]) || [],
            roleRows: (roleRows as any[]) || [],
            watchRows: (watchRows as any[]) || [],
          };
        })(),
        (async (): Promise<any[]> => {
          if (!authorIds.length) return [];
          try {
            const { data, error } = await db
              .from('profiles')
              .select('user_id, is_official')
              .in('user_id', authorIds);
            if (error) throw error;
            return (data as any[]) || [];
          } catch { return []; /* pre-migration */ }
        })(),
        (async (): Promise<any[]> => {
          if (!user || !ids.length) return [];
          const { data } = await supabase
            .from('forum_votes')
            .select('post_id, vote_type')
            .eq('user_id', user.id)
            .in('post_id', ids);
          return (data as any[]) || [];
        })(),
        (async (): Promise<{ polls: any[]; pollVotes: any[] }> => {
          if (!ids.length) return { polls: [], pollVotes: [] };
          try {
            const { data: polls, error } = await db.from('post_polls').select('*').in('post_id', ids);
            if (error) throw error;
            const pollList = (polls || []) as any[];
            if (!pollList.length) return { polls: [], pollVotes: [] };
            const { data: pollVotes } = await db
              .from('post_poll_votes')
              .select('poll_id, user_id, option_index')
              .in('poll_id', pollList.map((p) => p.id));
            return { polls: pollList, pollVotes: (pollVotes as any[]) || [] };
          } catch { return { polls: [], pollVotes: [] }; /* pre-migration */ }
        })(),
        (async (): Promise<any[]> => {
          if (!ids.length) return [];
          try {
            const { data, error } = await db.from('post_reposts').select('post_id, user_id').in('post_id', ids);
            if (error) throw error;
            return (data as any[]) || [];
          } catch { return []; /* pre-migration */ }
        })(),
        (async (): Promise<any[]> => {
          if (!user || !ids.length) return [];
          try {
            const { data, error } = await db
              .from('post_bookmarks')
              .select('post_id')
              .eq('user_id', user.id)
              .in('post_id', ids);
            if (error) throw error;
            return (data as any[]) || [];
          } catch { return []; /* pre-migration */ }
        })(),
        // Batched reactions: one query for the whole page instead of one per
        // PostCard (the ~20-query N+1 on first paint).
        (async (): Promise<any[]> => {
          if (!ids.length) return [];
          try {
            const { data, error } = await supabase
              .from('reactions')
              .select('entity_id, reaction_type, user_id')
              .eq('entity_type', 'forum_post')
              .in('entity_id', ids);
            if (error) throw error;
            return (data as any[]) || [];
          } catch { return []; }
        })(),
        (async (): Promise<{ interests: any[]; tagRows: any[] }> => {
          if (!wantsInterests) return { interests: [], tagRows: [] };
          try {
            const [{ data: interests }, { data: tagRows }] = await Promise.all([
              db.from('user_tag_interests').select('tag, weight').eq('user_id', user!.id),
              db.from('post_hashtags').select('post_id, tag').in('post_id', ids),
            ]);
            return { interests: (interests as any[]) || [], tagRows: (tagRows as any[]) || [] };
          } catch { return { interests: [], tagRows: [] }; /* pre-migration */ }
        })(),
        (async (): Promise<{ rooms: any[]; participants: any[]; hostProfiles: any[] }> => {
          if (!wantsRooms) return { rooms: [], participants: [], hostProfiles: [] };
          const { data: rawRooms } = await supabase
            .from('watch_rooms')
            .select(WATCH_ROOM_COLUMNS)
            .eq('is_active', true)
            .in('access_type', ['public', 'password'])
            .order('created_at', { ascending: false })
            .limit(20);
          let rooms = (rawRooms || []) as any[];
          if (tab === 'following') rooms = rooms.filter((r) => followingIds.includes(r.host_id));
          if (!rooms.length) return { rooms: [], participants: [], hostProfiles: [] };
          const roomIds = rooms.map((r) => r.id);
          const hostIds = [...new Set(rooms.map((r) => r.host_id))];
          const [{ data: participants }, { data: hostProfiles }] = await Promise.all([
            supabase.from('watch_room_participants').select('room_id').in('room_id', roomIds),
            supabase.from('profiles').select('user_id, username, display_name, avatar_url').in('user_id', hostIds),
          ]);
          return {
            rooms,
            participants: (participants as any[]) || [],
            hostProfiles: (hostProfiles as any[]) || [],
          };
        })(),
      ]);

      // Community summaries for attribution chips (posts made inside a community
      // surface in the global feed labeled with their community + a join card).
      const communityMap = new Map<string, { id: string; name: string; slug: string; icon_url: string | null; banner_url: string | null; is_verified: boolean }>();
      communityRows.forEach((c: any) =>
        communityMap.set(c.id, { id: c.id, name: c.name, slug: c.slug, icon_url: c.icon_url ?? null, banner_url: c.banner_url ?? null, is_verified: !!c.is_verified }),
      );

      // Author badges (stored grants + derived admin/mod) + episode-count rank proxy.
      const badgeMap = new Map<string, BadgeDef[]>();
      const rankScoreMap = new Map<string, number>();
      {
        const keysByUser = new Map<string, string[]>();
        badgeBundle.badgeRows.forEach((r: any) => {
          const list = keysByUser.get(r.user_id) || [];
          list.push(r.badge_key);
          keysByUser.set(r.user_id, list);
        });
        const roleByUser = new Map<string, any>();
        badgeBundle.roleRows.forEach((r: any) => roleByUser.set(r.user_id, r));
        badgeBundle.watchRows.forEach((w: any) =>
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
      officialRows.forEach((r: any) => {
        if (r.is_official) officialSet.add(r.user_id);
      });

      // Viewer votes
      const voteMap = new Map<string, 1 | -1>();
      voteRows.forEach((v: any) => v.post_id && voteMap.set(v.post_id, v.vote_type));

      // Polls (guarded)
      const pollMap = new Map<string, PostPoll>();
      {
        const byPoll = new Map<string, any[]>();
        pollBundle.pollVotes.forEach((v: any) => {
          const arr = byPoll.get(v.poll_id) || [];
          arr.push(v);
          byPoll.set(v.poll_id, arr);
        });
        pollBundle.polls.forEach((poll: any) => pollMap.set(poll.post_id, tallyPoll(poll, byPoll.get(poll.id) || [], user?.id)));
      }

      // Reposts + bookmarks (guarded)
      const repostCount = new Map<string, number>();
      const repostedSet = new Set<string>();
      const bookmarkedSet = new Set<string>();
      repostRows.forEach((r: any) => {
        repostCount.set(r.post_id, (repostCount.get(r.post_id) || 0) + 1);
        if (user && r.user_id === user.id) repostedSet.add(r.post_id);
      });
      bookmarkRows.forEach((b: any) => bookmarkedSet.add(b.post_id));

      // Reaction tallies for the page (seeds each card — no per-post fetch).
      const reactionMap = new Map<string, ReactionCounts>();
      const emptyReactionCounts = (): ReactionCounts => ({
        like: 0, love: 0, laugh: 0, wow: 0, sad: 0, angry: 0, user_reaction: null,
      });
      reactionRows.forEach((r: any) => {
        if (!r?.entity_id) return;
        let counts = reactionMap.get(r.entity_id);
        if (!counts) {
          counts = emptyReactionCounts();
          reactionMap.set(r.entity_id, counts);
        }
        if (r.reaction_type === 'like' || r.reaction_type === 'love' || r.reaction_type === 'laugh' || r.reaction_type === 'wow' || r.reaction_type === 'sad' || r.reaction_type === 'angry') {
          counts[r.reaction_type] += 1;
        }
        if (user && r.user_id === user.id) {
          counts.user_reaction = r.reaction_type as ReactionCounts['user_reaction'];
        }
      });

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
          reaction_counts: reactionMap.get(p.id) || null,
        };
        return { kind: 'post', sortAt: new Date(p.created_at).getTime(), post };
      });

      // ---- For You personalization (guarded) ----
      // Boost each post by the viewer's interest in its hashtags, so the page
      // re-ranks by recency + Σ(interest.weight for matching tags). Falls back to
      // pure recency pre-migration or when the viewer has no recorded interests.
      const boostByPost = new Map<string, number>();
      {
        const weightByTag = new Map<string, number>(
          (interestBundle.interests || []).map((r: any) => [String(r.tag).toLowerCase(), Number(r.weight) || 0]),
        );
        (interestBundle.tagRows || []).forEach((r: any) => {
          const w = weightByTag.get(String(r.tag).toLowerCase());
          if (w) boostByPost.set(r.post_id, (boostByPost.get(r.post_id) || 0) + w);
        });
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
      // Rows arrive from the enrichment wave above; only the shaping stays here.
      const countMap = new Map<string, number>();
      roomsBundle.participants.forEach((p: any) => countMap.set(p.room_id, (countMap.get(p.room_id) || 0) + 1));
      const hostMap = new Map((roomsBundle.hostProfiles || []).map((p: any) => [p.user_id, p]));
      const feedRooms: FeedItem[] = (roomsBundle.rooms || []).map((room: any) => ({
        kind: 'watchroom' as const,
        sortAt: new Date(room.created_at).getTime(),
        room: { ...room, participant_count: countMap.get(room.id) || 0, host_profile: hostMap.get(room.host_id) } as WatchRoom,
      }));

      const feedComments: FeedItem[] = commentRows.map(comment => ({ kind: 'comment', sortAt: new Date(comment.created_at).getTime(), comment }));
      return [...feedPosts, ...feedRooms, ...feedComments].sort((a, b) => {
        // Pinned posts always float to the top; then rank score (recency + interest).
        const pa = isPinned(a) ? 1 : 0;
        const pb = isPinned(b) ? 1 : 0;
        if (pa !== pb) return pb - pa;
        return rankOf(b) - rankOf(a);
      });
    },
  });
}
