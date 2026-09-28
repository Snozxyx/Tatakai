import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { Layers, Music2, Loader2, EyeOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getProxiedImageUrl } from '@/lib/api';
import { cn } from '@/lib/utils';
import { UnifiedMediaCard } from '@/components/UnifiedMediaCard';
import { useLightbox } from '@/components/media/ImageLightbox';
import { Poll } from './Poll';
import { RichContent } from './richText';
import { WatchroomLobbyCard } from './WatchroomFeedItem';
import { usePlaylist, usePlaylistItems } from '@/hooks/user/usePlaylist';
import { DEFAULT_TIERS, type TierListItem } from '@/hooks/user/useTierLists';
import { useVotePostPoll, usePostPoll, type PostPoll } from '@/hooks/community/usePostPolls';
import type { WatchRoom } from '@/hooks/media/useWatchRoom';
import { WATCH_ROOM_COLUMNS } from '@/hooks/media/useWatchRoom';

/** One or more images in a post, with optional spoiler blur. */
export function PostImageGrid({ images, spoiler }: { images: string[]; spoiler?: boolean }) {
  const [revealed, setRevealed] = useState(!spoiler);
  const { open } = useLightbox();
  const count = images.length;
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-white/[0.05] bg-black/20',
        count === 1 ? '' : 'grid gap-0.5',
        count === 2 && 'grid-cols-2',
        count >= 3 && 'grid-cols-2',
      )}
    >
      {images.slice(0, 4).map((url, i) => (
        <img
          key={i}
          src={getProxiedImageUrl(url)}
          alt=""
          loading="lazy"
          onClick={(e) => {
            if (!revealed) return;
            e.stopPropagation();
            open(images.map((u) => ({ url: u })), i);
          }}
          className={cn(
            'w-full object-cover',
            count === 1 ? 'max-h-[32rem] object-contain' : 'h-40 sm:h-52',
            count === 3 && i === 0 && 'row-span-2 h-full',
            revealed && 'cursor-zoom-in',
          )}
        />
      ))}
      {!revealed && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setRevealed(true);
          }}
          className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-background/70 backdrop-blur-xl"
        >
          <EyeOff className="h-6 w-6 text-muted-foreground" />
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Spoiler · tap to view</span>
        </button>
      )}
    </div>
  );
}

/** Preview of a quoted post (quote-repost). `preview` disables the navigate
 * (used inside the quote-compose dialog, where clicking must not leave the draft). */
