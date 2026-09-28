/**
 * Shared shape and rank styling for the v6 poster surfaces (docs/image-8.png).
 *
 * The genre grid feeds off `TatakaiMedia`, the trending board off `AnimeCard`
 * rows joined with view counts, and favorites off saved rows — three different
 * sources for one card. `PosterItem` is the small projection all of them can
 * produce, so the card and the ranked rail stay source-agnostic and the pages
 * keep their own mapping.
 */
import type { AnimeCard } from '@/types/anime';
import { splitRating } from '@/lib/mediaRating';

export interface PosterItem {
  /** Stable React key; ids differ per source, so the caller supplies it. */
  key: string;
  href: string;
  title: string;
  poster: string;
  /**
   * What the hover preview resolves against — it is the only id the preview API
   * accepts. Manga rows leave it unset: their AniList ids live in a different
   * namespace, so one would resolve to an unrelated anime.
   */
  anilistId?: number;
  /** The design's meta line, e.g. `ONA · 2026`. */
  meta?: string;
  /** Already formatted for display, e.g. `9.7`. */
  score?: string;
  /** AniList 18+ flag, propagated for content-safety hide/blur. */
  isAdult?: boolean;
}

/**
 * Posters are requested through `getHighQualityPoster`, which rewrites a cover
 * URL to its large variant — and a large variant that the CDN does not actually
 * hold 404s. A broken `<img>` renders its `alt` as body text, which is how a
 * stray title ended up printed in the middle of the hero, so every poster on
 * these surfaces steps down to the original URL and then to the placeholder.
 * The card's link already names the title, so the image stays decorative.
 */
export function handlePosterFallback(
  event: React.SyntheticEvent<HTMLImageElement>,
  poster: string,
) {
  const image = event.currentTarget;
  const stage = image.dataset.fallbackStage || 'upgraded';

  if (stage === 'upgraded' && poster && image.currentSrc !== poster) {
    image.dataset.fallbackStage = 'direct';
    image.src = poster;
    return;
  }

  if (stage !== 'placeholder') {
    image.dataset.fallbackStage = 'placeholder';
    image.src = '/placeholder.svg';
  }
}

/**
 * The design fans exactly seven posters in the hero rail, the first three on the
 * podium. Lives here rather than in the component so the hooks can size their
 * feeds to it without importing React.
 */
export const RAIL_LENGTH = 7;

/**
 * The podium walks down the theme's own accent ramp — primary, secondary,
 * accent — and everything below rank 3 stays dark. Medal colours would mean
 * hardcoding a palette the rest of the app does not use.
 */
export function rankBadgeClass(rank: number): string {
  if (rank === 1)
    return 'bg-gradient-to-br from-primary via-primary to-secondary text-primary-foreground ring-1 ring-primary/70 shadow-lg shadow-primary/30';
  if (rank === 2)
    return 'bg-gradient-to-br from-secondary via-secondary to-accent text-secondary-foreground ring-1 ring-secondary/60';
  if (rank === 3)
    return 'bg-gradient-to-br from-accent via-accent to-accent/70 text-accent-foreground ring-1 ring-accent/50';
  return 'bg-black/70 text-white/70 ring-1 ring-white/15 backdrop-blur-sm';
}

/**
 * The bridge for surfaces whose data is already `AnimeCard` — the trending
 * board, favorites — so they render the same card as the genre grid without
 * going back to `TatakaiMedia`. `id` is a route id by the time it reaches here
 * (the pages resolve it through `buildPreferredAnimeRouteId`), so this only has
 * to fall back to search when there is no id at all.
 *
 * `AnimeCard.rating` carries two unrelated things depending on which adapter
 * produced the row, so the split lives in `@/lib/mediaRating` — every card type
 * has to make the same call, not just this one.
 */
export function animeCardToPosterItem(anime: AnimeCard, index = 0): PosterItem {
  const { score, label } = splitRating(anime.rating);
  const episodes = anime.episodes?.sub || anime.episodes?.dub || 0;
  return {
    key: `${anime.id || anime.name}-${index}`,
    href: anime.id ? `/anime/${anime.id}` : `/search?q=${encodeURIComponent(anime.name)}`,
    title: anime.name,
    poster: anime.poster,
    anilistId: anime.anilistId,
    meta: [anime.type, label, episodes ? `${episodes} eps` : undefined].filter(Boolean).join(' · '),
    score,
    isAdult: anime.isAdult,
  };
}

/**
 * The dropdown/button treatment shared by every control on these surfaces — the
 * genre and year pickers, the favorites sort menu. Exported as strings rather
 * than a component because the callers wrap different primitives (a
 * `DropdownMenuTrigger`, a plain `button`) around the same look.
 */
export const controlTriggerClass =
  'inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white/70 transition-colors hover:border-white/20 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary data-[state=open]:border-primary/40 data-[state=open]:text-white';

export const controlMenuClass =
  'max-h-[19rem] w-52 overflow-y-auto border-white/10 bg-popover/95 p-1.5 backdrop-blur-xl';

export const controlItemClass =
  'flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm text-white/70 focus:bg-white/10 focus:text-white';

/**
 * The pager/"load more" button. Shared by the anime genre page's numbered pager
 * and the manga catalogue's cursor button so the two surfaces end a grid the
 * same way.
 */
export const PAGER_CLASS =
  'inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-5 py-2.5 text-sm font-semibold text-white/75 transition-colors hover:border-white/25 hover:text-white disabled:pointer-events-none disabled:opacity-35 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40';

/** The podium posters get an accent ring; nothing else does. */
export function rankRingClass(rank?: number): string | undefined {
  if (rank === 1) return 'ring-2 ring-primary/60';
  if (rank === 2) return 'ring-1 ring-secondary/60';
  if (rank === 3) return 'ring-1 ring-accent/50';
  return undefined;
}
