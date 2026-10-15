import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { normalizeCatalogSort, preservesCatalogPageOrder } from '@/core/content/catalog-sort';
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
import { useMemo, useRef, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useSettingsModal } from '@/contexts/SettingsModalContext';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarRange,
  ChevronDown,
  Clock,
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
  X,
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
import { TagGroupCloud, type TagCloudGroup } from '@/components/manga/TagGroupCloud';
import { Input } from '@/components/ui/input';
import { getMangaTagOptions } from '@/core/content/manga-tag-search';
import { cn } from '@/lib/utils';
import { useIsDesktopApp } from '@/hooks/ui/useIsNativeApp';
import { useContentSafetySettings } from '@/hooks/user/useContentSafetySettings';
import { discoverYears } from '@/hooks/api/useDiscover';
import {
  getMangaFilterCounts,
  searchManga,
  type MangaFeedTimeWindow,
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

const TYPE_OPTIONS = [
  { value: 'all', get label() { return uiI18n.t('app.all_types_30c8a0fc'); } },
  { value: 'manga', get label() { return uiI18n.t('app.manga_87db0f99'); } },
  { value: 'manhwa', get label() { return uiI18n.t('app.manhwa_8251bcf8'); } },
  { value: 'manhua', get label() { return uiI18n.t('app.manhua_b6ddb037'); } },
  { value: 'comics', get label() { return uiI18n.t('app.comics_0fd813b3'); } },
] as const;

const STATUS_OPTIONS = [
  { value: 'all', get label() { return uiI18n.t('app.any_status_55201ac9'); } },
  { value: 'ongoing', get label() { return uiI18n.t('app.ongoing_2e0254c2'); } },
  { value: 'completed', get label() { return uiI18n.t('app.completed_1798b3ba'); } },
  { value: 'hiatus', get label() { return uiI18n.t('app.hiatus_f6eb2b71'); } },
  { value: 'cancelled', get label() { return uiI18n.t('app.cancelled_a1bf92ef'); } },
  { value: 'unreleased', get label() { return uiI18n.t('app.unreleased_81dd1756'); } },
] as const;

/** The provider-native lanes. `auto` is genre search, or explore with no genre. */
const FEED_MODE_OPTIONS = [
  { value: 'auto', get label() { return uiI18n.t('app.auto_c614ba7c'); } },
  { value: 'latest', get label() { return uiI18n.t('app.latest_decd7ca8'); } },
  { value: 'added', get label() { return uiI18n.t('app.recently_added_53696342'); } },
  { value: 'new-chap', get label() { return uiI18n.t('app.new_chapters_5896ad09'); } },
  { value: 'recent', get label() { return uiI18n.t('app.recently_read_471a351e'); } },
  { value: 'foryou', get label() { return uiI18n.t('app.for_you_7e13d94a'); } },
  { value: 'popular', get label() { return uiI18n.t('app.popular_9bc2c5b3'); } },
  { value: 'recommendation', get label() { return uiI18n.t('app.recommended_9ef93755'); } },
  { value: 'origin', get label() { return uiI18n.t('app.by_origin_4be57f17'); } },
  { value: 'random', get label() { return uiI18n.t('app.random_picks_1b2435b2'); } },
] as const;

const FEED_WINDOW_OPTIONS = [
  { value: 'day', get label() { return uiI18n.t('app.today_24345a14'); } },
  { value: 'week', get label() { return uiI18n.t('app.this_week_7b72883e'); } },
  { value: 'month', get label() { return uiI18n.t('app.this_month_1b478533'); } },
  { value: 'all', get label() { return uiI18n.t('app.all_time_dbad49d8'); } },
] as const satisfies ReadonlyArray<ControlOption<MangaFeedTimeWindow>>;

const ORIGIN_OPTIONS = [
  { value: 'all', get label() { return uiI18n.t('app.any_origin_a6b1f00c'); } },
  { value: 'jp', get label() { return uiI18n.t('app.japan_manga_7ecb9133'); } },
  { value: 'kr', get label() { return uiI18n.t('app.korea_manhwa_013debbd'); } },
  { value: 'zh', get label() { return uiI18n.t('app.china_manhua_7ffbace8'); } },
] as const;

const SORT_LABELS: Record<MangaSortOption, string> = {
  relevance: 'Relevance',
  trending: 'Trending',
  latestUpdate: 'Latest update',
  rating: 'Highest rating',
  popularity: 'Popularity',
  chapterCount: 'Chapter count',
  follows: 'Most followed',
  newest: 'Newest',
};

/** Presets replace the old free-entry number inputs. See the file docblock. */
const MIN_SCORE_OPTIONS = [
  { value: '0', get label() { return uiI18n.t('app.any_rating_0aafdfb4'); } },
  { value: '9', label: '9+' },
  { value: '8', label: '8+' },
  { value: '7', label: '7+' },
  { value: '6', label: '6+' },
  { value: '5', label: '5+' },
] as const;

const MIN_CHAPTER_OPTIONS = [
  { value: '0', get label() { return uiI18n.t('app.any_length_4303876f'); } },
  { value: '10', get label() { return uiI18n.t('app.10_chapters_e197f158'); } },
  { value: '25', get label() { return uiI18n.t('app.25_chapters_9d6b158a'); } },
  { value: '50', get label() { return uiI18n.t('app.50_chapters_38803e0d'); } },
  { value: '100', get label() { return uiI18n.t('app.100_chapters_854acdff'); } },
  { value: '200', get label() { return uiI18n.t('app.200_chapters_6d93b8a5'); } },
  { value: '500', get label() { return uiI18n.t('app.500_chapters_59df847d'); } },
] as const;

const YEAR_OPTIONS: ReadonlyArray<ControlOption<string>> = [
  { value: '0', get label() { return uiI18n.t('app.any_year_57344265'); } },
  ...discoverYears().map((year) => ({ value: String(year), label: String(year) })),
];

type MangaTypeFilter = (typeof TYPE_OPTIONS)[number]['value'];
type MangaStatusFilter = (typeof STATUS_OPTIONS)[number]['value'];
type MangaSortFilter = 'default' | MangaSortOption;
type MangaDiscoverFeedMode = (typeof FEED_MODE_OPTIONS)[number]['value'];
type MangaOriginFilter = (typeof ORIGIN_OPTIONS)[number]['value'];

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
  return normalizeCatalogSort(value, Object.keys(SORT_LABELS) as MangaSortOption[]);
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

type MangaTagSource = 'anilist' | 'mangabaka';

function normalizeTagSource(value: string | null): MangaTagSource {
  return String(value || '').trim().toLowerCase() === 'mangabaka' ? 'mangabaka' : 'anilist';
}

function normalizeTags(value: string | null): string[] {
  const tags = String(value || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
  return [...new Set(tags)].slice(0, 10);
}

function parsePositiveNumberParam(value: string | null): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed;
}

/** Facet counts ride in the dropdown as a hint, not glued into the label. */
function formatCount(count: number | undefined): string | undefined {
  if (!Number.isFinite(count) || !count || count <= 0) return undefined;
  return count.toLocaleString(uiI18n.language);
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
  if (!genre) return uiI18n.t('app.all_genres_09ac5f61');
  return genre.replace(/-/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

interface CatalogPageArgs {
  page: number;
  genre: string;
  mangaType: MangaTypeFilter;
  mangaStatus: MangaStatusFilter;
  sort: MangaSortFilter;
  feedMode: MangaDiscoverFeedMode;
  feedWindow: MangaFeedTimeWindow;
  feedOrigin: MangaOriginFilter;
  tags: string[];
  tagSource: MangaTagSource;
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
    mangaType,
    mangaStatus,
    sort,
    feedMode,
    feedWindow,
    feedOrigin,
    tags,
    tagSource,
    minYear,
    minScore,
    minChapters,
    canShowAdult,
  } = args;
  // Tag search runs its own AniList/MangaBaka path (mode is ignored there,
  // but genre/type/origin/adult still scope it).
  const tagOptions = tags.length > 0 ? { tags, tagSource } : {};

  const isAdultGenre = genre === HENTAI_GENRE;
  const statuses = mangaStatus !== 'all' ? [mangaStatus] : undefined;
  // 'follows'/'newest' are catalogue labels — the backend keys them by their
  // AniList enum names, so translate before sending.
  const sortValue =
    sort === 'follows'
      ? 'FAVOURITES_DESC'
      : sort === 'newest'
        ? 'START_DATE_DESC'
        : sort !== 'default'
          ? sort
          : undefined;

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
      ...tagOptions,
    });
  }

  if (genre) {
    const genreMode = await searchManga('', page, PAGE_LIMIT, {
      mode: 'genre',
      genre,
      mangaType,
      adult: isAdultGenre,
      statuses,
      sort: sortValue,
      minYear,
      minScore,
      minChapters,
      requiresQuery: false,
      ...tagOptions,
    });

    if (Array.isArray(genreMode?.results) && genreMode.results.length > 0) {
      return genreMode;
    }

    return searchManga(`${genre} manga`, page, PAGE_LIMIT, {
      mode: 'search',
      mangaType,
      adult: isAdultGenre,
      statuses,
      sort: sortValue,
      minYear,
      minScore,
      minChapters,
      ...tagOptions,
    });
  }

  return searchManga('', page, PAGE_LIMIT, {
    mode: 'explore',
    mangaType,
    statuses,
    sort: sortValue,
    minYear,
    minScore,
    minChapters,
    requiresQuery: false,
    ...tagOptions,
  });
}

