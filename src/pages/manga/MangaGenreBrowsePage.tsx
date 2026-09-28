/**
 * The manga catalogue (`/manga/discover` and `/manga/genre/:genre`), rebuilt on
 * the same primitives as the anime genre page (docs/Plans.md §2).
 *
 * The data layer below is unchanged — the same feed lanes, the same facet counts,
 * the same query-string contract — because it works. What changed is everything
 * above it: eleven raw `<select>`/`<input>` controls (which render in the
 * browser's own chrome and ignore the theme entirely) became `ControlSelect`
 * dropdowns, the bespoke chip row became `PillGroup`, and `UnifiedMediaCard`
 * became the shared `PosterCard` fed by `mangaSearchItemToPosterItem` — so a
 * manga tile and an anime tile are now literally the same component.
 *
 * The three numeric inputs are dropdowns of presets now. "Min chapters: 37" was
 * a filter nobody wanted; it re-ran the whole infinite query on every keystroke,
 * and free numeric entry is the only reason this page needed text inputs at all.
 *
 * `MangaGenreSlider` is gone from this page. It hardcoded a poster URL and a
 * different Tailwind hue per genre (`amber-600`, `cyan-600`, `rose-500`…), which
 * is exactly the per-widget palette the v6 pass removed; the genre pills do its
 * job against real facet counts. It still renders on the manga home page.
 */
import { useMemo, useRef } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useSettingsModal } from '@/contexts/SettingsModalContext';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarRange,
  Clock,
  Compass,
  Globe,
  Layers,
  ListOrdered,
  Loader2,
  RotateCcw,
  SearchX,
  ShieldAlert,
  SlidersHorizontal,
  Star,
  Tag,
  TriangleAlert,
} from 'lucide-react';
import { Background } from '@/components/layout/Background';
import { Sidebar } from '@/components/layout/Sidebar';
import { MobileNav } from '@/components/layout/MobileNav';
import { Header } from '@/components/layout/Header';
import { SectionHeading } from '@/components/anime/discover/SectionHeading';
import { PillGroup, type PillOption } from '@/components/anime/discover/PillGroup';
import { ControlSelect, type ControlOption } from '@/components/anime/discover/ControlSelect';
import { PosterCard } from '@/components/anime/discover/PosterCard';
import { RankedPosterRail } from '@/components/anime/discover/RankedPosterRail';
import { POSTER_GRID_CLASS, PosterGridSkeleton } from '@/components/anime/discover/DiscoverPosterGrid';
import {
  PAGER_CLASS,
  RAIL_LENGTH,
  controlTriggerClass,
  type PosterItem,
} from '@/components/anime/discover/types';
import { mangaSearchItemToPosterItem } from '@/components/manga/mangaPosterItem';
import { cn } from '@/lib/utils';
import { useIsDesktopApp } from '@/hooks/ui/useIsNativeApp';
import { useContentSafetySettings } from '@/hooks/user/useContentSafetySettings';
import { discoverYears } from '@/hooks/api/useDiscover';
import {
  getMangaFilterCounts,
  parseMangaSearchProvider,
  searchManga,
  type MangaFeedTimeWindow,
  type MangaSearchProvider,
  type MangaSortOption,
} from '@/core/content/manga-client';
import type { MangaSearchResult } from '@/types/manga';

const BASE_GENRE_PRESETS = [
  '',
  'action',
  'romance',
  'fantasy',
  'thriller',
  'horror',
  'comedy',
  'adventure',
  'mystery',
  'drama',
  'historical',
  'isekai',
  'sports',
  'martial arts',
];

const HENTAI_GENRE = 'hentai';

const PROVIDER_OPTIONS = [
  { value: 'all', label: 'All providers' },
  { value: 'mapped', label: 'Mapped only' },
] as const satisfies ReadonlyArray<ControlOption<MangaSearchProvider>>;

const TYPE_OPTIONS = [
  { value: 'all', label: 'All types' },
  { value: 'manga', label: 'Manga' },
  { value: 'manhwa', label: 'Manhwa' },
  { value: 'manhua', label: 'Manhua' },
  { value: 'comics', label: 'Comics' },
] as const;

const STATUS_OPTIONS = [
  { value: 'all', label: 'Any status' },
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'completed', label: 'Completed' },
  { value: 'hiatus', label: 'Hiatus' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'unreleased', label: 'Unreleased' },
] as const;

