/**
 * The fanned, ranked poster rail in the discover hero (docs/image-8.png).
 *
 * Seven posters, each smaller and lower than the one before it, with the top
 * three badged in the theme's accent ramp. Geometry is driven off a single
 * `--rail` custom property so the whole fan scales at breakpoints without
 * per-poster media queries: width, overlap and step-down are all `calc()` of it.
 *
 * `--rail` is a `min()` of a per-breakpoint pixel cap and a share of the rail's
 * own width, because the pixel cap alone made the fan wider than the hero column
 * that holds it: the posters are `shrink-0`, so the surplus spilled left out of
 * the column and the leader landed on top of the hero's heading and copy. The
 * share is derived from `FAN_SPAN` rather than hand-tuned, so changing
 * `RAIL_LENGTH`, `SCALE_STEP` or `OVERLAP` keeps the fit.
 */
import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Star } from 'lucide-react';
import { getHighQualityPoster } from '@/lib/api';
import { cn } from '@/lib/utils';
import { rankBadgeClass, handlePosterFallback, RAIL_LENGTH, type PosterItem } from './types';

/** Shrink per position. Seven posters end at ~49% of the leader's width. */
const SCALE_STEP = 0.085;
/** How far each poster tucks under the one before it, as a share of `--rail`. */
const OVERLAP = 0.115;
/** How far each poster drops below the one before it, as a share of `--rail`. */
const STEP_DOWN = 0.075;

const railScale = (index: number) => Math.max(0.4, 1 - index * SCALE_STEP);

/**
 * The fan's total width in multiples of `--rail` — every poster's width, less
 * the overlaps. Inverting it gives the largest `--rail` that still fits.
 */
const FAN_SPAN =
  Array.from({ length: RAIL_LENGTH }, (_, index) => railScale(index)).reduce((sum, s) => sum + s, 0) -
  (RAIL_LENGTH - 1) * OVERLAP;

/**
 * 95 rather than 100 leaves room for the leader's rank badge, which hangs 8px
 * past the fan's left edge.
 */
const RAIL_SHARE = `${(95 / FAN_SPAN).toFixed(3)}%`;

interface RankedPosterRailProps {
  items: PosterItem[];
  isLoading?: boolean;
  className?: string;
}

/** Also used by the skeleton, so the hero does not resize when data lands. */
function railStyle(index: number) {
  return {
    width: `calc(var(--rail) * ${railScale(index).toFixed(3)})`,
    marginTop: `calc(var(--rail) * ${(index * STEP_DOWN).toFixed(3)})`,
    marginLeft: index === 0 ? undefined : `calc(var(--rail) * -${OVERLAP})`,
    zIndex: RAIL_LENGTH - index,
  } as const;
}

export function RankedPosterRail({ items, isLoading, className }: RankedPosterRailProps) {
  const shown = items.slice(0, RAIL_LENGTH);
  const showSkeleton = isLoading && shown.length === 0;

  return (
    <div
      className={cn(
        'flex w-full items-start justify-end [--rail-cap:96px] sm:[--rail-cap:132px] lg:[--rail-cap:158px] xl:[--rail-cap:186px]',
        className,
      )}
      style={{ '--rail': `min(var(--rail-cap), ${RAIL_SHARE})` } as CSSProperties}
    >
      {(showSkeleton ? Array.from({ length: RAIL_LENGTH }) : shown).map((entry, index) => {
        const style = railStyle(index);

        if (!entry) {
          return (
            <div key={`rail-skeleton-${index}`} className="relative shrink-0" style={style}>
              <div className="aspect-[2/3] w-full animate-pulse rounded-2xl border border-white/5 bg-white/[0.04]" />
            </div>
          );
        }

        const item = entry as PosterItem;
        const rank = index + 1;

        return (
          <Link
            key={item.key}
            to={item.href}
            title={item.title}
            aria-label={`#${rank} ${item.title}`}
            className="group relative shrink-0 transition-transform duration-300 hover:z-20 hover:-translate-y-2 focus-visible:z-20 focus-visible:-translate-y-2 focus-visible:outline-none"
            style={style}
          >
            <div
              className={cn(
                'relative aspect-[2/3] w-full overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] shadow-2xl shadow-black/60',
                rank === 1 && 'ring-2 ring-primary/60',
              )}
            >
              <img
                src={getHighQualityPoster(item.poster, item.anilistId)}
                alt=""
                aria-hidden
                loading={rank <= 3 ? 'eager' : 'lazy'}
                decoding="async"
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                onError={(event) => handlePosterFallback(event, item.poster)}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent opacity-70" />

              {/* Score reads on the podium only; the tail posters are too small. */}
              {item.score && rank <= 3 && (
                <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-sm">
                  <Star className="h-2.5 w-2.5 fill-amber text-amber" />
                  {item.score}
                </div>
              )}
            </div>

            <span
              className={cn(
                'absolute -left-2 -top-2 flex items-center justify-center rounded-full font-black tabular-nums',
                rank === 1 ? 'h-9 w-9 text-base' : 'h-7 w-7 text-xs',
                rankBadgeClass(rank),
              )}
            >
              {rank}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
