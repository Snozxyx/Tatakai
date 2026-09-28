import { useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { Heart, Edit2, Trash2, Save, X, Loader2, Reply } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Textarea } from '@/components/ui/textarea';
import { RankBadge } from '@/components/ui/RankBadge';
import { UserBadges } from '@/components/ui/UserBadges';
import { getRankNameStyle } from '@/lib/rankUtils';
import { ProfileWidgetCard } from '@/components/profile/ProfileWidgetCard';
import { CommentContent, type TimestampTarget } from '@/components/comments/CommentContent';
import { CommentAttachments } from '@/components/comments/CommentAttachments';
import { CommentEmbeds } from '@/components/comments/CommentEmbeds';
import { RichCommentComposer } from '@/components/comments/RichCommentComposer';
import { useBatchUserBadges } from '@/hooks/community/useUserBadges';
import {
  useReplies,
  useAddComment,
  useEditComment,
  useDeleteComment,
  useLikeComment,
  type CommentEntityType,
} from '@/hooks/community/useComments';
import type { BadgeDef } from '@/lib/badges';
import { cn } from '@/lib/utils';
import { tombstoneLabel } from '@/lib/tombstone';

/**
 * The reply thread hanging off a top-level comment. Storage stays one level deep
 * — a "reply to a reply" is posted against the same top-level parent and simply
 * @-mentions whoever it answers, so the whole conversation reads as one thread.
 */
export function CommentReplies({
  parentId,
  entityType,
  entityId,
  episodeId,
  currentUserId,
  fallbackEpisodeId,
  onScreenEpisodeId,
  highlightId,
}: {
  parentId: string;
  /** Surface the thread belongs to — needed to post a reply-to-a-reply. */
  entityType: CommentEntityType;
  entityId: string;
  /** Episode the thread belongs to (anime only; undefined otherwise). */
  episodeId?: string;
  currentUserId?: string;
  fallbackEpisodeId?: string;
  /** The episode whose player is mounted, if any — enables in-page seeking. */
  onScreenEpisodeId?: string;
  /** Reply id to transiently highlight (deep-link scroll target). */
  highlightId?: string | null;
}) {
  const { data: replies = [], isLoading } = useReplies(parentId);
  const replierIds = useMemo(
    () => [...new Set(replies.map((r) => r.user_id).filter(Boolean))],
    [replies],
  );
  const { data: badgesByUser } = useBatchUserBadges(replierIds);

  if (isLoading) {
    return (
      <div className="mt-2 flex items-center gap-2 pl-11 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading replies…
      </div>
    );
  }
  if (replies.length === 0) return null;

  return (
    <div className="mt-3 space-y-3 border-l border-white/[0.06] pl-3 sm:ml-11">
      {replies.map((reply) => (
        <ReplyRow
          key={reply.id}
          reply={reply}
          isOwn={reply.user_id === currentUserId}
          canReply={!!currentUserId}
          threadParentId={parentId}
          entityType={entityType}
          entityId={entityId}
          episodeId={episodeId}
          badges={badgesByUser?.[reply.user_id]}
          fallbackEpisodeId={fallbackEpisodeId}
          onScreenEpisodeId={onScreenEpisodeId}
          highlightId={highlightId}
        />
      ))}
    </div>
  );
}