/** The provider-native lanes. `auto` is genre search, or explore with no genre. */
const FEED_MODE_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'latest', label: 'Latest' },
  { value: 'added', label: 'Recently added' },
  { value: 'new-chap', label: 'New chapters' },
  { value: 'recent', label: 'Recently read' },
  { value: 'foryou', label: 'For you' },
  { value: 'popular', label: 'Popular' },
  { value: 'recommendation', label: 'Recommended' },
  { value: 'origin', label: 'By origin' },
  { value: 'random', label: 'Random picks' },
] as const;

const FEED_WINDOW_OPTIONS = [
  { value: 'day', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'all', label: 'All time' },
] as const satisfies ReadonlyArray<ControlOption<MangaFeedTimeWindow>>;

const ORIGIN_OPTIONS = [
  { value: 'all', label: 'Any origin' },
  { value: 'jp', label: 'Japan · Manga' },
  { value: 'kr', label: 'Korea · Manhwa' },
  { value: 'zh', label: 'China · Manhua' },
] as const;

const SORT_LABELS: Record<MangaSortOption, string> = {
  relevance: 'Relevance',
  trending: 'Trending',
  latestUpdate: 'Latest update',
  rating: 'Highest rating',
  popularity: 'Popularity',
  chapterCount: 'Chapter count',
};

/** Presets replace the old free-entry number inputs. See the file docblock. */
const MIN_SCORE_OPTIONS = [
  { value: '0', label: 'Any rating' },
  { value: '9', label: '9+' },
  { value: '8', label: '8+' },
  { value: '7', label: '7+' },
  { value: '6', label: '6+' },
  { value: '5', label: '5+' },
] as const;

const MIN_CHAPTER_OPTIONS = [
  { value: '0', label: 'Any length' },
  { value: '10', label: '10+ chapters' },
  { value: '25', label: '25+ chapters' },
  { value: '50', label: '50+ chapters' },
  { value: '100', label: '100+ chapters' },
  { value: '200', label: '200+ chapters' },
  { value: '500', label: '500+ chapters' },
] as const;

const YEAR_OPTIONS: ReadonlyArray<ControlOption<string>> = [
  { value: '0', label: 'Any year' },
  ...discoverYears().map((year) => ({ value: String(year), label: String(year) })),
];

type MangaTypeFilter = (typeof TYPE_OPTIONS)[number]['value'];
type MangaStatusFilter = (typeof STATUS_OPTIONS)[number]['value'];
type MangaSortFilter = 'default' | MangaSortOption;
type MangaDiscoverFeedMode = (typeof FEED_MODE_OPTIONS)[number]['value'];
type MangaOriginFilter = (typeof ORIGIN_OPTIONS)[number]['value'];

function normalizeProvider(value: string | null): MangaSearchProvider {
  return parseMangaSearchProvider(value, 'all');
}

function normalizeType(value: string | null): MangaTypeFilter {
  const lowered = String(value || 'all').trim().toLowerCase();
  if (lowered === 'manwha' || lowered === 'manwah') return 'manhwa';
  if (TYPE_OPTIONS.some((option) => option.value === lowered)) return lowered as MangaTypeFilter;
  return 'all';
}

function normalizeStatus(value: string | null): MangaStatusFilter {
  const lowered = String(value || 'all').trim().toLowerCase();
  if (STATUS_OPTIONS.some((option) => option.value === lowered)) return lowered as MangaStatusFilter;
  return 'all';
}

function normalizeSort(value: string | null): MangaSortFilter {
  const lowered = String(value || 'default').trim().toLowerCase();
  if (lowered === 'default') return 'default';
  if (Object.keys(SORT_LABELS).includes(lowered)) return lowered as MangaSortOption;
  return 'default';
}

function normalizeFeedMode(value: string | null): MangaDiscoverFeedMode {
  const lowered = String(value || 'auto').trim().toLowerCase();
  if (FEED_MODE_OPTIONS.some((option) => option.value === lowered)) {
    return lowered as MangaDiscoverFeedMode;
  }
  return 'auto';
}

function normalizeFeedWindow(value: string | null): MangaFeedTimeWindow {
  const lowered = String(value || 'day').trim().toLowerCase();
  if (FEED_WINDOW_OPTIONS.some((option) => option.value === lowered)) {
    return lowered as MangaFeedTimeWindow;
  }
  return 'day';
}

