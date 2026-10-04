import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { moderateContent, getViolationMessage } from '@/lib/autoModeration';
import { sanitizeComment } from '@/lib/sanitize';
import { notifyComment } from '@/core/network/discord-webhook';
import { sanitizeAttachments, type CommentAttachment } from '@/lib/commentMedia';
import { sanitizeEmbeds, type CommentEmbed } from '@/lib/commentEmbeds';
import { fetchCommentPolls, type CommentPoll } from './useCommentPolls';
import { ugcErrorMessage } from '@/lib/ugcErrors';

/** Usernames @-mentioned in a comment body (case preserved for exact lookup). */
function extractMentions(content: string): string[] {
  const out = new Set<string>();
  const re = /@([a-zA-Z0-9_]{2,32})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) out.add(m[1]);
  return [...out];
}

interface CommentProfile {
  display_name: string | null;
  avatar_url: string | null;
  username: string | null;
  is_admin: boolean | null;
  role: string | null;
  total_episodes: number;
}

/** Every surface comments can attach to. episode_id stays anime-only. */
export type CommentEntityType = 'anime' | 'manga' | 'playlist' | 'tier_list' | 'forum_post';

interface Comment {
  id: string;
  user_id: string;
  entity_type: CommentEntityType;
  entity_id: string;
  episode_id: string | null;
  content: string;
  parent_id: string | null;
  likes_count: number;
  is_spoiler: boolean;
  is_pinned: boolean;
  is_deleted?: boolean;
  deleted_by?: string | null;
  deleted_by_role?: string | null;
  created_at: string;
  updated_at: string;
  attachments: CommentAttachment[];
  mentions: string[];
  embeds: CommentEmbed[];
  poll?: CommentPoll | null;
  profile?: CommentProfile;
  user_liked?: boolean;
}

/** A poll draft handed to useAddComment (options + optional close time). */
export interface CommentPollDraft {
  question?: string;
  options: string[];
  endsAt?: string | null;
}

