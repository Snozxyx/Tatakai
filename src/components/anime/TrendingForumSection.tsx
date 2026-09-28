import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { formatDistanceToNow } from 'date-fns';
import { Flame, ChevronRight, Heart, MessageCircle, Eye, EyeOff, ImagePlus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { GlassPanel } from '@/components/ui/GlassPanel';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ProfileWidgetCard } from '@/components/profile/ProfileWidgetCard';
import { CommunityWidgetCard } from '@/components/community/CommunityWidgetCard';
import { UserBadges } from '@/components/ui/UserBadges';
import { getProxiedImageUrl } from '@/lib/api';
import { getRankNameStyle } from '@/lib/rankUtils';
import { resolveBadges, type BadgeDef } from '@/lib/badges';
import { deriveIsAdmin, deriveIsModerator } from '@/lib/roles';
import { useForumPosts, type ForumPost } from '@/hooks/community/useForum';
import { useTrendingTags } from '@/hooks/community/useTrending';
import { useAuth } from '@/contexts/AuthContext';
import { tallyPoll, type PostPoll } from '@/hooks/community/usePostPolls';
import { RichContent } from '@/components/community/feed/richText';
import {
  PostPollCard,
  PostImageGrid,
  PostPlaylistEmbed,
  PostTierlistEmbed,
} from '@/components/community/feed/PostEmbeds';
import { cn } from '@/lib/utils';

const TILE_COUNT = 6;

/** Bento grid geometry — row 1 hero/side, row 2 three squares, row 3 a wide band. */
const TILE_LAYOUTS = [
  { span: 'col-span-2 lg:col-span-8 min-h-[320px] lg:min-h-[440px]', shape: 'hero' as const },
  { span: 'col-span-2 lg:col-span-4 min-h-[320px] lg:min-h-[440px]', shape: 'side' as const },
  { span: 'col-span-1 lg:col-span-4 min-h-[240px]', shape: 'square' as const },
  { span: 'col-span-1 lg:col-span-4 min-h-[240px]', shape: 'square' as const },
  { span: 'col-span-1 lg:col-span-4 min-h-[240px]', shape: 'square' as const },
  { span: 'col-span-2 lg:col-span-12 min-h-[220px]', shape: 'band' as const },
];

/** One media-rich post, pre-enriched the same way the community feed does it. */
interface TrendingTile {
  post: ForumPost;
  images: string[];
  gif_url: string | null;
  poll: PostPoll | null;
  tags: string[];
  badges: BadgeDef[];
  author_rank_score: number;
  author_is_official: boolean;
  community: { name: string; slug: string; icon_url: string | null } | null;
  /** What this tile should render. */
  visual: 'cover' | 'poster' | 'images' | 'poll' | 'playlist' | 'tierlist' | 'text';
  heat: number;
}

/** Guarded query: a missing table (pre-migration) yields `[]`, never a throw. */
function guard<T>(promise: Promise<{ data: T[] | null }>): Promise<T[]> {
  return promise
    .then(({ data }) => data || [])
    .catch(() => [] as T[]);
}

/**
 * Hot posts, enriched with the community extras the feed renders (hashtags, polls,
 * badges, rank proxy) and re-ranked toward media-rich discussions so the home
 * bento always shows imagery, not text-only threads.
 */
