import { CosmeticAvatar, CosmeticName } from '@/components/profile/IdentityCosmetics';
import { isTV } from "@/core/tv/device";
import uiI18n from '@/lib/uiI18n';
import { requestTVWriting } from '@/core/tv/writingHandoff';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDistanceToNow } from '@/lib/localeFormat';
import { toast } from 'sonner';
import { MessageCircle, Repeat2, Heart, Bookmark, Share, MoreHorizontal, Quote as QuoteIcon, Pencil, Trash2, Pin, PinOff, Loader2, BadgeCheck } from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { UserBadges } from '@/components/ui/UserBadges';
import { ProfileWidgetCard } from '@/components/profile/ProfileWidgetCard';
import { CommunityWidgetCard } from '@/components/community/CommunityWidgetCard';
import { getProxiedImageUrl } from '@/lib/api';
import { getRankNameStyle } from '@/lib/rankUtils';
import { cn } from '@/lib/utils';
import { useReactions, useReact } from '@/hooks/community/useReactions';
import { useToggleRepost, useToggleBookmark } from '@/hooks/community/usePostSocial';
import { useTagEngagement } from '@/hooks/community/useTagEngagement';
import { useCreateForumPost, useUpdateForumPost, useDeleteForumPost, useSetPinned } from '@/hooks/community/useForum';
import { useMyCommunityRole } from '@/hooks/community/useCommunities';
import { ModerationMenuItems } from '@/components/moderation/ModerationMenu';
import { useContentFlags } from '@/hooks/moderation/useModeration';
import { useAuth } from '@/contexts/AuthContext';
import type { FeedPost } from '@/hooks/community/useFeed';
import { RichEditor, type RichEditorHandle } from './RichEditor';
import { Comments } from '@/components/comments/Comments';
import { TranslatedPostContent } from './TranslatedPostContent';
import {
  PostPollCard,
  PostImageGrid,
  PostPlaylistEmbed,
  PostTierlistEmbed,
  PostWatchroomEmbed,
  PostMediaEmbed,
  QuotedPostEmbed,
} from './PostEmbeds';

function FlairPills({ post, showPinned }: { post: FeedPost; showPinned: boolean }) {
  useUiTranslation();
  if (!showPinned && !post.flair && !post.is_spoiler) return null;
  
  return (
    <div className="flex flex-wrap items-center gap-2 mb-2">
      {showPinned && (
        <span className="flex items-center gap-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-emerald-400">
          <Pin className="h-3 w-3" /> {uiI18n.t('app.pinned_f9312169')}
        </span>
      )}
      {post.flair && (
        <span className="rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-primary">
          {post.flair}
        </span>
      )}
      {post.is_spoiler && (
        <span className="rounded-md bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-orange-400">
          {uiI18n.t('app.spoiler_875786ee')}
        </span>
      )}
    </div>
  );
}

function ActionButton({ icon: Icon, count, active, activeClass, hoverClass, label, onClick, className }: {
  icon: any; count?: number; active?: boolean; activeClass?: string; hoverClass: string; label: string; onClick: (e: React.MouseEvent) => void; className?: string;
}) {
  useUiTranslation();
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        'group flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium text-muted-foreground transition-all duration-200 ease-out',
        hoverClass,
        active && activeClass,
        className,
      )}
    >
      <Icon className={cn(
        'h-[18px] w-[18px] transition-transform duration-200 group-active:scale-90', 
        active ? 'fill-current' : 'group-hover:scale-110'
      )} />
      {/* Only show count if it's greater than 0 for a cleaner look, or leave as is if you prefer 0s */}
      {count !== undefined && count > 0 && <span className="tabular-nums">{count}</span>}
    </button>
  );
}

