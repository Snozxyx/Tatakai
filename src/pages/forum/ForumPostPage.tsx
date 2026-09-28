import { useNavigate, useParams } from 'react-router-dom';
import type { FC } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { ArrowLeft, Trash2, Pin, Loader2 } from 'lucide-react';
import { CommunitySidebar } from '@/components/community/feed/CommunitySidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { cn } from '@/lib/utils';
import { useIsNativeApp, useIsDesktopApp } from '@/hooks/ui/useIsNativeApp';
import { useAuth } from '@/contexts/AuthContext';
import { useForumPost, useDeleteForumPost, usePinForumPost } from '@/hooks/community/useForum';
import { usePostPoll } from '@/hooks/community/usePostPolls';
import { PostCard } from '@/components/community/feed/PostCard';
import { ModerationMenu } from '@/components/moderation/ModerationMenu';
import type { FeedPost } from '@/hooks/community/useFeed';
import { WatchTogetherWidget } from '@/components/community/feed/WatchTogetherWidget';
import { AiringWidget } from '@/components/community/feed/AiringWidget';
import { SocialWidget } from '@/components/community/feed/SocialWidget';
import { TrendingRail } from '@/components/community/feed/TrendingRail';
import { HashtagsWidget } from '@/components/community/feed/HashtagsWidget';
import { Seo } from '@/components/seo/Seo';

export default function ForumPostPage() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const isNative = useIsNativeApp();
  const isDesktopApp = useIsDesktopApp();
  const { user, isAdmin } = useAuth();
  const { data: post, isLoading } = useForumPost(postId!);
  const { data: poll } = usePostPoll(postId);
  const deletePost = useDeleteForumPost();
  const pinPost = usePinForumPost();
  const confirm = useConfirm();

  if (!postId) return <div className="p-8">Invalid post ID</div>;

  const canDelete = !!user && (post?.user_id === user.id || isAdmin);

  const handleDelete = async () => {
    if (!(await confirm({ title: 'Delete this post?', destructive: true }))) return;
    try {
      await deletePost.mutateAsync(postId);
      toast.success('Post deleted');
      navigate('/community');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const feedPost: FeedPost | null = post
    ? (() => {
        const metadata = (post.metadata || {}) as Record<string, any>;
        const images: string[] | null =
          Array.isArray(metadata.images) && metadata.images.length ? metadata.images : post.image_url ? [post.image_url] : null;
        return {
          ...post,
          poll: poll || null,
          gif_url: metadata.gif_url || null,
          images,
          watch_room_id: metadata.watch_room_id || null,
          quoted_post_id: metadata.quoted_post_id || null,
          media_type: metadata.media_type || (post.anime_id ? 'anime' : null),
        } as FeedPost;
      })()
    : null;

  const rail: FC<{ className?: string }>[] = [WatchTogetherWidget, AiringWidget, SocialWidget, TrendingRail, HashtagsWidget];

  return (
    <div className="relative min-h-screen bg-background text-foreground antialiased">
      {post && (
        <Seo
          title={(post as any).title || `Post by ${post.profiles?.display_name || 'a member'}`}
          description={post.content || undefined}
          image={post.image_url || (post.metadata as any)?.images?.[0] || post.anime_poster || undefined}
          canonicalPath={`/community/forum/${postId}`}
          kind="article"
          suffix=" — Tatakai Community"
        />
      )}
      {/* Ambient background mesh — matches /community */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-[10%] left-1/2 -translate-x-1/2 h-[600px] w-[1200px] rounded-full bg-radial from-rose-500/10 via-primary/5 to-transparent blur-3xl" />
        <div className="absolute top-[20%] -left-[10%] h-[500px] w-[500px] rounded-full bg-violet-600/5 blur-3xl" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/90 to-background" />
      </div>

      <CommunitySidebar />

      <main className={cn('relative z-10 w-full transition-all duration-300', isDesktopApp ? 'pl-24 lg:pl-28' : isNative ? 'pl-0' : 'pl-0 md:pl-20 lg:pl-24')}>
        <div className="mx-auto max-w-[1536px] px-4 pt-6 md:px-8 md:pt-10">
          <div className="mb-6 flex items-center justify-between">
            <Button variant="ghost" onClick={() => navigate('/community')} className="gap-2">
              <ArrowLeft className="h-4 w-4" /> Community
            </Button>
            {post && (
              <div className="flex items-center gap-1">
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => pinPost.mutate({ postId, isPinned: !post.is_pinned })}
                  >
                    <Pin className={cn('h-4 w-4', post.is_pinned && 'fill-current text-primary')} />
                    {post.is_pinned ? 'Unpin' : 'Pin'}
                  </Button>
                )}
                {canDelete && (
                  <Button variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={handleDelete}>
                    <Trash2 className="h-4 w-4" /> Delete
                  </Button>
                )}
                {/* Shared moderation toolbar — report + staff flag toggles / ban / admin.
                    Delete lives in the dedicated button above, so it's omitted here. */}
                <ModerationMenu
                  contentType="forum_post"
                  contentId={post.id}
                  authorUserId={post.user_id}
                  authorName={post.profiles?.display_name ?? undefined}
                  showPauseComments
                  showRepostControls
                />
              </div>
            )}
          </div>

          <div className="flex items-start gap-8 xl:gap-12 pb-12">
            {/* Main post column */}
            <div className="w-full min-w-0 flex-1 max-w-[720px]">
              {isLoading ? (
                <div className="flex justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : feedPost ? (
                <PostCard post={feedPost} defaultShowComments />
              ) : (
                <GlassPanel className="rounded-[2rem] p-16 text-center">
                  <h3 className="font-display text-lg font-bold tracking-tight">Post not found</h3>
                  <p className="mt-1 text-sm text-muted-foreground">It may have been removed.</p>
                </GlassPanel>
              )}
            </div>

            {/* Right rail — same follow-along widgets as /community */}
            <aside className="hidden w-[380px] 2xl:w-[420px] shrink-0 xl:block">
              <div className="sticky top-6 flex flex-col gap-6 w-full">
                {rail.map((Widget, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.05, ease: 'easeOut' }}
                  >
                    <Widget className="w-full" />
                  </motion.div>
                ))}
              </div>
            </aside>
          </div>
        </div>
      </main>
      <MobileNav />
    </div>
  );
}