function useTrendingTiles(target = TILE_COUNT) {
  const { data: posts = [], isLoading } = useForumPosts({ sortBy: 'hot', limit: 30 });
  const ids = useMemo(() => posts.map((p) => p.id), [posts]);
  const idKey = ids.join(',');
  const { user } = useAuth();

  const { data: extras } = useQuery({
    queryKey: ['trending-tiles', idKey, user?.id],
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const db = supabase as any;
      const [tagRows, pollRows, pollVoteRows, badgeRows, roleRows, commRows, officialRows] =
        await Promise.all([
          guard(db.from('post_hashtags').select('post_id, tag').in('post_id', ids)),
          guard(db.from('post_polls').select('*').in('post_id', ids)),
          guard(db.from('post_poll_votes').select('poll_id, user_id, option_index')),
          guard(db.from('user_badges' as any).select('user_id, badge_key')),
          guard(db.from('profiles').select('user_id, is_admin, is_moderator, role')),
          guard(db.from('communities').select('id, name, slug, icon_url')),
          guard(db.from('profiles').select('user_id, is_official')),
        ]);

      const tagsByPost = new Map<string, string[]>();
      (tagRows as any[]).forEach((r) => {
        const tag = String(r.tag).trim().toLowerCase();
        if (!tag) return;
        const list = tagsByPost.get(r.post_id) || [];
        if (!list.includes(tag)) list.push(tag);
        tagsByPost.set(r.post_id, list);
      });

      const votesByPoll = new Map<string, any[]>();
      (pollVoteRows as any[]).forEach((v) => {
        const arr = votesByPoll.get(v.poll_id) || [];
        arr.push(v);
        votesByPoll.set(v.poll_id, arr);
      });
      const pollByPost = new Map<string, PostPoll>();
      ((pollRows as any[]) || []).forEach((poll: any) =>
        pollByPost.set(poll.post_id, tallyPoll(poll, votesByPoll.get(poll.id) || [], user?.id)),
      );

      const keysByUser = new Map<string, string[]>();
      ((badgeRows as any[]) || []).forEach((r: any) => {
        const list = keysByUser.get(r.user_id) || [];
        list.push(r.badge_key);
        keysByUser.set(r.user_id, list);
      });
      const roleByUser = new Map<string, any>();
      ((roleRows as any[]) || []).forEach((r: any) => roleByUser.set(r.user_id, r));
      const badgesByUser = new Map<string, BadgeDef[]>();
      roleByUser.forEach((role, uid) =>
        badgesByUser.set(uid, resolveBadges(keysByUser.get(uid) || [], {
          isAdmin: deriveIsAdmin(role),
          isModerator: deriveIsModerator(role),
        })),
      );

      const communityByPost = new Map<string, { name: string; slug: string; icon_url: string | null }>();
      ((commRows as any[]) || []).forEach((c: any) =>
        communityByPost.set(c.id, { name: c.name, slug: c.slug, icon_url: c.icon_url ?? null }),
      );
      const official = new Set(((officialRows as any[]) || []).filter((r: any) => r.is_official).map((r: any) => r.user_id));

      return { tagsByPost, pollByPost, badgesByUser, communityByPost, official };
    },
  });

  const tiles = useMemo<TrendingTile[]>(() => {
    const list = extras ? posts.map((post) => {
      const metadata = (post.metadata || {}) as Record<string, any>;
      const images = Array.isArray(metadata.images) && metadata.images.length
        ? metadata.images
        : post.image_url ? [post.image_url] : [];
      const gif_url = typeof metadata.gif_url === 'string' ? metadata.gif_url : null;
      const poll = extras.pollByPost.get(post.id) || null;
      const tags = extras.tagsByPost.get(post.id) || [];
      const badges = extras.badgesByUser.get(post.user_id) || [];
      const community = post.community_id ? extras.communityByPost.get(post.community_id) ?? null : null;
      const heat = (post.upvotes - post.downvotes) * 2 + post.comments_count + post.views_count / 25;

      let visual: TrendingTile['visual'] = 'text';
      if (post.playlist_id) visual = 'playlist';
      else if (post.tierlist_id) visual = 'tierlist';
      else if (poll) visual = 'poll';
      else if (gif_url) visual = 'cover';
      else if (images.length > 1) visual = 'images';
      else if (images.length === 1) visual = 'cover';
      else if (post.anime_id && post.anime_poster) visual = 'poster';

      // Media posts float ahead of text-only threads at any engagement level.
      const mediaBoost = visual === 'text' ? -40 : visual === 'images' ? 30 : 55;

      return {
        post,
        images,
        gif_url,
        poll,
        tags,
        badges,
        author_rank_score: post.author_rank_score ?? 0,
        author_is_official: extras.official.has(post.user_id),
        community,
        visual,
        heat: heat + mediaBoost,
      } satisfies TrendingTile;
    }) : [];

    list.sort((a, b) => b.heat - a.heat);
    return list.slice(0, target);
  }, [posts, extras, target]);

  return { tiles, isLoading, isEmpty: !isLoading && tiles.length === 0 };
}

function compactCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(value);
}

function StatChip({ icon: Icon, value, className }: { icon: any; value: number; className?: string }) {
  if (!value) return null;
  return (
    <span className={cn('flex items-center gap-1 text-[11px] font-semibold tabular-nums', className)}>
      <Icon className="h-3.5 w-3.5" /> {compactCount(value)}
    </span>
  );
}

function RankBadge({ index, large = false }: { index: number; large?: boolean }) {
  if (index > 2) return null;
  return (
    <span
      className={cn(
        'flex items-center justify-center rounded-full border border-white/15 bg-black/60 font-display font-bold tabular-nums backdrop-blur-md',
        large ? 'h-9 w-9 text-sm' : 'h-7 w-7 text-[11px]',
        index === 0 && 'border-amber-400/40 text-amber',
        index === 1 && 'border-white/30 text-white',
        index === 2 && 'border-orange-400/40 text-orange-400',
      )}
    >
      #{index + 1}
    </span>
  );
}

/** Author row shared by every tile: avatar, name (rank-tinted), time, community chip. */
function TileHeader({ tile, shape }: { tile: TrendingTile; shape: 'hero' | 'side' | 'square' | 'band' }) {
  const { post } = tile;
  const author = post.profiles;
  const authorName = author?.display_name || author?.username || 'Anonymous';
  const rankStyle = getRankNameStyle(tile.author_rank_score);

  return (
    <div className="flex min-w-0 items-center gap-2">
      <ProfileWidgetCard
        userId={post.user_id}
        username={author?.username}
        displayName={author?.display_name}
        avatarUrl={author?.avatar_url}
        rankScore={tile.author_rank_score}
      >
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 transition-transform hover:scale-105"
        >
          <Avatar className={cn('ring-1 ring-white/15', shape === 'hero' ? 'h-9 w-9' : 'h-7 w-7')}>
            <AvatarImage src={author?.avatar_url || undefined} className="object-cover" />
            <AvatarFallback className={cn(shape === 'hero' ? 'text-xs' : 'text-[10px]')}>
              {authorName[0]?.toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
        </button>
      </ProfileWidgetCard>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <ProfileWidgetCard
            userId={post.user_id}
            username={author?.username}
            displayName={author?.display_name}
            avatarUrl={author?.avatar_url}
            rankScore={tile.author_rank_score}
          >
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              className={cn('truncate font-bold hover:underline decoration-white/30 underline-offset-2', rankStyle.className, shape === 'hero' ? 'text-[14px]' : 'text-[13px]')}
              style={rankStyle.style}
            >
              {authorName}
            </button>
          </ProfileWidgetCard>
          {tile.author_is_official && (
            <span className="shrink-0 rounded-[3px] border border-sky-400/40 bg-sky-400/20 px-1 text-[8px] font-bold uppercase text-sky-300">Official</span>
          )}
          <UserBadges badges={tile.badges} size={14} max={2} />
        </div>
        <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-white/50">
          <span className="shrink-0">{formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</span>
          {tile.community && (
            <>
              <span className="shrink-0 text-white/20">·</span>
              <CommunityWidgetCard slug={tile.community.slug} name={tile.community.name} iconUrl={tile.community.icon_url}>
                <button
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  className="flex min-w-0 items-center gap-1 rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 font-semibold text-primary transition-colors hover:bg-primary/20"
                >
                  {tile.community.icon_url && (
                    <img src={getProxiedImageUrl(tile.community.icon_url)} alt="" className="h-3 w-3 rounded-[3px] object-cover" />
                  )}
                  <span className="max-w-[90px] truncate">{tile.community.name}</span>
                </button>
              </CommunityWidgetCard>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Flair pill: the post's own flair, or its hottest hashtag as a fallback. */
function TileFlair({ tile, shape }: { tile: TrendingTile; shape: 'hero' | 'side' | 'square' | 'band' }) {
  const label = tile.post.flair || (tile.tags.length ? `#${tile.tags[0]}` : null);
  if (!label) return null;
  const size = shape === 'hero' ? 'text-xs' : 'text-[10px]';
  const isTag = label.startsWith('#');
  return (
    <span className={cn(
      'inline-flex max-w-full items-center rounded-md border px-2 py-0.5 font-bold uppercase tracking-wider',
      size,
      isTag ? 'border-primary/25 bg-primary/10 text-primary' : 'border-white/10 bg-white/10 text-white/80',
    )}>
      <span className="truncate">{label}</span>
    </span>
  );
}

function TileFooter({ tile, shape }: { tile: TrendingTile; shape: 'hero' | 'side' | 'square' | 'band' }) {
  const { post } = tile;
  const dim = shape === 'hero' ? 'text-white/60' : 'text-white/50';
  return (
    <div className="flex items-center gap-4">
      <StatChip icon={Heart} value={post.upvotes} className={dim} />
      <StatChip icon={MessageCircle} value={post.comments_count} className={dim} />
      <StatChip icon={Eye} value={post.views_count} className={dim} />
      {shape === 'hero' && (
        <span className="ml-auto flex items-center gap-1 text-[11px] font-semibold text-primary">
          Read discussion <ChevronRight className="h-3.5 w-3.5" />
        </span>
      )}
    </div>
  );
}

function FlairLine({ tile, shape }: { tile: TrendingTile; shape: 'hero' | 'side' | 'square' | 'band' }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <TileFlair tile={tile} shape={shape} />
      {tile.post.is_spoiler && (
        <span className="rounded-md border border-orange-500/25 bg-orange-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-orange-400">Spoiler</span>
      )}
    </div>
  );
}

/** Interactive community embeds (poll / playlist / tierlist) rendered in place. */
function TileWidget({ tile }: { tile: TrendingTile }) {
  if (tile.visual === 'poll' && tile.poll) return <PostPollCard poll={tile.poll} />;
  if (tile.visual === 'playlist' && tile.post.playlist_id) return <PostPlaylistEmbed playlistId={tile.post.playlist_id} />;
  if (tile.visual === 'tierlist' && tile.post.tierlist_id) return <PostTierlistEmbed tierlistId={tile.post.tierlist_id} />;
  return null;
}

function CoverImage({ tile, rounded = 'rounded-none' }: { tile: TrendingTile; rounded?: string }) {
  const src = tile.gif_url || tile.images[0];
  const extra = tile.images.length + (tile.gif_url ? 1 : 0) - 1;
  return (
    <div className={cn('absolute inset-0 overflow-hidden', rounded)}>
      <img
        src={getProxiedImageUrl(src)}
        alt=""
        loading="lazy"
        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
      />
      {!tile.post.is_spoiler && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/45 to-black/15" />
      )}
      {extra > 0 && (
        <span className="absolute right-2 top-2 flex items-center gap-1 rounded-md border border-white/10 bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white/80 backdrop-blur-md">
          <ImagePlus className="h-3 w-3" /> +{extra}
        </span>
      )}
    </div>
  );
}

function SpoilerVeil({ label = 'Spoiler · tap to view', onClick }: { label?: string; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-background/70 backdrop-blur-xl"
    >
      <EyeOff className="h-6 w-6 text-muted-foreground" />
      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{label}</span>
    </button>
  );
}

/** Full-bleed media tile: imagery carries the discussion. */
function CoverTile({ tile, shape, onOpen }: { tile: TrendingTile; shape: 'hero' | 'side' | 'square'; onOpen: () => void }) {
  const { post } = tile;
  const [revealed, setRevealed] = useState(!post.is_spoiler);
  const hero = shape === 'hero';

  return (
    <div className="absolute inset-0" onClick={onOpen}>
      <CoverImage tile={tile} />
      {post.is_spoiler && !revealed && <SpoilerVeil onClick={() => setRevealed(true)} />}
      <div className="absolute inset-0 flex flex-col justify-between p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <TileHeader tile={tile} shape={shape} />
          <RankBadge index={0} large={hero} />
        </div>
        <div className={cn('space-y-2.5', hero && 'max-w-[30rem]')}>
          <FlairLine tile={tile} shape={shape} />
          <h3 className={cn('font-display font-bold leading-tight tracking-tight text-white', hero ? 'text-2xl md:text-3xl line-clamp-3' : 'text-base sm:text-lg line-clamp-2')}>
            {post.title || (tile.tags.length ? `#${tile.tags[0]}` : 'Discussion')}
          </h3>
          {post.content && (
            <RichContent
              html={post.content}
              className={cn('text-[13px] leading-relaxed text-white/70', hero ? 'line-clamp-3 text-sm' : 'line-clamp-2')}
            />
          )}
        </div>
        <TileFooter tile={tile} shape={shape} />
      </div>
    </div>
  );
}

/** Split tile: text left, poster strip right — for shared anime/manga titles. */
function PosterTile({ tile, shape, onOpen }: { tile: TrendingTile; shape: 'hero' | 'side' | 'square' | 'band'; onOpen: () => void }) {
  const { post } = tile;
  const hero = shape === 'hero';
  const [revealed, setRevealed] = useState(!post.is_spoiler);
  return (
    <div className="flex h-full" onClick={onOpen}>
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-3 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <TileHeader tile={tile} shape={shape} />
          <RankBadge index={0} large={hero} />
        </div>
        <div className="space-y-2.5">
          <FlairLine tile={tile} shape={shape} />
          <h3 className={cn('font-display font-bold leading-tight tracking-tight', hero ? 'text-2xl line-clamp-3' : 'text-base sm:text-lg line-clamp-2')}>
            {post.title || 'Discussion'}
          </h3>
          {post.content && (
            <RichContent
              html={post.content}
              className={cn('text-[13px] leading-relaxed text-white/65', hero ? 'line-clamp-3 text-sm' : 'line-clamp-2')}
            />
          )}
        </div>
        <TileFooter tile={tile} shape={shape} />
      </div>
      <div className="relative h-full w-24 shrink-0 sm:w-32 lg:w-40 overflow-hidden">
        <img
          src={getProxiedImageUrl(post.anime_poster!)}
          alt={post.anime_name || post.title || ''}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/10 to-transparent" />
        {!revealed && <SpoilerVeil label="Spoiler" />}
      </div>
    </div>
  );
}

/** Stacked tile for polls, playlists, tierlists and text-only posts. */
function StackedTile({ tile, shape, onOpen }: { tile: TrendingTile; shape: 'hero' | 'side' | 'square' | 'band'; onOpen: () => void }) {
  const { post } = tile;
  const hero = shape === 'hero';
  const band = shape === 'band';
  const [revealed, setRevealed] = useState(!post.is_spoiler);

  return (
    <div className="flex h-full flex-col justify-between gap-3 p-4 sm:p-5" onClick={onOpen}>
      <div className="flex items-start justify-between gap-3">
        <TileHeader tile={tile} shape={shape} />
        <RankBadge index={0} />
      </div>

      <div className={cn('flex min-w-0 flex-1 flex-col gap-3', band && 'md:flex-row md:items-start')}>
        <div className={cn('min-w-0 flex-1 space-y-2.5', band && 'max-w-2xl')}>
          <FlairLine tile={tile} shape={shape} />
          <h3 className={cn('font-display font-bold leading-tight tracking-tight', hero ? 'text-2xl line-clamp-3' : band ? 'text-xl line-clamp-2' : 'text-base line-clamp-2')}>
            {post.title || 'Discussion'}
          </h3>
          {!tile.poll && post.content && (
            <RichContent
              html={post.content}
              className={cn('text-[13px] leading-relaxed text-white/65', hero ? 'line-clamp-3 text-sm' : 'line-clamp-2')}
            />
          )}
          {tile.visual === 'text' && !post.title && !post.content && (
            <p className="text-[13px] text-white/50">No content yet — start the conversation.</p>
          )}
        </div>

        {tile.visual === 'images' && tile.images.length > 0 && (
          <div className="w-full shrink-0" onClick={(e) => e.stopPropagation()}>
            {tile.images.length === 1 ? (
              <div className="relative overflow-hidden rounded-xl border border-white/[0.06]">
                <img src={getProxiedImageUrl(tile.images[0])} alt="" loading="lazy" className="h-28 w-full object-cover sm:h-36" />
                {post.is_spoiler && !revealed && <SpoilerVeil />}
              </div>
            ) : (
              <PostImageGrid images={tile.images} spoiler={!revealed} />
            )}
          </div>
        )}

        <div className="w-full shrink-0" onClick={(e) => e.stopPropagation()}>
          <TileWidget tile={tile} />
        </div>
      </div>

      <TileFooter tile={tile} shape={shape} />
    </div>
  );
}

function BentoTile({ tile, index, onOpen }: { tile: TrendingTile; index: number; onOpen: () => void }) {
  const layout = TILE_LAYOUTS[index];
  const body =
    tile.visual === 'cover' ? (
      <CoverTile tile={tile} shape={layout.shape === 'band' ? 'side' : layout.shape} onOpen={onOpen} />
    ) : tile.visual === 'poster' ? (
      <PosterTile tile={tile} shape={layout.shape} onOpen={onOpen} />
    ) : (
      <StackedTile tile={tile} shape={layout.shape} onOpen={onOpen} />
    );

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.4, ease: 'easeOut' }}
      className={cn('group', layout.span)}
    >
      <GlassPanel
        role="button"
        tabIndex={0}
        aria-label={tile.post.title || 'Trending post'}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpen();
          }
        }}
        className="cursor-pointer border-white/[0.07] transition-all duration-300 hover:border-primary/30 hover:shadow-[0_12px_40px_-12px_rgba(0,0,0,0.7),0_0_32px_-8px_hsl(var(--primary)/0.25)]"
      >
        {body}
      </GlassPanel>
    </motion.div>
  );
}