export function PostCard({ post, defaultShowComments = false, contextCommunityId = null }: { post: FeedPost; defaultShowComments?: boolean; contextCommunityId?: string | null }) {
  useUiTranslation();
  const navigate = useNavigate();
  const { user, isAdmin, isModerator } = useAuth();
  // Seeded from the feed's batched tallies — first paint costs no per-post
  // request; cards rendered without seed data (thread view, search) fetch
  // exactly as before.
  const { data: reactions } = useReactions('forum_post', post.id, post.reaction_counts ?? undefined);
  const react = useReact();
  const toggleRepost = useToggleRepost();
  const toggleBookmark = useToggleBookmark();
  const createPost = useCreateForumPost();
  const updatePost = useUpdateForumPost();
  const deletePost = useDeleteForumPost();
  const setPinned = useSetPinned();
  const bumpTagInterest = useTagEngagement();

  const [showComments, setShowComments] = useState(defaultShowComments);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quoteText, setQuoteText] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const editorRef = useRef<RichEditorHandle>(null);

  // Repost/quote gates. Fetched only while the repost menu is open so feed
  // render stays cheap (one query per post would be N queries otherwise).
  const [repostOpen, setRepostOpen] = useState(false);
  const { data: postFlags } = useContentFlags('forum_post', post.id, repostOpen);
  const allowRepost = postFlags?.allow_repost !== false;
  const allowRequote = postFlags?.allow_requote !== false;

  const isAuthor = !!user && user.id === post.user_id;
  const { data: myCommunityRole } = useMyCommunityRole(post.community_id ?? undefined);
  const isCommunityMod = myCommunityRole === 'owner' || myCommunityRole === 'mod';
  const inCommunity = !!post.community_id;
  const canPin = inCommunity ? (isAdmin || isModerator || isCommunityMod) : (isAdmin || isModerator);
  const canDelete = isAuthor || isAdmin || isModerator || isCommunityMod;
  const showPinned = !!post.is_pinned && (contextCommunityId ? post.community_id === contextCommunityId : !post.community_id);

  const liked = reactions?.user_reaction === 'like';
  const likeCount = reactions?.like ?? 0;
  const rankStyle = getRankNameStyle(post.author_rank_score || 0);

  const openPost = () => {
    void bumpTagInterest(post.id);
    navigate(`/community/forum/${post.id}`);
  };

  const requireAuth = () => {
    if (!user) {
      navigate('/auth');
      return false;
    }
    return true;
  };

  const handleLike = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!requireAuth()) return;
    if (!liked) void bumpTagInterest(post.id);
    react.mutate({ entityType: 'forum_post', entityId: post.id, reactionType: 'like' });
  };

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}/community/forum/${post.id}`;
    navigator.clipboard?.writeText(url).then(
      () => toast.success(uiI18n.t('app.link_copied_to_clipboard_cf544a80')),
      () => toast.error(uiI18n.t('app.could_not_copy_link_534e08ac')),
    );
  };

  const submitQuote = async () => {
    if (!quoteText.trim()) return;
    try {
      await createPost.mutateAsync({
        title: quoteText.trim().split('\n')[0].slice(0, 120) || 'Quote',
        content: quoteText.trim(),
        content_type: 'text',
        metadata: { quoted_post_id: post.id },
      } as any);
      toast.success(uiI18n.t('app.quoted_8e06ee91'));
      setQuoteOpen(false);
      setQuoteText('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : uiI18n.t('app.failed_to_quote_4189244b'));
    }
  };

  const submitEdit = async () => {
    const html = editorRef.current?.getHTML() ?? '';
    if (editorRef.current?.isEmpty()) return;
    try {
      await updatePost.mutateAsync({ id: post.id, content: html });
      toast.success(uiI18n.t('app.post_updated_ea3aeea3'));
      setEditOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : uiI18n.t('app.failed_to_update_197acf74'));
    }
  };

  const confirmDelete = async () => {
    try {
      await deletePost.mutateAsync(post.id);
      toast.success(uiI18n.t('app.post_deleted_fb8dc289'));
      setDeleteOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : uiI18n.t('app.failed_to_delete_07931ff7'));
    }
  };

  const handlePin = async () => {
    try {
      await setPinned.mutateAsync({ postId: post.id, pinned: !post.is_pinned });
      toast.success(post.is_pinned ? uiI18n.t('app.unpinned_63ca087d') : uiI18n.t('app.pinned_f9312169'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : uiI18n.t('app.failed_to_pin_b244e578'));
    }
  };

  const author = post.profiles;
  const authorName = author?.display_name || author?.username || 'Anonymous';

  if (post.is_deleted) return null;

  return (
    <div data-mobile-community-post>
      {/* Removed the background hover effect, replaced with subtle border highlight and shadow */}
      <GlassPanel
        className="relative flex flex-col gap-4 p-4 sm:p-5 transition-all duration-300 border border-white/5 hover:border-white/15 hover:shadow-[0_4px_24px_-8px_rgba(0,0,0,0.5)]"
        style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 320px' }}
      >
        
        {/* Header */}
        <div className="flex items-start gap-3">
          <ProfileWidgetCard
            userId={post.user_id}
            username={author?.username}
            displayName={author?.display_name}
            avatarUrl={author?.avatar_url}
            rankScore={post.author_rank_score || 0}
          >
            <button data-tv-key={isTV() ? `post-${post.id}-avatar` : undefined} type="button" onClick={(e) => e.stopPropagation()} className="shrink-0 mt-0.5">
              <CosmeticAvatar userId={post.user_id} className="h-11 w-11 ring-1 ring-white/10 transition-transform hover:scale-105">
                <AvatarImage src={author?.avatar_url || undefined} className="object-cover" />
                <AvatarFallback>{authorName[0]?.toUpperCase() || 'U'}</AvatarFallback>
              </CosmeticAvatar>
            </button>
          </ProfileWidgetCard>

          <div className="flex flex-col flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <ProfileWidgetCard
                userId={post.user_id}
                username={author?.username}
                displayName={author?.display_name}
                avatarUrl={author?.avatar_url}
                rankScore={post.author_rank_score || 0}
              >
                <button
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  data-tv-key={isTV() ? `post-${post.id}-author` : undefined}
                  className={cn('truncate text-[15px] font-bold text-foreground hover:underline decoration-white/30 underline-offset-2', rankStyle.className)}
                  style={rankStyle.style}
                >
                  <CosmeticName userId={post.user_id}>{authorName}</CosmeticName>
                </button>
              </ProfileWidgetCard>
              {post.author_is_official && (
                <BadgeCheck className="h-4 w-4 shrink-0 text-sky-400" aria-label={uiI18n.t('app.official_account_b15952ac')} />
              )}
              <UserBadges badges={post.badges} size={16} max={3} />
            </div>
            
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] text-muted-foreground mt-0.5">
              <span className="hover:underline cursor-pointer" onClick={openPost}>
                {formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}
              </span>
              
              {post.community && post.community_id !== contextCommunityId && (
                <>
                  <span className="text-white/20">•</span>
                  <CommunityWidgetCard
                    slug={post.community.slug}
                    name={post.community.name}
                    iconUrl={post.community.icon_url}
                    bannerUrl={post.community.banner_url}
                  >
                    <button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex max-w-[160px] items-center gap-1.5 rounded-md border border-primary/20 bg-primary/5 py-0.5 pr-1.5 pl-0.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/15"
                    >
                      {post.community.icon_url && (
                        <img src={getProxiedImageUrl(post.community.icon_url)} alt="" loading="lazy" decoding="async" className="h-3.5 w-3.5 rounded-[4px] object-cover" />
                      )}
                      <span className="truncate">{post.community.name}</span>
                    </button>
                  </CommunityWidgetCard>
                </>
              )}
              
              {(post as any).edited_at && (
                <>
                  <span className="text-white/20">•</span>
                  <span className="italic">{uiI18n.t('app.edited_a22fca6c')}</span>
                </>
              )}
              
              {post.flair === 'News' && post.news_source && (
                <>
                  <span className="text-white/20">•</span>
                  <span className="truncate text-sky-400 max-w-[160px]">
                    {uiI18n.t('app.via_a19e070e')} {post.news_source}
                  </span>
                </>
              )}
            </div>
          </div>

          {/* Options Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label={uiI18n.t('app.more_4bab2d8f')} onClick={(e) => e.stopPropagation()} className="shrink-0 rounded-full p-2 text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors mt-[-4px] mr-[-4px]">
                  <MoreHorizontal className="h-5 w-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                {isAuthor && (
                  <DropdownMenuItem onClick={() => { if (!requestTVWriting(post.id)) setEditOpen(true); }}>
                    <Pencil className="mr-2 h-4 w-4" /> {uiI18n.t('app.edit_post_e5157b9d')}
                  </DropdownMenuItem>
                )}
                {canPin && (
                  <DropdownMenuItem onClick={handlePin} disabled={setPinned.isPending}>
                    {post.is_pinned ? <PinOff className="mr-2 h-4 w-4" /> : <Pin className="mr-2 h-4 w-4" />}
                    {post.is_pinned ? uiI18n.t('app.unpin_post_cc453152') : uiI18n.t('app.pin_to_top_dacc47cd')}
                  </DropdownMenuItem>
                )}
                {(isAuthor || canPin) && canDelete && <DropdownMenuSeparator />}
                {!isAuthor && (
                   <DropdownMenuItem onClick={handleShare}>
                     <Share className="mr-2 h-4 w-4" /> {uiI18n.t('app.share_link_ef050958')}
                   </DropdownMenuItem>
                )}
                {canDelete && (
                  <DropdownMenuItem className="text-rose-400 focus:text-rose-400 focus:bg-rose-400/10" onClick={() => setDeleteOpen(true)}>
                    <Trash2 className="mr-2 h-4 w-4" /> {uiI18n.t('app.delete_post_8bcf9240')}
                  </DropdownMenuItem>
                )}
                <ModerationMenuItems
                  contentType="forum_post"
                  contentId={post.id}
                  authorUserId={post.user_id}
                  authorName={authorName}
                  showPauseComments
                  showRepostControls
                />
              </DropdownMenuContent>
            </DropdownMenu>
        </div>

        {/* Content Body */}
        <div className="cursor-pointer flex flex-col gap-2" onClick={openPost}>
          <FlairPills post={post} showPinned={showPinned} />
          
          <TranslatedPostContent title={post.title} content={post.content}
            titleClassName="font-semibold text-[17px] leading-snug text-foreground tracking-tight"
            contentClassName="text-[15px] text-foreground/90 leading-relaxed" />
        </div>

        {/* Media Embeds */}
        <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
          {post.poll && <PostPollCard poll={post.poll} />}
          {post.gif_url && <PostImageGrid images={[post.gif_url]} spoiler={post.is_spoiler} />}
          {!post.gif_url && post.images && post.images.length > 0 && (
            <PostImageGrid images={post.images} spoiler={post.is_spoiler} />
          )}
          {post.quoted_post_id && <QuotedPostEmbed postId={post.quoted_post_id} />}
          
          {post.playlist_id && <PostPlaylistEmbed playlistId={post.playlist_id} />}
          {post.tierlist_id && <PostTierlistEmbed tierlistId={post.tierlist_id} />}
          {post.watch_room_id && <PostWatchroomEmbed roomId={post.watch_room_id} />}
          
          {post.anime_id && post.anime_name && (
            <PostMediaEmbed id={post.anime_id} name={post.anime_name} poster={post.anime_poster} type={post.media_type || 'anime'} variant="card" />
          )}
        </div>

        {/* Action Bar */}
        <div className="flex items-center justify-between mt-1">
          <div className="flex items-center gap-1 sm:gap-4 -ml-2">
            <ActionButton 
              icon={Heart} 
              count={likeCount} 
              active={liked} 
              activeClass="text-rose-500" 
              hoverClass="hover:text-rose-500 hover:bg-rose-500/10"
              label={uiI18n.t('app.like_c7e02c95')}
              onClick={handleLike} 
            />
            <ActionButton 
              icon={MessageCircle} 
              count={post.comments_count || 0} 
              hoverClass="hover:text-blue-400 hover:bg-blue-400/10"
              label={uiI18n.t('app.comment_153d7a58')}
              onClick={(e) => { e.stopPropagation(); setShowComments((v) => !v); }} 
            />
            
            <DropdownMenu open={repostOpen} onOpenChange={setRepostOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={uiI18n.t('app.repost_98dd4750')}
                  onClick={(e) => { e.stopPropagation(); if (!user) { e.preventDefault(); navigate('/auth'); } }}
                  className={cn(
                    'group flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium text-muted-foreground transition-all duration-200 ease-out hover:text-emerald-500 hover:bg-emerald-500/10',
                    post.reposted && 'text-emerald-500'
                  )}
                >
                  <Repeat2 className={cn("h-[18px] w-[18px] transition-transform duration-200 group-hover:scale-110 group-active:scale-90", post.reposted && "stroke-[2.5px]")} />
                  {post.repost_count !== undefined && post.repost_count > 0 && <span className="tabular-nums">{post.repost_count}</span>}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem
                  disabled={!allowRepost && !post.reposted}
                  onClick={() => toggleRepost.mutate({ postId: post.id, reposted: !!post.reposted })}
                >
                  <Repeat2 className="mr-2 h-4 w-4" />
                  {post.reposted ? uiI18n.t('app.undo_repost_e97ec486') : allowRepost ? uiI18n.t('app.repost_98dd4750') : uiI18n.t('app.reposting_disabled_aba14e2f')}
                </DropdownMenuItem>
                <DropdownMenuItem disabled={!allowRequote} onClick={() => { if (!requestTVWriting(post.id)) setQuoteOpen(true); }}>
                  <QuoteIcon className="mr-2 h-4 w-4" />
                  {allowRequote ? uiI18n.t('app.quote_post_662231f9') : uiI18n.t('app.quoting_disabled_90c6c405')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex items-center gap-1 -mr-2">
            <ActionButton
              icon={Bookmark}
              active={post.bookmarked}
              activeClass="text-primary"
              hoverClass="hover:text-primary hover:bg-primary/10"
              label={uiI18n.t('app.bookmark_441da1bf')}
              onClick={(e) => { e.stopPropagation(); if (!requireAuth()) return; toggleBookmark.mutate({ postId: post.id, bookmarked: !!post.bookmarked }); }}
            />
            <ActionButton 
              icon={Share} 
              hoverClass="hover:text-sky-400 hover:bg-sky-400/10"
              label={uiI18n.t('app.share_09ca55ca')}
              onClick={handleShare} 
            />
          </div>
        </div>

        {/* Comments Section */}
        <AnimatePresence>
          {showComments && (
            <motion.div 
              initial={{ opacity: 0, height: 0 }} 
              animate={{ opacity: 1, height: 'auto' }} 
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="border-t border-white/[0.08] pt-4 mt-2">
                <Comments entityType="forum_post" entityId={post.id} entityName={post.title} generalCommunity={!post.community_id} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </GlassPanel>

      {/* Dialogs */}
      <Dialog open={quoteOpen} onOpenChange={setQuoteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{uiI18n.t('app.quote_post_662231f9')}</DialogTitle>
          </DialogHeader>
          <textarea
            value={quoteText}
            onChange={(e) => setQuoteText(e.target.value)}
            placeholder={uiI18n.t('app.add_your_thoughts_6f8c3326')}
            rows={3}
            className="w-full resize-none rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm outline-none transition-colors focus:border-primary/50 focus:bg-white/[0.05]"
          />
          <div className="max-h-72 overflow-y-auto mt-2 rounded-xl border border-white/5 bg-black/20 p-2">
            <QuotedPostEmbed postId={post.id} preview />
          </div>
          <div className="flex justify-end pt-2">
            <Button className="rounded-full px-6 font-semibold" disabled={!quoteText.trim() || createPost.isPending} onClick={submitQuote}>
              {uiI18n.t('app.post_quote_0cc58a78')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{uiI18n.t('app.edit_post_e5157b9d')}</DialogTitle>
          </DialogHeader>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
            <RichEditor ref={editorRef} content={post.content || ''} placeholder={uiI18n.t('app.edit_your_post_a09e168d')} minHeight="150px" />
          </div>
          <DialogFooter>
            <Button variant="ghost" className="rounded-full" onClick={() => setEditOpen(false)}>{uiI18n.t('app.cancel_77dfd213')}</Button>
            <Button className="rounded-full px-6 font-semibold" disabled={updatePost.isPending} onClick={submitEdit}>
              {updatePost.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {uiI18n.t('app.save_changes_fa2984b3')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{uiI18n.t('app.delete_post_c318415f')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{uiI18n.t('app.this_action_cannot_be_undone_the_post_will_be_pe_d03e258e')}</p>
          <DialogFooter>
            <Button variant="ghost" className="rounded-full" onClick={() => setDeleteOpen(false)}>{uiI18n.t('app.cancel_77dfd213')}</Button>
            <Button variant="destructive" className="rounded-full px-6 font-semibold" disabled={deletePost.isPending} onClick={confirmDelete}>
              {deletePost.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {uiI18n.t('app.delete_f6fdbe48')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
