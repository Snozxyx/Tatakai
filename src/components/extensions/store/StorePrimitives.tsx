/**
 * The store's building blocks, in the Microsoft Store idiom: a wide gradient
 * hero, stacked promo tiles beside it, shelves with a chevron-linked header and
 * prev/next arrows, and compact icon + name + action rows.
 *
 * Two constraints shaped these. First, colour comes only from theme tokens via
 * `typeVisual` — the pages these replace used `orange-500`/`blue-500`/`emerald-500`
 * literals, and `orange-*` in particular emits no CSS in this project. Second,
 * an extension's artwork can always fail to load — the service signs its asset
 * URLs against a private bucket and those signatures expire — so `ExtensionIcon`
 * draws the lettermark as a normal state with the image layered over it, and
 * every `<img>` here hides itself `onError` rather than tracking a failure flag.
 */
import { forwardRef, useCallback, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StoreExtension } from '@/core/extensions/store-api';
import type { InstallState } from '@/hooks/api/useExtensionStore';
import { formatCompact, formatHealth, lettermark, typeVisual } from './extensionVisuals';

type IconExtension = Pick<StoreExtension, 'name' | 'icon' | 'type'>;

/**
 * The detail route for an extension.
 *
 * Keyed on the service uuid, not the publisher id: `/api/extension/:extension`
 * only accepts the uuid, so linking by slug made every card open on a 404 and
 * fall back to the local sideloaded copy — zeroed counts and no readme. The
 * fetcher recovers from a slug via search, but only the uuid resolves in one hop.
 */
function detailHref(extension: Pick<StoreExtension, 'id' | 'slug'>): string {
  return `/extensions/${encodeURIComponent(extension.id || extension.slug)}`;
}

const ICON_SIZES = {
  sm: 'h-10 w-10 rounded-xl text-[11px]',
  md: 'h-14 w-14 rounded-2xl text-sm',
  lg: 'h-20 w-20 rounded-[1.25rem] text-lg',
  xl: 'h-28 w-28 rounded-[1.75rem] text-2xl sm:h-32 sm:w-32',
} as const;

/**
 * The app icon, or a gradient lettermark when there is no usable image. The
 * lettermark is always rendered underneath, so an icon that 404s simply hides
 * itself and reveals the mark — no error state to track, and no `alt` text
 * leaking into the tile as stray body copy.
 */
export function ExtensionIcon({
  extension,
  size = 'md',
  className,
}: {
  extension: IconExtension;
  size?: keyof typeof ICON_SIZES;
  className?: string;
}) {
  const visual = typeVisual(extension.type);

  return (
    <div
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden border border-white/10 bg-gradient-to-br font-black text-white/90',
        visual.tileClass,
        ICON_SIZES[size],
        className,
      )}
    >
      <span aria-hidden>{lettermark(extension.name)}</span>
      {extension.icon ? (
        <img
          src={extension.icon}
          alt=""
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
          onError={(event) => {
            (event.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * The Store's one action, in all four states. `not_loaded` is deliberately not
 * an error: in a browser the bundle downloads and the bookkeeping succeeds, but
 * no sandbox picks it up, and the honest label for that is "not loaded".
 */
const INSTALL_LABELS: Record<InstallState, string> = {
  idle: 'Get',
  installing: 'Installing',
  installed: 'Installed',
  not_loaded: 'Not loaded',
};

const INSTALL_CLASSES: Record<InstallState, string> = {
  idle: 'bg-primary text-primary-foreground shadow-sm shadow-primary/25 hover:bg-primary/90',
  installing: 'bg-white/10 text-white/70',
  installed: 'border border-white/10 bg-white/[0.06] text-white/70 hover:bg-white/10',
  not_loaded: 'bg-amber/15 text-amber border border-amber/30 hover:bg-amber/25',
};

const INSTALL_ICONS: Record<InstallState, typeof Download> = {
  idle: Download,
  installing: Loader2,
  installed: Check,
  not_loaded: TriangleAlert,
};

export function InstallButton({
  state,
  onClick,
  size = 'md',
  className,
  label,
}: {
  state: InstallState;
  onClick?: () => void;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  label?: string;
}) {
  const Icon = INSTALL_ICONS[state];

  return (
    <button
      type="button"
      disabled={state === 'installing'}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick?.();
      }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-wait',
        size === 'sm' && 'h-8 min-w-[4.5rem] px-3 text-xs',
        size === 'md' && 'h-9 min-w-[5.5rem] px-4 text-sm',
        size === 'lg' && 'h-12 min-w-[8rem] px-6 text-sm',
        INSTALL_CLASSES[state],
        className,
      )}
    >
      <Icon className={cn('h-3.5 w-3.5', state === 'installing' && 'animate-spin')} />
      {label ?? INSTALL_LABELS[state]}
    </button>
  );
}

/** Type chip, plus a featured mark and a health figure when the service has one. */
export function ExtensionChips({
  extension,
  className,
  showHealth = true,
}: {
  extension: Pick<StoreExtension, 'type' | 'isFeatured' | 'healthScore'>;
  className?: string;
  showHealth?: boolean;
}) {
  const visual = typeVisual(extension.type);
  const health = showHealth ? formatHealth(extension.healthScore) : undefined;

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <span
        className={cn(
          'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-bold',
          visual.chipClass,
        )}
      >
        <visual.icon className="h-3 w-3" />
        {visual.short}
      </span>
      {extension.isFeatured ? (
        <span className="inline-flex items-center gap-1 rounded-full border border-amber/30 bg-amber/15 px-2 py-0.5 text-[11px] font-bold text-amber">
          <Sparkles className="h-3 w-3" />
          Featured
        </span>
      ) : null}
      {health ? (
        <span className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] font-bold text-white/55">
          {health} healthy
        </span>
      ) : null}
    </div>
  );
}

