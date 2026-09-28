import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAnimeMetaByIds } from '@/hooks/api/useAnimeMetaByIds';
import { useMangaMetaByIds } from '@/hooks/api/useMangaMetaByIds';
import { sanitizeAttachments, type CommentAttachment } from '@/lib/commentMedia';
import { sanitizeEmbeds, type CommentEmbed } from '@/lib/commentEmbeds';
import { fetchCommentPolls, type CommentPoll } from '@/hooks/community/useCommentPolls';
import type { CommentEntityType } from '@/hooks/community/useComments';

/** Author identity attached to a detailed comment (for admin author links). */
export interface DetailedCommentAuthor {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

/** A comment enriched with its entity title, a deep-link target, structured
 *  media (attachments / embeds / poll) and — for the recent-comments feed — its
 *  author profile, so admin surfaces can render it exactly like the site does. */
export interface DetailedComment {
  id: string;
  user_id: string;
  entity_type: CommentEntityType;
  entity_id: string;
  episode_id: string | null;
  content: string;
  is_spoiler: boolean;
  created_at: string;
  /** Resolved title of the thing being commented on (best-effort). */
  title: string;
  /** Route to the entity, ending in `#comment-<id>` so the canonical Comments
   *  component scrolls to and highlights this comment on arrival. */
  target: string;
  /** True for anime comments that carry an episode_id. */
  hasEpisode: boolean;
  attachments: CommentAttachment[];
  embeds: CommentEmbed[];
  poll: CommentPoll | null;
  author: DetailedCommentAuthor | null;
}

interface RawComment {
  id: string;
  user_id: string;
  entity_type: CommentEntityType;
  entity_id: string;
  episode_id: string | null;
  content: string;
  is_spoiler: boolean;
  created_at: string;
  attachments?: unknown;
  embeds?: unknown;
}

const SELECT =
  'id, user_id, entity_type, entity_id, episode_id, content, is_spoiler, created_at, is_deleted, attachments, embeds';

const digits = (v: string) => v.match(/(\d+)/)?.[1] ?? v;

/**
 * Shared enrichment for a page of raw comments: resolves each to its entity
 * title + `#comment-<id>` deep-link, sanitizes attachments/embeds, batch-loads
 * polls, and (when `withAuthors`) joins author profiles. Anime/manga titles come
 * from AniList (batched); playlist / tier_list / forum titles from Supabase.
 */
function useEnrichedComments(rows: RawComment[], withAuthors: boolean) {
  const animeIds = useMemo(
    () => rows.filter((r) => r.entity_type === 'anime').map((r) => r.entity_id),
    [rows],
  );
  const mangaIds = useMemo(
    () => rows.filter((r) => r.entity_type === 'manga').map((r) => r.entity_id),
    [rows],
  );
  const { data: animeMeta = {} } = useAnimeMetaByIds(animeIds);
  const { data: mangaMeta = {} } = useMangaMetaByIds(mangaIds);

  const playlistIds = useMemo(
    () => [...new Set(rows.filter((r) => r.entity_type === 'playlist').map((r) => r.entity_id))],
    [rows],
  );
  const tierListIds = useMemo(
    () => [...new Set(rows.filter((r) => r.entity_type === 'tier_list').map((r) => r.entity_id))],
    [rows],
  );
  const forumIds = useMemo(
    () => [...new Set(rows.filter((r) => r.entity_type === 'forum_post').map((r) => r.entity_id))],
    [rows],
  );

  const { data: dbMeta } = useQuery({
    queryKey: ['comments-entity-meta', playlistIds, tierListIds, forumIds],
    queryFn: async () => {
      const playlists = new Map<string, string>();
      const tierLists = new Map<string, { title: string; shareCode: string }>();
      const forums = new Map<string, string>();

      const jobs: Promise<void>[] = [];
      if (playlistIds.length) {
        jobs.push(
          (async () => {
            const { data } = await supabase.from('playlists').select('id, name').in('id', playlistIds);
            (data || []).forEach((p: any) => playlists.set(p.id, p.name));
          })(),
        );
      }
      if (tierListIds.length) {
        jobs.push(
          (async () => {
            const { data } = await supabase
              .from('tier_lists')
              .select('id, name, title, share_code')
              .in('id', tierListIds);
            (data || []).forEach((t: any) =>
              tierLists.set(t.id, { title: t.title || t.name || 'Tier list', shareCode: t.share_code }),
            );
          })(),
        );
      }
      if (forumIds.length) {
        jobs.push(
          (async () => {
            const { data } = await supabase.from('forum_posts').select('id, title').in('id', forumIds);
            (data || []).forEach((f: any) => forums.set(f.id, f.title));
          })(),
        );
      }
      await Promise.all(jobs);
      return { playlists, tierLists, forums };
    },
    enabled: playlistIds.length + tierListIds.length + forumIds.length > 0,
  });

  // Batch-load polls attached to this page of comments.
  const commentIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const { data: pollMap } = useQuery({
    queryKey: ['comments-detailed-polls', commentIds],
    queryFn: () => fetchCommentPolls(commentIds),
    enabled: commentIds.length > 0,
  });

  // Author profiles (recent-comments feed only — the per-user variant already
  // knows the single author).
  const authorIds = useMemo(
    () => (withAuthors ? [...new Set(rows.map((r) => r.user_id))] : []),
    [rows, withAuthors],
  );
  const { data: authorMap } = useQuery({
    queryKey: ['comments-detailed-authors', authorIds],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('user_id, display_name, username, avatar_url')
        .in('user_id', authorIds);
      const map = new Map<string, DetailedCommentAuthor>();
      (data || []).forEach((p: any) => map.set(p.user_id, p));
      return map;
    },
    enabled: authorIds.length > 0,
  });