export function QuotedPostEmbed({ postId, preview = false }: { postId: string; preview?: boolean }) {
  const navigate = useNavigate();
  const { data: post, isLoading } = useQuery({
    queryKey: ['quoted-post', postId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('forum_posts')
        .select('id, title, content, user_id, image_url, metadata, is_spoiler, created_at, playlist_id, tierlist_id, anime_id, anime_name, anime_poster')
        .eq('id', postId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const { data: profile } = await supabase
        .from('profiles')
        .select('username, display_name, avatar_url')
        .eq('user_id', data.user_id)
        .maybeSingle();
      return { ...data, profile };
    },
    enabled: !!postId,
  });

  // A quoted post can carry its own poll — surface it so a quote of a poll shows
  // the poll, not just the question text.
  const { data: quotedPoll } = usePostPoll(postId);

  if (isLoading) return <EmbedShell><EmbedSkeleton /></EmbedShell>;
  if (!post) return null;
  const name = post.profile?.display_name || post.profile?.username || 'Anonymous';
  // Resolve the quoted post's media the same way the feed does: a picked GIF,
  // else metadata.images, else the legacy single image_url column.
  const meta = (post.metadata || {}) as Record<string, any>;
  const gif = typeof meta.gif_url === 'string' ? meta.gif_url : null;
  const images: string[] = Array.isArray(meta.images) && meta.images.length
    ? meta.images
    : post.image_url
      ? [post.image_url]
      : [];
  const mediaType = meta.media_type || ((post as any).anime_id ? 'anime' : null);
  const watchRoomId = typeof meta.watch_room_id === 'string' ? meta.watch_room_id : null;
  // Voting / navigating inside a nested embed must not also fire the quote's
  // own navigate — the child embeds already stopPropagation on their clicks.
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      role={preview ? undefined : 'link'}
      tabIndex={preview ? undefined : 0}
      onClick={preview ? undefined : (e) => { e.stopPropagation(); navigate(`/community/forum/${post.id}`); }}
      className={cn(
        'block rounded-2xl border border-white/[0.06] bg-white/[0.015] p-3 transition-colors',
        !preview && 'cursor-pointer hover:border-white/10',
      )}
    >
      <div className="flex items-center gap-2 text-xs">
        {post.profile?.avatar_url ? (
          <img
            src={getProxiedImageUrl(post.profile.avatar_url)}
            alt=""
            className="h-5 w-5 flex-shrink-0 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-bold">
            {name[0]?.toUpperCase()}
          </span>
        )}
        <span className="font-display font-bold tracking-tight">{name}</span>
        {post.profile?.username && <span className="text-muted-foreground">@{post.profile.username}</span>}
      </div>
      {post.title && post.title !== post.content && (
        <p className="mt-1 line-clamp-1 text-sm font-semibold">{post.title}</p>
      )}
      {post.content && (
        <RichContent html={post.content} className="mt-0.5 text-sm text-muted-foreground" />
      )}
      {gif ? (
        <div className="mt-2" onClick={stop}><PostImageGrid images={[gif]} spoiler={post.is_spoiler} /></div>
      ) : images.length > 0 ? (
        <div className="mt-2" onClick={stop}><PostImageGrid images={images} spoiler={post.is_spoiler} /></div>
      ) : null}
      {quotedPoll && (
        <div className="mt-2" onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}>
          <PostPollCard poll={quotedPoll} />
        </div>
      )}
      {(post as any).playlist_id && (
        <div className="mt-2" onClick={stop}><PostPlaylistEmbed playlistId={(post as any).playlist_id} /></div>
      )}
      {(post as any).tierlist_id && (
        <div className="mt-2" onClick={stop}><PostTierlistEmbed tierlistId={(post as any).tierlist_id} /></div>
      )}
      {watchRoomId && (
        <div className="mt-2" onClick={stop}><PostWatchroomEmbed roomId={watchRoomId} /></div>
      )}
      {(post as any).anime_id && (post as any).anime_name && (
        <div className="mt-2" onClick={stop}>
          <PostMediaEmbed
            id={(post as any).anime_id}
            name={(post as any).anime_name}
            poster={(post as any).anime_poster}
            type={mediaType || 'anime'}
            variant="pill"
          />
        </div>
      )}
    </div>
  );
}

/** Interactive poll attached to a post. */
export function PostPollCard({ poll }: { poll: PostPoll }) {
  const vote = useVotePostPoll();
  return (
    <div className="rounded-2xl border border-white/[0.05] bg-white/[0.015] p-4">
      <Poll
        results={poll.results}
        votesCount={poll.votes_count}
        userVote={poll.user_vote}
        endsAt={poll.ends_at}
        isClosed={poll.is_closed}
        disabled={vote.isPending}
        onVote={(optionIndex) =>
          vote.mutate({ postId: poll.post_id, pollId: poll.id, optionIndex })
        }
      />
    </div>
  );
}

/** Uploaded image or picked GIF. */
export function PostImageEmbed({ url, alt }: { url: string; alt?: string }) {
  const { open } = useLightbox();
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.05] bg-black/20">
      <img
        src={getProxiedImageUrl(url)}
        alt={alt || ''}
        loading="lazy"
        onClick={(e) => { e.stopPropagation(); open([{ url, alt }], 0); }}
        className="max-h-[32rem] w-full cursor-zoom-in object-contain"
      />
    </div>
  );
}

function EmbedShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/[0.05] bg-white/[0.015] p-3">{children}</div>
  );
}

