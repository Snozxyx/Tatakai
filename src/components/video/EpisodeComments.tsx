import { CosmeticAvatar, CosmeticName } from '@/components/profile/IdentityCosmetics';
import { supabase } from '@/integrations/supabase/client';
import uiI18n from '@/lib/uiI18n';
import { requestTVWriting } from '@/core/tv/writingHandoff';
import { isTV } from '@/core/tv/device';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useState, useMemo, useEffect } from 'react';
import { useComments, useAddComment, useDeleteComment, useLikeComment, useEditComment, type CommentEntityType } from '@/hooks/community/useComments';
import { useAuth } from '@/contexts/AuthContext';
import { useCommunityRulesGate } from '@/components/community/CommunityRulesGate';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from '@/lib/localeFormat';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare, Heart, Trash2, Edit2, Save, X, AlertTriangle,
  ChevronDown, ChevronUp, EyeOff, Loader2, Pin, Film, Globe2, Reply, Sparkles, ListChecks, MessageSquareOff
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { tombstoneLabel } from '@/lib/tombstone';
import { ModerationMenu } from '@/components/moderation/ModerationMenu';
import { useContentFlags, type ModContentType } from '@/hooks/moderation/useModeration';
import { toast } from 'sonner';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { RankBadge } from '@/components/ui/RankBadge';
import { getRankNameStyle } from '@/lib/rankUtils';
import { UserBadges } from '@/components/ui/UserBadges';
import { useBatchUserBadges } from '@/hooks/community/useUserBadges';
import { ProfileWidgetCard } from '@/components/profile/ProfileWidgetCard';
import { RichCommentComposer } from '@/components/comments/RichCommentComposer';
import { TranslatedCommentContent } from '@/components/comments/TranslatedCommentContent';
import { type TimestampTarget } from '@/components/comments/CommentContent';
import { CommentAttachments } from '@/components/comments/CommentAttachments';
import { CommentEmbeds } from '@/components/comments/CommentEmbeds';
import { CommentReplies } from './CommentReplies';
import type { CommentAttachment } from '@/lib/commentMedia';
import type { CommentEmbed } from '@/lib/commentEmbeds';
import type { CommentPollDraft } from '@/hooks/community/useComments';

type CommentFilter = 'new' | 'global' | 'episodes';

export interface CommentsProps {
  generalCommunity?: boolean;
  quoteDraft?: import('@/lib/commentQuotes').CommentQuoteDraft;
  /** Which surface these comments belong to. */
  entityType: CommentEntityType;
  /** The surface's id (anime/manga id, playlist id, tier list id, post id). */
  entityId: string;
  /** Anime only: pins the thread to one episode (hidden filters + seeking). */
  episodeId?: string;
  /** Context chip label (anime/series/playlist name). */
  entityName?: string;
  sourceKind?: 'anime' | 'manga' | 'novel';
  /**
   * Anime-info page only: episode 1's id, used to turn a timestamp on a global
   * comment into a `/watch/<ep1>?t=<s>` deep link. Ignored for other surfaces.
   */
  fallbackEpisodeId?: string;
}

/** Composer placeholder tuned to the surface. */
function composePlaceholder(entityType: CommentEntityType, episodeId?: string): string {
  switch (entityType) {
    case 'anime': return episodeId ? uiI18n.t('app.share_your_thoughts_on_this_episode_febf9f4d') : uiI18n.t('app.share_your_thoughts_about_this_anime_8180c8c3');
    case 'manga': return uiI18n.t('app.share_your_thoughts_about_this_series_f8b48598');
    case 'playlist': return uiI18n.t('app.discuss_this_playlist_816e7d86');
    case 'tier_list': return uiI18n.t('app.discuss_this_tier_list_5e683cd7');
    case 'forum_post': return uiI18n.t('app.add_a_comment_3780d9ec');
    default: return uiI18n.t('app.add_a_comment_3780d9ec');
  }
}

/** Episode number encoded in an episodeId (`<baseId>?ep=<n>`), or null. */
function episodeNumberOf(episodeId?: string | null): string | null {
  return episodeId?.match(/[?&]ep=(\d+)/)?.[1] ?? null;
}

