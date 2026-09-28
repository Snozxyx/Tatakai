/**
 * Data for the redesigned discover surface (docs/Plans.md §2 "Genre Page",
 * design docs/image-8.png).
 *
 * These hooks hand back raw `TatakaiMedia` rather than going through
 * `toAnimeCard`. The design puts `ONA · 2026 · ★ 9.7` under every poster and the
 * adapter keeps only `type` and `rating` — `seasonYear` is dropped on the way to
 * `AnimeCard`, so a card built from the adapter cannot render the meta line.
 */
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { contentGraph } from '@/core';
import { ALL_GENRES } from '@/lib/externalIntegrations';
import { buildPreferredAnimeRouteId } from '@/lib/animeIdMapping';
import { useContentSafetySettings } from '@/hooks/user/useContentSafetySettings';
import { filterAdultAnime } from '@/lib/contentSafety';
import type { PosterItem } from '@/components/anime/discover/types';
import { RAIL_LENGTH } from '@/components/anime/discover/types';
import type {
  ContentFeed,
  ContentSearchResult,
  FeedType,
  SearchFilters,
  TatakaiMedia,
} from '@/core/content/types';

// ─── Sorting ──────────────────────────────────────────────────────────────────

/** The design's filter row: For you · Top rated · Newest · A–Z. */
export type DiscoverSort = 'for-you' | 'top-rated' | 'newest' | 'a-z';

const SORT_BY: Record<DiscoverSort, NonNullable<SearchFilters['sortBy']>> = {
  'for-you': 'TRENDING_DESC',
  'top-rated': 'SCORE_DESC',
  newest: 'START_DATE_DESC',
  'a-z': 'TITLE_ROMAJI',
};

export const DISCOVER_SORTS: ReadonlyArray<{ id: DiscoverSort; label: string }> = [
  { id: 'for-you', label: 'For you' },
  { id: 'top-rated', label: 'Top rated' },
  { id: 'newest', label: 'Newest' },
  { id: 'a-z', label: 'A–Z' },
];

/** 7 columns × 4 rows, the grid at the design's widest breakpoint. */
export const DISCOVER_PER_PAGE = 28;

// ─── Genre slugs ──────────────────────────────────────────────────────────────

const canonical = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Route params reach this page in three different shapes, from three call sites:
 * `sci-fi` (GenreCloud:13 lowercases and hyphenates), `Slice of Life`
 * (InfiniteHomeSections:295 and MoodAnimePicker:115 pass the raw name) and
 * `Sci-Fi` (FavoritesPage:476 percent-encodes it).
 *
 * So the slug is *matched* against the canonical AniList list with separators
 * ignored, not transformed. The page previously did `slug.replace(/-/g, ' ')`,
 * which turns `sci-fi` into `Sci Fi` — a genre AniList does not have, so the
 * filter was dropped server-side and /genre/sci-fi quietly showed an unfiltered
 * list. Anything with no match falls back to the old behaviour so a genre added
 * upstream before it is added to ALL_GENRES still resolves.
 */
export function resolveGenreSlug(slug?: string): string | undefined {
  if (!slug) return undefined;
  let decoded = slug;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    // A malformed %-sequence in the URL is not worth throwing over.
  }
  const key = canonical(decoded);
  if (!key) return undefined;
  return ALL_GENRES.find((genre) => canonical(genre) === key) ?? decoded.replace(/-/g, ' ');
}

/** Title-cased for display, using the canonical spelling when there is one. */
export function genreDisplayName(slug?: string): string {
  const resolved = resolveGenreSlug(slug);
  if (!resolved) return 'All anime';
  return resolved.replace(/\b\w/g, (c) => c.toUpperCase());
}

// ─── Grid ─────────────────────────────────────────────────────────────────────

export interface DiscoverQuery {
  /** Route slug, not a resolved genre name. */
  genre?: string;
  sort?: DiscoverSort;
  /** A single year, as the design's "Any year ▾" picker produces. */
  year?: number | null;
  page?: number;
}

export function useDiscoverMedia({ genre, sort = 'for-you', year = null, page = 1 }: DiscoverQuery) {
  const resolvedGenre = resolveGenreSlug(genre);
  const { settings } = useContentSafetySettings();
  const showAdult = settings.showAdultEverywhere;

  return useQuery<ContentSearchResult>({
    queryKey: ['discover', 'grid', resolvedGenre ?? null, sort, year, page, showAdult],
    queryFn: () =>
      contentGraph.search({
        genres: resolvedGenre ? [resolvedGenre] : undefined,
        sortBy: SORT_BY[sort],
        year: year ? { min: year, max: year } : undefined,
        page,
        perPage: DISCOVER_PER_PAGE,
        // Hide adult server-side by default; `undefined` includes both.
        isAdult: showAdult ? undefined : false,
      }),
    staleTime: 5 * 60 * 1000,
    // Keeps the previous page on screen while the next one loads instead of
    // collapsing the grid to skeletons on every filter change.
    placeholderData: (previous) => previous,
    // Belt-and-suspenders: also drop anything the heuristic flags (genre/title)
    // that the server's isAdult filter alone would miss.
    select: (result) => ({ ...result, media: filterAdultAnime(result.media, showAdult) }),
  });
}