function ReplyRow({
  reply,
  isOwn,
  canReply,
  threadParentId,
  entityType,
  entityId,
  episodeId,
  badges,
  fallbackEpisodeId,
  onScreenEpisodeId,
  highlightId,
}: {
  reply: any;
  isOwn: boolean;
  canReply: boolean;
  /** Top-level comment id — every reply in the thread hangs off this. */
  threadParentId: string;
  entityType: CommentEntityType;
  entityId: string;
  episodeId?: string;
  badges?: BadgeDef[];
  fallbackEpisodeId?: string;
  onScreenEpisodeId?: string;
  highlightId?: string | null;
}) {
  const editComment = useEditComment();
  const deleteComment = useDeleteComment();
  const likeComment = useLikeComment();
  const addComment = useAddComment();
  const confirm = useConfirm();
  const isAnime = entityType === 'anime';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(reply.content ?? '');
  const [replying, setReplying] = useState(false);

  if (reply.is_deleted) {
    return (
      <p id={`comment-${reply.id}`} className="scroll-mt-24 text-sm italic text-muted-foreground">
        {tombstoneLabel((reply as any).deleted_by_role)}
      </p>
    );
  }

  const ns = getRankNameStyle(reply.profile?.total_episodes || 0);
  // Anime only: seek the mounted player, or deep-link to the source episode.
  // Other surfaces have no video, so timestamps stay plain text.
  const timestampTarget: TimestampTarget = !isAnime
    ? undefined
    : onScreenEpisodeId
    ? 'seek'
    : (seconds: number) => {
        const ep = reply.episode_id || fallbackEpisodeId;
        return ep ? `/watch/${encodeURIComponent(ep)}?t=${seconds}` : null;
      };

  const saveEdit = async () => {
    try {
      await editComment.mutateAsync({
        id: reply.id,
        content: draft,
        isSpoiler: reply.is_spoiler,
        // Preserve the reply's existing media/embeds — this inline editor only
        // touches the text.
        attachments: reply.attachments,
        embeds: reply.embeds,
      });
      setEditing(false);
    } catch {
      /* toast handled by the hook */
    }
  };

  // A reply-to-a-reply is stored against the same top-level parent (one level
  // deep) and pre-@mentions the person it answers.
  const replyMention = reply.profile?.username ? `@${reply.profile.username} ` : '';
  const submitReply = async (payload: {
    content: string;
    attachments: any[];
    isSpoiler: boolean;
    embeds: any[];
    poll: any;
  }) => {
    try {
      await addComment.mutateAsync({
        entityType,
        entityId,
        episodeId,
        parentId: threadParentId,
        content: payload.content,
        isSpoiler: payload.isSpoiler,
        attachments: payload.attachments,
        embeds: payload.embeds,
        poll: payload.poll,
      });
      setReplying(false);
    } catch {
      return false;
    }
  };

  return (
    <div
      id={`comment-${reply.id}`}
      className={cn(
        'flex gap-2.5 scroll-mt-24 rounded-2xl transition-shadow duration-500',
        highlightId === reply.id && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
      )}
    >
      <ProfileWidgetCard
        userId={reply.user_id}
        username={reply.profile?.username}
        displayName={reply.profile?.display_name}
        avatarUrl={reply.profile?.avatar_url}
        rankScore={reply.profile?.total_episodes || 0}
      >
        <Avatar className="h-7 w-7 flex-shrink-0 cursor-pointer hover:ring-2 ring-primary/30 transition-all">
          <AvatarImage src={reply.profile?.avatar_url || undefined} />
          <AvatarFallback className="bg-gradient-to-br from-primary/60 to-secondary/60 text-primary-foreground text-[10px] font-bold">
            {reply.profile?.display_name?.[0]?.toUpperCase() || '?'}
          </AvatarFallback>
        </Avatar>
      </ProfileWidgetCard>

      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex flex-wrap items-center gap-2">
          <span className={cn('text-sm font-semibold truncate', ns.className)} style={ns.style}>
            {reply.profile?.display_name || 'User'}
          </span>
          <RankBadge score={reply.profile?.total_episodes || 0} size="xs" showName={false} />
          <UserBadges badges={badges} size={12} />
          <span className="ml-auto text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(reply.created_at), { addSuffix: true })}
          </span>
        </div>

        {editing ? (
          <div className="mt-1 space-y-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(); }
                else if (e.key === 'Escape') { e.preventDefault(); setEditing(false); }
              }}
              rows={2}
              className="resize-none text-sm"
              autoFocus
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={saveEdit} disabled={editComment.isPending} className="h-7 gap-1 text-xs">
                <Save className="h-3 w-3" /> Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)} className="h-7 gap-1 text-xs">
                <X className="h-3 w-3" /> Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <CommentContent content={reply.content} className="leading-relaxed" timestampTarget={timestampTarget} clamp />
            <CommentAttachments attachments={reply.attachments} />
            <CommentEmbeds embeds={reply.embeds} poll={reply.poll} />

            <div className="mt-1.5 flex items-center gap-1">
              <button
                onClick={() => likeComment.mutate({ commentId: reply.id, liked: reply.user_liked || false })}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-xs font-medium transition-all',
                  reply.user_liked
                    ? 'text-rose-400 bg-rose-400/10 hover:bg-rose-400/20'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
                )}
              >
                <Heart className={cn('h-3.5 w-3.5', reply.user_liked && 'fill-current')} />
                {reply.likes_count > 0 && <span>{reply.likes_count}</span>}
              </button>
              {canReply && (
                <button
                  onClick={() => setReplying((r) => !r)}
                  className="flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
                >
                  <Reply className="h-3 w-3" /> Reply
                </button>
              )}
              {isOwn && (
                <>
                  <button
                    onClick={() => { setDraft(reply.content ?? ''); setEditing(true); }}
                    className="flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
                  >
                    <Edit2 className="h-3 w-3" /> Edit
                  </button>
                  <button
                    onClick={async () => {
                      if (await confirm({ title: 'Delete this reply?', destructive: true })) deleteComment.mutate(reply.id);
                    }}
                    className="flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                  >
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                </>
              )}
            </div>

            {replying && (
              <div className="mt-2">
                <RichCommentComposer
                  compact
                  autoFocus
                  allowTimestamp={isAnime}
                  allowEmbeds
                  initialContent={replyMention}
                  submitLabel="Reply"
                  submitting={addComment.isPending}
                  onSubmit={submitReply}
                  onCancel={() => setReplying(false)}
                  placeholder={`Reply to ${reply.profile?.display_name || 'this comment'}…`}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
