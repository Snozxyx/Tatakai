import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Loader2, MessageSquare, Pin } from 'lucide-react';

import { GlassPanel } from '@/components/ui/GlassPanel';
import { useFeed, type FeedTab, type FeedPostType } from '@/hooks/community/useFeed';
import { useAuth } from '@/contexts/AuthContext';

import { PostComposer } from './PostComposer';
import { PostCard } from './PostCard';
import { WatchroomFeedItem } from './WatchroomFeedItem';

export function FeedList({
  tab,
  tag,
  communityId,
  postType,
  search,
  showComposer = true,
  layout = 'timeline',
}: {
  tab: FeedTab;
  tag?: string;
  communityId?: string;
  postType?: FeedPostType;
  search?: string;
  showComposer?: boolean;
  /** `masonry` renders the timeline as balanced 2-column cards; the main feed stays `timeline`. */
  layout?: 'timeline' | 'masonry';
}) {
  const { user } = useAuth();

  const {
    data,
    isLoading,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useFeed(tab, {
    tag,
    communityId,
    postType,
    search,
  });

  const items = data?.pages.flat() ?? [];

  // Pinned posts logic (Community pin vs Global pin)
  const isCommunityView = !!communityId;
  const isPinnedItem = (i: (typeof items)[number]) =>
    i.kind === 'post' && i.post.is_pinned && (isCommunityView ? true : !i.post.community_id);
  const pinnedItems = items.filter(isPinnedItem);
  const timelineItems = items.filter((i) => !isPinnedItem(i));

  const sentinelRef = useRef<HTMLDivElement>(null);

  // Infinite scrolling observer
  useEffect(() => {
    const element = sentinelRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: '500px' },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  /* =========================================================
     LOADING STATE (Matches the new PostCard design)
  ========================================================= */
  if (isLoading) {
    return (
      <div className="w-full flex flex-col gap-4">
        {showComposer && user && (
          <div className="mb-2">
            <PostComposer onPosted={() => refetch()} defaultCommunityId={communityId} />
          </div>
        )}

        {[...Array(4)].map((_, index) => (
          <GlassPanel key={index} className="p-4 sm:p-5 border border-white/5 bg-white/[0.015]">
            <div className="flex gap-3">
              <div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-white/5" />
              <div className="flex-1 space-y-4 py-1">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-32 animate-pulse rounded-full bg-white/10" />
                  <div className="h-3 w-16 animate-pulse rounded-full bg-white/5" />
                </div>
                <div className="space-y-2">
                  <div className="h-3.5 w-full animate-pulse rounded-full bg-white/5" />
                  <div className="h-3.5 w-4/5 animate-pulse rounded-full bg-white/5" />
                </div>
                <div className="mt-4 flex gap-6">
                  {[1, 2, 3, 4].map((action) => (
                    <div key={action} className="h-6 w-12 animate-pulse rounded-full bg-white/5" />
                  ))}
                </div>
              </div>
            </div>
          </GlassPanel>
        ))}
      </div>
    );
  }

  /* =========================================================
     EMPTY STATE
  ========================================================= */
  if (items.length === 0) {
    return (
      <div className="w-full flex flex-col gap-4">
        {showComposer && user && (
          <div className="mb-4">
            <PostComposer onPosted={() => refetch()} defaultCommunityId={communityId} />
          </div>
        )}

        <div className="flex flex-col items-center justify-center rounded-[2rem] border border-dashed border-white/10 bg-white/[0.02] px-6 py-24 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-white/5 ring-1 ring-white/10">
            <MessageSquare className="h-7 w-7 text-muted-foreground/60" />
          </div>
          <h3 className="font-display text-[19px] font-semibold tracking-tight text-foreground">
            {tag
              ? `No posts tagged #${tag}`
              : tab === 'following'
                ? 'Nothing from people you follow'
                : tab === 'news'
                  ? 'No news updates yet'
                  : 'Nothing here yet'}
          </h3>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            {tab === 'following'
              ? 'Follow more members to see their posts here.'
              : 'Be the first to share something with the community.'}
          </p>
        </div>
      </div>
    );
  }

  /* =========================================================
     MAIN FEED RENDER
  ========================================================= */
  return (
    <div className="w-full flex flex-col gap-4">
      
      {showComposer && user && (
        <PostComposer onPosted={() => refetch()} defaultCommunityId={communityId} />
      )}

      {/* PINNED SECTION */}
      {pinnedItems.length > 0 && (
        <div className="mb-2 flex flex-col gap-4">
          <div className="flex items-center gap-2 px-1">
            <Pin className="h-4 w-4 text-emerald-400" />
            <span className="text-xs font-bold uppercase tracking-widest text-emerald-400">
              {isCommunityView ? 'Pinned' : 'Pinned · Global'}
            </span>
          </div>
          
          {pinnedItems.map((item) =>
            item.kind === 'post' ? (
              <PostCard key={item.post.id} post={item.post} contextCommunityId={communityId ?? null} />
            ) : null,
          )}
          
          {/* Subtle divider after pinned items */}
          <div className="mt-2 h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        </div>
      )}

      {/* TIMELINE / MASONRY GRID */}
      {layout === 'masonry' ? (
        <div className="columns-1 gap-4 [column-fill:_balance] lg:columns-2">
          {timelineItems.map((item, index) => {
            const key = item.kind === 'post' ? item.post.id : `room-${item.room.id}`;
            return (
              <motion.article
                key={key}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(index * 0.025, 0.15), ease: 'easeOut' }}
                className="break-inside-avoid mb-4"
              >
                {item.kind === 'post' ? (
                  <PostCard post={item.post} contextCommunityId={communityId ?? null} />
                ) : (
                  <WatchroomFeedItem room={item.room} />
                )}
              </motion.article>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {timelineItems.map((item, index) => {
            const key = item.kind === 'post' ? item.post.id : `room-${item.room.id}`;
            return (
              <motion.article
                key={key}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(index * 0.025, 0.15), ease: 'easeOut' }}
              >
                {item.kind === 'post' ? (
                  <PostCard post={item.post} contextCommunityId={communityId ?? null} />
                ) : (
                  <WatchroomFeedItem room={item.room} />
                )}
              </motion.article>
            );
          })}
        </div>
      )}

      {/* INFINITE SCROLL SENTINEL */}
      <div ref={sentinelRef} className="flex min-h-[100px] items-center justify-center pb-8">
        {isFetchingNextPage && (
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span>Loading more...</span>
          </div>
        )}
      </div>
    </div>
  );
}