export default function MangaGenreBrowsePage() {
  useUiTranslation();
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

  const feedMode = normalizeFeedMode(searchParams.get('feed'));
  const feedWindow = normalizeFeedWindow(searchParams.get('window'));
  const feedOrigin = normalizeOrigin(searchParams.get('origin'));
  const mangaType = normalizeType(searchParams.get('type'));
  const mangaStatus = normalizeStatus(searchParams.get('status'));
  const sortMode = normalizeSort(searchParams.get('sort'));
  const minYear = parsePositiveNumberParam(searchParams.get('minYear'));
  const minScore = parsePositiveNumberParam(searchParams.get('minScore'));
  const minChapters = parsePositiveNumberParam(searchParams.get('minChapters'));
  const selectedTags = normalizeTags(searchParams.get('tags'));
  const tagSource = normalizeTagSource(searchParams.get('tagSource'));
  const [tagsOpen, setTagsOpen] = useState(selectedTags.length > 0);
  const [tagSearch, setTagSearch] = useState('');

  // Tag catalog for the picker (AniList or MangaBaka). Cached indefinitely —
  // taxonomies barely move — and only fetched once the picker opens.
  const { data: tagOptions = [], isLoading: tagsLoading } = useQuery({
    queryKey: ['manga-tag-options', tagSource],
    queryFn: () => getMangaTagOptions(tagSource),
    enabled: tagsOpen || selectedTags.length > 0,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: false,
  });

  const filteredTagOptions = useMemo(() => {
    const needle = tagSearch.trim().toLowerCase();
    return tagOptions
      .filter((tag) => {
        if (tag.isAdult && !canShowAdultEverywhere) return false;
        if (!needle) return true;
        return (
          tag.name.toLowerCase().includes(needle) ||
          (tag.category || '').toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tagOptions, tagSearch, canShowAdultEverywhere]);

  const toggleTag = (name: string) => {
    const next = selectedTags.includes(name)
      ? selectedTags.filter((tag) => tag !== name)
      : [...selectedTags, name];
    setParamAndNavigate({ tags: next.length > 0 ? next.join(',') : null });
  };

  // Group the picker cloud by taxonomy category for context. Uncategorized
  // tags sink to a trailing "General" group; the rest sort alphabetically.
  const tagGroups = useMemo<TagCloudGroup[]>(() => {
    const byCategory = new Map<string, TagCloudGroup>();
    for (const tag of filteredTagOptions) {
      const category = (tag.category || '').trim() || 'General';
      const group = byCategory.get(category) ?? { category, tags: [] };
      group.tags.push(tag);
      byCategory.set(category, group);
    }
    return [...byCategory.values()].sort((a, b) => {
      if (a.category === 'General') return 1;
      if (b.category === 'General') return -1;
      return a.category.localeCompare(b.category);
    });
  }, [filteredTagOptions]);

  const hasActiveFilters =
    feedMode !== 'auto' ||
    mangaType !== 'all' ||
    mangaStatus !== 'all' ||
    sortMode !== 'default' ||
    minYear > 0 ||
    minScore > 0 ||
    minChapters > 0 ||
    selectedTags.length > 0;

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
      { value: 'default', get label() { return uiI18n.t('app.default_order_e869f2d7'); } },
      ...(Object.keys(SORT_LABELS) as MangaSortOption[]).map((sort) => ({
        value: sort,
        label: SORT_LABELS[sort],
      })),
    ],
    [uiI18n.language],
  );

  /**
   * Every control writes through here. Default values are deleted rather than
   * written so a shared URL carries only what the user actually changed, and the
   * genre stays in the path — which is what `/manga/genre/:genre` links expect.
   */
  const setParamAndNavigate = (updates: Record<string, string | null>, nextGenre?: string) => {
    const nextParams = new URLSearchParams(searchParams);

    Object.entries(updates).forEach(([key, value]) => {
      if (!value || value === 'all' || value === 'default' || value === 'auto' || value === 'day' || value === 'anilist') {
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
      tags: null,
      tagSource: null,
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
      feedMode,
      feedWindow,
      feedOrigin,
      mangaType,
      mangaStatus,
      sortMode,
      selectedTags.join(','),
      tagSource,
      minYear,
      minScore,
      minChapters,
      canShowAdultEverywhere,
    ],
    queryFn: ({ pageParam = 1 }) =>
      fetchGenreCatalogPage({
        page: pageParam,
        genre: activeGenre,
        mangaType,
        mangaStatus,
        sort: sortMode,
        feedMode,
        feedWindow,
        feedOrigin,
        tags: selectedTags,
        tagSource,
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
      preservesCatalogPageOrder(sortMode)
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
            if (sortMode === 'newest') {
              return Number(right?.year || 0) - Number(left?.year || 0);
            }
            // 'follows' keeps the backend FAVOURITES_DESC order.
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
  const heading = headingGenre ? uiI18n.t('app.i18n_value_0_manga_eb4bc3e4', { value0: headingGenre }) : uiI18n.t('app.browse_manga_02b03cb4');
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
                {uiI18n.t('app.manga_home_a87aab56')}
              </Link>

              <p className="mt-6 text-[11px] font-bold uppercase tracking-[0.28em] text-primary">
                {uiI18n.t('app.manga_catalogue_303e4177')}
              </p>
              <h1 className="font-display mt-3 text-4xl font-black capitalize leading-[1.05] tracking-tight text-foreground sm:text-5xl xl:text-[3.75rem]">
                {heading}
              </h1>
              <p className="mt-4 max-w-lg text-sm leading-relaxed text-white/55 sm:text-base">
                {headingGenre
                  ? uiI18n.t('app.every_i18n_value_0_series_the_connected_provider_9543877b', { value0: headingGenre.toLowerCase() })
                  : uiI18n.t('app.everything_the_connected_providers_can_reach_in__6e05e386')}
              </p>

              <button
                type="button"
                onClick={() =>
                  gridTop.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
                className="group mt-7 inline-flex items-center gap-2 rounded-full bg-gradient-to-b from-primary to-secondary px-6 py-3 text-sm font-bold text-primary-foreground shadow-lg shadow-primary/25 transition-all hover:from-primary/90 hover:to-secondary/90 hover:shadow-primary/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                {uiI18n.t('app.browse_the_catalogue_8bb22f99')}
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
            title={activeGenre ? uiI18n.t('app.i18n_value_0_titles_8cbe4089', { value0: headingGenre }) : uiI18n.t('app.all_titles_38b6e60e')}
            meta={
              posters.length > 0
                ? `${posters.length.toLocaleString(uiI18n.language)} loaded${
                    discoverQuery.hasNextPage ? ' · more available' : ''
                  }`
                : undefined
            }
          />

          <PillGroup
            className="mt-6"
            label={uiI18n.t('app.genre_2aa31fca')}
            options={genrePills}
            value={activeGenre}
            onChange={(next) => setParamAndNavigate({}, next)}
          />

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <ControlSelect
              label={uiI18n.t('app.feed_ff1928e5')}
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
                label={uiI18n.t('app.window_41dfc0a6')}
                icon={Clock}
                value={feedWindow}
                options={FEED_WINDOW_OPTIONS}
                neutral={['day']}
                onChange={(next) => setParamAndNavigate({ window: next })}
              />
            )}

            {feedMode === 'origin' && (
              <ControlSelect
                label={uiI18n.t('app.origin_44ab85a2')}
                icon={Globe}
                value={feedOrigin}
                options={ORIGIN_OPTIONS}
                neutral={['all']}
                onChange={(next) => setParamAndNavigate({ origin: next })}
              />
            )}
            {/* Facet counts ride along as hints where the schema reports them —
                the providers disagree on the group's name, hence the key lists. */}
            <ControlSelect
              label={uiI18n.t('app.type_3deb7456')}
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
              label={uiI18n.t('app.status_bae7d5be')}
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
              label={uiI18n.t('app.sort_adc4e96a')}
              icon={ListOrdered}
              value={sortMode}
              options={sortOptions}
              neutral={['default']}
              onChange={(next) => setParamAndNavigate({ sort: next })}
            />

            <ControlSelect
              label={uiI18n.t('app.year_879e3232')}
              icon={CalendarRange}
              value={String(minYear || 0)}
              options={YEAR_OPTIONS}
              neutral={['0']}
              onChange={(next) => setParamAndNavigate({ minYear: next === '0' ? null : next })}
            />

            <ControlSelect
              label={uiI18n.t('app.rating_6437b7bf')}
              icon={Star}
              value={String(minScore || 0)}
              options={MIN_SCORE_OPTIONS}
              neutral={['0']}
              onChange={(next) => setParamAndNavigate({ minScore: next === '0' ? null : next })}
            />

            <ControlSelect
              label={uiI18n.t('app.length_3bade34e')}
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
                {uiI18n.t('app.reset_44c57abd')}
              </button>
            )}
          </div>

          {/* Tags — AniList or MangaBaka catalog. Tag search runs its own
              backend path, so tags compose with genre/type/status/year. */}
          <div className="mt-3 rounded-2xl border border-white/[0.07] bg-white/[0.015] p-3 md:p-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setTagsOpen((open) => !open)}
                aria-expanded={tagsOpen}
                className={cn(
                  controlTriggerClass,
                  selectedTags.length > 0 && 'border-primary/50 text-primary',
                )}
              >
                <Tag className="h-3.5 w-3.5 opacity-60" />
                {uiI18n.t('app.tags_848eed0f')}
                {selectedTags.length > 0 && (
                  <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-black text-primary-foreground">
                    {selectedTags.length}
                  </span>
                )}
                <ChevronDown className={cn('h-3.5 w-3.5 opacity-60 transition-transform', tagsOpen && 'rotate-180')} />
              </button>

              <div className="flex rounded-full border border-white/10 bg-white/[0.02] p-0.5">
                {(['anilist', 'mangabaka'] as const).map((source) => (
                  <button
                    key={source}
                    type="button"
                    onClick={() => {
                      if (source === tagSource) return;
                      // Catalogs don't share tag names — reselect on switch.
                      setParamAndNavigate({
                        tagSource: source === 'anilist' ? null : source,
                        tags: null,
                      });
                    }}
                    className={cn(
                      'rounded-full px-3 py-1 text-[11px] font-bold transition-all active:scale-95',
                      tagSource === source
                        ? 'bg-primary text-primary-foreground shadow'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {source === 'anilist' ? uiI18n.t('app.anilist_c03a6787') : uiI18n.t('app.mangabaka_c4dfa49b')}
                  </button>
                ))}
              </div>

              {selectedTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  title={uiI18n.t('app.remove_tag_bc7b89e4')}
                  onClick={() => toggleTag(tag)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-primary/50 bg-primary/15 px-2.5 py-1 text-[11px] font-bold text-primary transition-colors hover:bg-primary/25"
                >
                  {tag}
                  <X className="h-3 w-3" />
                </button>
              ))}
            </div>

            {tagsOpen && (
              <div className="mt-3 space-y-2">
                <Input
                  value={tagSearch}
                  onChange={(event) => setTagSearch(event.target.value)}
                  placeholder={uiI18n.t('app.search_i18n_value_0_tags_71e73aa6', { value0: tagSource === 'anilist' ? 'AniList' : 'MangaBaka' })}
                  className="h-9 rounded-xl border-white/10 bg-background/80 text-xs focus:border-primary/50"
                />
                {tagsLoading ? (
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: 12 }).map((_, i) => (
                      <div key={i} className="h-7 w-20 animate-pulse rounded-lg bg-white/[0.05]" />
                    ))}
                  </div>
                ) : filteredTagOptions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {tagOptions.length === 0
                      ? uiI18n.t('app.the_tag_catalog_did_not_load_check_your_connecti_957f055c')
                      : uiI18n.t('app.no_tags_match_that_search_b5b4f8be')}
                  </p>
                ) : (
                  <TagGroupCloud
                    groups={tagGroups}
                    selected={selectedTags}
                    onToggle={toggleTag}
                    maxHeightClass="max-h-56"
                    emptyText={uiI18n.t('app.no_tags_match_that_search_b5b4f8be')}
                  />
                )}
              </div>
            )}
          </div>
          {failedProviders.length > 0 && (
            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber/25 bg-amber/[0.06] px-4 py-3">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
              <p className="text-xs leading-relaxed text-white/60">
                <span className="font-bold text-amber">{uiI18n.t('app.partial_results_429f4085')}</span>{' '}
                {failedProviders.join(', ')} {uiI18n.t('app.did_not_answer_so_anything_only_they_carry_is_mi_cbff67fa')}
              </p>
            </div>
          )}

          <div className="mt-8">
            {isAdultGenreLocked ? (
              <div className="flex flex-col items-center justify-center rounded-3xl border border-destructive/25 bg-destructive/[0.06] px-6 py-20 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/15">
                  <ShieldAlert className="h-7 w-7 text-destructive" />
                </span>
                <p className="mt-5 text-lg font-bold">{uiI18n.t('app.mature_content_is_switched_off_1f236f08')}</p>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-white/55">
                  {uiI18n.t('app.this_genre_returns_adult_titles_only_and_your_co_5fec630e')}
                </p>
                <button
                  type="button"
                  onClick={() => openSettings('privacy', 'mature-content-controls')}
                  className="group mt-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-5 py-2.5 text-sm font-semibold text-white/75 transition-colors hover:border-white/25 hover:text-white"
                >
                  {uiI18n.t('app.open_content_settings_1bac12e2')}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </button>
              </div>
            ) : isInitialLoading ? (
              <PosterGridSkeleton />
            ) : discoverQuery.isError ? (
              <div className="flex flex-col items-center justify-center rounded-3xl border border-destructive/25 bg-destructive/[0.06] px-6 py-20 text-center">
                <TriangleAlert className="h-9 w-9 text-destructive" />
                <p className="mt-4 text-lg font-bold">{uiI18n.t('app.the_catalogue_did_not_load_7df4b326')}</p>
                <p className="mt-1 max-w-sm text-sm text-white/55">
                  {uiI18n.t('app.every_provider_failed_for_this_query_retry_or_dr_c4e71f44')}
                </p>
                <button
                  type="button"
                  onClick={() => discoverQuery.refetch()}
                  className={cn(PAGER_CLASS, 'mt-6')}
                >
                  <RotateCcw className="h-4 w-4" />
                  {uiI18n.t('app.try_again_042c862e')}
                </button>
              </div>
            ) : posters.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-3xl border border-white/[0.07] bg-white/[0.02] py-24 text-center">
                <SearchX className="h-10 w-10 text-muted-foreground/60" />
                <p className="mt-4 text-lg font-semibold">{uiI18n.t('app.nothing_matches_those_filters_cba264ec')}</p>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  {hasActiveFilters
                    ? uiI18n.t('app.the_providers_returned_nothing_for_this_combinat_6407260b')
                    : uiI18n.t('app.no_provider_returned_a_title_for_this_genre_try__3d4b803f')}
                </p>
                {hasActiveFilters && (
                  <button type="button" onClick={resetFilters} className={cn(PAGER_CLASS, 'mt-6')}>
                    <RotateCcw className="h-4 w-4" />
                    {uiI18n.t('app.reset_filters_56553100')}
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
                    {uiI18n.t('app.loading_8f26c652')}
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
