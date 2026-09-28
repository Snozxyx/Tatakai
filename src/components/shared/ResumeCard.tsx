/**
 * The horizontal "pick this back up" card, shared by the manga continue-reading
 * row and the torrent session row.
 *
 * Those two lists were separately implemented and separately drifted: same
 * anatomy (poster, title, two meta lines, a progress bar), different paddings,
 * different poster sizes, different progress-bar heights, and a hover shadow
 * hardcoded to `rgba(139,92,246,0.3)` — the primary hue frozen at the value it
 * had when it was written. One component, tokens only, so the two rows stay
 * identical and follow the theme.
 *
 * It renders as a `<Link>` when given `href` and as a `<button>` when given
 * `onClick`, because the torrent row navigates through `useNavigate` with a
 * computed query string while the manga row has a plain URL.
 */
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Play, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** The grid both consumers use, so the two rows line up on the same page. */
export const RESUME_GRID_CLASS = 'grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3';

export interface ResumeCardProps {
  /** Whole-card destination. Mutually exclusive with `onClick`. */
  href?: string;
  onClick?: () => void;
  poster?: string;
  title: string;
  /** Optional separate destination for the title, e.g. the series page. */
  titleHref?: string;
  /** Emphasised line under the title — chapter, episode, quality. */
  primaryMeta?: ReactNode;
  /** Quieter line under that — page count, start date, status. */
  secondaryMeta?: ReactNode;
  /** 0–100. Omit to hide the bar entirely. */
  progress?: number;
  /** Right-hand figure on the progress row, e.g. a download speed. */
  progressNote?: ReactNode;
  /** Shown when there is no progress bar, in the bar's place. */
  footer?: ReactNode;
  /** Drawn over the poster on hover. Defaults to a play glyph. */
  overlayIcon?: LucideIcon;
  /** Replaces the hover overlay with a persistent spinner. */
  busy?: boolean;
  /** Greys the card out — an inactive session, a dropped series. */
  dimmed?: boolean;
  /** Renders the corner dismiss button. */
  onRemove?: () => void;
  removeLabel?: string;
  /** Drawn in the poster's place when there is no image. */
  fallbackIcon?: LucideIcon;
  className?: string;
}

export function ResumeCard({
  href,
  onClick,
  poster,
  title,
  titleHref,
  primaryMeta,
  secondaryMeta,
  progress,
  progressNote,
  footer,
  overlayIcon: OverlayIcon = Play,
  busy = false,
  dimmed = false,
  onRemove,
  removeLabel = 'Remove',
  fallbackIcon: FallbackIcon,
  className,
}: ResumeCardProps) {
  const percent =
    typeof progress === 'number' && Number.isFinite(progress)
      ? Math.max(0, Math.min(100, Math.round(progress)))
      : undefined;

  const shell = cn(
    'tk-pressable group relative flex w-full items-stretch gap-4 overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4 text-left transition-all duration-300',
    'hover:border-primary/40 hover:bg-white/[0.04] hover:shadow-[0_0_28px_-10px_hsl(var(--primary)/0.5)]',
    'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary',
    dimmed && 'opacity-60 grayscale hover:opacity-100 hover:grayscale-0',
    className,
  );

  const body = (
    <>
      <div className="relative h-28 w-20 shrink-0 overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.04]">
        {poster ? (
          <img
            src={poster}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={(event) => {
              (event.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : null}
        {!poster && FallbackIcon ? (
          <FallbackIcon className="absolute inset-0 m-auto h-6 w-6 text-white/20" />
        ) : null}

        {busy ? (
          <span className="absolute inset-0 flex items-center justify-center bg-primary/25 backdrop-blur-[2px]">
            <Loader2 className="h-5 w-5 animate-spin text-white" />
          </span>
        ) : (
          <span className="absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 backdrop-blur-[2px] transition-opacity duration-300 group-hover:opacity-100">
            <span className="flex h-9 w-9 scale-75 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform duration-300 group-hover:scale-100">
              <OverlayIcon className="h-4 w-4" fill="currentColor" />
            </span>
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {titleHref ? (
          <Link
            to={titleHref}
            onClick={(event) => event.stopPropagation()}
            className="relative z-10 line-clamp-2 self-start text-sm font-bold leading-snug text-white/90 transition-colors hover:text-primary"
          >
            {title}
          </Link>
        ) : (
          <p className="line-clamp-2 text-sm font-bold leading-snug text-white/90 transition-colors group-hover:text-primary">
            {title}
          </p>
        )}

        {primaryMeta ? (
          <p className="mt-1.5 line-clamp-1 text-xs font-bold uppercase tracking-[0.14em] text-primary">
            {primaryMeta}
          </p>
        ) : null}
        {secondaryMeta ? (
          <p className="mt-1 line-clamp-1 text-xs font-medium text-white/40">{secondaryMeta}</p>
        ) : null}

        <div className="mt-auto pt-3">
          {percent !== undefined ? (
            <>
              <div className="mb-1.5 flex items-center justify-between text-[11px] font-bold text-white/40">
                <span>{percent}%</span>
                {progressNote ? <span>{progressNote}</span> : null}
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-secondary transition-[width] duration-500"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </>
          ) : (
            footer
          )}
        </div>
      </div>

      {onRemove ? (
        <button
          type="button"
          aria-label={removeLabel}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRemove();
          }}
          className="absolute right-2 top-2 z-10 rounded-full bg-black/50 p-1.5 text-white/45 opacity-0 transition-all hover:bg-destructive/15 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </>
  );

  // The card destination is a stretched, absolutely-positioned overlay rather
  // than an element wrapping `body`. Wrapping would nest the title's own <Link>
  // inside the card <a> (or <button>), which is invalid — React warns
  // "validateDOMNesting: <a> cannot appear as a descendant of <a>" — and breaks
  // the title's independent navigation. The overlay covers the whole card (z-0),
  // and the title link / remove button sit above it (z-10) to stay clickable.
  const overlay = href ? (
    <Link
      to={href}
      aria-label={title}
      className="absolute inset-0 z-0 rounded-2xl focus:outline-none"
    />
  ) : onClick ? (
    <button
      type="button"
      onClick={onClick}
      aria-label={title}
      className="absolute inset-0 z-0 rounded-2xl focus:outline-none"
    />
  ) : null;

  return (
    <div className={shell}>
      {overlay}
      {body}
    </div>
  );
}

/** Matches the card's footprint so the grid does not reflow when data lands. */
export function ResumeCardSkeleton() {
  return (
    <div className="flex gap-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
      <div className="h-28 w-20 shrink-0 animate-pulse rounded-xl bg-white/[0.05]" />
      <div className="flex-1 space-y-2 py-1">
        <div className="h-4 w-3/4 animate-pulse rounded bg-white/[0.05]" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-white/[0.04]" />
        <div className="h-3 w-1/4 animate-pulse rounded bg-white/[0.04]" />
        <div className="mt-6 h-1.5 w-full animate-pulse rounded-full bg-white/[0.05]" />
      </div>
    </div>
  );
}