  return useMemo<DetailedComment[]>(() => {
    return rows.map((r) => {
      const hash = `#comment-${r.id}`;
      let title = 'Comment';
      let target = '#';
      switch (r.entity_type) {
        case 'anime': {
          title = (animeMeta as any)[Number(digits(r.entity_id))]?.title || 'Anime';
          target = (r.episode_id ? `/watch/${r.episode_id}` : `/anime/${r.entity_id}`) + hash;
          break;
        }
        case 'manga': {
          title = (mangaMeta as any)[Number(digits(r.entity_id))]?.title || 'Manga';
          target = `/manga/${r.entity_id}${hash}`;
          break;
        }
        case 'playlist': {
          title = dbMeta?.playlists.get(r.entity_id) || 'Playlist';
          target = `/playlist/${r.entity_id}${hash}`;
          break;
        }
        case 'tier_list': {
          const tl = dbMeta?.tierLists.get(r.entity_id);
          title = tl?.title || 'Tier list';
          target = tl?.shareCode ? `/tierlist/${tl.shareCode}${hash}` : '#';
          break;
        }
        case 'forum_post': {
          title = dbMeta?.forums.get(r.entity_id) || 'Forum post';
          target = `/community/forum/${r.entity_id}${hash}`;
          break;
        }
      }
      return {
        id: r.id,
        user_id: r.user_id,
        entity_type: r.entity_type,
        entity_id: r.entity_id,
        episode_id: r.episode_id,
        content: r.content,
        is_spoiler: r.is_spoiler,
        created_at: r.created_at,
        title,
        target,
        hasEpisode: r.entity_type === 'anime' && !!r.episode_id,
        attachments: sanitizeAttachments((r as any).attachments),
        embeds: sanitizeEmbeds((r as any).embeds),
        poll: pollMap?.get(r.id) ?? null,
        author: withAuthors ? authorMap?.get(r.user_id) ?? null : null,
      };
    });
  }, [rows, animeMeta, mangaMeta, dbMeta, pollMap, authorMap, withAuthors]);
}

/**
 * A user's non-deleted comments, each resolved to its entity title, a
 * `#comment-<id>` deep-link and its structured media.
 */
export function useUserCommentsDetailed(userId: string | undefined) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['user-comments-detailed', userId],
    queryFn: async () => {
      if (!userId) return [] as RawComment[];
      const { data, error } = await supabase
        .from('comments')
        .select(SELECT)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(60);
      if (error) throw error;
      return (data || []).filter((c: any) => !c.is_deleted) as RawComment[];
    },
    enabled: !!userId,
  });

  const comments = useEnrichedComments(rows, false);
  return { comments, isLoading };
}

/**
 * The most recent non-deleted comments across the whole site, enriched with
 * source title, deep-link, structured media and author profile — for the admin
 * "Recent Comments" panel.
 */
export function useRecentCommentsDetailed(limit = 30) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['recent-comments-detailed', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('comments')
        .select(SELECT)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data || []).filter((c: any) => !c.is_deleted) as RawComment[];
    },
  });

  const comments = useEnrichedComments(rows, true);
  return { comments, isLoading };
}
