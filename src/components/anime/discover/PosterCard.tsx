/**
 * The one poster card behind the v6 grids (docs/Plans.md §2 — "Cards (improve
 * polish and consistency)").
 *
 * Title and meta sit *below* the poster, as in docs/image-8.png, which is what
 * separates it from the older AnimeGrid card that overlays them on the image.
 * `rank` and `footer` are what let the trending board reuse it without a second
 * card definition, and `preview` gives the trending, favorites and genre grids
 * the same hover video the home cards have — through the shared
 * `useHoverPreview`, so there is still only one hls.js lifecycle in the app.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Play, Star } from 'lucide-react';
import { getHighQualityPoster } from '@/lib/api';
import { useHoverPreview } from '@/hooks/useHoverPreview';
import { cn } from '@/lib/utils';
import { handlePosterFallback, rankBadgeClass, rankRingClass, type PosterItem } from './types';
import { Peekable } from '@/components/media/MediaQuickPeek';
import { peekFromHref } from '@/components/media/quickPeekStore';

interface PosterCardProps {
  item: PosterItem;
  /** Renders the numbered badge. Omit on unranked grids. */
  rank?: number;
  /** Above-the-fold cards skip lazy loading. */
  eager?: boolean;
  /** Extra row under the meta line — the trending board puts its pulse here. */
  footer?: ReactNode;
  /**
   * Play a muted preview on hover. Needs `item.anilistId`, so it is a no-op on
   * rows whose source never carried one (saved provider slugs, manga).
   */
  preview?: boolean;
  className?: string;
}

export function PosterCard({ item, rank, eager, footer, preview, className }: PosterCardProps) {
  const showScoreOnPoster = rank !== undefined && rank <= 3;
  const previewEnabled = Boolean(preview && item.anilistId);
  const hover = useHoverPreview({
    anilistId: item.anilistId,
    title: item.title,
    enabled: previewEnabled,
  });

  return (
    <Peekable media={peekFromHref(item.href, item)}>
    <div
      className={cn('group relative', className)}
      // Only wired when a preview is possible: the handlers set state, and on a
      // fifty-card board that is a render per pointer crossing for nothing.
      onMouseEnter={previewEnabled ? hover.onEnter : undefined}
      onMouseLeave={previewEnabled ? hover.onLeave : undefined}
    >
      <Link to={item.href} className="block focus-visible:outline-none" aria-label={item.title}>
        <div
          className={cn(
            'relative aspect-[2/3] w-full overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.04] transition-all duration-300 group-hover:border-white/20 group-hover:shadow-xl group-hover:shadow-black/50 group-focus-visible:ring-2 group-focus-visible:ring-ring',
            rankRingClass(rank),
          )}
        >
          <img
            src={getHighQualityPoster(item.poster, item.anilistId)}
            alt=""
            aria-hidden
            loading={eager ? 'eager' : 'lazy'}
            decoding="async"
            className={cn(
              'h-full w-full object-cover transition-all duration-500',
              hover.isActive ? 'opacity-0' : 'opacity-100 group-hover:scale-[1.06]',
            )}
            onError={(event) => handlePosterFallback(event, item.poster)}
          />

          {previewEnabled && (
            <video
              ref={hover.videoRef}
              className={cn(
                'absolute inset-0 h-full w-full object-cover transition-opacity duration-300',
                hover.isActive ? 'opacity-100' : 'opacity-0',
              )}
              muted
              loop
              playsInline
              crossOrigin="anonymous"
              onError={hover.onError}
            />
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

          {/* The preview's own affordance: a spinner while it resolves, a play
              glyph when there is nothing to play. Hidden once a stream attaches,
              so it never sits on top of moving video. */}
          {previewEnabled && hover.showFallback && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
              {hover.isLoading ? (
                <span className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              ) : (
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-foreground/95 shadow-2xl">
                  <Play className="ml-0.5 h-5 w-5 fill-background text-background" />
                </span>
              )}
            </div>
          )}

          {showScoreOnPoster && item.score && (
            <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
              <Star className="h-2.5 w-2.5 fill-amber text-amber" />
              {item.score}
            </div>
          )}
        </div>

        <h3 className="mt-3 line-clamp-1 text-sm font-bold text-white/90 transition-colors group-hover:text-white">
          {item.title}
        </h3>

        {(item.meta || (item.score && !showScoreOnPoster)) && (
          <p className="mt-1 flex items-center gap-1.5 text-xs font-medium text-white/40">
            {item.meta}
            {item.meta && item.score && !showScoreOnPoster && <span aria-hidden>·</span>}
            {item.score && !showScoreOnPoster && (
              <span className="inline-flex items-center gap-1 text-white/55">
                <Star className="h-3 w-3 fill-amber text-amber" />
                {item.score}
              </span>
            )}
          </p>
        )}
      </Link>

      {rank !== undefined && (
        <span
          className={cn(
            'pointer-events-none absolute -left-2 -top-2 z-10 flex items-center justify-center rounded-full font-black tabular-nums',
            rank <= 3 ? 'h-9 w-9 text-base' : 'h-7 w-7 text-xs',
            rankBadgeClass(rank),
          )}
        >
          {rank}
        </span>
      )}

      {footer}
    </div>
    </Peekable>
  );
}