/**
 * The wide gradient card that opens the store. The banner sits behind a scrim
 * because the copy has to stay readable over artwork nobody in this repo
 * controls; with no banner the type's own gradient carries the card.
 */
export function ExtensionHeroCard({
  extension,
  state,
  onInstall,
  className,
}: {
  extension: StoreExtension;
  state: InstallState;
  onInstall: () => void;
  className?: string;
}) {
  const visual = typeVisual(extension.type);
  const href = detailHref(extension);

  return (
    <Link
      to={href}
      className={cn(
        'group relative flex min-h-[19rem] flex-col justify-end overflow-hidden rounded-[1.75rem] border border-white/[0.07] bg-surface p-6 transition-colors hover:border-white/15 sm:p-8',
        className,
      )}
    >
      {extension.banner ? (
        <img
          src={extension.banner}
          alt=""
          className="absolute inset-0 h-full w-full scale-105 object-cover opacity-45 transition-transform duration-700 group-hover:scale-110"
          onError={(event) => {
            (event.currentTarget as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : null}
      <div className={cn('absolute inset-0 bg-gradient-to-br', visual.glowClass)} />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-transparent" />

      <div className="relative flex flex-col gap-4">
        <ExtensionChips extension={extension} />
        <div className="flex items-end gap-4">
          <ExtensionIcon extension={extension} size="lg" className="hidden sm:flex" />
          <div className="min-w-0 flex-1">
            <h3 className="font-display truncate text-2xl font-black tracking-tight text-foreground sm:text-4xl">
              {extension.name}
            </h3>
            <p className="mt-1 text-sm font-medium text-white/50">by {extension.author}</p>
          </div>
        </div>
        <p className="max-w-xl text-sm leading-relaxed text-white/65 line-clamp-2">
          {extension.description || 'No description provided.'}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <InstallButton state={state} onClick={onInstall} size="lg" />
          <span className="text-xs font-semibold text-white/40">
            {formatCompact(extension.installs || extension.downloads)} installs · v{extension.version}
          </span>
        </div>
      </div>
    </Link>
  );
}

/** One of the stacked tiles beside the hero — half its height, same anatomy. */
export function ExtensionPromoTile({
  extension,
  state,
  onInstall,
  className,
}: {
  extension: StoreExtension;
  state: InstallState;
  onInstall: () => void;
  className?: string;
}) {
  const visual = typeVisual(extension.type);
  const href = detailHref(extension);

  return (
    <Link
      to={href}
      className={cn(
        'group relative flex flex-1 items-center gap-4 overflow-hidden rounded-[1.5rem] border border-white/[0.07] bg-surface p-5 transition-colors hover:border-white/15',
        className,
      )}
    >
      <div className={cn('absolute inset-0 bg-gradient-to-r opacity-70', visual.glowClass)} />
      <ExtensionIcon extension={extension} size="md" className="relative" />
      <div className="relative min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-white/90">{extension.name}</p>
        <p className="mt-0.5 truncate text-xs font-medium text-white/45">
          {visual.label} · {formatCompact(extension.installs || extension.downloads)} installs
        </p>
      </div>
      <InstallButton state={state} onClick={onInstall} size="sm" className="relative" />
    </Link>
  );
}

/**
 * The compact row the Store uses for its trending lists: icon, name, one line of
 * meta, action. `rank` renders the position when the row sits in a ranked shelf.
 */
export function ExtensionRow({
  extension,
  state,
  onInstall,
  rank,
  className,
}: {
  extension: StoreExtension;
  state: InstallState;
  onInstall: () => void;
  rank?: number;
  className?: string;
}) {
  const visual = typeVisual(extension.type);
  const href = detailHref(extension);

  return (
    <Link
      to={href}
      className={cn(
        'group flex items-center gap-3 rounded-2xl px-2 py-2.5 transition-colors hover:bg-white/[0.04]',
        className,
      )}
    >
      {typeof rank === 'number' ? (
        <span className="w-5 shrink-0 text-center text-sm font-black text-white/25">{rank}</span>
      ) : null}
      <ExtensionIcon extension={extension} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-white/90">{extension.name}</p>
        <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs font-medium text-white/40">
          <visual.icon className={cn('h-3 w-3', visual.textClass)} />
          {visual.short}
          <span className="text-white/20">·</span>
          {formatCompact(extension.installs || extension.downloads)}
        </p>
      </div>
      <InstallButton state={state} onClick={onInstall} size="sm" />
    </Link>
  );
}

/** The catalogue tile: portrait-ish card for the "all extensions" grid. */
export function ExtensionTile({
  extension,
  state,
  onInstall,
  className,
}: {
  extension: StoreExtension;
  state: InstallState;
  onInstall: () => void;
  className?: string;
}) {
  const visual = typeVisual(extension.type);
  const href = detailHref(extension);

  return (
    <Link
      to={href}
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-[1.25rem] border border-white/[0.07] bg-white/[0.02] p-4 transition-colors hover:border-primary/40 hover:bg-white/[0.04]',
        className,
      )}
    >
      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b opacity-0 transition-opacity group-hover:opacity-100',
          visual.glowClass,
        )}
      />
      <div className="relative flex items-start gap-3">
        <ExtensionIcon extension={extension} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white/90">{extension.name}</p>
          <p className="mt-0.5 truncate text-xs font-medium text-white/40">{extension.author}</p>
          <ExtensionChips extension={extension} className="mt-2" showHealth={false} />
        </div>
      </div>
      <p className="relative mt-3 text-xs leading-relaxed text-white/50 line-clamp-2">
        {extension.description || 'No description provided.'}
      </p>
      <div className="relative mt-4 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-white/35">
          v{extension.version} · {formatCompact(extension.installs || extension.downloads)} installs
        </span>
        <InstallButton state={state} onClick={onInstall} size="sm" />
      </div>
    </Link>
  );
}