function TileSkeleton({ className }: { className?: string }) {
  return (
    <GlassPanel className={cn('border-white/[0.06] p-4', className)}>
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 animate-pulse rounded-full bg-white/[0.06]" />
        <div className="space-y-1.5">
          <div className="h-2.5 w-20 animate-pulse rounded bg-white/[0.06]" />
          <div className="h-2 w-14 animate-pulse rounded bg-white/[0.04]" />
        </div>
      </div>
      <div className="mt-4 h-4 w-3/4 animate-pulse rounded bg-white/[0.06]" />
      <div className="mt-2 space-y-1.5">
        <div className="h-3 w-full animate-pulse rounded bg-white/[0.04]" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-white/[0.04]" />
      </div>
      <div className="mt-6 h-3 w-1/2 animate-pulse rounded bg-white/[0.04]" />
    </GlassPanel>
  );
}

function TrendingPostSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-12 gap-3 sm:gap-4">
      {TILE_LAYOUTS.map((layout, i) => (
        <TileSkeleton key={i} className={layout.span} />
      ))}
    </div>
  );
}

function TrendingPostHeader() {
  const navigate = useNavigate();
  const { data: tags = [] } = useTrendingTags(5);
  const topTags = tags.slice(0, 3);

  return (
    <div className="mb-6 flex items-center justify-between gap-4 px-1 sm:px-2">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 shadow-[0_0_24px_-6px_hsl(var(--primary)/0.5)]">
          <Flame className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <h2 className="font-display text-xl font-bold tracking-tight sm:text-2xl">Trending Post</h2>
          <p className="truncate text-[13px] text-muted-foreground">
            {topTags.length
              ? <>Hottest right now · {topTags.map((t) => `#${t.tag}`).join('  ')}</>
              : 'What the community is buzzing about'}
          </p>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => navigate('/community')}
        className="flex-shrink-0 gap-1 rounded-full text-muted-foreground hover:text-foreground"
      >
        View All
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

export function TrendingForumSection() {
  const navigate = useNavigate();
  const { tiles, isLoading, isEmpty } = useTrendingTiles(TILE_COUNT);

  if (isEmpty) return null;

  return (
    <section className="relative mb-16">
      {/* Ambient wash behind the grid */}
      <div aria-hidden className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-primary/10 blur-[110px]" />
      <div aria-hidden className="pointer-events-none absolute -right-24 bottom-0 h-72 w-72 rounded-full bg-rose-500/10 blur-[110px]" />

      <div className="relative">
        <TrendingPostHeader />

        {isLoading ? (
          <TrendingPostSkeleton />
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-12 gap-3 sm:gap-4">
            {tiles.map((tile, index) => (
              <BentoTile
                key={tile.post.id}
                tile={tile}
                index={index}
                onOpen={() => navigate(`/community/forum/${tile.post.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