/** Short label for a removable embed chip in the edit view. */
function embedLabel(e: CommentEmbed): string {
  switch (e.kind) {
    case 'media': return uiI18n.t('app.i18n_value_0_i18n_value_1_b6af3412', { value0: e.mediaType || 'media', value1: e.name });
    case 'playlist': return uiI18n.t('app.playlist_cd95b41f');
    case 'tierlist': return uiI18n.t('app.tier_list_b0ba4885');
    case 'post': return uiI18n.t('app.quoted_post_7567ae51');
    default: return uiI18n.t('app.embed_ad02e14e');
  }
}

/**
 * The rich comment thread for any surface. Anime-specific affordances (episode
 * filters, clickable video timestamps, per-episode source chips) light up only
 * when entityType === 'anime'; every other surface gets the same GIF / poll /
 * mention / embed feature set without them.
 */
export function Comments({ entityType, entityId, episodeId, entityName, sourceKind, fallbackEpisodeId, quoteDraft, generalCommunity = false }: CommentsProps) {
  useUiTranslation();
  const { user, profile, isAdmin, isModerator } = useAuth();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    if (!isTV() && !user && new URLSearchParams(location.search).get('compose') === 'reply') sessionStorage.setItem('tatakai-auth-return', location.pathname + location.search + location.hash);
  }, [user, location.pathname, location.search, location.hash]);
  const ensureAgreed = useCommunityRulesGate();
  // The `#comment-<uuid>` target a notification deep-link points at, plus the
  // id we're transiently highlighting once we've scrolled to it.
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const isAnime = entityType === 'anime';
  // episode_id scopes a sub-thread: episode number for anime, canonical chapter
  // number for manga. Both are allowed by the DB CHECK; other entity types keep
  // a single global thread, so never thread episodeId for them.
  const epId = isAnime || entityType === 'manga' ? episodeId : undefined;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  // Edit-mode removal buffers — what survives once the user strips media/embeds/poll.
  const [editAttachments, setEditAttachments] = useState<CommentAttachment[]>([]);
  const [editEmbeds, setEditEmbeds] = useState<CommentEmbed[]>([]);
  const [editRemovePoll, setEditRemovePoll] = useState(false);
  const [editHadPoll, setEditHadPoll] = useState(false);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [revealedSpoilers, setRevealedSpoilers] = useState<Set<string>>(new Set());
  const [isExpanded, setIsExpanded] = useState(true);
  // Anime-info page only: New (all, newest) / Global / per-episode.
  const [filter, setFilter] = useState<CommentFilter>('new');

  const { data: comments = [], isLoading } = useComments(entityType, entityId, epId);
  const [handoffUnavailable, setHandoffUnavailable] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (isTV() || params.get('compose') !== 'reply' || entityType !== 'forum_post' || isLoading) return;
    const id = params.get('commentId');
    if (id) {
      // Replies are stored one level deep: target their root composer.
      void (supabase as any).from('comments').select('id,parent_id,entity_id,is_deleted').eq('id', id).eq('entity_type', 'forum_post').eq('entity_id', entityId).maybeSingle().then(({ data }: { data: { id: string; parent_id: string | null; is_deleted?: boolean } | null }) => {
        if (!data || data.is_deleted) { setHandoffUnavailable(true); return; }
        setReplyingId(data.parent_id || data.id); setIsExpanded(true);
      });
    } else {
      const timer = setTimeout(() => document.querySelector<HTMLTextAreaElement>('[data-tv-comment-composer] textarea')?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [location.search, entityId, entityType, isLoading]);

  const addComment = useAddComment();
  const deleteComment = useDeleteComment();
  const likeComment = useLikeComment();
  const editComment = useEditComment();

  // Thread-level moderation: staff can pause a thread's comments. Enforcement is
  // app-layer — the composer is hidden for non-staff while paused. 'manga'
  // threads carry no flags row, so the query stays disabled there.
  const isStaff = isAdmin || isModerator;
  const flagType: ModContentType | null =
    entityType === 'anime' || entityType === 'playlist' ||
    entityType === 'tier_list' || entityType === 'forum_post'
      ? entityType
      : null;
  const { data: threadFlags } = useContentFlags(flagType ?? 'anime', entityId, !!flagType);
  const commentsPaused = !!threadFlags?.comments_paused;
  const composeLocked = commentsPaused && !isStaff;

  // One batched lookup for every commenter's badges (we only surface the
  // top-tier ones next to the name).
  const commenterIds = useMemo(
    () => [...new Set(comments.map(c => c.user_id).filter(Boolean))],
    [comments],
  );
  const { data: badgesByUser } = useBatchUserBadges(commenterIds);

  const handleSubmit = async (payload: { content: string; attachments: CommentAttachment[]; isSpoiler: boolean; embeds: CommentEmbed[]; poll: CommentPollDraft | null }) => {
    if (!user) { navigate('/auth'); return false; }
    if (!(await ensureAgreed())) return false;
    try {
      await addComment.mutateAsync({
        entityType,
        entityId,
        sourceTitle: entityName,
        sourceKind: sourceKind ?? (entityType === 'anime' || entityType === 'manga' ? entityType : undefined),
        sourcePath: location.pathname + location.search,
        episodeId: epId,
        content: payload.content,
        isSpoiler: payload.isSpoiler,
        attachments: payload.attachments,
        embeds: payload.embeds,
        poll: payload.poll,
      });
    } catch {
      return false; // keep the composer's draft on failure
    }
  };

  const handleReply = (parentId: string) => async (payload: { content: string; attachments: CommentAttachment[]; isSpoiler: boolean; embeds: CommentEmbed[]; poll: CommentPollDraft | null }) => {
    if (!user) { navigate('/auth'); return false; }
    if (!(await ensureAgreed())) return false;
    try {
      await addComment.mutateAsync({
        entityType,
        entityId,
        sourceTitle: entityName,
        sourceKind: sourceKind ?? (entityType === 'anime' || entityType === 'manga' ? entityType : undefined),
        sourcePath: location.pathname + location.search,
        episodeId: epId,
        parentId,
        content: payload.content,
        isSpoiler: payload.isSpoiler,
        attachments: payload.attachments,
        embeds: payload.embeds,
        poll: payload.poll,
      });
      setReplyingId(null);
    } catch {
      return false;
    }
  };

  const beginEdit = (comment: typeof comments[number]) => {
    setEditingId(comment.id);
    setEditContent(comment.content);
    setEditAttachments(comment.attachments ?? []);
    setEditEmbeds(comment.embeds ?? []);
    setEditHadPoll(!!comment.poll);
    setEditRemovePoll(false);
  };

  const handleEdit = async (comment: typeof comments[number]) => {
    try {
      await editComment.mutateAsync({
        id: comment.id,
        content: editContent,
        isSpoiler: comment.is_spoiler,
        attachments: editAttachments,
        embeds: editEmbeds,
        removePoll: editRemovePoll,
      });
      setEditingId(null);
    } catch {
      // toast handled by the hook
    }
  };

  const handleLike = async (id: string, currentlyLiked: boolean) => {
    if (!user) { toast.error(uiI18n.t('app.sign_in_to_like_comments_a13bfb66')); return; }
    await likeComment.mutateAsync({ commentId: id, liked: currentlyLiked });
  };

  const toggleSpoiler = (id: string) => {
    setRevealedSpoilers(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // On the anime-info page (anime, no fixed episodeId) the list mixes global
  // and per-episode comments, so offer a filter. Every other surface (and a
  // single-episode view) shows the flat list. New = everything newest-first.
  const filteredComments = (!isAnime || epId)
    ? comments
    : comments.filter((c) => {
        if (filter === 'global') return !c.episode_id;
        if (filter === 'episodes') return !!c.episode_id;
        return true;
      });

  const sortedComments = [...filteredComments].sort((a, b) => {
    if (a.is_pinned && !b.is_pinned) return -1;
    if (!a.is_pinned && b.is_pinned) return 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  // Deep-link scroll: when the URL carries a `#comment-<uuid>` (a notification
  // link), scroll to that comment/reply and highlight it briefly. The anime page
  // is heavy — the comments list has a height/entrance animation and shelves +
  // images below keep loading — so a single scroll lands, then reflow strands the
  // anchor. We therefore (1) poll until the target mounts (a reply may still be
  // fetching), then (2) keep re-centering it through the reflow until its
  // position holds steady. Re-runs when the hash changes.
  useEffect(() => {
    const match = location.hash.match(/^#comment-(.+)$/);
    if (!match) return;
    const targetId = match[1];
    if (isLoading) return;

    setIsExpanded(true);

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let findTries = 0;      // ~10s to let a lazily-fetched reply mount
    let correctTries = 0;   // ~6s of active re-centering through reflow
    let stableTicks = 0;
    let scrolledOnce = false;

    const clearHighlightSoon = () => {
      timer = setTimeout(() => {
        if (!cancelled) setHighlightId((cur) => (cur === targetId ? null : cur));
      }, 1800);
    };

    const tick = () => {
      if (cancelled) return;
      const el = document.getElementById(`comment-${targetId}`);
      if (!el) {
        if (findTries++ < 66) timer = setTimeout(tick, 150);
        return;
      }

      const rect = el.getBoundingClientRect();
      const offFromCenter = Math.abs(rect.top + rect.height / 2 - window.innerHeight / 2);

      if (!scrolledOnce) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        scrolledOnce = true;
        setHighlightId(targetId);
      } else if (offFromCenter > 120) {
        // Layout shifted the anchor away — snap it back without re-animating.
        el.scrollIntoView({ behavior: 'auto', block: 'center' });
      }

      // Settled once it stays near center across a few consecutive ticks.
      stableTicks = offFromCenter <= 120 ? stableTicks + 1 : 0;
      if (stableTicks >= 3 || correctTries++ >= 30) {
        clearHighlightSoon();
        return;
      }
      timer = setTimeout(tick, 200);
    };
    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [location.hash, isLoading, comments.length]);

  return (
    <div className="mt-8">
      {handoffUnavailable && <p role="alert">This comment is unavailable or you do not have access to it.</p>}
      {/* Header */}
      <button
        onClick={() => setIsExpanded(prev => !prev)}
        className="flex items-center gap-3 mb-6 group w-full text-left"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <MessageSquare className="w-5 h-5 text-primary" />
          <h2 className="font-display text-xl font-bold">
            {uiI18n.t('app.comments_fce06e20')}
          </h2>
          {comments.length > 0 && (
            <Badge variant="secondary" className="text-xs font-bold">
              {comments.length}
            </Badge>
          )}
          {/* Entity / episode context */}
          {entityName && (
            <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-muted/50 border border-border/40 text-muted-foreground font-medium">
              {entityName}
              {epId && (() => {
                const epNum = epId.match(/(\d+)/)?.[1];
                return epNum ? (
                  <>
                    <span className="text-border/60">·</span>
                    <span className="text-primary/80">{uiI18n.t('app.ep_nbsp_270d0a67')}{epNum}</span>
                  </>
                ) : null;
              })()}
            </span>
          )}
        </div>
        <div className="ml-auto text-muted-foreground group-hover:text-foreground transition-colors">
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            {/* Compose */}
            {composeLocked ? (
              <GlassPanel className="p-4 mb-6 flex items-center gap-3 text-sm text-muted-foreground">
                <MessageSquareOff className="h-4 w-4 shrink-0" />
                {uiI18n.t('app.comments_are_paused_by_a_moderator_c8957cea')}
              </GlassPanel>
            ) : user ? (
              <GlassPanel className="p-4 mb-6">
                {commentsPaused && isStaff && (
                  <div className="mb-3 flex items-center gap-2 rounded-md bg-amber-400/10 px-3 py-1.5 text-xs text-amber-300">
                    <MessageSquareOff className="h-3.5 w-3.5 shrink-0" />
                    {uiI18n.t('app.comments_are_paused_only_staff_can_post_816279e5')}
                  </div>
                )}
                <div className="flex gap-3">
                  <CosmeticAvatar userId={profile?.user_id} className="w-9 h-9 flex-shrink-0 mt-0.5">
                    <AvatarImage src={profile?.avatar_url || undefined} />
                    <AvatarFallback className="bg-gradient-to-br from-primary to-secondary text-primary-foreground text-sm font-bold">
                      {profile?.display_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'}
                    </AvatarFallback>
                  </CosmeticAvatar>
                  <div className="flex-1 min-w-0">
                    <RichCommentComposer
                      generalCommunity={generalCommunity}
                      quoteDraft={quoteDraft}
                      key={`${user.id}:${entityType}:${entityId}:${epId ?? "all"}`}
                      draftKey={`${entityType}:${entityId}:${epId ?? "all"}`}
                      compact
                      allowTimestamp={isAnime}
                      allowEmbeds
                      submitLabel="Post"
                      submitting={addComment.isPending}
                      onSubmit={handleSubmit}
                      placeholder={composePlaceholder(entityType, epId)}
                    />
                  </div>
                </div>
              </GlassPanel>
            ) : (
              <GlassPanel className="p-4 mb-6 text-center">
                {quoteDraft && <blockquote className="mb-3 whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/40 p-3 text-left text-sm text-muted-foreground">{quoteDraft.text}</blockquote>}
                <p className="text-sm text-muted-foreground mb-3">{uiI18n.t('app.sign_in_to_join_the_discussion_c8ac10e2')}</p>
                <Button size="sm" onClick={() => navigate('/auth')}>{uiI18n.t('app.sign_in_f8492cc1')}</Button>
              </GlassPanel>
            )}

            {/* Filter (anime-info page only — mixes global + per-episode) */}
            {isAnime && !epId && comments.length > 0 && (
              <div className="mb-4 flex items-center gap-1.5">
                {([
                  { key: 'new', get label() { return uiI18n.t('app.new_6403f2b7'); }, icon: Sparkles },
                  { key: 'global', get label() { return uiI18n.t('app.global_5f1184f7'); }, icon: Globe2 },
                  { key: 'episodes', get label() { return uiI18n.t('app.episodes_49d641ba'); }, icon: Film },
                ] as const).map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                      filter === key
                        ? 'bg-primary/15 text-primary'
                        : 'bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted/60',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            )}

            {/* Comments list */}
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                {uiI18n.t('app.loading_comments_4b98e940')}
              </div>
            ) : sortedComments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mb-4">
                  <MessageSquare className="w-7 h-7 text-muted-foreground" />
                </div>
                <p className="font-medium text-muted-foreground">{uiI18n.t('app.no_comments_yet_d14da379')}</p>
                <p className="text-sm text-muted-foreground/60 mt-1">
                  {uiI18n.t('app.be_the_first_to_share_your_thoughts_6a509a45')}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedComments.map((comment, idx) => {
                  const isOwn = comment.user_id === user?.id;
                  const isSpoilerHidden = comment.is_spoiler && !revealedSpoilers.has(comment.id);
                  const isEditing = editingId === comment.id;

                  // All of the commenter's badges, rarity-ordered (admin/mod
                  // included), shown inline next to the name — no overflow cap.
                  const userBadges = badgesByUser?.[comment.user_id] ?? [];
                  // Anime only: seek the mounted player, or deep-link to the
                  // source episode. Other surfaces keep timestamps as plain text.
                  const timestampTarget: TimestampTarget = !isAnime
                    ? undefined
                    : epId
                    ? 'seek'
                    : (seconds: number) => {
                        const ep = comment.episode_id || fallbackEpisodeId;
                        return ep ? `/watch/${encodeURIComponent(ep)}?t=${seconds}` : null;
                      };
                  // Where this comment was written — shown only on the anime-info
                  // page, where the list mixes episodes and global comments.
                  const sourceEp = episodeNumberOf(comment.episode_id);

                  // Soft-deleted comment: tombstone the body, keep its replies.
                  if (comment.is_deleted && entityType === 'forum_post') {
                    return <CommentReplies key={comment.id} generalCommunity={generalCommunity}
                      parentId={comment.id} entityType={entityType} entityId={entityId}
                      episodeId={epId} currentUserId={user?.id} highlightId={highlightId} />;
                  }
                  if (comment.is_deleted) {
                    return (
                      <motion.div
                        key={comment.id}
                        id={`comment-${comment.id}`}
                        className={cn(
                          'scroll-mt-24 rounded-2xl transition-shadow duration-500',
                          highlightId === comment.id && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
                        )}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: Math.min(idx * 0.04, 0.3), duration: 0.25 }}
                      >
                        <GlassPanel className="p-4">
                          <p className="text-sm italic text-muted-foreground">{tombstoneLabel((comment as any).deleted_by_role)}</p>
                          <CommentReplies
                            generalCommunity={generalCommunity}
                            parentId={comment.id}
                            entityType={entityType}
                            entityId={entityId}
                            episodeId={epId}
                            currentUserId={user?.id}
                            fallbackEpisodeId={fallbackEpisodeId}
                            onScreenEpisodeId={epId}
                            highlightId={highlightId}
                          />
                        </GlassPanel>
                      </motion.div>
                    );
                  }

                  return (
                    <motion.div
                      key={comment.id}
                      id={`comment-${comment.id}`}
                      className={cn(
                        'scroll-mt-24 rounded-2xl transition-shadow duration-500',
                        highlightId === comment.id && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
                      )}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(idx * 0.04, 0.3), duration: 0.25 }}
                    >
                      <GlassPanel
                        className={cn(
                          'p-4 transition-all duration-200',
                          comment.is_pinned && 'border-primary/20 bg-primary/5',
                        )}
                      >
                        {/* Comment header */}
                        <div className="flex items-start gap-3">
                          <ProfileWidgetCard
                            userId={comment.user_id}
                            username={comment.profile?.username}
                            displayName={comment.profile?.display_name}
                            avatarUrl={comment.profile?.avatar_url}
                            rankScore={comment.profile?.total_episodes || 0}
                          >
                            <CosmeticAvatar userId={comment.user_id} className="w-8 h-8 flex-shrink-0 cursor-pointer hover:ring-2 ring-primary/30 transition-all">
                              <AvatarImage src={comment.profile?.avatar_url || undefined} />
                              <AvatarFallback className="bg-gradient-to-br from-primary/60 to-secondary/60 text-primary-foreground text-xs font-bold">
                                {comment.profile?.display_name?.[0]?.toUpperCase() || '?'}
                              </AvatarFallback>
                            </CosmeticAvatar>
                          </ProfileWidgetCard>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              {(() => {
                                const ns = getRankNameStyle(comment.profile?.total_episodes || 0);
                                return (
                                  <ProfileWidgetCard
                                    userId={comment.user_id}
                                    username={comment.profile?.username}
                                    displayName={comment.profile?.display_name}
                                    avatarUrl={comment.profile?.avatar_url}
                                    rankScore={comment.profile?.total_episodes || 0}
                                  >
                                    <button
                                      className={cn('text-sm font-semibold hover:opacity-80 transition-opacity truncate', ns.className)}
                                      style={ns.style}
                                    >
                                      <CosmeticName userId={comment.user_id}>{comment.profile?.display_name || uiI18n.t('app.user_9f8a2389')}</CosmeticName>
                                    </button>
                                  </ProfileWidgetCard>
                                );
                              })()}

                              <RankBadge
                                score={comment.profile?.total_episodes || 0}
                                size="xs"
                                showName={false}
                              />

                              <UserBadges badges={userBadges} size={14} />

                              {comment.is_pinned && (
                                <Badge className="h-4 text-[10px] gap-0.5 px-1.5 bg-amber/15 text-amber border-amber/20">
                                  <Pin className="w-2.5 h-2.5" />
                                  {uiI18n.t('app.pinned_f9312169')}
                                </Badge>
                              )}
                              {comment.is_spoiler && (
                                <Badge className="h-4 text-[10px] gap-0.5 px-1.5 bg-destructive/15 text-destructive border-destructive/20">
                                  <AlertTriangle className="w-2.5 h-2.5" />
                                  {uiI18n.t('app.spoiler_875786ee')}
                                </Badge>
                              )}
                              <span className="text-xs text-muted-foreground ml-auto">
                                {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                              </span>

                              {/* Source chip (anime-info page only) */}
                              {isAnime && !epId && (
                                comment.episode_id ? (
                                  <Link
                                    to={`/watch/${encodeURIComponent(comment.episode_id)}`}
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary/90 hover:bg-primary/20 transition-colors"
                                  >
                                    <Film className="w-2.5 h-2.5" />
                                    {uiI18n.t('app.ep_91954275')} {sourceEp ?? '?'}
                                  </Link>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-muted/50 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                                    <Globe2 className="w-2.5 h-2.5" />
                                    {uiI18n.t('app.global_5f1184f7')}
                                  </span>
                                )
                              )}
                            </div>

                            {/* Comment content */}
                            {isEditing ? (
                              <div className="space-y-2 mt-2">
                                <Textarea
                                  value={editContent}
                                  onChange={e => setEditContent(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEdit(comment); }
                                    else if (e.key === 'Escape') { e.preventDefault(); setEditingId(null); }
                                  }}
                                  rows={3}
                                  className="resize-none text-sm"
                                  autoFocus
                                />

                                {/* Removable attachments */}
                                {editAttachments.length > 0 && (
                                  <div className="flex flex-wrap gap-2">
                                    {editAttachments.map((a, i) => (
                                      <div key={`${a.url}-${i}`} className="group relative">
                                        <img
                                          src={a.preview || a.url}
                                          alt={a.title || uiI18n.t('app.attachment_1625e5ed')}
                                          className="h-16 w-16 rounded-lg object-cover bg-muted/40"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => setEditAttachments(prev => prev.filter((_, idx) => idx !== i))}
                                          className="absolute -right-1.5 -top-1.5 rounded-full bg-destructive p-0.5 text-destructive-foreground"
                                          aria-label={uiI18n.t('app.remove_attachment_0fcc6594')}
                                        >
                                          <X className="h-3 w-3" />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {/* Removable embeds (media / post / playlist / tier list) */}
                                {editEmbeds.length > 0 && (
                                  <div className="flex flex-wrap gap-2">
                                    {editEmbeds.map((e, i) => (
                                      <span
                                        key={`${e.kind}-${i}`}
                                        className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
                                      >
                                        <span className="max-w-[180px] truncate">{embedLabel(e)}</span>
                                        <button
                                          type="button"
                                          aria-label={uiI18n.t('app.remove_embed_429b01a2')}
                                          onClick={() => setEditEmbeds(prev => prev.filter((_, idx) => idx !== i))}
                                          className="hover:text-primary/70"
                                        >
                                          <X className="h-3 w-3" />
                                        </button>
                                      </span>
                                    ))}
                                  </div>
                                )}

                                {/* Removable poll */}
                                {editHadPoll && !editRemovePoll && (
                                  <div className="flex items-center justify-between rounded-xl border border-border/40 bg-muted/20 px-3 py-2 text-xs">
                                    <span className="flex items-center gap-1.5 text-muted-foreground">
                                      <ListChecks className="h-3.5 w-3.5" /> {uiI18n.t('app.poll_attached_947887aa')}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => setEditRemovePoll(true)}
                                      className="font-medium text-destructive hover:underline"
                                    >
                                      {uiI18n.t('app.remove_poll_771e6008')}
                                    </button>
                                  </div>
                                )}

                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    onClick={() => handleEdit(comment)}
                                    disabled={editComment.isPending}
                                    className="h-7 text-xs gap-1"
                                  >
                                    <Save className="w-3 h-3" />
                                    {uiI18n.t('app.save_efc007a3')}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setEditingId(null)}
                                    className="h-7 text-xs gap-1"
                                  >
                                    <X className="w-3 h-3" />
                                    {uiI18n.t('app.cancel_77dfd213')}
                                  </Button>
                                </div>
                              </div>
                            ) : isSpoilerHidden ? (
                              <button
                                onClick={() => toggleSpoiler(comment.id)}
                                className="mt-1 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
                              >
                                <div className="px-3 py-1.5 rounded-lg bg-muted/40 border border-border/50 group-hover:bg-muted/70 transition-colors flex items-center gap-2">
                                  <EyeOff className="w-3.5 h-3.5" />
                                  {uiI18n.t('app.click_to_reveal_spoiler_4efcfe84')}
                                </div>
                              </button>
                            ) : (
                              <div className="mt-1">
                                <TranslatedCommentContent content={comment.content} className="leading-relaxed" timestampTarget={timestampTarget} clamp />
                                <CommentAttachments attachments={comment.attachments} />
                                <CommentEmbeds embeds={comment.embeds} poll={comment.poll} />
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Comment actions */}
                        {!isEditing && (
                          <div className="flex items-center gap-1 mt-2 ml-11">
                            <button
                            onClick={() => handleLike(comment.id, comment.user_liked || false)}
                              className={cn(
                                'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all',
                                comment.user_liked
                                  ? 'text-rose-400 bg-rose-400/10 hover:bg-rose-400/20'
                                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                              )}
                            >
                              <Heart className={cn('w-3.5 h-3.5', comment.user_liked && 'fill-current')} />
                              {comment.likes_count > 0 && <span>{comment.likes_count}</span>}
                            </button>

                            {!composeLocked && (
                              <button
                                onClick={() => {
                                  if (requestTVWriting(entityType === 'forum_post' ? entityId : undefined, comment.id)) return;
                                  if (!user) { navigate('/auth'); return; }
                                  setReplyingId(prev => (prev === comment.id ? null : comment.id));
                                }}
                                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
                              >
                                <Reply className="w-3.5 h-3.5" />
                                {uiI18n.t('app.reply_6c2bb735')}
                              </button>
                            )}

                            {isOwn && (
                              <>
                                <button
                                  onClick={() => beginEdit(comment)}
                                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
                                >
                                  <Edit2 className="w-3 h-3" />
                                  {uiI18n.t('app.edit_5301648d')}
                                </button>
                                <button
                                  onClick={async () => { if (await confirm({ get title() { return uiI18n.t('app.delete_this_comment_b88a2bf0'); }, destructive: true })) deleteComment.mutate(comment.id); }}
                                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  {uiI18n.t('app.delete_f6fdbe48')}
                                </button>
                              </>
                            )}

                            <div className="ml-auto">
                              <ModerationMenu
                                contentType="comment"
                                contentId={comment.id}
                                authorUserId={comment.user_id}
                                authorName={comment.profile?.display_name}
                                onStaffDelete={async () => {
                                  if (await confirm({ get title() { return uiI18n.t('app.delete_this_comment_as_staff_c3881bbc'); }, get description() { return uiI18n.t('app.it_will_show_a_deleted_by_admin_moderator_tombst_ec3742e0'); }, destructive: true })) {
                                    deleteComment.mutate(comment.id);
                                  }
                                }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Reply composer */}
                        {replyingId === comment.id && (
                          <div className="mt-3 ml-11">
                            <RichCommentComposer
                              generalCommunity={generalCommunity}
                              draftKey={`reply:${comment.id}`}
                              compact
                              autoFocus
                              allowTimestamp={isAnime}
                              allowEmbeds
                              submitLabel="Reply"
                              submitting={addComment.isPending}
                              onSubmit={handleReply(comment.id)}
                              onCancel={() => setReplyingId(null)}
                              placeholder={uiI18n.t('app.reply_to_i18n_value_0_89f8191b', { value0: comment.profile?.display_name || 'this comment' })}
                            />
                          </div>
                        )}

                        {/* Replies */}
                        <CommentReplies
                          generalCommunity={generalCommunity}
                          parentId={comment.id}
                          entityType={entityType}
                          entityId={entityId}
                          episodeId={epId}
                          currentUserId={user?.id}
                          fallbackEpisodeId={fallbackEpisodeId}
                          onScreenEpisodeId={epId}
                          highlightId={highlightId}
                        />
                      </GlassPanel>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Anime episode / info-page comments — a thin wrapper over the generic
 * <Comments> that maps the legacy anime props onto entity_type='anime'.
 */
export function EpisodeComments({
  animeId,
  episodeId,
  animeName,
  fallbackEpisodeId,
}: {
  animeId: string;
  episodeId?: string;
  animeName?: string;
  fallbackEpisodeId?: string;
}) {
  useUiTranslation();
  return (
    <Comments
      entityType="anime"
      entityId={animeId}
      episodeId={episodeId}
      entityName={animeName}
      fallbackEpisodeId={fallbackEpisodeId}
    />
  );
}

