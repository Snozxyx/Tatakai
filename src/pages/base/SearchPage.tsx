import { ThemedCheckbox } from '@/components/ui/themed-checkbox';
import { ThemedSelect } from '@/components/ui/themed-select';
import uiI18n from '@/lib/uiI18n';
import { searchCompatibility } from '@/core/extensions/compatibility/content';
import { EXTENSION_INSTALLED_EVENT } from '@/core/extensions/ecosystems';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
import { useSearchParams, useNavigate, useParams } from "react-router-dom";
import { Background } from "@/components/layout/Background";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { HeaderSearchSuggestions } from "@/components/layout/HeaderSearchSuggestions";
// import { Header } from "@/components/layout/Header";
import { useIsNativeApp, useIsDesktopApp } from "@/hooks/ui/useIsNativeApp";
import { useIsMobile } from "@/hooks/ui/use-mobile";
import { cn } from "@/lib/utils";
import { CardSkeleton } from "@/components/ui/skeleton-custom";
import { Input } from "@/components/ui/input";
import { Search, X, Loader2, Film, User, ExternalLink, Users, BookOpen, Camera, Puzzle, ArrowRight, SlidersHorizontal, ChevronRight, Sparkles, Play, Tags } from "lucide-react";
import { useAniListCharacterSearch } from '@/hooks/user/useProfileFeatures';
import { ANILIST_GRAPHQL_ENDPOINT, resolveApiV3Base } from '@/lib/api/backendOrigin';
import { GlassPanel } from "@/components/ui/GlassPanel";
import { useAniListGenres } from "@/hooks/api/useAniListGenres";
import { useInfiniteSearch as useInfSearch, type AnimeSearchFilters, useEpisodeTitleSearch } from "@/hooks/api/useAnimeData";
import { useInfiniteMangaSearch } from "@/hooks/api/useMangaData";
import { useInfiniteNovelSearch } from "@/hooks/api/useNovelData";
import type { NovelSearchOptions } from "@/core/content/novel-client";
import { NovelSearchFilters } from '@/components/novel/NovelSearchFilters';
import { useRef, useCallback, useState, useEffect, useMemo } from "react";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { searchCharacters } from "@/core/content/character-client";
import { fetchProducerAnimes } from "@/lib/api";
import { getMangaTagOptions } from "@/core/content/manga-tag-search";
import { AppliedFilters } from '@/components/search/AppliedFilters';
import { Button } from '@/components/ui/button';
import { type MangaSearchOptions } from "@/core/content/manga-client";
import { getProxiedImageUrl } from "@/lib/api";
import { UnifiedMediaCard } from "@/components/UnifiedMediaCard";
import { useContentSafetySettings } from "@/hooks/user/useContentSafetySettings";
import { isExplicitExtensionContent } from '@/lib/contentSafety';
import { isExplicitMangaSearchQuery, inferMangaAdultFlag, inferAnimeAdultFlag } from "@/lib/contentSafety";
import { extensionRegistry } from "@/core/extensions/ExtensionRegistry";
import { DiscoverHero } from '@/components/anime/discover/DiscoverHero';
import { PillGroup } from '@/components/anime/discover/PillGroup';
import { POSTER_GRID_CLASS, PosterGridSkeleton, DiscoverPosterGrid } from '@/components/anime/discover/DiscoverPosterGrid';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Check, ChevronDown, Tag } from 'lucide-react';
import { TagGroupCloud } from '@/components/manga/TagGroupCloud';
import { discoverYears, DISCOVER_SORTS, type DiscoverSort, useDiscoverMedia } from '@/hooks/api/useDiscover';
import { controlItemClass, controlMenuClass, controlTriggerClass } from '@/components/anime/discover/types';
import { celebrate, type CelebrateVariant } from '@/components/effects/Celebrate';

function useExtensionSearch(query: string, enabled: boolean, kind?: 'watch' | 'read') {
  useUiTranslation();
  const [revision, setRevision] = useState(0);
  useEffect(() => { const changed = () => setRevision(v => v + 1); window.addEventListener(EXTENSION_INSTALLED_EVENT, changed); return () => window.removeEventListener(EXTENSION_INSTALLED_EVENT, changed); }, []);
  return useQuery({
    queryKey: ['extension-search', query, kind, revision],
    queryFn: async ({ signal }) => {
      const providers = kind === 'read' ? [] : extensionRegistry.getSearchProviders();
      const compatibility = searchCompatibility(query, kind, signal).catch(() => []);
      const results = await Promise.all(
        providers.map(async (provider) => {
          try {
            const providerResults = await provider.search(query);
            return providerResults.map(r => ({ ...r, providerName: provider.name }));
          } catch (err) {
            console.error(`Search provider ${provider.name} failed:`, err);
            return [];
          }
        })
      );
      const nativeResults = await compatibility;
      signal.throwIfAborted();
      return [...results.flat(), ...nativeResults];
    },
    enabled: enabled && query.length > 2,
    staleTime: 5 * 60 * 1000,
  });
}