/** Playlist embedded as a compact card. `size="lg"` widens it (used in comments). */
export function PostPlaylistEmbed({ playlistId, size = 'default' }: { playlistId: string; size?: 'default' | 'lg' }) {
  const { data: playlist, isLoading } = usePlaylist(playlistId);
  const { data: items = [] } = usePlaylistItems(playlistId);
  const covers = items.slice(0, 4).map((i) => i.anime_poster).filter(Boolean) as string[];

  if (isLoading) return <EmbedShell><EmbedSkeleton /></EmbedShell>;
  if (!playlist) return null;

  const lg = size === 'lg';
  const desc = (playlist as any).description as string | undefined;

  return (
    <EmbedShell>
      <Link
        to={`/playlist/${playlist.id}`}
        onClick={(e) => e.stopPropagation()}
        className="group flex items-center gap-4"
      >
        <div className={cn('relative flex-shrink-0 overflow-hidden rounded-xl bg-muted', lg ? 'h-32 w-32' : 'h-24 w-24')}>
          {covers.length > 0 ? (
            <div className={cn('grid h-full w-full', covers.length >= 2 ? 'grid-cols-2' : 'grid-cols-1')}>
              {covers.slice(0, 4).map((img, idx) => (
                <img key={idx} src={getProxiedImageUrl(img)} alt="" className="h-full w-full object-cover" />
              ))}
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/20 to-secondary/20">
              <Music2 className={cn('text-muted-foreground', lg ? 'h-9 w-9' : 'h-7 w-7')} />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-primary/80">Playlist</span>
          <h4
            className={cn(
              'truncate font-display font-semibold tracking-tight group-hover:text-primary transition-colors',
              lg ? 'text-lg' : 'text-base',
            )}
          >
            {playlist.name}
          </h4>
          <p className="text-xs text-muted-foreground tabular-nums">{playlist.items_count} anime</p>
          {lg && desc && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground/80">{desc}</p>}
        </div>
      </Link>
    </EmbedShell>
  );
}

/** Tier list embedded as a mini widget — shows the actual S→F rows with posters. */
export function PostTierlistEmbed({ tierlistId }: { tierlistId: string }) {
  const { data: tierlist, isLoading } = useQuery({
    queryKey: ['embed-tierlist', tierlistId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tier_lists')
        .select('id, title, description, share_code, items')
        .eq('id', tierlistId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!tierlistId,
  });

  if (isLoading) return <EmbedShell><EmbedSkeleton /></EmbedShell>;
  if (!tierlist) return null;

  const href = tierlist.share_code ? `/tierlist/${tierlist.share_code}` : '/tierlists';
  const items = (Array.isArray((tierlist as any).items) ? (tierlist as any).items : []) as TierListItem[];
  // Only the tiers that actually hold items, in canonical S→F order.
  const rows = DEFAULT_TIERS
    .map((tier) => ({ tier, list: items.filter((i) => i.tier === tier.name) }))
    .filter((r) => r.list.length > 0)
    .slice(0, 5);

  return (
    <EmbedShell>
      <Link to={href} onClick={(e) => e.stopPropagation()} className="group block">
        <div className="mb-2 flex items-center gap-2">
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/20 to-secondary/20">
            <Layers className="h-4 w-4 text-primary/70" />
          </span>
          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-primary/80">Tier List</span>
            <h4 className="truncate font-display font-semibold tracking-tight group-hover:text-primary transition-colors">
              {tierlist.title}
            </h4>
          </div>
          {items.length > 0 && (
            <span className="text-xs text-muted-foreground tabular-nums">{items.length}</span>
          )}
        </div>

        {rows.length > 0 ? (
          <div className="space-y-1 overflow-hidden rounded-xl border border-white/[0.05]">
            {rows.map(({ tier, list }) => (
              <div key={tier.name} className="flex items-stretch gap-1">
                <div
                  className="flex w-7 flex-shrink-0 items-center justify-center text-xs font-bold text-black/80"
                  style={{ backgroundColor: tier.color }}
                >
                  {tier.name}
                </div>
                <div className="flex flex-1 flex-wrap gap-1 bg-black/20 p-1">
                  {list.slice(0, 8).map((item) => (
                    <img
                      key={item.anime_id}
                      src={getProxiedImageUrl(item.anime_image)}
                      alt={item.anime_title}
                      loading="lazy"
                      className="h-9 w-7 flex-shrink-0 rounded-sm object-cover"
                    />
                  ))}
                  {list.length > 8 && (
                    <span className="flex h-9 items-center px-1 text-[10px] font-semibold text-muted-foreground">
                      +{list.length - 8}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : tierlist.description ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">{tierlist.description}</p>
        ) : null}
      </Link>
    </EmbedShell>
  );
}

/** Anime / manga / manhwa / comic shared in a post. */
export function PostMediaEmbed({
  id,
  name,
  poster,
  type,
  variant = 'pill',
}: {
  id: string;
  name: string;
  poster?: string | null;
  type?: string;
  variant?: 'pill' | 'card';
}) {
  const kind = (type || 'anime').toLowerCase();
  const isCharacter = kind === 'character';
  const isAnime = kind === 'anime';
  const href = isCharacter
    ? `/character/${encodeURIComponent(id)}?name=${encodeURIComponent(name)}`
    : isAnime ? `/anime/${id}` : `/manga/${id}`;
  const kindLabel = isCharacter ? 'Character' : isAnime ? 'Anime' : kind.replace(/^\w/, (c) => c.toUpperCase());

  // The primary attachment upgrades to the app's canonical media card so a
  // shared title reads like it does everywhere else (poster + type badge),
  // instead of a hand-rolled pill. Sub-formats (manhwa/manhua/comics) collapse
  // to the `manga` media type but keep their own label via `type`.
  if (variant === 'card') {
    const mediaType: 'anime' | 'manga' | 'character' = isCharacter
      ? 'character'
      : isAnime
        ? 'anime'
        : 'manga';
    return (
      <div className="max-w-[190px]" onClick={(e) => e.stopPropagation()}>
        <UnifiedMediaCard
          variant="poster"
          item={{ id, name, poster: poster || '', type: kind, mediaType, href }}
        />
      </div>
    );
  }

  return (
    <Link
      to={href}
      className="inline-flex items-center gap-2 rounded-md border border-white/5 bg-white/[0.03] p-1 pr-3 text-xs font-medium transition-colors hover:bg-white/[0.06]"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="h-5 w-5 flex-shrink-0 overflow-hidden rounded bg-muted">
        {poster ? (
          <img src={getProxiedImageUrl(poster)} alt={name} className="h-full w-full object-cover" />
        ) : (
          <Layers className="h-3 w-3 m-1 text-muted-foreground" />
        )}
      </div>
      <span className="truncate max-w-[150px] text-muted-foreground">{name}</span>
    </Link>
  );
}

/** Watch Together lobby embedded in a post. */
export function PostWatchroomEmbed({ roomId }: { roomId: string }) {
  const { data: room, isLoading } = useQuery({
    queryKey: ['embed-watchroom', roomId],
    queryFn: async (): Promise<WatchRoom | null> => {
      const { data, error } = await supabase
        .from('watch_rooms')
        .select(WATCH_ROOM_COLUMNS)
        .eq('id', roomId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      const { count } = await supabase
        .from('watch_room_participants')
        .select('*', { count: 'exact', head: true })
        .eq('room_id', roomId);

      const { data: host } = await supabase
        .from('profiles')
        .select('username, display_name, avatar_url')
        .eq('user_id', data.host_id)
        .maybeSingle();

      return { ...(data as any), participant_count: count || 0, host_profile: host || undefined };
    },
    enabled: !!roomId,
  });

  if (isLoading) return <EmbedShell><EmbedSkeleton /></EmbedShell>;
  if (!room) return null;
  return <WatchroomLobbyCard room={room} />;
}

function EmbedSkeleton() {
  return (
    <div className="flex items-center gap-3">
      <div className="h-16 w-16 animate-pulse rounded-xl bg-muted" />
      <div className="flex-1 space-y-2">
        <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
        <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
      </div>
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
    </div>
  );
}
