import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MessagesSquare, PenSquare, ChevronRight } from 'lucide-react';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { PostCard } from '@/components/community/feed/PostCard';
import { PostComposer } from '@/components/community/feed/PostComposer';
import { useForumPosts } from '@/hooks/community/useForum';
import { useAuth } from '@/contexts/AuthContext';
import type { FeedPost } from '@/hooks/community/useFeed';
import type { SelectedMedia } from '@/components/community/feed/MediaPicker';

/** Map a raw forum row (from useForumPosts) to the FeedPost shape PostCard
 *  expects. Embeds live in metadata; social counts default to 0 — PostCard
 *  fetches its own live reaction state. Mirrors VaultTab's toFeedPost. */
function toFeedPost(p: any): FeedPost {
  const metadata = (p.metadata || {}) as Record<string, any>;
  const images =
    Array.isArray(metadata.images) && metadata.images.length
      ? metadata.images
      : p.image_url
        ? [p.image_url]
        : null;
  return {
    ...p,
    poll: null,
    gif_url: metadata.gif_url || null,
    images,
    watch_room_id: metadata.watch_room_id || null,
    quoted_post_id: metadata.quoted_post_id || null,
    media_type: metadata.media_type || (p.anime_id ? 'anime' : null),
    repost_count: 0,
    reposted: false,
    bookmarked: false,
    badges: [],
    author_rank_score: 0,
    author_is_official: false,
    news_source: (metadata.source as string) || null,
  } as FeedPost;
}

const MAX_VISIBLE = 4;

/**
 * "Community posts about this anime" — surfaces forum posts tagged to this
 * title (anime-level media context) directly on the series page, and lets a
 * signed-in viewer start a new post with the anime pre-attached.
 */
export function AnimeCommunityPosts({
  animeId,
  animeName,
  animePoster,
}: {
  animeId: string;
  animeName: string;
  animePoster?: string | null;
}) {
  const { user } = useAuth();
  const { data: posts = [], isLoading, refetch } = useForumPosts({ animeId, sortBy: 'new', limit: 12 });
  const [composerOpen, setComposerOpen] = useState(false);

  const defaultMedia: SelectedMedia = {
    id: animeId,
    name: animeName,
    poster: animePoster ?? null,
    type: 'anime',
  };

  const visible = posts.slice(0, MAX_VISIBLE);

  return (
    <section className="mb-16">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 className="font-display text-2xl font-semibold flex items-center gap-2">
          <MessagesSquare className="w-5 h-5 text-primary" />
          Community posts
        </h2>
        {user && (
          <Button
            variant={composerOpen ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setComposerOpen((v) => !v)}
            className="gap-1.5 rounded-full"
          >
            <PenSquare className="h-4 w-4" />
            {composerOpen ? 'Close' : 'New post about this'}
          </Button>
        )}
      </div>

      {composerOpen && user && (
        <div className="mb-6">
          <PostComposer
            defaultMedia={defaultMedia}
            onPosted={() => {
              setComposerOpen(false);
              refetch();
            }}
          />
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <GlassPanel key={i} className="h-32 animate-pulse border-white/[0.06]" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <GlassPanel className="flex flex-col items-center justify-center gap-2 py-10 text-center border-white/[0.06]">
          <MessagesSquare className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium text-muted-foreground">No posts about {animeName} yet.</p>
          {user ? (
            <p className="text-xs text-muted-foreground/70">Be the first to start the conversation.</p>
          ) : (
            <p className="text-xs text-muted-foreground/70">
              <Link to="/auth" className="text-primary hover:underline">Sign in</Link> to post about this anime.
            </p>
          )}
        </GlassPanel>
      ) : (
        <div className="space-y-4">
          {visible.map((post) => (
            <PostCard key={post.id} post={toFeedPost(post)} />
          ))}
          {posts.length > MAX_VISIBLE && (
            <Link
              to={`/community?anime=${encodeURIComponent(animeId)}`}
              className="flex items-center justify-center gap-1 text-sm font-semibold text-primary hover:underline"
            >
              View all {posts.length} posts
              <ChevronRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      )}
    </section>
  );
}