export default function SearchPage() {
  useUiTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { producerName } = useParams<{ producerName?: string }>();
  const navigate = useNavigate();
  const isNative = useIsNativeApp();
  const isDesktopApp = useIsDesktopApp();
  const isMobile = useIsMobile();
  const decodedProducerName = useMemo(() => {
    if (!producerName) return "";

    try {
      return decodeURIComponent(producerName).trim();
    } catch {
      return producerName.trim();
    }
  }, [producerName]);
  const isProducerRoute = decodedProducerName.length > 0;

  const producerRequestCandidates = useMemo(() => {
    if (!decodedProducerName) return [];

    const slug = decodedProducerName
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    return Array.from(new Set([decodedProducerName, slug].map((value) => value.trim()).filter(Boolean)));
  }, [decodedProducerName]);

  const queryParam = searchParams.get("q") || decodedProducerName || "";
  const [query, setQuery] = useState(queryParam);
  const [searchInput, setSearchInput] = useState(queryParam);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const closeSuggestions = useCallback(() => setShowSuggestions(false), []);

  // Secret search phrases: typing one exactly fires a celebration flourish and
  // nothing else — results are untouched. Guarded so it fires once per phrase,
  // not on every keystroke. celebrate() is a no-op under reduced motion.
  const firedPhraseRef = useRef<string>('');
  useEffect(() => {
    const SECRET: Record<string, CelebrateVariant> = {
      tatakai: 'petal',
      'over 9000': 'spark',
      konami: 'confetti',
      'plus ultra': 'spark',
    };
    const normalized = searchInput.trim().toLowerCase().replace(/\s+/g, ' ');
    if (normalized in SECRET) {
      if (firedPhraseRef.current !== normalized) {
        firedPhraseRef.current = normalized;
        celebrate({ variant: SECRET[normalized], count: 22 });
      }
    } else {
      firedPhraseRef.current = '';
    }
  }, [searchInput]);
  const [page, setPage] = useState(1);
  const [resultType, setResultType] = useState<'all' | 'anime' | 'manga' | 'novel' | 'character'>(() => {
    const t = searchParams.get("type");
    if (t === 'manga') return 'manga';
    if (t === 'novel') return 'novel';
    if (t === 'anime') return 'anime';
    if (t === 'character') return 'character';
    return 'all';
  });
  const [enableSecondaryResultStreams, setEnableSecondaryResultStreams] = useState(false);
  const [animeTypeFilter, setAnimeTypeFilter] = useState<string>('all');
  const [animeStatusFilter, setAnimeStatusFilter] = useState<string>('all');
  const [animeGenreFilter, setAnimeGenreFilter] = useState<string>('all');
  const [animeSortFilter, setAnimeSortFilter] = useState<string>('default');
  const [mangaTypeFilter, setMangaTypeFilter] = useState<string>('all');
  const [mangaStatusFilter, setMangaStatusFilter] = useState<string>('all');
  const [mangaOrigin, setMangaOrigin] = useState<string>('all');
  const [mangaGenreFilter, setMangaGenreFilter] = useState<string>(() => {
    const g = searchParams.get("genre");
    return g ? g.trim() : 'all';
  });
  const [mangaAdultFilter, setMangaAdultFilter] = useState(false);
  const [novelFilters, setNovelFilters] = useState<NovelSearchOptions>({});
  const [localNovelFilters, setLocalNovelFilters] = useState<NovelSearchOptions>({});
  const novelFilterActive = Object.entries(novelFilters).some(([key, value]) => key !== 'tagSource' && (Array.isArray(value) ? value.length > 0 : Boolean(value)));
  const [minRating, setMinRating] = useState<number>(0);
  const [minReleaseYear, setMinReleaseYear] = useState<number>(0);
  const [maxRating, setMaxRating] = useState<number>(0);
  const [maxReleaseYear, setMaxReleaseYear] = useState<number>(0);
  const [seasonFilter, setSeasonFilter] = useState<string>('all');
  const [minEpisodes, setMinEpisodes] = useState<number>(0);
  const [maxEpisodes, setMaxEpisodes] = useState<number>(0);
  const [sortMode, setSortMode] = useState<'relevance' | 'rating' | 'title' | 'popularity'>('relevance');
  const [discoverSort, setDiscoverSort] = useState<DiscoverSort>('for-you');

  const handleDiscoverSortChange = (newSort: DiscoverSort) => {
    setDiscoverSort(newSort);
    if (newSort === 'for-you') {
      setSortMode('relevance');
      setAnimeSortFilter('default');
    } else if (newSort === 'top-rated') {
      setSortMode('rating');
      setAnimeSortFilter('score_desc');
    } else if (newSort === 'newest') {
      setSortMode('relevance');
      setAnimeSortFilter('start_date_desc');
    } else if (newSort === 'a-z') {
      setSortMode('title');
      setAnimeSortFilter('title_asc');
    }
  };

  const [imageConfidenceThreshold, setImageConfidenceThreshold] = useState<number>(0.85);
  const [showAdvancedAssist, setShowAdvancedAssist] = useState(false);
  const [selectedAnimeTags, setSelectedAnimeTags] = useState<string[]>(() => {
    const values = searchParams.getAll('animeTag');
    const packed = searchParams.get('animeTags');
    const typeParam = searchParams.get('type');
    const generic = typeParam !== 'manga' && typeParam !== 'novel' ? searchParams.getAll('tag').concat(searchParams.get('tags')?.split(',') ?? []) : [];
    return Array.from(new Set([...values, ...(packed ? packed.split(',') : []), ...generic].filter(Boolean)));
  });
  const [selectedMangaTags, setSelectedMangaTags] = useState<string[]>(() => {
    const values = searchParams.getAll('mangaTag').concat(searchParams.getAll('manwhaTag'));
    const packed = searchParams.get('mangaTags') || searchParams.get('manwhaTags');
    const typeParam = searchParams.get('type');
    const generic = typeParam === 'manga' ? searchParams.getAll('tag').concat(searchParams.get('tags')?.split(',') ?? []) : [];
    return Array.from(new Set([...values, ...(packed ? packed.split(',') : []), ...generic].filter(Boolean)));
  });
  const [mangaTagSource, setMangaTagSource] = useState<'anilist' | 'mangabaka' | undefined>(() => {
    const source = searchParams.get('mangaTagSource');
    return source === 'anilist' || source === 'mangabaka' ? source : undefined;
  });
  const { data: mangaBakaTags = [] } = useQuery({
    queryKey: ['mangabaka-tags'], queryFn: () => getMangaTagOptions('mangabaka'),
    enabled: showAdvancedAssist && mangaTagSource === 'mangabaka', staleTime: 24 * 60 * 60 * 1000,
  });
  const [tagSearch, setTagSearch] = useState('');
  const [mangaTagSearch, setMangaTagSearch] = useState('');
  const [showSpoilerTags, setShowSpoilerTags] = useState(false);

  const { data: anilistTags = [] } = useQuery({
    queryKey: ['anilist-media-tags'],
    queryFn: () => getMangaTagOptions('anilist'),
    staleTime: 24 * 60 * 60 * 1000,
    enabled: showAdvancedAssist,
  });

  // Local state for filters to avoid triggering searches on every change
  const [localAnimeType, setLocalAnimeType] = useState(animeTypeFilter);
  const [localAnimeStatus, setLocalAnimeStatus] = useState(animeStatusFilter);
  const [localAnimeGenre, setLocalAnimeGenre] = useState(animeGenreFilter);
  const [localAnimeSort, setLocalAnimeSort] = useState(animeSortFilter);
  const [localMangaType, setLocalMangaType] = useState(mangaTypeFilter);
  const [localMangaStatus, setLocalMangaStatus] = useState(mangaStatusFilter);
  const [localMangaOrigin, setLocalMangaOrigin] = useState(mangaOrigin);
  const [localMangaGenre, setLocalMangaGenre] = useState(mangaGenreFilter);
  const [localMinRating, setLocalMinRating] = useState(minRating);
  const [localMinReleaseYear, setLocalMinReleaseYear] = useState(minReleaseYear);
  const [localMaxRating, setLocalMaxRating] = useState(maxRating);
  const [localMaxReleaseYear, setLocalMaxReleaseYear] = useState(maxReleaseYear);
  const [localSeason, setLocalSeason] = useState(seasonFilter);
  const [localMinEpisodes, setLocalMinEpisodes] = useState(minEpisodes);
  const [localMaxEpisodes, setLocalMaxEpisodes] = useState(maxEpisodes);
  const [localSortMode, setLocalSortMode] = useState(sortMode);
  const [localMangaAdult, setLocalMangaAdult] = useState(mangaAdultFilter);

  const applyFilters = () => {
    setNovelFilters(localNovelFilters);
    setAnimeTypeFilter(localAnimeType);
    setAnimeStatusFilter(localAnimeStatus);
    // Keep anime + manga genre filters in sync so AniList results cover both media types
    const sharedGenre = localAnimeGenre !== 'all' ? localAnimeGenre : localMangaGenre;
    setAnimeGenreFilter(sharedGenre);
    setLocalAnimeGenre(sharedGenre);
    setMangaGenreFilter(sharedGenre);
    setLocalMangaGenre(sharedGenre);
    setAnimeSortFilter(localAnimeSort);
    setMangaTypeFilter(localMangaType);
    setMangaStatusFilter(localMangaStatus);
    setMangaOrigin(localMangaOrigin);
    setMinRating(localMinRating);
    setMinReleaseYear(localMinReleaseYear);
    setMaxRating(localMaxRating);
    setMaxReleaseYear(localMaxReleaseYear);
    setSeasonFilter(localSeason);
    setMinEpisodes(localMinEpisodes);
    setMaxEpisodes(localMaxEpisodes);
    setSortMode(localSortMode);
    setMangaAdultFilter(localMangaAdult);
    setPage(1);
  };

  useEffect(() => {
    setLocalAnimeType(animeTypeFilter);
    setLocalAnimeStatus(animeStatusFilter);
    setLocalAnimeGenre(animeGenreFilter);
    setLocalAnimeSort(animeSortFilter);
    setLocalMangaType(mangaTypeFilter);
    setLocalMangaStatus(mangaStatusFilter);
    setLocalMangaOrigin(mangaOrigin);
    setLocalMangaGenre(mangaGenreFilter);
    setLocalMinRating(minRating);
    setLocalMinReleaseYear(minReleaseYear);
    setLocalMaxRating(maxRating);
    setLocalMaxReleaseYear(maxReleaseYear);
    setLocalSeason(seasonFilter);
    setLocalMinEpisodes(minEpisodes);
    setLocalMaxEpisodes(maxEpisodes);
    setLocalSortMode(sortMode);
    setLocalMangaAdult(mangaAdultFilter);
  }, [
    animeTypeFilter,
    animeStatusFilter,
    animeGenreFilter,
    animeSortFilter,
    mangaTypeFilter,
    mangaStatusFilter,
    mangaOrigin,
    mangaGenreFilter,
    minRating,
    minReleaseYear,
    maxRating,
    maxReleaseYear,
    seasonFilter,
    minEpisodes,
    maxEpisodes,
    sortMode,
    mangaAdultFilter,
  ]);

  const shouldSearchAnime = resultType === 'all' || resultType === 'anime';
  const shouldSearchManga = (resultType === 'all' || resultType === 'manga') && !isProducerRoute;
  const shouldSearchNovels = (resultType === 'all' || resultType === 'novel') && !isProducerRoute;
  const shouldSearchCharacters = (resultType === 'all' || resultType === 'character') && !isProducerRoute;
  const shouldDelaySecondaryStreams = resultType === 'all' && query.length > 0 && !isProducerRoute;
  const shouldEnableCharacterSearch =
    shouldSearchCharacters && (!shouldDelaySecondaryStreams || enableSecondaryResultStreams);
  const { settings: contentSafetySettings } = useContentSafetySettings();
  const { genres: anilistGenres } = useAniListGenres();
  // Group tag options by AniList category, hiding general-spoiler tags unless
  // the viewer opts in. Returns [{ category, tags }] sorted by category name.
  const groupTagOptions = useCallback((term: string, collection = anilistTags) => {
    const needle = term.trim().toLowerCase();
    const rows = collection
      .filter((tag) => !tag.isAdult || contentSafetySettings.showAdultEverywhere)
      .filter((tag) => showSpoilerTags || !tag.isGeneralSpoiler)
      .filter((tag) => !needle || tag.name.toLowerCase().includes(needle) || tag.category?.toLowerCase().includes(needle));

    const buckets = new Map<string, typeof rows>();
    for (const tag of rows) {
      const category = (tag.category || 'Other').trim() || 'Other';
      const bucket = buckets.get(category);
      if (bucket) bucket.push(tag);
      else buckets.set(category, [tag]);
    }
    return Array.from(buckets.entries())
      .map(([category, tags]) => ({
        category,
        tags: tags.slice().sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.category.localeCompare(b.category));
  }, [anilistTags, contentSafetySettings.showAdultEverywhere, showSpoilerTags]);

  const filteredTagOptions = useMemo(() => groupTagOptions(tagSearch), [groupTagOptions, tagSearch]);
  const filteredMangaTagOptions = useMemo(() => groupTagOptions(mangaTagSearch, mangaTagSource === 'mangabaka' ? mangaBakaTags : anilistTags), [groupTagOptions, mangaTagSearch, mangaTagSource, mangaBakaTags, anilistTags]);
  const explicitMangaQuery = useMemo(() => isExplicitMangaSearchQuery(query), [query]);
  const allowAdultAnime = useMemo(
    () => contentSafetySettings.showAdultEverywhere || explicitMangaQuery,
    [contentSafetySettings.showAdultEverywhere, explicitMangaQuery],
  );
  const animeFilterActive = useMemo(() => {
    return (
      animeTypeFilter !== 'all' ||
      animeStatusFilter !== 'all' ||
      animeGenreFilter !== 'all' ||
      animeSortFilter !== 'default' ||
      minRating > 0 ||
      minReleaseYear > 0 ||
      maxRating > 0 ||
      maxReleaseYear > 0 ||
      seasonFilter !== 'all' ||
      minEpisodes > 0 ||
      maxEpisodes > 0 ||
      selectedAnimeTags.length > 0
    );
  }, [
    animeTypeFilter,
    animeStatusFilter,
    animeGenreFilter,
    animeSortFilter,
    minRating,
    minReleaseYear,
    maxRating,
    maxReleaseYear,
    seasonFilter,
    minEpisodes,
    maxEpisodes,
    selectedAnimeTags,
  ]);

  const animeGenreOptions = useMemo(() => {
    const normalizeGenreValue = (value: string) => {
      const normalized = String(value || '').toLowerCase().trim();
      if (!normalized) return '';
      if (normalized === 'mahou shoujo') return 'magic';

      return normalized
        .replace(/&/g, '-and-')
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
    };

    return anilistGenres.map((genre) => ({
      label: genre,
      value: normalizeGenreValue(genre),
    })).filter((option, index, rows) => {
      if (!option.value) return false;
      return rows.findIndex((row) => row.value === option.value) === index;
    });
  }, [anilistGenres]);

  const normalizeAnimeStatus = useCallback((value: string | undefined) => {
    const normalized = String(value || '').toLowerCase().replace(/[_\s]+/g, '-');

    if (normalized.includes('finished') || normalized.includes('completed')) return 'finished-airing';
    if (normalized.includes('currently') || normalized === 'airing' || normalized.includes('releasing')) return 'currently-airing';
    if (normalized.includes('not-yet') || normalized.includes('upcoming')) return 'not-yet-aired';

    return normalized;
  }, []);

  const normalizeAnimeGenre = useCallback((value: string | undefined) => {
    const normalized = String(value || '').toLowerCase().trim();
    if (!normalized) return '';
    if (normalized === 'mahou shoujo') return 'magic';

    return normalized
      .replace(/&/g, '-and-')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }, []);

  const resolvedAnimeGenre = useMemo(() => {
    if (animeGenreFilter === 'all') return undefined;
    const match = animeGenreOptions.find((genre) => genre.value === animeGenreFilter);
    return match?.label ?? animeGenreFilter;
  }, [animeGenreFilter, animeGenreOptions]);

  /** AniList expects Title Case genre names for manga too */
  const resolvedMangaGenre = useMemo(() => {
    if (mangaGenreFilter === 'all') return undefined;
    const match = animeGenreOptions.find((genre) => genre.value === mangaGenreFilter);
    if (match?.label) return match.label;
    // Fallback: title-case slug
    return String(mangaGenreFilter)
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }, [mangaGenreFilter, animeGenreOptions]);

  const genreFilterActive = animeGenreFilter !== 'all' || mangaGenreFilter !== 'all';
  const tagFilterActive = selectedAnimeTags.length > 0 || selectedMangaTags.length > 0;
  const mangaFilterActive = useMemo(() => {
    return (
      mangaGenreFilter !== 'all' ||
      mangaTypeFilter !== 'all' ||
      mangaStatusFilter !== 'all' ||
      mangaOrigin !== 'all' ||
      mangaAdultFilter
    );
  }, [mangaGenreFilter, mangaTypeFilter, mangaStatusFilter, mangaAdultFilter]);

  const shouldEnableMangaSearch =
    shouldSearchManga &&
    (query.length > 0 || mangaFilterActive || genreFilterActive || tagFilterActive) &&
    (!shouldDelaySecondaryStreams || enableSecondaryResultStreams || genreFilterActive || mangaFilterActive || tagFilterActive);

  const normalizedMangaTypeFilter = useMemo(() => {
    const normalized = String(mangaTypeFilter || '').toLowerCase();
    if (normalized === 'manwha' || normalized === 'manwah') return 'manhwa';
    return normalized;
  }, [mangaTypeFilter]);

  const mangaSearchMode = useMemo<MangaSearchOptions['mode']>(() => {
    if (query.trim()) return 'search';
    if (mangaGenreFilter !== 'all') return 'genre';
    if (normalizedMangaTypeFilter !== 'all' && !query.trim()) return 'category';
    if (mangaAdultFilter) {
      return 'explore';
    }
    return 'search';
  }, [
    mangaGenreFilter,
    normalizedMangaTypeFilter,
    query,
    mangaAdultFilter,
  ]);

  const animeBackendFilters = useMemo<AnimeSearchFilters>(() => {
    const filters: AnimeSearchFilters = {};
    if (animeTypeFilter !== 'all') filters.type = animeTypeFilter;
    if (animeStatusFilter !== 'all') filters.status = animeStatusFilter;
    if (resolvedAnimeGenre) filters.genres = [resolvedAnimeGenre];
    if (animeSortFilter !== 'default') filters.sort = animeSortFilter;
    if (minRating > 0) filters.minRating = minRating;
    if (minReleaseYear > 0) filters.minReleaseYear = minReleaseYear;
    if (maxRating > 0) filters.maxRating = maxRating;
    if (maxReleaseYear > 0) filters.maxReleaseYear = maxReleaseYear;
    if (seasonFilter !== 'all') filters.season = seasonFilter;
    if (minEpisodes > 0) filters.minEpisodes = minEpisodes;
    if (maxEpisodes > 0) filters.maxEpisodes = maxEpisodes;
    if (selectedAnimeTags.length > 0) filters.tags = selectedAnimeTags;
    filters.isAdult = allowAdultAnime ? true : false;
    return filters;
  }, [
    animeTypeFilter,
    animeStatusFilter,
    animeGenreFilter,
    animeSortFilter,
    minRating,
    minReleaseYear,
    maxRating,
    maxReleaseYear,
    seasonFilter,
    minEpisodes,
    maxEpisodes,
    allowAdultAnime,
    selectedAnimeTags,
  ]);

  const mangaSearchOptions = useMemo<MangaSearchOptions>(() => {
    const types: string[] = [];

    if (normalizedMangaTypeFilter !== 'all') {
      if (normalizedMangaTypeFilter === 'manga') types.push('Manga');
      if (normalizedMangaTypeFilter === 'manhwa') types.push('Manwha');
      if (normalizedMangaTypeFilter === 'manhua') types.push('Manhua');
      if (normalizedMangaTypeFilter === 'comics') types.push('OEL');
    }

    const hasGenre = Boolean(resolvedMangaGenre);
    return {
      mode: hasGenre ? 'genre' : mangaSearchMode,
      provider: 'all',
      genre: resolvedMangaGenre,
      tags: selectedMangaTags,
      tagSource: mangaTagSource,
      origin: mangaOrigin === 'all' ? undefined : mangaOrigin,
      sort: hasGenre ? 'POPULARITY_DESC' : undefined,
      adult: mangaAdultFilter || explicitMangaQuery || contentSafetySettings.showAdultEverywhere,
      types: types.length > 0 ? Array.from(new Set(types)) : undefined,
      mangaType: normalizedMangaTypeFilter !== 'all' ? (normalizedMangaTypeFilter as any) : undefined,
      // Allow genre-only AniList browse (no text query required)
      requiresQuery: !(hasGenre || selectedMangaTags.length > 0 || mangaOrigin !== 'all' || mangaSearchMode === 'genre' || mangaSearchMode === 'explore' || mangaSearchMode === 'latest' || mangaSearchMode === 'category'),
    };
  }, [
    mangaSearchMode,
    resolvedMangaGenre,
    mangaAdultFilter,
    explicitMangaQuery,
    contentSafetySettings.showAdultEverywhere,
    normalizedMangaTypeFilter,
    selectedMangaTags,
    mangaTagSource,
    mangaOrigin,
  ]);

  const atsuGenreOptions = useMemo(() => {
    // Use the full AniList genre list so manga tag-based navigation finds a match.
    // These are the genre names AniList accepts for manga searches.
    return [
      "Action", "Adventure", "Comedy", "Drama", "Ecchi", "Fantasy", "Hentai",
      "Horror", "Mahou Shoujo", "Mecha", "Music", "Mystery", "Psychological",
      "Romance", "Sci-Fi", "Slice of Life", "Sports", "Supernatural", "Thriller",
      // Common manga-specific tags promoted to top-level options
      "Isekai", "Shounen", "Shoujo", "Seinen", "Josei",
      "Martial Arts", "Historical", "School", "Supernatural", "Demons",
      "Game", "Harem", "Military", "Parody", "Police", "Samurai", "Space",
      "Super Power", "Vampire", "Yaoi", "Yuri",
    ]
      // Dedupe preserving first occurrence
      .filter((g, i, arr) => arr.indexOf(g) === i)
      .sort()
      .map((genre) => ({
        label: genre,
        value: genre.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
      }));
  }, []);

  const shouldEnableAnimeSearch =
    shouldSearchAnime && !isProducerRoute && (query.length > 0 || animeFilterActive || genreFilterActive || tagFilterActive);

  const {
    data: infiniteData,
    fetchNextPage: fetchNextSearchPage,
    hasNextPage: hasNextSearchPage,
    isFetchingNextPage: isFetchingNextSearchPage,
    isLoading: isLoadingSearch,
  } = useInfSearch(query, animeBackendFilters, shouldEnableAnimeSearch, animeFilterActive || selectedAnimeTags.length > 0);

  const {
    data: producerInfiniteData,
    fetchNextPage: fetchNextProducerPage,
    hasNextPage: hasNextProducerPage,
    isFetchingNextPage: isFetchingNextProducerPage,
    isLoading: isLoadingProducer,
  } = useInfiniteQuery({
    queryKey: ['producer-search-infinite', producerRequestCandidates],
    queryFn: async ({ pageParam = 1 }) => {
      for (const candidate of producerRequestCandidates) {
        try {
          const response = await fetchProducerAnimes(candidate, Number(pageParam));
          if (Array.isArray(response?.animes) && response.animes.length > 0) {
            return response;
          }
        } catch {
          // Try next producer variant.
        }
      }

      return {
        producerName: decodedProducerName,
        animes: [],
        top10Animes: { today: [], week: [], month: [] },
        topAiringAnimes: [],
        currentPage: Number(pageParam),
        totalPages: Number(pageParam),
        hasNextPage: false,
      };
    },
    getNextPageParam: (lastPage) => {
      if (!lastPage || !lastPage.hasNextPage) return undefined;
      return lastPage.currentPage + 1;
    },
    initialPageParam: 1,
    enabled: shouldSearchAnime && isProducerRoute && producerRequestCandidates.length > 0,
    staleTime: 2 * 60 * 1000,
  });

  const hasNextAnimePage = isProducerRoute ? hasNextProducerPage : hasNextSearchPage;
  const isFetchingNextAnimePage = isProducerRoute ? isFetchingNextProducerPage : isFetchingNextSearchPage;
  const isLoadingAnime = isProducerRoute ? isLoadingProducer : isLoadingSearch;

  const {
    data: infiniteMangaData,
    fetchNextPage: fetchNextMangaPage,
    hasNextPage: hasNextMangaPage,
    isFetchingNextPage: isFetchingNextMangaPage,
    isLoading: isLoadingManga,
    error: mangaSearchError,
    refetch: retryMangaSearch,
  } = useInfiniteMangaSearch(query, 20, shouldEnableMangaSearch, mangaSearchOptions);

  const shouldEnableNovelSearch =
    shouldSearchNovels &&
    (query.length > 0 || novelFilterActive || minReleaseYear > 0 || maxReleaseYear > 0 || minRating > 0 || maxRating > 0 || sortMode !== 'relevance') &&
    (!shouldDelaySecondaryStreams || enableSecondaryResultStreams || novelFilterActive);

  const novelSearchOptions = useMemo<NovelSearchOptions>(() => ({
    ...novelFilters,
    sort: novelFilters.sort || (sortMode === 'rating' ? 'SCORE_DESC' : sortMode === 'title' ? 'TITLE_ROMAJI' : undefined),
    minYear: minReleaseYear || undefined,
    maxYear: maxReleaseYear || undefined,
    minScore: minRating || undefined,
    maxScore: maxRating || undefined,
    adult: novelFilters.adult || explicitMangaQuery || contentSafetySettings.showAdultEverywhere,
  }), [novelFilters, sortMode, minReleaseYear, maxReleaseYear, minRating, maxRating, explicitMangaQuery, contentSafetySettings.showAdultEverywhere]);

  const {
    data: infiniteNovelData,
    fetchNextPage: fetchNextNovelPage,
    hasNextPage: hasNextNovelPage,
    isFetchingNextPage: isFetchingNextNovelPage,
    isLoading: isLoadingNovels,
    error: novelSearchError,
    refetch: retryNovelSearch,
  } = useInfiniteNovelSearch(query, 20, shouldEnableNovelSearch, novelSearchOptions);

  const { data: extensionResults, isLoading: isLoadingExtensions } = useExtensionSearch(query, ['all', 'anime', 'manga'].includes(resultType), resultType === 'anime' ? 'watch' : resultType === 'manga' ? 'read' : undefined);
  const [extensionFilter, setExtensionFilter] = useState('all');
  useEffect(() => setExtensionFilter('all'), [query, resultType]);
  const extensionOptions = new Map<string, string>((extensionResults || []).map(item => [String(item.sourceId || item.providerName), String(item.providerName)]));
  const filteredExtensionResults = (extensionResults || []).filter(item => (contentSafetySettings.showAdultEverywhere || !isExplicitExtensionContent(item)) && (extensionFilter === 'all' || String(item.sourceId || item.providerName) === extensionFilter));


  const observer = useRef<IntersectionObserver>();
  const loadMoreLockRef = useRef(false);
  const scrollRef = useCallback((node: HTMLDivElement) => {
    if (isLoadingAnime || isLoadingManga || isLoadingNovels) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      const entry = entries[0];
      if (!entry) return;

      if (!entry.isIntersecting) {
        loadMoreLockRef.current = false;
        return;
      }

      if (loadMoreLockRef.current) {
        return;
      }

      let didRequestNextPage = false;

      if (resultType === 'anime') {
        if (hasNextAnimePage && !isFetchingNextAnimePage) {
          if (isProducerRoute) {
            fetchNextProducerPage();
          } else {
            fetchNextSearchPage();
          }
          didRequestNextPage = true;
        }
      } else if (resultType === 'manga') {
        if (hasNextMangaPage && !isFetchingNextMangaPage) {
          fetchNextMangaPage();
          didRequestNextPage = true;
        }
      } else if (resultType === 'novel') {
        if (hasNextNovelPage && !isFetchingNextNovelPage) {
          fetchNextNovelPage();
          didRequestNextPage = true;
        }
      } else {
        if (hasNextAnimePage && !isFetchingNextAnimePage) {
          if (isProducerRoute) {
            fetchNextProducerPage();
          } else {
            fetchNextSearchPage();
          }
          didRequestNextPage = true;
        } else if (hasNextMangaPage && !isFetchingNextMangaPage) {
          fetchNextMangaPage();
          didRequestNextPage = true;
        } else if (hasNextNovelPage && !isFetchingNextNovelPage) {
          fetchNextNovelPage();
          didRequestNextPage = true;
        }
      }

      if (didRequestNextPage) {
        loadMoreLockRef.current = true;
      }
    }, { rootMargin: '120px 0px' });
    if (node) observer.current.observe(node);
  }, [isLoadingAnime, hasNextAnimePage, isFetchingNextAnimePage, isProducerRoute, fetchNextProducerPage, fetchNextSearchPage, isLoadingManga, hasNextMangaPage, isFetchingNextMangaPage, fetchNextMangaPage, isLoadingNovels, hasNextNovelPage, isFetchingNextNovelPage, fetchNextNovelPage, resultType]);

  const allAnimeResults = useMemo(() => {
    if (isProducerRoute) {
      return producerInfiniteData?.pages.flatMap(page => page.animes) || [];
    }

    return infiniteData?.pages.flatMap(page => page.animes) || [];
  }, [infiniteData, isProducerRoute, producerInfiniteData]);

  const allMangaResults = useMemo(() => {
    return (infiniteMangaData?.pages || []).flatMap((page: any) => {
      const results = Array.isArray(page?.results) ? page.results : [];

      return results
        .map((manga: any) => {
          const fallbackTitle =
            manga?.canonicalTitle ||
            manga?.title?.english ||
            manga?.title?.romaji ||
            manga?.title?.native;

          const normalizedId = manga?.tatakaiId || manga?.id || (manga?.anilistId ? `anilist:${manga.anilistId}` : manga?.malId ? `mal:${manga.malId}` : null);
          if (!normalizedId || !fallbackTitle) return null;

          return {
            id: String(normalizedId),
            name: fallbackTitle,
            href: manga.href,
            poster: manga?.poster || "",
            type: manga?.type || manga?.mediaType || "manga",
            status: manga?.status || undefined,
            year:
              typeof manga?.year === "number" ? manga.year : undefined,
            popularity:
              typeof manga?.popularity === "number" ? manga.popularity : undefined,
            providersAvailable: Array.isArray(manga?.providersAvailable)
              ? manga.providersAvailable
              : [],
            rating:
              typeof manga?.score === "number"
                ? (manga.score / 10).toFixed(1)
                : undefined,
            chapters:
              typeof manga?.chapters === "number" && manga.chapters > 0
                ? manga.chapters
                : undefined,
            volumes:
              typeof manga?.volumes === "number" && manga.volumes > 0
                ? manga.volumes
                : undefined,
            genres: Array.isArray(manga?.genres) ? manga.genres : [],
            providerSource:
              typeof manga?.providerSource === 'string' ? manga.providerSource : undefined,
            originLanguage:
              typeof manga?.originLanguage === 'string' ? manga.originLanguage.toLowerCase() : undefined,
            malId:
              typeof manga?.malId === "number" ? manga.malId : undefined,
            anilistId:
              typeof manga?.anilistId === "number" ? manga.anilistId : undefined,
            isAdult: inferMangaAdultFlag(manga),
          };
        })
        .filter(Boolean);
    });
  }, [infiniteMangaData]);

  const allNovelResults = useMemo(() => {
    return (infiniteNovelData?.pages || []).flatMap((page: any) => {
      const results = Array.isArray(page?.results) ? page.results : [];
      return results
        .map((novel: any) => {
          const fallbackTitle =
            novel?.canonicalTitle ||
            novel?.title?.english ||
            novel?.title?.romaji ||
            novel?.title?.native;
          const normalizedId = novel?.id || (novel?.anilistId ? `anilist:${novel.anilistId}` : novel?.malId ? `mal:${novel.malId}` : null);
          if (!normalizedId || !fallbackTitle) return null;
          return {
            id: String(normalizedId),
            name: fallbackTitle,
            poster: novel?.poster || '',
            type: 'novel',
            status: novel?.status || undefined,
            year: typeof novel?.year === 'number' ? novel.year : undefined,
            rating:
              typeof novel?.score === 'number'
                ? (novel.score / 10).toFixed(1)
                : undefined,
            chapters:
              typeof novel?.chapters === 'number' && novel.chapters > 0
                ? novel.chapters
                : undefined,
            malId: typeof novel?.malId === 'number' ? novel.malId : undefined,
            anilistId: typeof novel?.anilistId === 'number' ? novel.anilistId : undefined,
            isAdult: inferMangaAdultFlag(novel),
          };
        })
        .filter(Boolean);
    });
  }, [infiniteNovelData]);
  const { data: aniListCharacterSearch, isLoading: loadingAniListCharacters } = useAniListCharacterSearch(query);

  const characterResults = useMemo(() => {
    return aniListCharacterSearch || [];
  }, [aniListCharacterSearch]);

  const loadingCharacters = loadingAniListCharacters;

  // Episode title search — fires when result type includes anime and query >= 3 chars
  const showEpisodeSearch = (resultType === 'all' || resultType === 'anime') && query.trim().length >= 3;
  const { data: episodeTitleResults = [] } = useEpisodeTitleSearch(query, showEpisodeSearch);

  // Image search states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageResults, setImageResults] = useState<any[] | null>(null);
  const [isSearchingImage, setIsSearchingImage] = useState(false);

  const filteredAnimeResults = allAnimeResults || [];

  const normalizeMangaStatus = (status: string | undefined) => {
    const normalized = String(status || '').toLowerCase();
    if (normalized.includes('ongoing') || normalized.includes('releasing')) return 'ongoing';
    if (normalized.includes('completed') || normalized.includes('finished')) return 'completed';
    if (normalized.includes('hiatus')) return 'hiatus';
    if (normalized.includes('cancel')) return 'cancelled';
    if (normalized.includes('unreleased') || normalized.includes('not_yet')) return 'unreleased';
    return 'unknown';
  };

  const normalizeSearchText = (value: unknown) =>
    String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const mangaSearchTokens = useMemo(
    () => normalizeSearchText(query).split(' ').filter((token) => token.length >= 3),
    [query]
  );

  const isAdultTitleSearchIntent = useCallback(
    (manga: any) => {
      if (mangaSearchTokens.length === 0) return false;
      const title = normalizeSearchText(manga?.name || manga?.canonicalTitle || manga?.title?.english || '');
      if (!title) return false;
      return mangaSearchTokens.every((token) => title.includes(token));
    },
    [mangaSearchTokens]
  );

  const filteredMangaResults = (allMangaResults || []).filter((manga) => {
    const mangaType = (manga.type || '').toLowerCase();
    if (mangaType === 'novel' || mangaType === 'light_novel') return false;
    const mangaRating = Number.parseFloat(manga.rating || '0');
    const isAdult = Boolean(manga.isAdult);
    const statusValue = normalizeMangaStatus(manga.status);
    const genres = Array.isArray((manga as any).genres)
      ? (manga as any).genres.map((genre: string) => String(genre || '').toLowerCase())
      : [];
    const allowAdultByIntent =
      mangaAdultFilter ||
      explicitMangaQuery ||
      isAdultTitleSearchIntent(manga) ||
      query.trim().length > 0;

    if (isAdult && !contentSafetySettings.showAdultEverywhere && !allowAdultByIntent) return false;

    if (normalizedMangaTypeFilter !== 'all' && mangaType !== normalizedMangaTypeFilter) return false;
    if (mangaStatusFilter !== 'all' && statusValue !== mangaStatusFilter) return false;
    if (mangaGenreFilter !== 'all' && genres.length > 0 && !genres.includes(mangaGenreFilter.toLowerCase())) {
      return false;
    }
    if (mangaRating > 0 && mangaRating < minRating) return false;
    if (minReleaseYear > 0 && Number(manga.year || 0) > 0 && Number(manga.year) < minReleaseYear) {
      return false;
    }
    return true;
  });

  const filteredNovelResults = (allNovelResults || []).filter((novel: any) => {
    const isAdult = Boolean(novel.isAdult);
    if (isAdult && !novelSearchOptions.adult && query.trim().length === 0) return false;
    const novelRating = Number.parseFloat(novel.rating || '0');
    if (novelRating > 0 && novelRating < minRating) return false;
    if (maxRating > 0 && novelRating > maxRating) return false;
    if (minReleaseYear > 0 && Number(novel.year || 0) > 0 && Number(novel.year) < minReleaseYear) return false;
    if (maxReleaseYear > 0 && Number(novel.year || 0) > 0 && Number(novel.year) > maxReleaseYear) return false;
    if (novelFilters.statuses?.length) {
      const s = String(novel.status || '').toLowerCase();
      const norm =
        s.includes('ongoing') || s.includes('releasing') ? 'ongoing'
        : s.includes('completed') || s.includes('finished') ? 'completed'
        : s.includes('hiatus') ? 'hiatus'
        : s.includes('cancel') ? 'cancelled'
        : s.includes('unreleased') || s.includes('not_yet') ? 'unreleased'
        : 'unknown';
      if (!novelFilters.statuses.includes(norm)) return false;
    }
    return true;
  });

  const unifiedResults = useMemo(() => {
    const arr: any[] = [];
    if (resultType === 'all' || resultType === 'anime') {
      arr.push(
        ...filteredAnimeResults.map((a) => {
          const isAdult = inferAnimeAdultFlag(a);
          return {
            ...a,
            mediaType: 'anime' as const,
            isAdult,
            // Mirror the manga blur: mature anime only reach here on an explicit
            // query (safe mode hides them server-side), so blur those covers.
            blurAdult:
              isAdult &&
              !contentSafetySettings.showAdultEverywhere &&
              explicitMangaQuery &&
              contentSafetySettings.blurAdultInSearch,
          };
        })
      );
    }
    if (resultType === 'all' || resultType === 'manga') {
      arr.push(
        ...filteredMangaResults.map((m) => ({
          ...m,
          mediaType: 'manga' as const,
          blurAdult:
            Boolean(m.isAdult) &&
            !contentSafetySettings.showAdultEverywhere &&
            (explicitMangaQuery || mangaAdultFilter || isAdultTitleSearchIntent(m) || query.trim().length > 0) &&
            contentSafetySettings.blurAdultInSearch,
        }))
      );
    }
    if (resultType === 'all' || resultType === 'novel') {
      arr.push(
        ...filteredNovelResults.map((n) => ({
          ...n,
          mediaType: 'novel' as const,
          blurAdult:
            Boolean(n.isAdult) &&
            !contentSafetySettings.showAdultEverywhere &&
            query.trim().length > 0 &&
            contentSafetySettings.blurAdultInSearch,
        }))
      );
    }

    if (sortMode === 'relevance') return arr;

    const sorted = [...arr].sort((a, b) => {
      if (sortMode === 'rating') {
        return Number(b.rating || 0) - Number(a.rating || 0);
      }
      if (sortMode === 'title') {
        return String(a.name || '').localeCompare(String(b.name || ''));
      }
      if (sortMode === 'popularity') {
        return Number((b as any).popularity || 0) - Number((a as any).popularity || 0);
      }
      return 0;
    });

    return sorted;
  }, [
    filteredAnimeResults,
    filteredMangaResults,
    filteredNovelResults,
    resultType,
    sortMode,
    contentSafetySettings.showAdultEverywhere,
    contentSafetySettings.blurAdultInSearch,
    explicitMangaQuery,
    mangaAdultFilter,
    isAdultTitleSearchIntent,
    query,
  ]);

  // Only URL keys belonging to filters are rewritten; q/type/producer context survives.
  const clearFilterUrl = (genre = false, animeTags: string[] = [], mangaTags: string[] = [], novelTags: string[] = novelFilters.tags || []) => {
    const next = new URLSearchParams(searchParams);
    ['tag', 'tags', 'animeTag', 'animeTags', 'mangaTag', 'mangaTags', 'manwhaTag', 'manwhaTags', 'novelTag', 'novelTags'].forEach(key => next.delete(key));
    animeTags.forEach(tag => next.append('animeTag', tag));
    mangaTags.forEach(tag => next.append('mangaTag', tag));
    novelTags.forEach(tag => next.append('novelTag', tag));
    if (genre) next.delete('genre');
    setSearchParams(next, { replace: true });
  };
  const resetFilters = () => {
    setNovelFilters({});
    setLocalNovelFilters({});
    setLocalAnimeType('all');
    setLocalAnimeStatus('all');
    setLocalAnimeGenre('all');
    setLocalAnimeSort('default');
    setLocalMangaType('all');
    setLocalMangaStatus('all');
    setLocalMangaOrigin('all');
    setLocalMangaGenre('all');
    setLocalMangaAdult(false);
    setLocalMinRating(0);
    setLocalMinReleaseYear(0);
    setLocalMaxRating(0);
    setLocalMaxReleaseYear(0);
    setLocalSeason('all');
    setLocalMinEpisodes(0);
    setLocalMaxEpisodes(0);
    setLocalSortMode('relevance');

    // Immediately apply reset
    setAnimeTypeFilter('all');
    setAnimeStatusFilter('all');
    setAnimeGenreFilter('all');
    setAnimeSortFilter('default');
    setMangaTypeFilter('all');
    setMangaStatusFilter('all');
    setMangaOrigin('all');
    setMangaGenreFilter('all');
    setMangaAdultFilter(false);
    setMinRating(0);
    setMinReleaseYear(0);
    setMaxRating(0);
    setMaxReleaseYear(0);
    setSeasonFilter('all');
    setMinEpisodes(0);
    setMaxEpisodes(0);
    setSortMode('relevance');
    setSelectedAnimeTags([]);
    setSelectedMangaTags([]);
    setTagSearch('');
    setMangaTagSearch('');
    clearFilterUrl(true, [], [], []);
    setDiscoverSort('for-you');
    setPage(1);
  };

  const appliedFilters: { id: string; label: string; remove: () => void }[] = [];
  const addFilter = (id: string, value: string | number, active: boolean, remove: () => void) => {
    if (active) appliedFilters.push({ id, label: String(value), remove: () => { remove(); setPage(1); } });
  };
  const readable = (value: string) => /^(tv|ova|ona)$/i.test(value) ? value.toUpperCase() : value.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
  addFilter('anime-type', 'Anime: ' + readable(animeTypeFilter), animeTypeFilter !== 'all', () => setAnimeTypeFilter('all'));
  addFilter('anime-status', 'Anime status: ' + readable(animeStatusFilter), animeStatusFilter !== 'all', () => setAnimeStatusFilter('all'));
  addFilter('manga-type', 'Manga: ' + readable(mangaTypeFilter), mangaTypeFilter !== 'all', () => setMangaTypeFilter('all'));
  addFilter('manga-status', 'Manga status: ' + readable(mangaStatusFilter), mangaStatusFilter !== 'all', () => setMangaStatusFilter('all'));
  addFilter('origin', 'Origin: ' + readable(mangaOrigin), mangaOrigin !== 'all', () => setMangaOrigin('all'));
  const clearGenre = () => { setAnimeGenreFilter('all'); setMangaGenreFilter('all'); clearFilterUrl(true, selectedAnimeTags, selectedMangaTags); };
  addFilter('genre', 'Genre: ' + readable(animeGenreFilter !== 'all' ? animeGenreFilter : mangaGenreFilter), animeGenreFilter !== 'all' || mangaGenreFilter !== 'all', clearGenre);
  addFilter('mature', 'Mature manga', mangaAdultFilter, () => setMangaAdultFilter(false));
  addFilter('min-score', 'Score ≥ ' + minRating, minRating > 0, () => setMinRating(0));
  addFilter('max-score', 'Score ≤ ' + maxRating, maxRating > 0, () => setMaxRating(0));
  addFilter('min-year', 'Year ≥ ' + minReleaseYear, minReleaseYear > 0, () => setMinReleaseYear(0));
  addFilter('max-year', 'Year ≤ ' + maxReleaseYear, maxReleaseYear > 0, () => setMaxReleaseYear(0));
  addFilter('season', 'Season: ' + readable(seasonFilter), seasonFilter !== 'all', () => setSeasonFilter('all'));
  addFilter('min-episodes', 'Episodes ≥ ' + minEpisodes, minEpisodes > 0, () => setMinEpisodes(0));
  addFilter('max-episodes', 'Episodes ≤ ' + maxEpisodes, maxEpisodes > 0, () => setMaxEpisodes(0));
  const presetSort = (animeSortFilter === 'score_desc' && sortMode === 'rating') || (animeSortFilter === 'title_asc' && sortMode === 'title') || (animeSortFilter === 'start_date_desc' && sortMode === 'relevance');
  const resetSort = () => { setAnimeSortFilter('default'); setSortMode('relevance'); setDiscoverSort('for-you'); };
  addFilter('anime-sort', 'Anime order: ' + readable(animeSortFilter), animeSortFilter !== 'default' && !presetSort, () => { setAnimeSortFilter('default'); setDiscoverSort('for-you'); });
  addFilter('sort', 'Sort: ' + (presetSort ? (animeSortFilter === 'score_desc' ? 'Top rated' : animeSortFilter === 'title_asc' ? 'A–Z' : 'Newest') : readable(sortMode)), sortMode !== 'relevance' || presetSort, resetSort);
  selectedAnimeTags.forEach(tag => addFilter('anime-tag-' + tag, 'Anime tag: ' + tag, true, () => {
    const next = selectedAnimeTags.filter(value => value !== tag); setSelectedAnimeTags(next); clearFilterUrl(false, next, selectedMangaTags);
  }));
  selectedMangaTags.forEach(tag => addFilter('manga-tag-' + tag, 'Manga tag: ' + tag, true, () => {
    const next = selectedMangaTags.filter(value => value !== tag); setSelectedMangaTags(next); clearFilterUrl(false, selectedAnimeTags, next);
  }));
  const activeFilterCount = appliedFilters.length;

  const filteredImageResults = (imageResults || []).filter((result) => {
    return Number(result?.similarity || 0) >= imageConfidenceThreshold;
  });



  const handleImageSearch = async () => {
    if (!selectedFile) return;

    setIsSearchingImage(true);
    setImageResults(null);
    try {
      const formData = new FormData();
      formData.append("image", selectedFile);

      const response = await fetch("https://api.trace.moe/search", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error(uiI18n.t('app.search_failed_e2e904ac'));
      const data = await response.json();
      const rawResults = data.result || [];

      // Deduplicate by anilist id — keep the best similarity per anime
      const bestByAnilist = new Map<number, any>();
      for (const r of rawResults) {
        const existing = bestByAnilist.get(r.anilist);
        if (!existing || r.similarity > existing.similarity) {
          bestByAnilist.set(r.anilist, r);
        }
      }

      // Batch-fetch anime titles from AniList for all unique ids
      const anilistIds = Array.from(bestByAnilist.keys()).filter(Boolean);
      const titleMap = new Map<number, { title: string; coverImage: string }>();

      if (anilistIds.length > 0) {
        try {
          const gql = `
            query ($ids: [Int]) {
              Page(perPage: 50) {
                media(id_in: $ids, type: ANIME) {
                  id
                  title { romaji english native }
                  coverImage { medium }
                }
              }
            }
          `;
          const res = await fetch(ANILIST_GRAPHQL_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: gql, variables: { ids: anilistIds } }),
          });
          if (res.ok) {
            const json = await res.json();
            const mediaList = json?.data?.Page?.media || [];
            for (const m of mediaList) {
              titleMap.set(m.id, {
                title: m.title?.english || m.title?.romaji || m.title?.native || `Anime #${m.id}`,
                coverImage: m.coverImage?.medium || '',
              });
            }
          }
        } catch {
          // Non-critical — fall back to filename parsing
        }
      }

      // Enrich results with resolved anime metadata
      const enriched = Array.from(bestByAnilist.values()).map((r) => ({
        ...r,
        _animeTitle: titleMap.get(r.anilist)?.title || null,
        _animeCover: titleMap.get(r.anilist)?.coverImage || null,
      }));

      // Sort by similarity descending
      enriched.sort((a, b) => b.similarity - a.similarity);
      setImageResults(enriched);
    } catch (error) {
      console.error("Image search error:", error);
    } finally {
      setIsSearchingImage(false);
    }
  };

  useEffect(() => {
    const tagSource = searchParams.get('mangaTagSource');
    setMangaTagSource(tagSource === 'anilist' || tagSource === 'mangabaka' ? tagSource : undefined);
    setQuery(queryParam);
    setSearchInput(queryParam);
    setShowSuggestions(false);
    const typeParam = searchParams.get('type');
    if (typeParam === 'anime' || typeParam === 'manga' || typeParam === 'novel' || typeParam === 'character' || typeParam === 'all') {
      setResultType(typeParam as any);
    }
    const genericTags = searchParams.getAll('tag').concat(searchParams.get('tags')?.split(',') ?? []);
    const animeTags = searchParams.getAll('animeTag').concat(typeParam !== 'manga' && typeParam !== 'novel' ? genericTags : []);
    const mangaTags = typeParam === 'novel' ? [] : searchParams.getAll('mangaTag').concat(searchParams.getAll('manwhaTag')).concat(typeParam === 'manga' ? genericTags : []);
    setSelectedAnimeTags(Array.from(new Set(animeTags.concat(searchParams.get('animeTags')?.split(',') ?? []).filter(Boolean))));
    setSelectedMangaTags(Array.from(new Set(mangaTags.concat((searchParams.get('mangaTags') || searchParams.get('manwhaTags'))?.split(',') ?? []).filter(Boolean))));
    const novelTags = searchParams.getAll('novelTag').concat(searchParams.get('novelTags')?.split(',') ?? [], typeParam === 'novel' ? genericTags.concat(searchParams.getAll('mangaTag'), searchParams.get('mangaTags')?.split(',') ?? []) : []);
    const novelTagSource = searchParams.get('novelTagSource') || (typeParam === 'novel' ? searchParams.get('mangaTagSource') : undefined);
    const linkedNovelFilters: NovelSearchOptions = {
      genre: typeParam === 'novel' ? searchParams.get('genre') || undefined : undefined,
      tags: Array.from(new Set(novelTags.filter(Boolean))),
      tagSource: novelTagSource === 'mangabaka' ? 'mangabaka' : 'anilist',
    };
    setNovelFilters(current => ({ ...current, ...linkedNovelFilters }));
    setLocalNovelFilters(current => ({ ...current, ...linkedNovelFilters }));
    // Novel deep-links (genre/tag chips on NovelPage) land here as
    // `/search?genre=<g>&type=novel` — sync the shared genre filter so the
    // novel lane actually scopes to it, same as the manga filter.
    const urlGenre = searchParams.get('genre');
    if (typeParam !== 'novel' && urlGenre && urlGenre.trim()) {
      const slug = urlGenre.trim().toLowerCase();
      setMangaGenreFilter(slug);
      setLocalMangaGenre(slug);
      setAnimeGenreFilter(slug);
      setLocalAnimeGenre(slug);
    }
  }, [queryParam, searchParams]);

  useEffect(() => {
    if (!shouldDelaySecondaryStreams) {
      setEnableSecondaryResultStreams(true);
      return;
    }

    setEnableSecondaryResultStreams(false);
    const timer = window.setTimeout(() => {
      setEnableSecondaryResultStreams(true);
    }, 300);

    return () => window.clearTimeout(timer);
  }, [query, resultType, shouldDelaySecondaryStreams]);

  useEffect(() => {
    if (decodedProducerName) {
      setResultType('anime');
    }
  }, [decodedProducerName]);

  useEffect(() => {
    setPage(1);
  }, [query]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setShowSuggestions(false);
    const term = searchInput.trim();
    if (term) {
      try {
        const history = localStorage.getItem('tatakai_search_history');
        let searches: string[] = history ? JSON.parse(history) : [];
        searches = [term, ...searches.filter(s => s !== term)].slice(0, 20); // keep 20 max
        localStorage.setItem('tatakai_search_history', JSON.stringify(searches));
      } catch { }
      navigate(`/search?q=${encodeURIComponent(term)}`);
    } else {
      navigate('/search');
    }
  };

  const handleClearSearch = () => {
    setSearchInput('');
    setShowSuggestions(false);
    if (query) {
      navigate('/search');
    }
  };

  // show all recent searches
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  useEffect(() => {
    try {
      const searches = localStorage.getItem('tatakai_search_history');
      if (searches) {
        const parsed = JSON.parse(searches) as string[];
        setRecentSearches(parsed.slice(0, 10)); // show last 10
      }
    } catch {
      setRecentSearches([]);
    }
  }, []);

  const runRecentSearch = (term: string) => {
    setSearchInput(term);
    navigate(`/search?q=${encodeURIComponent(term)}`);
  };

  const deleteSearchItem = (term: string) => {
    try {
      const updated = recentSearches.filter(s => s !== term);
      setRecentSearches(updated);
      localStorage.setItem('tatakai_search_history', JSON.stringify(updated));
    } catch { }
  };

  const showAnimeResults = (resultType === 'all' || resultType === 'anime') && (query.length > 0 || animeFilterActive || genreFilterActive || tagFilterActive);
  const showMangaResults = shouldSearchManga && (query.length > 0 || mangaFilterActive || genreFilterActive || tagFilterActive);
  const showNovelResults = shouldEnableNovelSearch;
  const showCharacterResults = shouldEnableCharacterSearch && query.length > 1;
  const isQuerylessMangaMode = showMangaResults && mangaSearchMode !== 'search';
  const hasSearchContext = query.length > 0 || isQuerylessMangaMode || animeFilterActive || genreFilterActive || tagFilterActive || showNovelResults;
  const hasMoreResults =
    (showAnimeResults && !!hasNextAnimePage) ||
    (showMangaResults && !!hasNextMangaPage) ||
    (showNovelResults && !!hasNextNovelPage);
  const isFetchingMoreResults =
    (showAnimeResults && !!isFetchingNextAnimePage) ||
    (showMangaResults && !!isFetchingNextMangaPage) ||
    (showNovelResults && !!isFetchingNextNovelPage);
  const hasMixedResults = unifiedResults.length > 0;
  const hasCharacterResults = characterResults.length > 0;
  const hasAnyResult = hasMixedResults || (showCharacterResults && hasCharacterResults);

  // Keep search responsive even if one provider is slow/unavailable.
  const isAnimeInitialLoading = showAnimeResults && isLoadingAnime && allAnimeResults.length === 0;
  const isMangaInitialLoading = showMangaResults && isLoadingManga && allMangaResults.length === 0;
  const isNovelInitialLoading = showNovelResults && isLoadingNovels && allNovelResults.length === 0;
  const isCharacterInitialLoading = showCharacterResults && loadingCharacters && characterResults.length === 0;
  const hybridLoading = isAnimeInitialLoading || isMangaInitialLoading || isNovelInitialLoading || isCharacterInitialLoading;

  const { data: discoverData, isLoading: isLoadingDiscover } = useDiscoverMedia({
    sort: discoverSort,
    year: minReleaseYear > 0 ? minReleaseYear : null,
    genre: animeGenreFilter !== 'all' ? animeGenreFilter : undefined,
  });

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {!isNative && <Background />}
      {!isMobile && <Sidebar />}

      <main className={cn(
        "app-page relative z-10 max-w-[1800px] mx-auto",
        "pr-[max(1.5rem,env(safe-area-inset-right))] md:pr-6",
        "pb-24 md:pb-6",
        "pt-[calc(1.5rem+env(safe-area-inset-top,0px))] md:pt-6",
        isDesktopApp ? "p-6" : "pl-[max(1.5rem,env(safe-area-inset-left))] md:pl-32"
      )}>
        {/* Discover Hero when browsing — desktop only (hidden on mobile) */}
        {!hasSearchContext && !isProducerRoute && !isMobile && (
          <div className="mb-8 mt-2">
            <DiscoverHero />
          </div>
        )}

        {/* Centered Search Bar in Middle of Page after Hero */}
        <div className="flex justify-center mb-8">
          <form
            onSubmit={handleSearch}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) closeSuggestions();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') closeSuggestions();
            }}
            className="relative z-30 w-full max-w-2xl"
          >
            <div className="premium-search-field relative flex items-center rounded-full">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-primary pointer-events-none" />
              <Input
                id="tatakai-search-page-input"
                type="text"
                placeholder={uiI18n.t('app.search_anime_manga_novels_manhwa_or_alternate_ti_bace1b9f')}
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                aria-label={uiI18n.t('app.search_anime_manga_novels_manhwa_and_characters__0caf6d34')}
                autoComplete="off"
                className="pl-14 pr-32 h-14 bg-card/85 hover:bg-card focus:bg-card border border-border hover:border-primary/40 focus:border-primary rounded-full text-base backdrop-blur-md transition-[color,background-color,border-color,opacity,transform]"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                {searchInput && (
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    className="p-1.5 rounded-full hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
                    title={uiI18n.t('app.clear_719ea396')}
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="submit"
                  className="px-5 h-9 rounded-full bg-primary text-primary-foreground font-semibold text-sm hover:brightness-110 active:scale-95 transition-[color,background-color,border-color,opacity,transform] shadow-md"
                >
                  {uiI18n.t('app.search_bce06414')}
                </button>
              </div>
            </div>
            <HeaderSearchSuggestions
              query={searchInput}
              visible={showSuggestions && !isProducerRoute}
              onSelect={(name) => {
                setSearchInput(name);
                closeSuggestions();
              }}
              onClose={closeSuggestions}
            />
          </form>
        </div>

        <div className="mb-8 md:mb-10">

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 mb-6">
            <div>
              <h1 className="font-display text-2xl md:text-3xl font-bold flex items-center gap-3">
                <Search className="w-6 h-6 md:w-7 md:h-7 text-primary" />
                {hasSearchContext ? uiI18n.t('app.search_results_5e054413') : uiI18n.t('app.discover_4827ea22')}
              </h1>
              {hasSearchContext && (
                <p className="text-muted-foreground text-xs md:text-sm mt-1">
                  {query ? (
                    <>
                      {uiI18n.t('app.showing_results_for_c17b3a2b')}<span className="text-foreground font-medium">{query}</span>"
                    </>
                  ) : (
                    <>{uiI18n.t('app.showing_manga_discovery_results_8bcf1a96')}</>
                  )}
                  {uiI18n.t('app.i18n_value_0_anime_06076e08', { value0: filteredAnimeResults.length })}
                  {uiI18n.t('app.i18n_value_0_manga_1600b087', { value0: filteredMangaResults.length })}
                  {uiI18n.t('app.i18n_value_0_novels_395fba93', { value0: filteredNovelResults.length })}
                  {showCharacterResults && uiI18n.t('app.i18n_value_0_characters_fd5e3ab3', { value0: characterResults.length })}
                  {activeFilterCount > 0 && uiI18n.t('app.i18n_value_0_active_filters_5a80fffc', { value0: activeFilterCount })}
                  {!contentSafetySettings.showAdultEverywhere &&
                    uiI18n.t('app.mature_results_i18n_value_0_df9a2ed2', { value0: (explicitMangaQuery || mangaAdultFilter || query.trim().length > 0) ? 'blurred' : 'hidden' })}
                </p>
              )}
            </div>

          </div>


          {/* Sleek Discover Filter Bar (docs/image-8.png / GenrePage style) */}
          <div className="flex flex-wrap items-center gap-2.5">

            <PillGroup
              options={DISCOVER_SORTS}
              value={discoverSort}
              onChange={handleDiscoverSortChange}
              label={uiI18n.t('app.sort_adc4e96a')}
            />

            {/* Type Switcher Pills */}
            <div className="flex bg-muted/40 p-1 rounded-full border border-white/5">
              {[
                { id: 'all', get label() { return uiI18n.t('app.all_6a720856'); } },
                { id: 'anime', get label() { return uiI18n.t('app.anime_f1b32a19'); }, icon: <Film className="w-3 h-3" /> },
                { id: 'manga', get label() { return uiI18n.t('app.manga_87db0f99'); }, icon: <BookOpen className="w-3 h-3" /> },
                { id: 'novel', get label() { return uiI18n.t('app.novels_4ae488fd'); }, icon: <BookOpen className="w-3 h-3" /> },
                { id: 'character', get label() { return uiI18n.t('app.characters_b6f59f08'); } }
              ].map(type => (
                <button
                  key={type.id}
                  aria-pressed={resultType === type.id}
                  onClick={() => setResultType(type.id as any)}
                  className={cn(
                    "px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-[color,background-color,border-color,opacity,transform] whitespace-nowrap",
                    resultType === type.id
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {type.icon}
                  {type.label}
                </button>
              ))}
            </div>

            {/* Year Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger className={controlTriggerClass}>
                {minReleaseYear > 0 ? minReleaseYear : uiI18n.t('app.any_year_57344265')}
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className={controlMenuClass}>
                <DropdownMenuItem
                  className={controlItemClass}
                  onSelect={() => {
                    setMinReleaseYear(0);
                    setLocalMinReleaseYear(0);
                  }}
                >
                  {uiI18n.t('app.any_year_57344265')}
                  {minReleaseYear === 0 && <Check className="h-3.5 w-3.5 text-primary" />}
                </DropdownMenuItem>
                {discoverYears().map((value) => (
                  <DropdownMenuItem
                    key={value}
                    className={controlItemClass}
                    onSelect={() => {
                      setMinReleaseYear(value);
                      setLocalMinReleaseYear(value);
                    }}
                  >
                    {value}
                    {minReleaseYear === value && <Check className="h-3.5 w-3.5 text-primary" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Trace.moe image search */}
            <div className="flex items-center gap-2">
              <label className={controlTriggerClass}>
                <span className="max-w-[120px] truncate">{selectedFile ? selectedFile.name : uiI18n.t('app.image_search_993350ec')}</span>
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                />
              </label>
              {selectedFile && (
                <button
                  onClick={handleImageSearch}
                  disabled={isSearchingImage}
                  className="px-3.5 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-bold hover:brightness-110 active:scale-95 transition-[color,background-color,border-color,opacity,transform] flex items-center gap-1.5"
                >
                  {isSearchingImage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : uiI18n.t('app.identify_38af51b7')}
                </button>
              )}
            </div>

            {/* Genre Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger className={controlTriggerClass}>
                <Tag className="h-3.5 w-3.5 opacity-60" />
                {resolvedAnimeGenre || (animeGenreFilter !== 'all' ? animeGenreFilter : uiI18n.t('app.genre_2aa31fca'))}
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className={controlMenuClass}>
                <DropdownMenuItem
                  className={controlItemClass}
                  onSelect={() => {
                    setAnimeGenreFilter('all');
                    setLocalAnimeGenre('all');
                    setMangaGenreFilter('all');
                    setLocalMangaGenre('all');
                  }}
                >
                  {uiI18n.t('app.all_genres_09ac5f61')}
                  {animeGenreFilter === 'all' && <Check className="h-3.5 w-3.5 text-primary" />}
                </DropdownMenuItem>
                {animeGenreOptions.map((option) => (
                  <DropdownMenuItem
                    key={option.value}
                    className={controlItemClass}
                    onSelect={() => {
                      setAnimeGenreFilter(option.value);
                      setLocalAnimeGenre(option.label);
                      setMangaGenreFilter(option.value);
                      setLocalMangaGenre(option.label);
                    }}
                  >
                    {option.label}
                    {animeGenreFilter === option.value && <Check className="h-3.5 w-3.5 text-primary" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>


            {/* Power Filters Button */}
            <button
              type="button"
              id="search-filters-toggle"
              aria-expanded={showAdvancedAssist}
              aria-controls="search-advanced-filters"
              onClick={() => setShowAdvancedAssist((val) => !val)}
              className={cn(
                "h-8 px-3 rounded-full text-xs font-semibold border transition-[color,background-color,border-color,opacity,transform] flex items-center gap-1.5",
                showAdvancedAssist
                  ? "border-primary text-primary bg-primary/10 shadow-sm"
                  : "border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20 bg-muted/20"
              )}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>{uiI18n.t('app.filters_96e57821')}</span>
              {activeFilterCount > 0 && (
                <span className="flex items-center justify-center w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          <AppliedFilters filters={appliedFilters} onClear={resetFilters} />

          {showAdvancedAssist && (
            <GlassPanel id="search-advanced-filters" className="premium-filter-panel mt-4 p-4 md:p-6 space-y-6 rounded-2xl border border-border overflow-hidden relative ui-state-fade bg-card/60">

              <div className="flex flex-wrap items-center justify-between gap-4 relative z-10 pb-4 border-b border-white/[0.07]">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/15 text-primary">
                    <SlidersHorizontal className="w-4 h-4" />
                  </span>
                  <span className="text-xs font-bold uppercase tracking-wider">{uiI18n.t('app.power_filters_c5424719')}</span>
                  {activeFilterCount > 0 && (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-black text-primary-foreground">
                      {activeFilterCount} {uiI18n.t('app.active_2bb6b986')}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="h-9 px-3.5 rounded-xl text-xs font-bold uppercase tracking-wide bg-background/70 border border-white/10 text-muted-foreground hover:text-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-[color,background-color,border-color,opacity,transform]"
                  >
                    {uiI18n.t('app.reset_all_a21b0fec')}
                  </button>

                  <button
                    onClick={applyFilters}
                    type="button"
                    className="ui-button h-10 px-6 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 motion-safe:active:scale-[.97] transition-[color,background-color,border-color,opacity,transform] shadow-lg shadow-primary/20 flex items-center gap-2 text-xs"
                  >
                    <Search className="w-3.5 h-3.5" />
                    {uiI18n.t('app.apply_filters_6b2a78a8')}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 pt-2">
                {/* Anime Section */}
                <div className="space-y-4 rounded-2xl border border-white/[0.06] bg-white/[0.015] p-4 md:p-5">
                  <div className="flex items-center gap-2 pb-2 border-b border-white/5">
                    <Film className="w-4 h-4 text-primary" />
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-foreground">{uiI18n.t('app.anime_filters_93a99363')}</h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label htmlFor="filter-localAnimeType" className="text-xs text-muted-foreground font-semibold">{uiI18n.t('app.type_3deb7456')}</label>
                      <ThemedSelect
                        id="filter-localAnimeType"
                        value={localAnimeType}
                        onChange={(e) => setLocalAnimeType(e.target.value)}
                        className="w-full h-11 rounded-xl bg-background/80 border border-white/10 px-3 text-sm outline-none transition-[color,background-color,border-color,opacity,transform] cursor-pointer hover:border-white/25 hover:bg-background focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                      >
                        <option value="all">{uiI18n.t('app.all_types_30c8a0fc')}</option>
                        <option value="tv">{uiI18n.t('app.tv_56ab49a5')}</option>
                        <option value="movie">{uiI18n.t('app.movie_0e65bd96')}</option>
                        <option value="ova">{uiI18n.t('app.ova_256d1ad0')}</option>
                        <option value="ona">{uiI18n.t('app.ona_2e6b1c12')}</option>
                        <option value="special">{uiI18n.t('app.special_942078ca')}</option>
                      </ThemedSelect>
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="filter-localAnimeStatus" className="text-xs text-muted-foreground font-semibold">{uiI18n.t('app.status_bae7d5be')}</label>
                      <ThemedSelect
                        id="filter-localAnimeStatus"
                        value={localAnimeStatus}
                        onChange={(e) => setLocalAnimeStatus(e.target.value)}
                        className="w-full h-11 rounded-xl bg-background/80 border border-white/10 px-3 text-sm outline-none transition-[color,background-color,border-color,opacity,transform] cursor-pointer hover:border-white/25 hover:bg-background focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                      >
                        <option value="all">{uiI18n.t('app.any_status_55201ac9')}</option>
                        <option value="currently-airing">{uiI18n.t('app.currently_airing_024e7049')}</option>
                        <option value="finished-airing">{uiI18n.t('app.finished_airing_44bcad79')}</option>
                        <option value="not-yet-aired">{uiI18n.t('app.not_yet_aired_ca93adcf')}</option>
                      </ThemedSelect>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="filter-localAnimeGenre" className="text-xs text-muted-foreground font-semibold">{uiI18n.t('app.genre_2aa31fca')}</label>
                    <ThemedSelect
                      id="filter-localAnimeGenre"
                      value={localAnimeGenre}
                      onChange={(e) => setLocalAnimeGenre(e.target.value)}
                      className="w-full h-11 rounded-xl bg-background/80 border border-white/10 px-3 text-sm outline-none transition-[color,background-color,border-color,opacity,transform] cursor-pointer hover:border-white/25 hover:bg-background focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="all">{uiI18n.t('app.any_genre_a2ae9cce')}</option>
                      {animeGenreOptions.map((genre) => (
                        <option key={genre.value} value={genre.value}>
                          {genre.label}
                        </option>
                      ))}
                    </ThemedSelect>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Tags className="w-3.5 h-3.5 text-primary" />
                      <p className="text-xs text-muted-foreground font-semibold">{uiI18n.t('app.anilist_tags_dae15328')}</p>
                    </div>
                    <Input
                      aria-label={uiI18n.t('app.search_anilist_tags_8238a70a')}
                      value={tagSearch}
                      onChange={(event) => setTagSearch(event.target.value)}
                      placeholder={uiI18n.t('app.search_tags_aa0f0bbb')}
                      className="h-9 rounded-xl bg-background/80 border-white/10 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSpoilerTags((v) => !v)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors",
                        showSpoilerTags
                          ? "border-amber-400/50 bg-amber-400/15 text-amber-300"
                          : "border-white/10 bg-background/60 text-muted-foreground hover:border-amber-400/30 hover:text-amber-300"
                      )}
                    >
                      {showSpoilerTags ? uiI18n.t('app.hiding_nothing_spoiler_tags_shown_ee779cb0') : uiI18n.t('app.show_spoiler_tags_de6453df')}
                    </button>
                    {selectedAnimeTags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {selectedAnimeTags.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            title={uiI18n.t('app.remove_tag_bc7b89e4')}
                            onClick={() => setSelectedAnimeTags((current) => current.filter((value) => value !== tag))}
                            className="rounded-md bg-primary/15 px-2 py-1 text-[10px] font-bold text-primary hover:bg-primary/25"
                          >
                            {tag} x
                          </button>
                        ))}
                      </div>
                    )}
                    <TagGroupCloud
                      groups={filteredTagOptions}
                      selected={selectedAnimeTags}
                      onToggle={(name) => setSelectedAnimeTags((current) => current.includes(name) ? current.filter((value) => value !== name) : [...current, name])}
                      maxHeightClass="max-h-40"
                      emptyText={uiI18n.t('app.no_tags_match_that_search_b5b4f8be')}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="filter-localAnimeSort" className="text-xs text-muted-foreground font-semibold">{uiI18n.t('app.sort_method_7ae019e9')}</label>
                    <ThemedSelect
                      id="filter-localAnimeSort"
                      value={localAnimeSort}
                      onChange={(e) => setLocalAnimeSort(e.target.value)}
                      className="w-full h-11 rounded-xl bg-background/80 border border-white/10 px-3 text-sm outline-none transition-[color,background-color,border-color,opacity,transform] cursor-pointer hover:border-white/25 hover:bg-background focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="default">{uiI18n.t('app.best_match_86f686f8')}</option>
                      <option value="recently-added">{uiI18n.t('app.recently_added_66560f11')}</option>
                      <option value="recently-updated">{uiI18n.t('app.recently_updated_04bf5346')}</option>
                      <option value="score">{uiI18n.t('app.score_489f4877')}</option>
                      <option value="name-a-z">{uiI18n.t('app.name_a_z_257c1c4b')}</option>
                      <option value="released-date">{uiI18n.t('app.released_date_6ccfd4a6')}</option>
                    </ThemedSelect>
                  </div>
                </div>

                {/* Manga Section */}
                <div className="space-y-4 rounded-2xl border border-white/[0.06] bg-white/[0.015] p-4 md:p-5">
                  <div className="flex items-center gap-2 pb-2 border-b border-white/5">
                    <BookOpen className="w-4 h-4 text-primary" />
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-foreground">{uiI18n.t('app.manga_filters_f16ae5e7')}</h3>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="filter-localMangaOrigin" className="text-xs text-muted-foreground font-semibold">{uiI18n.t('app.origin_44ab85a2')}</label>
                    <ThemedSelect
                      id="filter-localMangaOrigin"
                      value={localMangaOrigin}
                      onChange={(e) => setLocalMangaOrigin(e.target.value)}
                      className="w-full h-11 rounded-xl bg-background/80 border border-white/10 px-3 text-sm outline-none transition-[color,background-color,border-color,opacity,transform] cursor-pointer hover:border-white/25 hover:bg-background focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="all">{uiI18n.t('app.all_origins_8b645e03')}</option>
                      <option value="JP">{uiI18n.t('app.japan_manga_e84da95f')}</option>
                      <option value="KR">{uiI18n.t('app.south_korea_manhwa_webtoon_e69ff1fb')}</option>
                      <option value="CN">{uiI18n.t('app.china_manhua_3ff6ad6f')}</option>
                    </ThemedSelect>
                  </div>

                  <div className="space-y-2 rounded-xl border border-white/10 bg-background/50 p-3">
                    <p className="text-xs text-muted-foreground font-semibold">{uiI18n.t('app.popular_manhwa_webtoon_tags_dcc334b1')}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {['Cultivation', 'Dungeon', 'Necromancy', 'Age Regression', 'Video Games', 'Revenge', 'Survival', 'Martial Arts', 'Post-Apocalyptic'].map((tag) => (
                        <button
                          key={`popular-manhwa-${tag}`}
                          type="button"
                          onClick={() => setSelectedMangaTags((current) => current.includes(tag) ? current.filter((value) => value !== tag) : [...current, tag])}
                          className={cn(
                            "rounded-lg border px-2.5 py-1.5 min-h-[30px] text-[10px] font-semibold transition-[color,background-color,border-color,opacity,transform] active:scale-95",
                            selectedMangaTags.includes(tag) ? "border-primary/50 bg-primary/15 text-primary" : "border-white/10 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                          )}
                        >
                          {uiI18n.t(({"Cultivation":"app.cultivation_72a09e3e","Dungeon":"app.dungeon_ef947e3a","Necromancy":"app.necromancy_b02bd83f","Age Regression":"app.age_regression_240a896b","Video Games":"app.video_games_ed143e8b","Revenge":"app.revenge_fa84139d","Survival":"app.survival_fe88ea8d","Martial Arts":"app.martial_arts_d0f0b5b7","Post-Apocalyptic":"app.post_apocalyptic_5e7e47ca"})[tag])}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground font-semibold">{uiI18n.t('app.popular_manga_tags_e53151a9')}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {['School', 'Shounen', 'Seinen', 'Shoujo', 'Josei', 'Isekai', 'Cyberpunk', 'Samurai', 'Ninja', 'Family Life'].map((tag) => (
                        <button
                          key={`popular-manga-${tag}`}
                          type="button"
                          onClick={() => setSelectedMangaTags((current) => current.includes(tag) ? current.filter((value) => value !== tag) : [...current, tag])}
                          className={cn(
                            "rounded-lg border px-2.5 py-1.5 min-h-[30px] text-[10px] font-semibold transition-[color,background-color,border-color,opacity,transform] active:scale-95",
                            selectedMangaTags.includes(tag) ? "border-primary/50 bg-primary/15 text-primary" : "border-white/10 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                          )}
                        >
                          {uiI18n.t(({"School":"app.school_f2f3d66a","Shounen":"app.shounen_611c0d1c","Seinen":"app.seinen_34012d1c","Shoujo":"app.shoujo_61e8a8ab","Josei":"app.josei_44d383ca","Isekai":"app.isekai_8f383a56","Cyberpunk":"app.cyberpunk_e2878e18","Samurai":"app.samurai_807e72f0","Ninja":"app.ninja_7eb0443b","Family Life":"app.family_life_60750c75"})[tag])}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label htmlFor="filter-localMangaType" className="text-xs text-muted-foreground font-semibold">{uiI18n.t('app.format_041a5dec')}</label>
                      <ThemedSelect
                        id="filter-localMangaType"
                        value={localMangaType}
                        onChange={(e) => setLocalMangaType(e.target.value)}
                        className="w-full h-11 rounded-xl bg-background/80 border border-white/10 px-3 text-sm outline-none transition-[color,background-color,border-color,opacity,transform] cursor-pointer hover:border-white/25 hover:bg-background focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                      >
                        <option value="all">{uiI18n.t('app.all_formats_63944b6a')}</option>
                        <option value="manga">{uiI18n.t('app.manga_87db0f99')}</option>
                        <option value="manhwa">{uiI18n.t('app.manhwa_8251bcf8')}</option>
                        <option value="manhua">{uiI18n.t('app.manhua_b6ddb037')}</option>
                        <option value="comics">{uiI18n.t('app.comics_0fd813b3')}</option>
                      </ThemedSelect>
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="filter-localMangaStatus" className="text-xs text-muted-foreground font-semibold">{uiI18n.t('app.status_bae7d5be')}</label>
                      <ThemedSelect
                        id="filter-localMangaStatus"
                        value={localMangaStatus}
                        onChange={(e) => setLocalMangaStatus(e.target.value)}
                        className="w-full h-11 rounded-xl bg-background/80 border border-white/10 px-3 text-sm outline-none transition-[color,background-color,border-color,opacity,transform] cursor-pointer hover:border-white/25 hover:bg-background focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                      >
                        <option value="all">{uiI18n.t('app.any_status_55201ac9')}</option>
                        <option value="ongoing">{uiI18n.t('app.ongoing_2e0254c2')}</option>
                        <option value="completed">{uiI18n.t('app.completed_1798b3ba')}</option>
                        <option value="hiatus">{uiI18n.t('app.hiatus_f6eb2b71')}</option>
                        <option value="cancelled">{uiI18n.t('app.cancelled_a1bf92ef')}</option>
                        <option value="unreleased">{uiI18n.t('app.unreleased_81dd1756')}</option>
                      </ThemedSelect>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="filter-localMangaGenre" className="text-xs text-muted-foreground font-semibold">{uiI18n.t('app.genre_2aa31fca')}</label>
                    <ThemedSelect
                      id="filter-localMangaGenre"
                      value={localMangaGenre}
                      onChange={(e) => setLocalMangaGenre(e.target.value)}
                      className="w-full h-11 rounded-xl bg-background/80 border border-white/10 px-3 text-sm outline-none transition-[color,background-color,border-color,opacity,transform] cursor-pointer hover:border-white/25 hover:bg-background focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="all">{uiI18n.t('app.any_genre_a2ae9cce')}</option>
                      {/* If a tag from MangaPage was passed via URL and isn't in the list, show it as the first option */}
                      {localMangaGenre !== 'all' && !atsuGenreOptions.some((g) => g.value === localMangaGenre) && (
                        <option value={localMangaGenre}>
                          {localMangaGenre.split(/[-_]+/).map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                        </option>
                      )}
                      {atsuGenreOptions.map((genre) => (
                        <option key={genre.value} value={genre.value}>
                          {genre.label}
                        </option>
                      ))}
                    </ThemedSelect>
                  </div>

                  <div className="space-y-2 rounded-xl border border-primary/10 bg-primary/5 p-3">
                    <div className="flex items-center gap-2">
                      <Tags className="w-3.5 h-3.5 text-primary" />
                      <ThemedSelect aria-label={uiI18n.t('app.manga_tag_catalog_3c6109dc')} value={mangaTagSource || 'anilist'}
                        onChange={(event) => { setMangaTagSource(event.target.value as 'anilist' | 'mangabaka'); setSelectedMangaTags([]); }}
                        className="min-h-11 rounded-lg border border-border bg-background px-3 text-sm">
                        <option value="anilist">{uiI18n.t('app.anilist_tags_57a023ee')}</option>
                        <option value="mangabaka">{uiI18n.t('app.mangabaka_tags_982685a1')}</option>
                      </ThemedSelect>
                    </div>
                    <Input
                      value={mangaTagSearch}
                      onChange={(event) => setMangaTagSearch(event.target.value)}
                      placeholder={uiI18n.t('app.search_manga_tags_ba10d508')}
                      className="h-9 rounded-xl bg-background/80 border-white/10 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSpoilerTags((v) => !v)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-wide transition-colors",
                        showSpoilerTags
                          ? "border-amber-400/50 bg-amber-400/15 text-amber-300"
                          : "border-white/10 bg-background/60 text-muted-foreground hover:border-amber-400/30 hover:text-amber-300"
                      )}
                    >
                      {showSpoilerTags ? uiI18n.t('app.spoiler_tags_shown_9b29c01d') : uiI18n.t('app.show_spoiler_tags_de6453df')}
                    </button>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedMangaTags.length > 0 ? selectedMangaTags.map((tag) => (
                        <button
                          key={`manga-${tag}`}
                          type="button"
                          onClick={() => setSelectedMangaTags((current) => current.filter((value) => value !== tag))}
                          className="rounded-md bg-primary/15 px-2 py-1 text-[10px] font-bold text-primary hover:bg-primary/25"
                        >
                          {tag} x
                        </button>
                      )) : (
                        <span className="text-[10px] text-muted-foreground">{uiI18n.t('app.no_manga_tags_selected_05d6ce1a')}</span>
                      )}
                    </div>
                    <TagGroupCloud
                      groups={filteredMangaTagOptions}
                      selected={selectedMangaTags}
                      onToggle={(name) => setSelectedMangaTags((current) => current.includes(name) ? current.filter((value) => value !== name) : [...current, name])}
                      maxHeightClass="max-h-40"
                      emptyText={uiI18n.t('app.no_tags_match_that_search_b5b4f8be')}
                    />
                  </div>

                  <div className="flex items-center gap-2 p-3 rounded-xl bg-background/70 border border-white/10 hover:border-primary/30 transition-[color,background-color,border-color,opacity,transform] cursor-pointer group" onClick={() => setLocalMangaAdult(!localMangaAdult)}>
                    <ThemedCheckbox
                      type="checkbox"
                      checked={localMangaAdult}
                      onChange={(e) => setLocalMangaAdult(e.target.checked)}
                      className="w-4 h-4 accent-primary rounded"
                      id="adult-filter"
                    />
                    <label htmlFor="adult-filter" className="text-xs font-bold uppercase tracking-wide text-muted-foreground group-hover:text-foreground cursor-pointer flex-1">
                      {uiI18n.t('app.18_adult_content_9017958f')}
                    </label>
                    {localMangaAdult && <span className="text-[10px] text-primary animate-pulse font-black">{uiI18n.t('app.enabled_e22fb092')}</span>}
                  </div>
                </div>

                <NovelSearchFilters value={localNovelFilters} onChange={setLocalNovelFilters} genres={anilistGenres} />

                {/* Common Section */}
                <div className="space-y-4 rounded-2xl border border-white/[0.06] bg-white/[0.015] p-4 md:p-5">
                  <div className="flex items-center gap-2 pb-2 border-b border-white/5">
                    <SlidersHorizontal className="w-4 h-4 text-primary" />
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-foreground">{uiI18n.t('app.general_tuning_6eb6147d')}</h3>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="filter-localSortMode" className="text-xs text-muted-foreground font-semibold">{uiI18n.t('app.global_sort_method_e38cf87c')}</label>
                    <ThemedSelect
                      id="filter-localSortMode"
                      value={localSortMode}
                      onChange={(e) => setLocalSortMode(e.target.value as any)}
                      className="w-full h-11 rounded-xl bg-background/80 border border-white/10 px-3 text-sm outline-none transition-[color,background-color,border-color,opacity,transform] cursor-pointer hover:border-white/25 hover:bg-background focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="relevance">{uiI18n.t('app.relevance_dcb70f52')}</option>
                      <option value="rating">{uiI18n.t('app.highest_rating_2b1db9e1')}</option>
                      <option value="popularity">{uiI18n.t('app.popularity_be6c200f')}</option>
                      <option value="title">{uiI18n.t('app.title_a_z_ed803fe1')}</option>
                    </ThemedSelect>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground font-semibold">{uiI18n.t('app.min_rating_a8ae7609')}</p>
                      <span className="text-xs font-bold text-primary">{localMinRating.toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={10}
                      step={0.5}
                      aria-label={uiI18n.t('app.minimum_rating_bdb888a3')} value={localMinRating}
                      onChange={(e) => setLocalMinRating(Number(e.target.value))}
                      className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground font-semibold">{uiI18n.t('app.min_release_year_e7f7c51e')}</p>
                    <div className="relative">
                      <Input
                        type="number"
                        min={1900}
                        max={new Date().getFullYear() + 1}
                        aria-label={uiI18n.t('app.minimum_release_year_5f7499af')} value={localMinReleaseYear || ''}
                        onChange={(e) => setLocalMinReleaseYear(Math.max(0, Number(e.target.value) || 0))}
                        className="h-10 rounded-xl bg-background/80 border-white/10 focus:border-primary/50"
                        placeholder={uiI18n.t('app.any_year_7a823621')}
                      />
                      {localMinReleaseYear > 0 && (
                        <button
                          onClick={() => setLocalMinReleaseYear(0)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground font-semibold">{uiI18n.t('app.max_rating_d60f5b91')}</p>
                      <span className="text-xs font-bold text-primary">{localMaxRating > 0 ? localMaxRating.toFixed(1) : uiI18n.t('app.any_322444d3')}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={10}
                      step={0.5}
                      aria-label={uiI18n.t('app.maximum_rating_ccbb633d')} value={localMaxRating}
                      onChange={(e) => setLocalMaxRating(Number(e.target.value))}
                      className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground font-semibold">{uiI18n.t('app.max_release_year_3431e8c7')}</p>
                    <div className="relative">
                      <Input
                        type="number"
                        min={1900}
                        max={new Date().getFullYear() + 1}
                        aria-label={uiI18n.t('app.maximum_release_year_805454f8')} value={localMaxReleaseYear || ''}
                        onChange={(e) => setLocalMaxReleaseYear(Math.max(0, Number(e.target.value) || 0))}
                        className="h-10 rounded-xl bg-background/80 border-white/10 focus:border-primary/50"
                        placeholder={uiI18n.t('app.any_year_7a823621')}
                      />
                      {localMaxReleaseYear > 0 && (
                        <button
                          onClick={() => setLocalMaxReleaseYear(0)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground font-semibold">{uiI18n.t('app.season_62255f56')} <span className="text-muted-foreground/60 normal-case">{uiI18n.t('app.anime_1483ec5d')}</span></p>
                    <ThemedSelect aria-label={uiI18n.t('app.season_62255f56')}
                        value={localSeason}
                      onChange={(e) => setLocalSeason(e.target.value)}
                      className="w-full h-11 rounded-xl bg-background/80 border border-white/10 px-3 text-sm outline-none transition-[color,background-color,border-color,opacity,transform] cursor-pointer hover:border-white/25 hover:bg-background focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="all">{uiI18n.t('app.any_season_3959b2c5')}</option>
                      <option value="WINTER">{uiI18n.t('app.winter_24615d93')}</option>
                      <option value="SPRING">{uiI18n.t('app.spring_89677615')}</option>
                      <option value="SUMMER">{uiI18n.t('app.summer_7c92fc5c')}</option>
                      <option value="FALL">{uiI18n.t('app.fall_5c1ae82c')}</option>
                    </ThemedSelect>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground font-semibold">{uiI18n.t('app.episodes_49d641ba')} <span className="text-muted-foreground/60 normal-case">{uiI18n.t('app.anime_1483ec5d')}</span></p>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="number"
                        min={0}
                        aria-label={uiI18n.t('app.minimum_episodes_602509da')} value={localMinEpisodes || ''}
                        onChange={(e) => setLocalMinEpisodes(Math.max(0, Number(e.target.value) || 0))}
                        className="h-10 rounded-xl bg-background/80 border-white/10 focus:border-primary/50"
                        placeholder={uiI18n.t('app.min_7eb0cee8')}
                      />
                      <Input
                        type="number"
                        min={0}
                        aria-label={uiI18n.t('app.maximum_episodes_99e6d079')} value={localMaxEpisodes || ''}
                        onChange={(e) => setLocalMaxEpisodes(Math.max(0, Number(e.target.value) || 0))}
                        className="h-10 rounded-xl bg-background/80 border-white/10 focus:border-primary/50"
                        placeholder={uiI18n.t('app.max_a95e85ae')}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground font-semibold">{uiI18n.t('app.image_confidence_3ed346c3')}</p>
                      <span className="text-xs font-bold text-primary">{Math.round(imageConfidenceThreshold * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0.5}
                      max={1}
                      step={0.01}
                      aria-label={uiI18n.t('app.image_confidence_6efb4be8')} value={imageConfidenceThreshold}
                      onChange={(e) => setImageConfidenceThreshold(Number(e.target.value))}
                      className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                  </div>

                </div>

              </div>

            </GlassPanel>

          )}



        {/* Image Search Results Overlay/Section */}
        </div>
        {imageResults && (
          <div className="mb-12 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Film className="w-5 h-5 text-primary" />
                {uiI18n.t('app.scene_33446003')} <span className="text-primary italic">{uiI18n.t('app.identification_9d2c7063')}</span>
                <span className="text-sm font-normal text-muted-foreground ml-1">({filteredImageResults.length} {uiI18n.t('app.match_ef5c844e')}{filteredImageResults.length !== 1 ? uiI18n.t('app.es_09cd68a2') : ''})</span>
              </h2>
              <button
                onClick={() => { setImageResults(null); setSelectedFile(null); }}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {uiI18n.t('app.clear_719ea396')}
              </button>
            </div>
            {filteredImageResults.length === 0 ? (
              <GlassPanel className="p-6 text-sm text-muted-foreground">
                {uiI18n.t('app.no_frame_matches_above_a2661490')} {Math.round(imageConfidenceThreshold * 100)}{uiI18n.t('app.confidence_lower_the_confidence_filter_to_see_mo_a747aab3')}
              </GlassPanel>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {filteredImageResults.map((result, idx) => {
                  const animeTitle = result._animeTitle || (() => {
                    // Fallback: parse from filename like "[Group] Title - 01 (…)"
                    const namePart = result.filename?.split('] ')?.[1]?.split(' - ')?.[0]?.trim();
                    return namePart || result.filename || 'Unknown Anime';
                  })();
                  const similarityPct = (result.similarity * 100).toFixed(1);
                  const similarityColor =
                    result.similarity >= 0.95
                      ? 'text-emerald-400'
                      : result.similarity >= 0.85
                      ? 'text-amber-400'
                      : 'text-muted-foreground';
                  const timestampSecs = typeof result.at === 'number' ? result.at : null;
                  const formatTimestamp = (secs: number) => {
                    const h = Math.floor(secs / 3600);
                    const m = Math.floor((secs % 3600) / 60);
                    const s = Math.floor(secs % 60);
                    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
                    return `${m}:${String(s).padStart(2,'0')}`;
                  };

                  return (
                    <GlassPanel key={`img-result-${idx}`} className="overflow-hidden group hover:border-primary/40 transition-colors flex flex-col">
                      {/* Preview image / video row */}
                      <div className="relative aspect-video bg-black flex-shrink-0 overflow-hidden">
                        <img
                          src={result.image}
                          alt={uiI18n.t('app.frame_from_i18n_value_0_9347f326', { value0: animeTitle })}
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                        {/* Similarity badge */}
                        <div className={`absolute top-2 right-2 px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-sm text-xs font-black ${similarityColor}`}>
                          {similarityPct}%
                        </div>
                        {/* Episode badge */}
                        {result.episode != null && (
                          <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/70 backdrop-blur-sm text-xs font-bold text-white">
                            {uiI18n.t('app.ep_00c1bff9')} {result.episode}
                          </div>
                        )}
                        {/* Timestamp */}
                        {timestampSecs !== null && (
                          <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[10px] text-white font-mono">
                            {formatTimestamp(timestampSecs)}
                          </div>
                        )}
                        {/* Video preview button */}
                        {result.video && (
                          <a
                            href={result.video}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30"
                            onClick={(e) => e.stopPropagation()}
                            title={uiI18n.t('app.preview_scene_08210673')}
                          >
                            <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/30 hover:bg-white/30 transition-colors">
                              <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                            </div>
                          </a>
                        )}
                      </div>

                      {/* Content */}
                      <div className="p-4 flex gap-3 flex-1">
                        {/* Cover image */}
                        {result._animeCover && (
                          <img
                            src={result._animeCover}
                            alt=""
                            className="w-10 h-14 object-cover rounded-lg shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm leading-tight line-clamp-2 mb-1">{animeTitle}</p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                            {result.episode != null && (
                              <span className="font-semibold text-foreground/70">{uiI18n.t('app.episode_8669aa56')} {result.episode}</span>
                            )}
                            {timestampSecs !== null && (
                              <span>{uiI18n.t('app.at_27e90dfa')} {formatTimestamp(timestampSecs)}</span>
                            )}
                            <span className={`font-black ${similarityColor}`}>{similarityPct}{uiI18n.t('app.match_a12e74de')}</span>
                          </div>
                          <div className="mt-3 flex gap-2">
                            <button
                              onClick={() => navigate(`/anime/${result.anilist}`)}
                              className="flex-1 py-1.5 rounded-lg bg-primary/15 hover:bg-primary/30 text-[10px] font-bold text-primary transition-[color,background-color,border-color,opacity,transform] border border-primary/20 hover:border-primary/40"
                            >
                              {uiI18n.t('app.view_anime_fcdc083e')}
                            </button>
                            <button
                              onClick={() => navigate(`/search?q=${encodeURIComponent(animeTitle)}`)}
                              className="flex-1 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] font-bold text-muted-foreground hover:text-foreground transition-[color,background-color,border-color,opacity,transform] border border-white/5"
                            >
                              {uiI18n.t('app.search_bce06414')}
                            </button>
                          </div>
                        </div>
                      </div>
                    </GlassPanel>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {query && extensionResults && extensionResults.length > 0 && (
          <div className="mb-12 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold flex items-center gap-3">
              <Puzzle className="w-5 h-5 text-primary" />
              {uiI18n.t('extensions.searchResults', { defaultValue: 'Extension results' })} ({filteredExtensionResults.length})
            </h2><label className="flex items-center gap-2 text-sm">Source<ThemedSelect aria-label="Filter extension results by source" className={controlTriggerClass} value={extensionFilter} onChange={event => setExtensionFilter(event.target.value)}><option value="all">All enabled sources</option>{[...extensionOptions].map(([id, name]) => <option key={id} value={id}>{name}</option>)}</ThemedSelect></label></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredExtensionResults.map((result, idx) => (
                <GlassPanel key={result.route || idx} role="button" tabIndex={0} className="p-4 flex gap-4 items-center group hover:border-primary/50 transition-[color,background-color,border-color,opacity,transform] cursor-pointer" onClick={() => result.route ? navigate(result.route) : result.url && window.open(result.url, '_blank', 'noopener,noreferrer')} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); result.route ? navigate(result.route) : result.url && window.open(result.url, '_blank', 'noopener,noreferrer'); } }}>
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                    {result.image ? (
                      <img src={result.image} alt="" className="w-full h-full object-cover rounded-xl" />
                    ) : (
                      <Puzzle className="w-6 h-6" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm truncate">{result.title}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] font-black uppercase tracking-widest text-primary/70">{result.providerName}</span>
                      <span className="text-[10px] text-muted-foreground">• {result.type || uiI18n.t('app.result_5faa59d4')}</span>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </GlassPanel>
              ))}
            </div>
          </div>
        )}

        {hasSearchContext ? (
          hybridLoading && !hasAnyResult ? (
            <PosterGridSkeleton count={14} className="mt-6" />
          ) : (
          <>
            {showCharacterResults && characterResults.length > 0 && (
              <div className="mb-12">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 rounded-xl bg-primary/10 text-primary">
                    <User className="w-5 h-5" />
                  </div>
                  <h2 className="text-2xl font-black tracking-tight">{uiI18n.t('app.character_ee9946c8')} <span className="text-primary italic">{uiI18n.t('app.matches_ee2dbd5d')}</span></h2>
                </div>
                <div className={POSTER_GRID_CLASS}>
                  {characterResults.map((character: any) => (
                    <UnifiedMediaCard
                      key={character.id}

                      item={{
                        id: String(character.id),
                        name: character.name?.full || character.name || 'Character',
                        mediaType: 'character',
                        poster: character.image?.large || character.image?.medium || character.poster || '/placeholder.svg',
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Episode title search results */}
            {showEpisodeSearch && episodeTitleResults.length > 0 && (
              <div className="mb-12">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 rounded-xl bg-primary/10 text-primary">
                    <Film className="w-5 h-5" />
                  </div>
                  <h2 className="text-2xl font-black tracking-tight">
                    {uiI18n.t('app.episode_8669aa56')} <span className="text-primary italic">{uiI18n.t('app.matches_ee2dbd5d')}</span>
                    <span className="ml-2 text-sm font-normal text-muted-foreground">{uiI18n.t('app.by_episode_title_03d8c78e')}</span>
                  </h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {episodeTitleResults.map((hit: any, idx: number) => (
                    <GlassPanel
                      key={`ep-${hit.anilistId ?? idx}`}
                      className="p-3 flex items-center gap-4 hover:bg-white/10 transition-[color,background-color,border-color,opacity,transform] cursor-pointer group border-white/5 hover:border-primary/30"
                      onClick={() => navigate(`/anime/${hit.animeId || hit.anilistId}`)}
                    >
                      {hit.animePoster && (
                        <div className="relative w-12 h-16 flex-shrink-0 overflow-hidden rounded-xl border border-white/10">
                          <img
                            src={hit.animePoster}
                            alt={hit.animeName}
                            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                            loading="lazy"
                          />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-sm truncate group-hover:text-primary transition-colors">{hit.animeName}</p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          <span className="font-semibold text-primary/70">{uiI18n.t('app.episode_8bffcf5b')} </span>{hit.episodeTitle}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] font-black uppercase tracking-widest text-primary/50 bg-primary/10 px-1.5 py-0.5 rounded-md">{uiI18n.t('app.episode_match_4f089f26')}</span>
                          <ChevronRight className="w-3 h-3 text-muted-foreground/40 group-hover:translate-x-1 transition-transform" />
                        </div>
                      </div>
                    </GlassPanel>
                  ))}
                </div>
              </div>
            )}

            {showNovelResults && novelSearchError && (
              <div role="alert" className="my-6 rounded-2xl border border-destructive/30 p-5">
                <p>{novelSearchError.message}</p>
                <Button className="mt-3" onClick={() => void retryNovelSearch()}>{uiI18n.t('app.retry_novel_search_bb8570e7')}</Button>
              </div>
            )}
            {showMangaResults && mangaSearchError && (
              <div role="alert" className="my-6 rounded-2xl border border-destructive/30 p-5">
                <p>{mangaSearchError.message}</p>
                <Button className="mt-3" onClick={() => void retryMangaSearch()}>{uiI18n.t('app.retry_manga_search_94f4e4f5')}</Button>
              </div>
            )}
            {showMangaResults && infiniteMangaData?.pages[0]?.source === 'mangabaka' && (
              <p className="my-4 text-sm text-muted-foreground">{uiI18n.t('app.catalog_4dabf82c')} <a className="underline" href="https://mangabaka.org/data/api" target="_blank" rel="noreferrer">{uiI18n.t('app.mangabaka_and_its_metadata_providers_7f97fa76')}</a>{uiI18n.t('app.titles_without_a_tatakai_mapping_open_on_mangaba_20de82ca')}</p>
            )}
            {(showAnimeResults || showMangaResults || showNovelResults) && (hasMixedResults || hasMoreResults) && (
              <>
                <div className={POSTER_GRID_CLASS}>
                  {unifiedResults.map((item) => (
                    <UnifiedMediaCard key={item.id} item={item} />
                  ))}
                </div>

                {/* Infinite Scroll Trigger */}
                <div ref={scrollRef} className="h-20 mt-8 flex flex-col items-center justify-center gap-3">
                  {isFetchingMoreResults ? (
                    <div className="flex items-center gap-3 text-primary animate-pulse bg-primary/5 px-6 py-3 rounded-2xl border border-primary/10">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="text-sm font-bold uppercase tracking-wider">{uiI18n.t('app.loading_more_35e3dc3d')}</span>
                    </div>
                  ) : hasMoreResults ? (
                    <Button variant="outline" onClick={() => {
                      if (hasNextAnimePage) void (isProducerRoute ? fetchNextProducerPage() : fetchNextSearchPage());
                      if (hasNextMangaPage) void fetchNextMangaPage();
                      if (hasNextNovelPage) void fetchNextNovelPage();
                    }}>{uiI18n.t('app.load_more_results_1faf82e4')}</Button>
                  ) : (
                    <div className="flex flex-col items-center gap-2 opacity-40">
                      <div className="h-px w-24 bg-border" />
                      <span className="text-[10px] font-black uppercase tracking-[0.2em]">{uiI18n.t('app.end_of_results_a68743b8')}</span>
                    </div>
                  )}
                </div>
              </>
            )}

            {!hasAnyResult && !hasMoreResults && !mangaSearchError && !novelSearchError && (
              <div className="text-center py-20">
                <Search className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <h2 className="text-xl font-semibold mb-2">{uiI18n.t('app.no_results_found_658e79f9')}</h2>
                <p className="text-muted-foreground">{uiI18n.t('app.try_broadening_filters_or_using_a_different_quer_3e21e6f7')}</p>
              </div>
            )}
          </>
          )
        ) : (
          <div className="mt-8 flex w-full flex-col items-center text-center">
            {recentSearches.length > 0 && (
              <div className="mb-8 w-full max-w-3xl">
                <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">{uiI18n.t('app.recent_searches_a73d2913')}</p>
                <div className="flex flex-wrap justify-center gap-2.5">
                  {recentSearches.map((term, idx) => (
                    <div key={idx} className="group inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-xs transition-[color,background-color,border-color,opacity,transform]">
                      <button
                        onClick={() => runRecentSearch(term)}
                        className="font-medium text-foreground"
                      >
                        {term}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteSearchItem(term); }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity ml-1 text-muted-foreground hover:text-destructive"
                        title={uiI18n.t('app.remove_e963907d')}
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}


          </div>
        )}
      </main>

      <MobileNav />
    </div>
  );
}