function normalizeOrigin(value: string | null): MangaOriginFilter {
  const lowered = String(value || 'all').trim().toLowerCase();
  if (ORIGIN_OPTIONS.some((option) => option.value === lowered)) {
    return lowered as MangaOriginFilter;
  }
  return 'all';
}

function parsePositiveNumberParam(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed;
}

/** Facet counts ride in the dropdown as a hint, not glued into the label. */
function formatCount(count: number | undefined): string | undefined {
  if (!Number.isFinite(count) || !count || count <= 0) return undefined;
  return count.toLocaleString();
}

/** Providers word status a dozen ways; the filter only knows five. */
function normalizeStatusValue(value: unknown): MangaStatusFilter | 'unknown' {
  const normalized = String(value || '').toLowerCase();
  if (normalized.includes('ongoing') || normalized.includes('releasing')) return 'ongoing';
  if (normalized.includes('completed') || normalized.includes('finished')) return 'completed';
  if (normalized.includes('hiatus')) return 'hiatus';
  if (normalized.includes('cancel')) return 'cancelled';
  if (normalized.includes('unreleased') || normalized.includes('not')) return 'unreleased';
  return 'unknown';
}

function formatGenreLabel(genre: string): string {
  if (!genre) return 'All genres';
  return genre.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

interface CatalogPageArgs {
  page: number;
  genre: string;
  provider: MangaSearchProvider;
  mangaType: MangaTypeFilter;
  mangaStatus: MangaStatusFilter;
  sort: MangaSortFilter;
  feedMode: MangaDiscoverFeedMode;
  feedWindow: MangaFeedTimeWindow;
  feedOrigin: MangaOriginFilter;
  minYear: number;
  minScore: number;
  minChapters: number;
  canShowAdult: boolean;
}

const PAGE_LIMIT = 24;

async function fetchGenreCatalogPage(args: CatalogPageArgs): Promise<MangaSearchResult> {
  const {
    page,
    genre,
    provider,
    mangaType,
    mangaStatus,
    sort,
    feedMode,
    feedWindow,
    feedOrigin,
    minYear,
    minScore,
    minChapters,
    canShowAdult,
  } = args;

  const isAdultGenre = genre === HENTAI_GENRE;
  const statuses = mangaStatus !== 'all' ? [mangaStatus] : undefined;
  const sortValue = sort !== 'default' ? sort : undefined;

  if (isAdultGenre && !canShowAdult) {
    return {
      query: genre,
      page,
      limit: PAGE_LIMIT,
      partial: false,
      failedProviders: [],
      results: [],
      currentPage: page,
      totalPages: page,
      hasNextPage: false,
      source: 'genre',
    };
  }

  if (feedMode !== 'auto') {
    return searchManga('', page, PAGE_LIMIT, {
      mode: feedMode,
      provider,
      mangaType,
      adult: isAdultGenre,
      statuses,
      sort: sortValue,
      timeWindow:
        feedMode === 'foryou' || feedMode === 'recent' || feedMode === 'popular'
          ? feedWindow
          : undefined,
      origin: feedMode === 'origin' && feedOrigin !== 'all' ? feedOrigin : undefined,
      minYear,
      minScore,
      minChapters,
      requiresQuery: false,
    });
  }

  if (genre) {
    // Only some providers expose a genre lane; the rest need the genre as a query.
    const supportsGenreMode =
      (provider as string) === 'all' ||
      (provider as string) === 'mangafire' ||
      (provider as string) === 'allmanga';

    if (supportsGenreMode) {
      const genreMode = await searchManga('', page, PAGE_LIMIT, {
        mode: 'genre',
        provider,
        genre,
        mangaType,
        adult: isAdultGenre,
        statuses,
        sort: sortValue,
        minYear,
        minScore,
        minChapters,
        requiresQuery: false,
      });

      if (Array.isArray(genreMode?.results) && genreMode.results.length > 0) {
        return genreMode;
      }
    }

    return searchManga(`${genre} manga`, page, PAGE_LIMIT, {
      mode: 'search',
      provider,
      mangaType,
      adult: isAdultGenre,
      statuses,
      sort: sortValue,
      minYear,
      minScore,
      minChapters,
    });
  }

  if (provider !== 'all') {
    return searchManga('', page, PAGE_LIMIT, {
      mode: 'latest',
      provider,
      mangaType,
      statuses,
      sort: sortValue,
      minYear,
      minScore,
      minChapters,
      requiresQuery: false,
    });
  }

  return searchManga('', page, PAGE_LIMIT, {
    mode: 'explore',
    provider,
    mangaType,
    statuses,
    sort: sortValue,
    minYear,
    minScore,
    minChapters,
    requiresQuery: false,
  });
}

export default function MangaGenreBrowsePage() {
  const navigate = useNavigate();
  const { openSettings } = useSettingsModal();
  const isDesktopApp = useIsDesktopApp();
  const { settings: contentSafetySettings } = useContentSafetySettings();
  const { genre: routeGenre } = useParams<{ genre?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const gridTop = useRef<HTMLDivElement>(null);

  const canShowAdultEverywhere = contentSafetySettings.showAdultEverywhere;

  const normalizedRouteGenre = routeGenre
    ? decodeURIComponent(routeGenre).trim().toLowerCase()
    : '';
  const queryGenre = String(searchParams.get('genre') || '').trim().toLowerCase();
  const activeGenre = normalizedRouteGenre || queryGenre;
  const isAdultGenre = activeGenre === HENTAI_GENRE;
  const isAdultGenreLocked = isAdultGenre && !canShowAdultEverywhere;
  const hasRouteGenre = Boolean(normalizedRouteGenre);

  const provider = normalizeProvider(searchParams.get('provider'));
  const feedMode = normalizeFeedMode(searchParams.get('feed'));
  const feedWindow = normalizeFeedWindow(searchParams.get('window'));
  const feedOrigin = normalizeOrigin(searchParams.get('origin'));
  const mangaType = normalizeType(searchParams.get('type'));
  const mangaStatus = normalizeStatus(searchParams.get('status'));
  const sortMode = normalizeSort(searchParams.get('sort'));
  const minYear = parsePositiveNumberParam(searchParams.get('minYear'));
  const minScore = parsePositiveNumberParam(searchParams.get('minScore'));
  const minChapters = parsePositiveNumberParam(searchParams.get('minChapters'));

  const hasActiveFilters =
    provider !== 'all' ||
    feedMode !== 'auto' ||
    mangaType !== 'all' ||
    mangaStatus !== 'all' ||
    sortMode !== 'default' ||
    minYear > 0 ||
    minScore > 0 ||
    minChapters > 0;

  const facetQueryText = useMemo(() => {
    if (activeGenre) return `${activeGenre} manga`;
    if (mangaType !== 'all') return mangaType;
    return 'manga';
  }, [activeGenre, mangaType]);

  const { data: mangaFilterCounts } = useQuery({
    queryKey: ['manga-discover-filter-counts', facetQueryText],
    queryFn: () => getMangaFilterCounts(facetQueryText),
    enabled: facetQueryText.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  /** `{ group → { value → count } }`, flattened from the schema response. */
  const facetCountLookup = useMemo(() => {
    const lookup = new Map<string, Map<string, number>>();
    const groups = Array.isArray(mangaFilterCounts?.groups) ? mangaFilterCounts.groups : [];

    groups.forEach((group) => {
      const key = String(group?.key || '').toLowerCase();
      if (!key) return;

      const valueMap = new Map<string, number>();
      const counts = Array.isArray(group?.counts) ? group.counts : [];

      counts.forEach((entry) => {
        const value = String(entry?.value || '').toLowerCase();
        const count = Number(entry?.count);
        if (!value || !Number.isFinite(count)) return;
        valueMap.set(value, count);
      });

      lookup.set(key, valueMap);
    });

    return lookup;
  }, [mangaFilterCounts]);

  /** Providers disagree on singular vs plural group keys, so callers pass both. */
  const getFacetCount = (keys: string[], value: string) => {
    const normalizedValue = String(value || '').toLowerCase();
    if (!normalizedValue) return undefined;

    for (const key of keys) {
      const group = facetCountLookup.get(String(key || '').toLowerCase());
      const count = group?.get(normalizedValue);
      if (typeof count === 'number') return count;
    }

    return undefined;
  };

  const genreCountMap = useMemo(() => {
    const map = new Map<string, number>();
    ['genre', 'genres'].forEach((key) => {
      const group = facetCountLookup.get(key);
      if (!group) return;
      group.forEach((count, value) => map.set(value, count));
    });
    return map;
  }, [facetCountLookup]);

  /** Hentai only joins the list when the user has unlocked mature content. */
  const genrePills = useMemo<ReadonlyArray<PillOption<string>>>(() => {
    const presets = BASE_GENRE_PRESETS.filter(Boolean);
    if (canShowAdultEverywhere && !presets.includes(HENTAI_GENRE)) presets.push(HENTAI_GENRE);
    const safe = canShowAdultEverywhere
      ? presets
      : presets.filter((genre) => genre !== HENTAI_GENRE);

    return ['', ...safe].map((genre) => {
      const count = genre ? formatCount(genreCountMap.get(genre.toLowerCase())) : undefined;
      return {
        id: genre,
        label: count ? `${formatGenreLabel(genre)} ${count}` : formatGenreLabel(genre),
        icon:
          genre === HENTAI_GENRE ? (
            <span aria-hidden className="text-[10px]">
              18+
            </span>
          ) : undefined,
      };
    });
  }, [canShowAdultEverywhere, genreCountMap]);

  const sortOptions = useMemo<ReadonlyArray<ControlOption<MangaSortFilter>>>(
    () => [
      { value: 'default', label: 'Default order' },
      ...(Object.keys(SORT_LABELS) as MangaSortOption[]).map((sort) => ({
        value: sort,
        label: SORT_LABELS[sort],
      })),
    ],
    [],
  );

  /**
   * Every control writes through here. Default values are deleted rather than
   * written so a shared URL carries only what the user actually changed, and the
   * genre stays in the path — which is what `/manga/genre/:genre` links expect.
   */
  const setParamAndNavigate = (updates: Record<string, string | null>, nextGenre?: string) => {
    const nextParams = new URLSearchParams(searchParams);

    Object.entries(updates).forEach(([key, value]) => {
      if (!value || value === 'all' || value === 'default' || value === 'auto' || value === 'day') {
        nextParams.delete(key);
      } else {
        nextParams.set(key, value);
      }
    });

    const targetGenre = typeof nextGenre === 'string' ? nextGenre : activeGenre;

    if (targetGenre) {
      nextParams.set('genre', targetGenre);
      const qs = nextParams.toString();
      navigate(`/manga/genre/${encodeURIComponent(targetGenre)}${qs ? `?${qs}` : ''}`);
      return;
    }

    nextParams.delete('genre');
    const qs = nextParams.toString();
    if (hasRouteGenre) {
      navigate(`/manga/discover${qs ? `?${qs}` : ''}`);
    } else {
      setSearchParams(nextParams);
    }
  };

  const resetFilters = () =>
    setParamAndNavigate({
      provider: null,
      feed: null,
      window: null,
      origin: null,
      type: null,
      status: null,
      sort: null,
      minYear: null,
      minScore: null,
      minChapters: null,
    });

  const discoverQuery = useInfiniteQuery({
    queryKey: [
      'manga-discover-catalog',
      activeGenre,
      provider,
      feedMode,
      feedWindow,
      feedOrigin,
      mangaType,
      mangaStatus,
      sortMode,
      minYear,
      minScore,
      minChapters,
      canShowAdultEverywhere,
    ],
    queryFn: ({ pageParam = 1 }) =>
      fetchGenreCatalogPage({
        page: pageParam,
        genre: activeGenre,
        provider,
        mangaType,
        mangaStatus,
        sort: sortMode,
        feedMode,
        feedWindow,
        feedOrigin,
        minYear,
        minScore,
        minChapters,
        canShowAdult: canShowAdultEverywhere,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage?.hasNextPage) return undefined;
      const current =
        typeof lastPage?.currentPage === 'number' ? lastPage.currentPage : allPages.length;
      return current + 1;
    },
    staleTime: 2 * 60 * 1000,
  });

  const failedProviders = useMemo(() => {
    const pages = discoverQuery.data?.pages ?? [];
    const names = new Set<string>();
    pages.forEach((page) => {
      (Array.isArray(page?.failedProviders) ? page.failedProviders : []).forEach((name) => {
        if (name) names.add(String(name));
      });
    });
    return Array.from(names);
  }, [discoverQuery.data]);

  /**
   * The providers apply only some of these filters server-side, and a merged page
   * mixes rows from several of them, so the same predicates run again here. The
   * re-sort is for the same reason: a merged page is only sorted per provider.
   */
  const posters = useMemo(() => {
    const rows = (discoverQuery.data?.pages ?? []).flatMap((page) =>
      Array.isArray(page?.results) ? page.results : [],
    );
    const minScoreRaw = minScore > 0 ? minScore * 10 : 0;

    const filtered = rows.filter((item) => {
      if (!canShowAdultEverywhere && item?.adult) return false;
      if (mangaStatus !== 'all' && normalizeStatusValue(item?.status) !== mangaStatus) return false;

      if (minYear > 0) {
        const year = Number(item?.year);
        if (!Number.isFinite(year) || year < minYear) return false;
      }

      if (minScoreRaw > 0) {
        const score = Number(item?.score);
        if (!Number.isFinite(score) || score < minScoreRaw) return false;
      }

      if (minChapters > 0) {
        const chapters = Number(item?.chapters);
        if (!Number.isFinite(chapters) || chapters < minChapters) return false;
      }

      return true;
    });

    const sorted =
      sortMode === 'default'
        ? filtered
        : [...filtered].sort((left, right) => {
            if (sortMode === 'rating') return Number(right?.score || 0) - Number(left?.score || 0);
            if (sortMode === 'popularity' || sortMode === 'trending') {
              return Number(right?.popularity || 0) - Number(left?.popularity || 0);
            }
            if (sortMode === 'chapterCount') {
              return Number(right?.chapters || 0) - Number(left?.chapters || 0);
            }
            if (sortMode === 'latestUpdate') {
              const yearGap = Number(right?.year || 0) - Number(left?.year || 0);
              if (yearGap !== 0) return yearGap;
              return Number(right?.chapters || 0) - Number(left?.chapters || 0);
            }
            return 0;
          });

    /**
     * Deduping happens on the source rows rather than the mapped posters: a merged
     * page can carry the same title from two providers under different local ids,
     * and the AniList/MAL number is what identifies it across them.
     */
    const seen = new Set<string>();
    const items: PosterItem[] = [];

    sorted.forEach((item, index) => {
      const identity = String(
        item?.anilistId ? `al:${item.anilistId}` : item?.malId ? `mal:${item.malId}` : item?.id || '',
      );
      if (!identity || seen.has(identity)) return;
      seen.add(identity);

      const poster = mangaSearchItemToPosterItem(item, index);
      if (poster) items.push(poster);
    });

    return items;
  }, [
    discoverQuery.data,
    canShowAdultEverywhere,
    mangaStatus,
    minYear,
    minScore,
    minChapters,
    sortMode,
  ]);

  const headingGenre = activeGenre ? formatGenreLabel(activeGenre) : '';
  const heading = headingGenre ? `${headingGenre} manga` : 'Browse manga';
  const isInitialLoading = discoverQuery.isPending && !isAdultGenreLocked;

  /**
   * The hero fan: the highest-rated of the rows already loaded, so it costs no
   * extra request and cannot contradict the grid under it. The anime hero pages
   * four ranked boards there; a catalogue has one list, so it ranks that list.
   */
  const railItems = useMemo(
    () =>
      posters
        .filter((item) => Boolean(item.score))
        .sort((left, right) => Number(right.score) - Number(left.score))
        .slice(0, RAIL_LENGTH),
    [posters],
  );

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <Background />
      <Sidebar />

      <main
        className={cn(
          'relative z-10 mx-auto max-w-[1800px] px-4 py-6 pb-24 sm:px-6 md:pb-6',
          isDesktopApp ? 'md:pl-6' : 'md:pl-32',
        )}
      >
        <Header />
        <section className="relative mt-2 overflow-hidden rounded-[2rem] border border-white/[0.07] bg-card">
          {/* The accent cast of the anime hero, without its banner backdrop —
              manga rows carry no banner art, so the panel supplies the colour. */}
          <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_15%_110%,hsl(var(--primary)/0.28),transparent_60%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(80%_70%_at_95%_0%,hsl(var(--secondary)/0.18),transparent_65%)]" />

          <div className="relative grid gap-10 p-6 sm:p-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-center lg:gap-6 lg:p-14">
            <div className="max-w-xl">
              <Link
                to="/manga"
                className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-white/40 transition-colors hover:text-white"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Manga home
              </Link>

              <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.28em] text-primary">
                Manga catalogue
              </p>
              <h1 className="font-display mt-3 text-4xl font-black capitalize leading-[1.05] tracking-tight text-foreground sm:text-5xl xl:text-[3.75rem]">
                {heading}
              </h1>
              <p className="mt-4 max-w-lg text-sm leading-relaxed text-white/55 sm:text-base">
                {headingGenre
                  ? `Every ${headingGenre.toLowerCase()} series the connected providers can reach, in one grid — filter by type, status, length or rating, and the URL keeps the view.`
                  : 'Everything the connected providers can reach, in one grid — pick a genre, filter by type, status, length or rating, and the URL keeps the view.'}
              </p>

              <button
                type="button"
                onClick={() =>
                  gridTop.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
                className="group mt-7 inline-flex items-center gap-2 rounded-full bg-gradient-to-b from-primary to-secondary px-6 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:from-primary/90 hover:to-secondary/90 hover:shadow-primary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                Browse the catalogue
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </button>
            </div>

            {/* Stretched rather than end-aligned: the rail sizes its posters off
                this column's width, so the column needs a definite one. */}
            <div className="min-w-0">
              <RankedPosterRail items={railItems} isLoading={isInitialLoading} />
            </div>
          </div>
        </section>
        <div ref={gridTop} className="scroll-mt-6 pt-12">
          <SectionHeading
            eyebrow={activeGenre ? 'Genre' : 'Discover'}
            title={activeGenre ? `${headingGenre} titles` : 'All titles'}
            meta={
              posters.length > 0
                ? `${posters.length.toLocaleString()} loaded${
                    discoverQuery.hasNextPage ? ' · more available' : ''
                  }`
                : undefined
            }
          />

          <PillGroup
            className="mt-6"
            label="Genre"
            options={genrePills}
            value={activeGenre}
            onChange={(next) => setParamAndNavigate({}, next)}
          />

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <ControlSelect
              label="Feed"
              icon={Layers}
              value={feedMode}
              options={FEED_MODE_OPTIONS}
              neutral={['auto']}
              onChange={(next) => setParamAndNavigate({ feed: next })}
            />

            {/* Only two lanes read a time window, and only one reads an origin —
                the rest ignore them, so showing them there would be a lie. */}
            {(feedMode === 'foryou' || feedMode === 'recent' || feedMode === 'popular') && (
              <ControlSelect
                label="Window"
                icon={Clock}
                value={feedWindow}
                options={FEED_WINDOW_OPTIONS}
                neutral={['day']}
                onChange={(next) => setParamAndNavigate({ window: next })}
              />
            )}

            {feedMode === 'origin' && (
              <ControlSelect
                label="Origin"
                icon={Globe}
                value={feedOrigin}
                options={ORIGIN_OPTIONS}
                neutral={['all']}
                onChange={(next) => setParamAndNavigate({ origin: next })}
              />
            )}
            <ControlSelect
              label="Provider"
              icon={Compass}
              value={provider}
              options={PROVIDER_OPTIONS}
              neutral={['all']}
              onChange={(next) => setParamAndNavigate({ provider: next })}
            />

            {/* Facet counts ride along as hints where the schema reports them —
                the providers disagree on the group's name, hence the key lists. */}
            <ControlSelect
              label="Type"
              icon={Tag}
              value={mangaType}
              options={TYPE_OPTIONS.map((option) => ({
                ...option,
                hint:
                  option.value === 'all'
                    ? undefined
                    : formatCount(getFacetCount(['type', 'types', 'format', 'formats'], option.value)),
              }))}
              neutral={['all']}
              onChange={(next) => setParamAndNavigate({ type: next })}
            />

            <ControlSelect
              label="Status"
              icon={SlidersHorizontal}
              value={mangaStatus}
              options={STATUS_OPTIONS.map((option) => ({
                ...option,
                hint:
                  option.value === 'all'
                    ? undefined
                    : formatCount(getFacetCount(['status', 'statuses'], option.value)),
              }))}
              neutral={['all']}
              onChange={(next) => setParamAndNavigate({ status: next })}
            />
            <ControlSelect
              label="Sort"
              icon={ListOrdered}
              value={sortMode}
              options={sortOptions}
              neutral={['default']}
              onChange={(next) => setParamAndNavigate({ sort: next })}
            />

            <ControlSelect
              label="Year"
              icon={CalendarRange}
              value={String(minYear || 0)}
              options={YEAR_OPTIONS}
              neutral={['0']}
              onChange={(next) => setParamAndNavigate({ minYear: next === '0' ? null : next })}
            />

            <ControlSelect
              label="Rating"
              icon={Star}
              value={String(minScore || 0)}
              options={MIN_SCORE_OPTIONS}
              neutral={['0']}
              onChange={(next) => setParamAndNavigate({ minScore: next === '0' ? null : next })}
            />

            <ControlSelect
              label="Length"
              icon={BookOpen}
              value={String(minChapters || 0)}
              options={MIN_CHAPTER_OPTIONS}
              neutral={['0']}
              onChange={(next) => setParamAndNavigate({ minChapters: next === '0' ? null : next })}
            />

            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className={cn(controlTriggerClass, 'text-white/50 hover:text-white')}
              >
                <RotateCcw className="h-3.5 w-3.5 opacity-60" />
                Reset
              </button>
            )}
          </div>
          {failedProviders.length > 0 && (
            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber/25 bg-amber/[0.06] px-4 py-3">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
              <p className="text-xs leading-relaxed text-white/60">
                <span className="font-bold text-amber">Partial results.</span>{' '}
                {failedProviders.join(', ')} did not answer, so anything only they carry is missing
                from this list.
              </p>
            </div>
          )}

          <div className="mt-8">
            {isAdultGenreLocked ? (
              <div className="flex flex-col items-center justify-center rounded-3xl border border-destructive/25 bg-destructive/[0.06] px-6 py-20 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/15">
                  <ShieldAlert className="h-7 w-7 text-destructive" />
                </span>
                <p className="mt-5 text-lg font-bold">Mature content is switched off</p>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-white/55">
                  This genre returns adult titles only, and your content safety settings hide them
                  everywhere. Turn mature content on to browse it.
                </p>
                <button
                  type="button"
                  onClick={() => openSettings('privacy', 'mature-content-controls')}
                  className="group mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-5 py-2.5 text-sm font-semibold text-white/75 transition-colors hover:border-white/25 hover:text-white"
                >
                  Open content settings
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </button>
              </div>
            ) : isInitialLoading ? (
              <PosterGridSkeleton />
            ) : discoverQuery.isError ? (
              <div className="flex flex-col items-center justify-center rounded-3xl border border-destructive/25 bg-destructive/[0.06] px-6 py-20 text-center">
                <TriangleAlert className="h-9 w-9 text-destructive" />
                <p className="mt-4 text-lg font-bold">The catalogue did not load</p>
                <p className="mt-1 max-w-sm text-sm text-white/55">
                  Every provider failed for this query. Retry, or drop a filter or two.
                </p>
                <button
                  type="button"
                  onClick={() => discoverQuery.refetch()}
                  className={cn(PAGER_CLASS, 'mt-6')}
                >
                  <RotateCcw className="h-4 w-4" />
                  Try again
                </button>
              </div>
            ) : posters.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-3xl border border-white/[0.07] bg-white/[0.02] py-24 text-center">
                <SearchX className="h-10 w-10 text-muted-foreground/60" />
                <p className="mt-4 text-lg font-semibold">Nothing matches those filters</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  {hasActiveFilters
                    ? 'The providers returned nothing for this combination. Reset the filters, or widen one of them.'
                    : 'No provider returned a title for this genre. Try another one.'}
                </p>
                {hasActiveFilters && (
                  <button type="button" onClick={resetFilters} className={cn(PAGER_CLASS, 'mt-6')}>
                    <RotateCcw className="h-4 w-4" />
                    Reset filters
                  </button>
                )}
              </div>
            ) : (
              /* No `preview`: the hover video resolves against an AniList anime id,
                 and manga ids live in a different namespace. See `PosterItem`. */
              <div
                className={cn(
                  POSTER_GRID_CLASS,
                  discoverQuery.isFetching && !discoverQuery.isFetchingNextPage && 'opacity-70 transition-opacity',
                )}
              >
                {posters.map((item, index) => (
                  <PosterCard key={item.key} item={item} eager={index < 7} />
                ))}
              </div>
            )}
          </div>

          {/* A cursor button rather than the anime page's numbered pager: the
              providers stream pages without ever reporting a total. */}
          {!isAdultGenreLocked && discoverQuery.hasNextPage && (
            <div className="mt-14 flex justify-center">
              <button
                type="button"
                onClick={() => discoverQuery.fetchNextPage()}
                disabled={discoverQuery.isFetchingNextPage}
                className={PAGER_CLASS}
              >
                {discoverQuery.isFetchingNextPage ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading
                  </>
                ) : (
                  'Load more titles'
                )}
              </button>
            </div>
          )}
        </div>
      </main>

      <MobileNav />
    </div>
  );
}