export function useComments(
  entityType: CommentEntityType | undefined,
  entityId: string | undefined,
  episodeId?: string,
) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['comments', entityType, entityId, episodeId],
    queryFn: async () => {
      let query = supabase
        .from('comments')
        .select('*')
        .eq('entity_type', entityType!)
        .eq('entity_id', entityId!)
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

      // Fetch episode counts from watch_history for rank display
      const { data: watchRows } = await supabase
        .from('watch_history')
        .select('user_id')
        .in('user_id', userIds);
      const episodeCountMap = new Map<string, number>();
      watchRows?.forEach(w => {
        episodeCountMap.set(w.user_id, (episodeCountMap.get(w.user_id) || 0) + 1);
      });

      // NOTE: rank is derived from the real watched-episode count only. We do NOT
      // inflate it from manual achievement grants — doing so used to force e.g. a
      // "hashira" holder to 600 eps (rank Hashira) over their true count (Bankai).

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

      // Batch-load any attached polls for this page of comments.
      const pollMap = await fetchCommentPolls(comments.map(c => c.id), user?.id);

      const mapped = comments.map(c => ({
        ...c,
        is_pinned: !!(c as any).is_pinned,
        attachments: sanitizeAttachments((c as any).attachments),
        mentions: Array.isArray((c as any).mentions) ? (c as any).mentions : [],
        embeds: sanitizeEmbeds((c as any).embeds),
        poll: pollMap.get(c.id) ?? null,
        profile: {
          ...profileMap.get(c.user_id),
          total_episodes: episodeCountMap.get(c.user_id) || 0,
        },
        user_liked: likedIds.has(c.id),
      })) as Comment[];

      // Pinned comments float to the top. `is_pinned` comes from an unapplied
      // migration, so it's coerced to false when the column is absent; the sort
      // is stable, preserving created_at-desc order within each group.
      mapped.sort((a, b) => (b.is_pinned ? 1 : 0) - (a.is_pinned ? 1 : 0));
      return mapped;
    },
    enabled: !!entityType && !!entityId,
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

      // Fetch episode counts from watch_history for rank display
      const { data: watchRows } = await supabase
        .from('watch_history')
        .select('user_id')
        .in('user_id', userIds);
      const episodeCountMap = new Map<string, number>();
      watchRows?.forEach(w => {
        episodeCountMap.set(w.user_id, (episodeCountMap.get(w.user_id) || 0) + 1);
      });

      // NOTE: real watched-episode count only — see useComments for why manual
      // achievement grants must not inflate the displayed rank.

      let likedIds = new Set<string>();
      if (user) {
        const { data: likes } = await supabase
          .from('comment_likes')
          .select('comment_id')
          .eq('user_id', user.id)
          .in('comment_id', comments.map(c => c.id));

        likedIds = new Set(likes?.map(l => l.comment_id) || []);
      }

      // Batch-load any attached polls for these replies.
      const pollMap = await fetchCommentPolls(comments.map(c => c.id), user?.id);

      return comments.map(c => ({
        ...c,
        attachments: sanitizeAttachments((c as any).attachments),
        mentions: Array.isArray((c as any).mentions) ? (c as any).mentions : [],
        embeds: sanitizeEmbeds((c as any).embeds),
        poll: pollMap.get(c.id) ?? null,
        profile: {
          ...profileMap.get(c.user_id),
          total_episodes: episodeCountMap.get(c.user_id) || 0,
        },
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
      entityType,
      entityId,
      episodeId,
      content,
      parentId,
      isSpoiler = false,
      attachments = [],
      embeds = [],
      poll,
    }: {
      entityType: CommentEntityType;
      entityId: string;
      episodeId?: string;
      content: string;
      parentId?: string;
      isSpoiler?: boolean;
      attachments?: CommentAttachment[];
      embeds?: CommentEmbed[];
      poll?: CommentPollDraft | null;
    }) => {
      // Sanitize first
      const sanitized = sanitizeComment(content);

      // Auto-moderate content
      const moderation = moderateContent(sanitized);

      if (!moderation.isAllowed) {
        throw new Error(getViolationMessage(moderation.violations));
      }

      const cleanAttachments = sanitizeAttachments(attachments);
      const cleanEmbeds = sanitizeEmbeds(embeds);
      const pollOptions = (poll?.options ?? []).map(o => o.trim()).filter(Boolean);
      const hasPoll = pollOptions.length >= 2;

      // A comment must carry something — text, media, an embed, or a poll.
      if (
        !moderation.sanitizedContent.trim() &&
        cleanAttachments.length === 0 &&
        cleanEmbeds.length === 0 &&
        !hasPoll
      ) {
        throw new Error('Comment cannot be empty');
      }

      // Resolve @mentions to auth user ids so the notify_on_comment() trigger can
      // fan out mention notifications. Missing/unknown usernames simply drop out.
      const usernames = extractMentions(moderation.sanitizedContent);
      let mentionIds: string[] = [];
      if (usernames.length > 0) {
        const { data: mentioned } = await supabase
          .from('profiles')
          .select('user_id, username')
          .in('username', usernames);
        mentionIds = [...new Set((mentioned ?? []).map((m: any) => m.user_id))];
      }

      const { data, error } = await supabase
        .from('comments')
        .insert({
          user_id: user!.id,
          entity_type: entityType,
          entity_id: entityId,
          // episode_id scopes a sub-thread: episode number for anime, canonical
          // chapter number for manga (DB CHECK allows both).
          episode_id: entityType === 'anime' || entityType === 'manga' ? (episodeId ?? null) : null,
          content: moderation.sanitizedContent,
          parent_id: parentId,
          is_spoiler: isSpoiler,
          attachments: cleanAttachments as any,
          mentions: mentionIds as any,
          embeds: cleanEmbeds as any,
        } as any)
        .select()
        .single();

      if (error) throw error;

      // A poll is a second insert into the comment_polls side table, keyed on the
      // comment we just created. RLS lets the comment's author attach it. If this
      // fails the comment still stands — surface the error but don't unwind.
      if (hasPoll && data?.id) {
        const db = supabase as any;
        const { error: pollError } = await db
          .from('comment_polls')
          .insert({
            comment_id: data.id,
            question: poll?.question?.trim() || '',
            options: pollOptions,
            created_by: user!.id,
            ends_at: poll?.endsAt || null,
          });
        if (pollError) throw pollError;
      }

      return data;
    },
    // Optimistic insert: show the comment/reply the instant the user submits, so
    // posting feels instant instead of waiting for the round-trip + refetch. The
    // temp row is reconciled by the onSuccess invalidation (or rolled back on error).
    onMutate: async (variables) => {
      const listKey = ['comments', variables.entityType, variables.entityId, variables.episodeId] as const;
      const replyKey = variables.parentId ? (['replies', variables.parentId] as const) : null;
      const targetKey = replyKey ?? listKey;

      await queryClient.cancelQueries({ queryKey: targetKey });
      const previous = queryClient.getQueryData<Comment[]>(targetKey as any);

      const optimistic = {
        id: `optimistic-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        user_id: user?.id ?? 'me',
        entity_type: variables.entityType,
        entity_id: variables.entityId,
        episode_id: variables.episodeId ?? null,
        content: variables.content,
        parent_id: variables.parentId ?? null,
        is_spoiler: variables.isSpoiler ?? false,
        is_pinned: false,
        is_deleted: false,
        attachments: sanitizeAttachments(variables.attachments ?? []),
        embeds: sanitizeEmbeds(variables.embeds ?? []),
        mentions: [],
        poll: null,
        likes_count: 0,
        user_liked: false,
        created_at: new Date().toISOString(),
        profile: {
          user_id: user?.id,
          display_name: user?.user_metadata?.display_name ?? null,
          avatar_url: user?.user_metadata?.avatar_url ?? null,
          username: user?.user_metadata?.username ?? null,
          total_episodes: 0,
        },
        _optimistic: true,
      } as unknown as Comment;

      queryClient.setQueryData<Comment[]>(targetKey as any, (old) => {
        const list = old ? [...old] : [];
        // Replies render oldest-first; top-level render newest-first.
        return replyKey ? [...list, optimistic] : [optimistic, ...list];
      });

      return { previous, targetKey };
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['comments', variables.entityType, variables.entityId] });
      if (variables.parentId) {
        queryClient.invalidateQueries({ queryKey: ['replies', variables.parentId] });
      }
      toast.success('Comment posted');

      // Notify Discord comment channel
      notifyComment({
        userName: user?.user_metadata?.display_name || user?.email?.split('@')[0] || 'Anonymous',
        animeName: `${variables.entityType}:${variables.entityId}`,
        episodeId: variables.episodeId,
        content: variables.content,
        isSpoiler: variables.isSpoiler,
      });
    },
    onError: (error: Error, _variables, context: any) => {
      // Roll back the optimistic insert.
      if (context?.previous !== undefined && context?.targetKey) {
        queryClient.setQueryData(context.targetKey, context.previous);
      }
      toast.error(ugcErrorMessage(error) || error.message || 'Failed to post comment');
    },
  });
}

/**
 * Soft-delete a comment so its row (and any thread structure hanging off it)
 * survives as a role-labeled tombstone. Routes through the soft_delete_comment
 * RPC (authorizes author | community owner/mod | platform staff, and stamps
 * deleted_by_role). Falls back to a direct soft-delete, then a hard delete, if
 * the RPC / columns aren't present yet (migration 20260924… not applied).
 */
async function softDeleteComment(commentId: string) {
  const { error: rpcErr } = await (supabase as any).rpc('soft_delete_comment', { p_comment_id: commentId });
  if (!rpcErr) return;

  if (rpcErr.code === 'PGRST202' || /function .*soft_delete_comment/i.test(rpcErr.message || '')) {
    const { error } = await supabase
      .from('comments')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() } as any)
      .eq('id', commentId);
    if (error) {
      const { error: delErr } = await supabase.from('comments').delete().eq('id', commentId);
      if (delErr) throw delErr;
    }
    return;
  }
  throw rpcErr;
}

export function useDeleteComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (commentId: string) => {
      await softDeleteComment(commentId);
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

/**
 * Edit a comment's body and its attached media / embeds, and optionally drop an
 * attached poll. Lets the author strip a GIF, shared post, playlist or poll
 * after the fact (the composer only adds on create).
 */
export function useEditComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      content,
      isSpoiler,
      attachments,
      embeds,
      removePoll,
    }: {
      id: string;
      content: string;
      isSpoiler?: boolean;
      attachments?: CommentAttachment[];
      embeds?: CommentEmbed[];
      removePoll?: boolean;
    }) => {
      const sanitized = sanitizeComment(content);
      const moderation = moderateContent(sanitized);
      if (!moderation.isAllowed) throw new Error(getViolationMessage(moderation.violations));

      const cleanAttachments = sanitizeAttachments(attachments ?? []);
      const cleanEmbeds = sanitizeEmbeds(embeds ?? []);

      const update: Record<string, any> = {
        content: moderation.sanitizedContent,
        attachments: cleanAttachments,
        embeds: cleanEmbeds,
        updated_at: new Date().toISOString(),
      };
      if (typeof isSpoiler === 'boolean') update.is_spoiler = isSpoiler;

      const { error } = await supabase.from('comments').update(update).eq('id', id);
      if (error) throw error;

      if (removePoll) {
        const db = supabase as any;
        await db.from('comment_polls').delete().eq('comment_id', id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments'] });
      queryClient.invalidateQueries({ queryKey: ['replies'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update comment');
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