/** Newest first, back to 1960 — enough to cover everything AniList indexes. */
export function discoverYears(): number[] {
  const latest = new Date().getFullYear() + 1;
  return Array.from({ length: latest - 1959 }, (_, i) => latest - i);
}

// ─── Card presentation ────────────────────────────────────────────────────────

/**
 * `TatakaiMedia` carries the three ids buildPreferredAnimeRouteId looks for
 * under exactly those names, but an interface has no index signature so it is
 * not assignable to the candidate type — the fields are passed across
 * explicitly. Falls back to search when a row has no usable id at all.
 */
export function mediaHref(media: TatakaiMedia): string {
  const routeId = buildPreferredAnimeRouteId({
    tatakaiId: media.tatakaiId,
    malId: media.malId,
    anilistId: media.anilistId,
    titleEnglish: media.titleEnglish,
    titleRomaji: media.titleRomaji,
  });
  if (routeId) return `/anime/${routeId}`;
  return `/search?q=${encodeURIComponent(mediaTitle(media))}`;
}

export function mediaTitle(media: TatakaiMedia): string {
  return media.titleEnglish ?? media.titleRomaji;
}

/** `ONA · 2026 · ★ 9.7`, the meta line under each poster in the design. */
export function mediaMetaParts(media: TatakaiMedia): { label: string; score?: string } {
  const year = media.seasonYear ?? media.startDate?.year;
  const bits = [media.format?.replace(/_/g, ' '), year ? String(year) : undefined].filter(
    Boolean,
  ) as string[];
  return {
    label: bits.join(' · '),
    // averageScore is an integer 0–100, so one decimal is all the data supports.
    score: media.averageScore ? (media.averageScore / 10).toFixed(1) : undefined,
  };
}

/** Projection every v6 poster surface renders from. */
export function mediaToPosterItem(media: TatakaiMedia, index = 0): PosterItem {
  const { label, score } = mediaMetaParts(media);
  const title = mediaTitle(media);
  return {
    key: `${media.anilistId || media.malId || media.tatakaiId || title}-${index}`,
    href: mediaHref(media),
    title,
    poster: media.coverImageLarge ?? media.coverImageMedium ?? '',
    anilistId: media.anilistId,
    meta: label,
    score,
    isAdult: media.isAdult,
  };
}

// ─── Hero boards ──────────────────────────────────────────────────────────────

/**
 * The four hero slides behind the design's carousel dots. The mockup shows the
 * dots without saying what they page through; each one is a ranked board with
 * its own feed, so the dots move between boards rather than between images of
 * the same one.
 */
export const POSTERS_PER_BOARD = RAIL_LENGTH;

export interface RankedBoard {
  id: FeedType;
  eyebrow: string;
  heading: string;
  description: string;
  cta: { label: string; to: string };
}

export const RANKED_BOARDS: ReadonlyArray<RankedBoard> = [
  {
    id: 'popular',
    eyebrow: 'This week',
    heading: 'Popular worldwide',
    description:
      "This week's most watched across the anime community — ranked gold, silver, and bronze. Handpicked heat from around the globe.",
    cta: { label: 'See the board', to: '/trending' },
  },
  {
    id: 'trending',
    eyebrow: 'Right now',
    heading: 'Trending today',
    description:
      'What everyone started watching in the last few hours. Moves fast, so the order here rarely survives the day.',
    cta: { label: 'See what’s moving', to: '/trending' },
  },
  {
    id: 'top_rated',
    eyebrow: 'All time',
    heading: 'Highest rated',
    description:
      'The best-scored anime ever indexed, by community average. No recency bias, no seasonal noise — just the ceiling.',
    cta: { label: 'See the rankings', to: '/trending' },
  },
  {
    id: 'seasonal',
    eyebrow: 'This season',
    heading: 'Airing now',
    description:
      'Everything currently on air, ordered by how much of the community is keeping up with it week to week.',
    cta: { label: 'See the season', to: '/trending' },
  },
];

export function useRankedBoard(board: FeedType) {
  const { settings } = useContentSafetySettings();
  const showAdult = settings.showAdultEverywhere;
  return useQuery<ContentFeed>({
    queryKey: ['discover', 'board', board],
    queryFn: () => contentGraph.getFeed(board, 1, POSTERS_PER_BOARD),
    staleTime: 10 * 60 * 1000,
    // The rail is the tallest thing on the page; swapping boards should not
    // make the hero jump to a skeleton and back.
    placeholderData: (previous) => previous,
    // getFeed can't filter server-side, so hide adult on read. Reactive to the
    // toggle without refetching the cached feed.
    select: (feed) => ({ ...feed, media: filterAdultAnime(feed.media, showAdult) }),
  });
}

/**
 * Warms a board before it is shown. Called on dot hover/focus so that paging
 * the hero is instant, without paying for all four feeds on first paint — the
 * grid below is what the visitor actually came for.
 */
export function usePrefetchRankedBoard() {
  const queryClient = useQueryClient();
  return useCallback(
    (board: FeedType) => {
      void queryClient.prefetchQuery({
        queryKey: ['discover', 'board', board],
        queryFn: () => contentGraph.getFeed(board, 1, POSTERS_PER_BOARD),
        staleTime: 10 * 60 * 1000,
      });
    },
    [queryClient],
  );
}