/**
 * A titled shelf: chevron-linked heading on the left, prev/next arrows on the
 * right, and a horizontally scrolling track. The arrows scroll by 80% of the
 * viewport width rather than by a fixed card count, so the same shelf works for
 * the wide promo cards and for the narrow rows.
 */
export const StoreShelf = forwardRef<
  HTMLDivElement,
  {
    title: string;
    eyebrow?: string;
    href?: string;
    /** Rendered instead of the arrows when a shelf is not scrollable. */
    action?: ReactNode;
    scrollable?: boolean;
    children: ReactNode;
    className?: string;
    trackClassName?: string;
  }
>(function StoreShelf(
  { title, eyebrow, href, action, scrollable = true, children, className, trackClassName },
  ref,
) {
  const track = useRef<HTMLDivElement | null>(null);

  const scrollBy = useCallback((direction: -1 | 1) => {
    const node = track.current;
    if (!node) return;
    node.scrollBy({ left: direction * node.clientWidth * 0.8, behavior: 'smooth' });
  }, []);

  const heading = (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-display text-xl font-black tracking-tight text-foreground sm:text-2xl">
        {title}
      </span>
      {href ? <ChevronRight className="h-5 w-5 text-white/40" /> : null}
    </span>
  );

  return (
    <section ref={ref} className={cn('space-y-4', className)}>
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-primary">
              {eyebrow}
            </p>
          ) : null}
          {href ? (
            <Link to={href} className="group mt-1 inline-block hover:text-primary">
              {heading}
            </Link>
          ) : (
            <div className="mt-1">{heading}</div>
          )}
        </div>
        {action ??
          (scrollable ? (
            <div className="flex shrink-0 items-center gap-2">
              <ShelfArrow direction={-1} onClick={() => scrollBy(-1)} />
              <ShelfArrow direction={1} onClick={() => scrollBy(1)} />
            </div>
          ) : null)}
      </div>
      {scrollable ? (
        <div
          ref={track}
          className={cn(
            'flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth pb-2 scrollbar-none',
            trackClassName,
          )}
        >
          {children}
        </div>
      ) : (
        <div className={trackClassName}>{children}</div>
      )}
    </section>
  );
});

function ShelfArrow({ direction, onClick }: { direction: -1 | 1; onClick: () => void }) {
  const Icon = direction === -1 ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === -1 ? 'Scroll left' : 'Scroll right'}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.07] bg-white/[0.03] text-white/60 transition-colors hover:border-white/20 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
