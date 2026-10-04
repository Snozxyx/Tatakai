import { useSearchParams, useNavigate, useParams } from "react-router-dom";
import { Background } from "@/components/layout/Background";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
// import { Header } from "@/components/layout/Header";
import { useIsNativeApp } from "@/hooks/ui/useIsNativeApp";
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
import { useRef, useCallback, useState, useEffect, useMemo } from "react";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { searchCharacters } from "@/core/content/character-client";
import { fetchProducerAnimes } from "@/lib/api";
import { type MangaSearchOptions } from "@/core/content/manga-client";
import { getProxiedImageUrl } from "@/lib/api";
import { UnifiedMediaCard } from "@/components/UnifiedMediaCard";
import { useContentSafetySettings } from "@/hooks/user/useContentSafetySettings";
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
import { discoverYears, DISCOVER_SORTS, type DiscoverSort, useDiscoverMedia } from '@/hooks/api/useDiscover';
import { controlItemClass, controlMenuClass, controlTriggerClass } from '@/components/anime/discover/types';
import { celebrate, type CelebrateVariant } from '@/components/effects/Celebrate';

function useExtensionSearch(query: string, enabled: boolean) {
  return useQuery({
    queryKey: ['extension-search', query],
    queryFn: async () => {
      const providers = extensionRegistry.getSearchProviders();
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
      return results.flat();
    },
    enabled: enabled && query.length > 2,
    staleTime: 5 * 60 * 1000,
  });
}


export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const { producerName } = useParams<{ producerName?: string }>();
  const navigate = useNavigate();
  const isNative = useIsNativeApp();
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
  const [resultType, setResultType] = useState<'all' | 'anime' | 'manga' | 'character'>(() => {
    const t = searchParams.get("type");
    if (t === 'manga') return 'manga';
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
    const generic = typeParam !== 'manga' ? searchParams.getAll('tag').concat(searchParams.get('tags')?.split(',') ?? []) : [];
    return Array.from(new Set([...values, ...(packed ? packed.split(',') : []), ...generic].filter(Boolean)));
  });
  const [selectedMangaTags, setSelectedMangaTags] = useState<string[]>(() => {
    const values = searchParams.getAll('mangaTag').concat(searchParams.getAll('manwhaTag'));
    const packed = searchParams.get('mangaTags') || searchParams.get('manwhaTags');
    const typeParam = searchParams.get('type');
    const generic = typeParam === 'manga' ? searchParams.getAll('tag').concat(searchParams.get('tags')?.split(',') ?? []) : [];
    return Array.from(new Set([...values, ...(packed ? packed.split(',') : []), ...generic].filter(Boolean)));
  });
  const [tagSearch, setTagSearch] = useState('');
  const [mangaTagSearch, setMangaTagSearch] = useState('');
  const [showSpoilerTags, setShowSpoilerTags] = useState(false);

  const { data: anilistTags = [] } = useQuery({
    queryKey: ['anilist-media-tags'],
    queryFn: async () => {
      const response = await fetch(`${resolveApiV3Base()}/content/tags`);
      if (!response.ok) return [];
      const payload = await response.json();
      return Array.isArray(payload?.data) ? payload.data as Array<{
        id: number;
        name: string;
        description?: string | null;
        category?: string | null;
        isGeneralSpoiler?: boolean;
        isAdult?: boolean;
      }> : [];
    },
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
  const shouldSearchCharacters = (resultType === 'all' || resultType === 'character') && !isProducerRoute;
  const shouldDelaySecondaryStreams = resultType === 'all' && query.length > 0 && !isProducerRoute;
  const shouldEnableCharacterSearch =
    shouldSearchCharacters && (!shouldDelaySecondaryStreams || enableSecondaryResultStreams);
  const { settings: contentSafetySettings } = useContentSafetySettings();
  const { genres: anilistGenres } = useAniListGenres();
  // Group tag options by AniList category, hiding general-spoiler tags unless
  // the viewer opts in. Returns [{ category, tags }] sorted by category name.
  const groupTagOptions = useCallback((term: string) => {
    const needle = term.trim().toLowerCase();
    const rows = anilistTags
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
  const filteredMangaTagOptions = useMemo(() => groupTagOptions(mangaTagSearch), [groupTagOptions, mangaTagSearch]);
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
    isLoading: isLoadingManga
  } = useInfiniteMangaSearch(query, 20, shouldEnableMangaSearch, mangaSearchOptions);

  const { data: extensionResults, isLoading: isLoadingExtensions } = useExtensionSearch(query, resultType === 'all' || resultType === 'anime');


  const observer = useRef<IntersectionObserver>();
  const loadMoreLockRef = useRef(false);
  const scrollRef = useCallback((node: HTMLDivElement) => {
    if (isLoadingAnime || isLoadingManga) return;
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
        }
      }

      if (didRequestNextPage) {
        loadMoreLockRef.current = true;
      }
    }, { rootMargin: '120px 0px' });
    if (node) observer.current.observe(node);
  }, [isLoadingAnime, hasNextAnimePage, isFetchingNextAnimePage, isProducerRoute, fetchNextProducerPage, fetchNextSearchPage, isLoadingManga, hasNextMangaPage, isFetchingNextMangaPage, fetchNextMangaPage, resultType]);

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
    resultType,
    sortMode,
    contentSafetySettings.showAdultEverywhere,
    contentSafetySettings.blurAdultInSearch,
    explicitMangaQuery,
    mangaAdultFilter,
    isAdultTitleSearchIntent,
    query,
  ]);

  const activeFilterCount = useMemo(() => {
    return [
      animeTypeFilter !== 'all',
      animeStatusFilter !== 'all',
      animeGenreFilter !== 'all',
      animeSortFilter !== 'default',
      mangaTypeFilter !== 'all',
      mangaStatusFilter !== 'all',
      mangaGenreFilter !== 'all',
      mangaOrigin !== 'all',
      mangaAdultFilter,
      minRating > 0,
      minReleaseYear > 0,
      selectedAnimeTags.length > 0 || selectedMangaTags.length > 0,
      sortMode !== 'relevance',
    ].filter(Boolean).length;
  }, [
    animeTypeFilter,
    animeStatusFilter,
    animeGenreFilter,
    animeSortFilter,
    mangaTypeFilter,
    mangaStatusFilter,
    mangaGenreFilter,
    mangaOrigin,
    mangaAdultFilter,
    minRating,
    minReleaseYear,
    selectedAnimeTags,
    selectedMangaTags,
    sortMode,
  ]);

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

      if (!response.ok) throw new Error("Search failed");
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
    setQuery(queryParam);
    setSearchInput(queryParam);
    const typeParam = searchParams.get('type');
    if (typeParam === 'anime' || typeParam === 'manga' || typeParam === 'character' || typeParam === 'all') {
      setResultType(typeParam as any);
    }
    const genericTags = searchParams.getAll('tag').concat(searchParams.get('tags')?.split(',') ?? []);
    const animeTags = searchParams.getAll('animeTag').concat(typeParam !== 'manga' ? genericTags : []);
    const mangaTags = searchParams.getAll('mangaTag').concat(searchParams.getAll('manwhaTag')).concat(typeParam === 'manga' ? genericTags : []);
    setSelectedAnimeTags(Array.from(new Set(animeTags.concat(searchParams.get('animeTags')?.split(',') ?? []).filter(Boolean))));
    setSelectedMangaTags(Array.from(new Set(mangaTags.concat((searchParams.get('mangaTags') || searchParams.get('manwhaTags'))?.split(',') ?? []).filter(Boolean))));
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
  const showCharacterResults = shouldEnableCharacterSearch && query.length > 1;
  const isQuerylessMangaMode = showMangaResults && mangaSearchMode !== 'search';
  const hasSearchContext = query.length > 0 || isQuerylessMangaMode || animeFilterActive || genreFilterActive || tagFilterActive;
  const hasMoreResults =
    (showAnimeResults && !!hasNextAnimePage) ||
    (showMangaResults && !!hasNextMangaPage);
  const isFetchingMoreResults =
    (showAnimeResults && !!isFetchingNextAnimePage) ||
    (showMangaResults && !!isFetchingNextMangaPage);
  const hasMixedResults = unifiedResults.length > 0;
  const hasCharacterResults = characterResults.length > 0;
  const hasAnyResult = hasMixedResults || (showCharacterResults && hasCharacterResults);

  // Keep search responsive even if one provider is slow/unavailable.
  const isAnimeInitialLoading = showAnimeResults && isLoadingAnime && allAnimeResults.length === 0;
  const isMangaInitialLoading = showMangaResults && isLoadingManga && allMangaResults.length === 0;
  const isCharacterInitialLoading = showCharacterResults && loadingCharacters && characterResults.length === 0;
  const hybridLoading = isAnimeInitialLoading || isMangaInitialLoading || isCharacterInitialLoading;

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
        "relative z-10 pr-6 py-6 max-w-[1800px] mx-auto pb-24 md:pb-6",
        isNative ? "p-6" : "pl-6 md:pl-32"
      )}>
        {/* Discover Hero when browsing */}
        {!hasSearchContext && !isProducerRoute && (
          <div className="mb-8 mt-2">
            <DiscoverHero />
          </div>
        )}

        {/* Centered Search Bar in Middle of Page after Hero */}
        <div className="flex justify-center mb-8">
          <form onSubmit={handleSearch} className="w-full max-w-2xl">
            <div className="relative flex items-center shadow-2xl rounded-full">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-primary pointer-events-none" />
              <Input
                id="tatakai-search-page-input"
                type="text"
                placeholder="Search anime, manga, characters..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-14 pr-32 h-14 bg-card/85 hover:bg-card focus:bg-card border border-white/15 hover:border-primary/40 focus:border-primary rounded-full text-base shadow-lg shadow-black/20 backdrop-blur-md transition-all"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                {searchInput && (
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    className="p-1.5 rounded-full hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors"
                    title="Clear"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="submit"
                  className="px-5 h-9 rounded-full bg-primary text-primary-foreground font-semibold text-sm hover:brightness-110 active:scale-95 transition-all shadow-md"
                >
                  Search
                </button>
              </div>
            </div>
          </form>
        </div>

        <div className="mb-8 md:mb-10">
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 mb-6">
            <div>
              <h1 className="font-display text-2xl md:text-3xl font-bold flex items-center gap-3">
                <Search className="w-6 h-6 md:w-7 md:h-7 text-primary" />
                {hasSearchContext ? 'Search Results' : 'Discover'}
              </h1>
              {(query || isQuerylessMangaMode) && (
                <p className="text-muted-foreground text-xs md:text-sm mt-1">
                  {query ? (
                    <>
                      Showing results for "<span className="text-foreground font-medium">{query}</span>"
                    </>
                  ) : (
                    <>Showing manga discovery results</>
                  )}
                  {` • ${filteredAnimeResults.length} anime`}
                  {` • ${filteredMangaResults.length} manga`}
                  {showCharacterResults && ` • ${characterResults.length} characters`}
                  {activeFilterCount > 0 && ` • ${activeFilterCount} active filters`}
                  {!contentSafetySettings.showAdultEverywhere &&
                    ` • mature results ${(explicitMangaQuery || mangaAdultFilter || query.trim().length > 0) ? 'blurred' : 'hidden'}`}
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
              label="Sort"
            />

            {/* Type Switcher Pills */}
            <div className="flex bg-muted/40 p-1 rounded-full border border-white/5">
              {[
                { id: 'all', label: 'All' },
                { id: 'anime', label: 'Anime', icon: <Film className="w-3 h-3" /> },
                { id: 'manga', label: 'Manga', icon: <BookOpen className="w-3 h-3" /> },
                { id: 'character', label: 'Characters' }
              ].map(type => (
                <button
                  key={type.id}
                  onClick={() => setResultType(type.id as any)}
                  className={cn(
                    "px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all whitespace-nowrap",
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
                {minReleaseYear > 0 ? minReleaseYear : 'Any year'}
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
                  Any year
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
                <span className="max-w-[120px] truncate">{selectedFile ? selectedFile.name : 'Image search'}</span>
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
                  className="px-3.5 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-bold hover:brightness-110 active:scale-95 transition-all flex items-center gap-1.5"
                >
                  {isSearchingImage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Identify'}
                </button>
              )}
            </div>

            {/* Genre Dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger className={controlTriggerClass}>
                <Tag className="h-3.5 w-3.5 opacity-60" />
                {resolvedAnimeGenre || (animeGenreFilter !== 'all' ? animeGenreFilter : 'Genre')}
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
                  All genres
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
              onClick={() => setShowAdvancedAssist((val) => !val)}
              className={cn(
                "h-8 px-3 rounded-full text-xs font-semibold border transition-all flex items-center gap-1.5",
                showAdvancedAssist
                  ? "border-primary text-primary bg-primary/10 shadow-sm"
                  : "border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20 bg-muted/20"
              )}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Filters</span>
              {activeFilterCount > 0 && (
                <span className="flex items-center justify-center w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {showAdvancedAssist && (
            <GlassPanel className="mt-4 p-4 md:p-6 space-y-6 border border-white/10 shadow-xl overflow-hidden relative animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="flex flex-wrap items-center justify-between gap-4 relative z-10 pb-3 border-b border-white/5">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-primary" />
                  <span className="text-xs font-bold uppercase tracking-wider">Power Filters</span>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
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
                    }}
                    className="h-9 px-3.5 rounded-xl text-xs font-bold uppercase tracking-wide bg-background/70 border border-white/10 text-muted-foreground hover:text-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-all"
                  >
                    Reset all
                  </button>

                  <button
                    onClick={applyFilters}
                    className="h-9 px-6 rounded-xl bg-primary text-primary-foreground font-bold hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/20 flex items-center gap-2 text-xs"
                  >
                    <Search className="w-3.5 h-3.5" />
                    Apply Filters
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pt-2">
                {/* Anime Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-white/5">
                    <Film className="w-4 h-4 text-primary" />
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-foreground">Anime Filters</h3>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Type</p>
                      <select
                        value={localAnimeType}
                        onChange={(e) => setLocalAnimeType(e.target.value)}
                        className="w-full h-10 rounded-xl bg-background/80 border border-white/10 px-3 text-sm focus:border-primary/50 outline-none transition-colors"
                      >
                        <option value="all">All types</option>
                        <option value="tv">TV</option>
                        <option value="movie">Movie</option>
                        <option value="ova">OVA</option>
                        <option value="ona">ONA</option>
                        <option value="special">Special</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Status</p>
                      <select
                        value={localAnimeStatus}
                        onChange={(e) => setLocalAnimeStatus(e.target.value)}
                        className="w-full h-10 rounded-xl bg-background/80 border border-white/10 px-3 text-sm focus:border-primary/50 outline-none transition-colors"
                      >
                        <option value="all">Any status</option>
                        <option value="currently-airing">Currently Airing</option>
                        <option value="finished-airing">Finished Airing</option>
                        <option value="not-yet-aired">Not Yet Aired</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Genre</p>
                    <select
                      value={localAnimeGenre}
                      onChange={(e) => setLocalAnimeGenre(e.target.value)}
                      className="w-full h-10 rounded-xl bg-background/80 border border-white/10 px-3 text-sm focus:border-primary/50 outline-none transition-colors"
                    >
                      <option value="all">Any genre</option>
                      {animeGenreOptions.map((genre) => (
                        <option key={genre.value} value={genre.value}>
                          {genre.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Tags className="w-3.5 h-3.5 text-primary" />
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">AniList Tags</p>
                    </div>
                    <Input
                      value={tagSearch}
                      onChange={(event) => setTagSearch(event.target.value)}
                      placeholder="Search tags..."
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
                      {showSpoilerTags ? 'Hiding nothing — spoiler tags shown' : 'Show spoiler tags'}
                    </button>
                    {selectedAnimeTags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {selectedAnimeTags.map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            title="Remove tag"
                            onClick={() => setSelectedAnimeTags((current) => current.filter((value) => value !== tag))}
                            className="rounded-md bg-primary/15 px-2 py-1 text-[10px] font-bold text-primary hover:bg-primary/25"
                          >
                            {tag} x
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="flex max-h-40 flex-col gap-2 overflow-y-auto pr-1">
                      {filteredTagOptions.map(({ category, tags }) => (
                        <div key={category} className="space-y-1">
                          <p className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground/70 font-bold sticky top-0 bg-background/95 py-0.5">{category}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {tags.map((tag) => (
                              <button
                                key={tag.id}
                                type="button"
                                title={tag.description || tag.category || tag.name}
                                onClick={() => setSelectedAnimeTags((current) => current.includes(tag.name) ? current.filter((value) => value !== tag.name) : [...current, tag.name])}
                                className={cn(
                                  "rounded-md border px-2 py-1 text-[10px] transition-colors",
                                  selectedAnimeTags.includes(tag.name)
                                    ? "border-primary/50 bg-primary/15 text-primary"
                                    : "border-white/10 bg-background/60 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                                )}
                              >
                                {tag.name}
                                {tag.isGeneralSpoiler && <span className="ml-1 text-amber-400" title="General spoiler">!</span>}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Sort Method</p>
                    <select
                      value={localAnimeSort}
                      onChange={(e) => setLocalAnimeSort(e.target.value)}
                      className="w-full h-10 rounded-xl bg-background/80 border border-white/10 px-3 text-sm focus:border-primary/50 outline-none transition-colors"
                    >
                      <option value="default">Best match</option>
                      <option value="recently-added">Recently Added</option>
                      <option value="recently-updated">Recently Updated</option>
                      <option value="score">Score</option>
                      <option value="name-a-z">Name A-Z</option>
                      <option value="released-date">Released Date</option>
                    </select>
                  </div>
                </div>

                {/* Manga Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-white/5">
                    <BookOpen className="w-4 h-4 text-primary" />
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-foreground">Manga Filters</h3>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Origin</p>
                    <select
                      value={localMangaOrigin}
                      onChange={(e) => setLocalMangaOrigin(e.target.value)}
                      className="w-full h-10 rounded-xl bg-background/80 border border-white/10 px-3 text-sm focus:border-primary/50 outline-none transition-colors"
                    >
                      <option value="all">All origins</option>
                      <option value="JP">Japan (Manga)</option>
                      <option value="KR">South Korea (Manhwa/Webtoon)</option>
                      <option value="CN">China (Manhua)</option>
                    </select>
                  </div>

                  <div className="space-y-2 rounded-xl border border-white/10 bg-background/50 p-3">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Popular Manhwa / Webtoon Tags</p>
                    <div className="flex flex-wrap gap-1.5">
                      {['Cultivation', 'Dungeon', 'Necromancy', 'Age Regression', 'Video Games', 'Revenge', 'Survival', 'Martial Arts', 'Post-Apocalyptic'].map((tag) => (
                        <button
                          key={`popular-manhwa-${tag}`}
                          type="button"
                          onClick={() => setSelectedMangaTags((current) => current.includes(tag) ? current.filter((value) => value !== tag) : [...current, tag])}
                          className={cn(
                            "rounded-md border px-2 py-1 text-[10px] transition-colors",
                            selectedMangaTags.includes(tag) ? "border-primary/50 bg-primary/15 text-primary" : "border-white/10 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                          )}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Popular Manga Tags</p>
                    <div className="flex flex-wrap gap-1.5">
                      {['School', 'Shounen', 'Seinen', 'Shoujo', 'Josei', 'Isekai', 'Cyberpunk', 'Samurai', 'Ninja', 'Family Life'].map((tag) => (
                        <button
                          key={`popular-manga-${tag}`}
                          type="button"
                          onClick={() => setSelectedMangaTags((current) => current.includes(tag) ? current.filter((value) => value !== tag) : [...current, tag])}
                          className={cn(
                            "rounded-md border px-2 py-1 text-[10px] transition-colors",
                            selectedMangaTags.includes(tag) ? "border-primary/50 bg-primary/15 text-primary" : "border-white/10 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                          )}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Format</p>
                      <select
                        value={localMangaType}
                        onChange={(e) => setLocalMangaType(e.target.value)}
                        className="w-full h-10 rounded-xl bg-background/80 border border-white/10 px-3 text-sm focus:border-primary/50 outline-none transition-colors"
                      >
                        <option value="all">All formats</option>
                        <option value="manga">Manga</option>
                        <option value="manhwa">Manhwa</option>
                        <option value="manhua">Manhua</option>
                        <option value="comics">Comics</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Status</p>
                      <select
                        value={localMangaStatus}
                        onChange={(e) => setLocalMangaStatus(e.target.value)}
                        className="w-full h-10 rounded-xl bg-background/80 border border-white/10 px-3 text-sm focus:border-primary/50 outline-none transition-colors"
                      >
                        <option value="all">Any status</option>
                        <option value="ongoing">Ongoing</option>
                        <option value="completed">Completed</option>
                        <option value="hiatus">Hiatus</option>
                        <option value="cancelled">Cancelled</option>
                        <option value="unreleased">Unreleased</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Genre</p>
                    <select
                      value={localMangaGenre}
                      onChange={(e) => setLocalMangaGenre(e.target.value)}
                      className="w-full h-10 rounded-xl bg-background/80 border border-white/10 px-3 text-sm focus:border-primary/50 outline-none transition-colors"
                    >
                      <option value="all">Any genre</option>
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
                    </select>
                  </div>

                  <div className="space-y-2 rounded-xl border border-primary/10 bg-primary/5 p-3">
                    <div className="flex items-center gap-2">
                      <Tags className="w-3.5 h-3.5 text-primary" />
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">AniList Tags</p>
                    </div>
                    <Input
                      value={mangaTagSearch}
                      onChange={(event) => setMangaTagSearch(event.target.value)}
                      placeholder="Search manga tags..."
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
                      {showSpoilerTags ? 'Spoiler tags shown' : 'Show spoiler tags'}
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
                        <span className="text-[10px] text-muted-foreground">No manga tags selected</span>
                      )}
                    </div>
                    <div className="flex max-h-40 flex-col gap-2 overflow-y-auto pr-1">
                      {filteredMangaTagOptions.map(({ category, tags }) => (
                        <div key={`manga-cat-${category}`} className="space-y-1">
                          <p className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground/70 font-bold sticky top-0 bg-background/95 py-0.5">{category}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {tags.map((tag) => (
                              <button
                                key={`manga-tag-${tag.id}`}
                                type="button"
                                title={tag.description || tag.category || tag.name}
                                onClick={() => setSelectedMangaTags((current) => current.includes(tag.name) ? current.filter((value) => value !== tag.name) : [...current, tag.name])}
                                className={cn(
                                  "rounded-md border px-2 py-1 text-[10px] transition-colors",
                                  selectedMangaTags.includes(tag.name)
                                    ? "border-primary/50 bg-primary/15 text-primary"
                                    : "border-white/10 bg-background/60 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                                )}
                              >
                                {tag.name}
                                {tag.isGeneralSpoiler && <span className="ml-1 text-amber-400" title="General spoiler">!</span>}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 p-3 rounded-xl bg-background/70 border border-white/10 hover:border-primary/30 transition-all cursor-pointer group" onClick={() => setLocalMangaAdult(!localMangaAdult)}>
                    <input
                      type="checkbox"
                      checked={localMangaAdult}
                      onChange={(e) => setLocalMangaAdult(e.target.checked)}
                      className="w-4 h-4 accent-primary rounded"
                      id="adult-filter"
                    />
                    <label htmlFor="adult-filter" className="text-xs font-bold uppercase tracking-wide text-muted-foreground group-hover:text-foreground cursor-pointer flex-1">
                      18+ Adult Content
                    </label>
                    {localMangaAdult && <span className="text-[10px] text-primary animate-pulse font-black">ENABLED</span>}
                  </div>
                </div>

                {/* Common Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 pb-2 border-b border-white/5">
                    <SlidersHorizontal className="w-4 h-4 text-primary" />
                    <h3 className="text-xs font-black uppercase tracking-[0.2em] text-foreground">General Tuning</h3>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Global Sort Method</p>
                    <select
                      value={localSortMode}
                      onChange={(e) => setLocalSortMode(e.target.value as any)}
                      className="w-full h-10 rounded-xl bg-background/80 border border-white/10 px-3 text-sm focus:border-primary/50 outline-none transition-colors"
                    >
                      <option value="relevance">Relevance</option>
                      <option value="rating">Highest Rating</option>
                      <option value="popularity">Popularity</option>
                      <option value="title">Title A-Z</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Min Rating</p>
                      <span className="text-xs font-bold text-primary">{localMinRating.toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={10}
                      step={0.5}
                      value={localMinRating}
                      onChange={(e) => setLocalMinRating(Number(e.target.value))}
                      className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Min Release Year</p>
                    <div className="relative">
                      <Input
                        type="number"
                        min={1900}
                        max={new Date().getFullYear() + 1}
                        value={localMinReleaseYear || ''}
                        onChange={(e) => setLocalMinReleaseYear(Math.max(0, Number(e.target.value) || 0))}
                        className="h-10 rounded-xl bg-background/80 border-white/10 focus:border-primary/50"
                        placeholder="Any year..."
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
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Max Rating</p>
                      <span className="text-xs font-bold text-primary">{localMaxRating > 0 ? localMaxRating.toFixed(1) : 'Any'}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={10}
                      step={0.5}
                      value={localMaxRating}
                      onChange={(e) => setLocalMaxRating(Number(e.target.value))}
                      className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Max Release Year</p>
                    <div className="relative">
                      <Input
                        type="number"
                        min={1900}
                        max={new Date().getFullYear() + 1}
                        value={localMaxReleaseYear || ''}
                        onChange={(e) => setLocalMaxReleaseYear(Math.max(0, Number(e.target.value) || 0))}
                        className="h-10 rounded-xl bg-background/80 border-white/10 focus:border-primary/50"
                        placeholder="Any year..."
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
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Season <span className="text-muted-foreground/60 normal-case">(anime)</span></p>
                    <select
                      value={localSeason}
                      onChange={(e) => setLocalSeason(e.target.value)}
                      className="w-full h-10 rounded-xl bg-background/80 border border-white/10 px-3 text-sm focus:border-primary/50 outline-none transition-colors"
                    >
                      <option value="all">Any season</option>
                      <option value="WINTER">Winter</option>
                      <option value="SPRING">Spring</option>
                      <option value="SUMMER">Summer</option>
                      <option value="FALL">Fall</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Episodes <span className="text-muted-foreground/60 normal-case">(anime)</span></p>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="number"
                        min={0}
                        value={localMinEpisodes || ''}
                        onChange={(e) => setLocalMinEpisodes(Math.max(0, Number(e.target.value) || 0))}
                        className="h-10 rounded-xl bg-background/80 border-white/10 focus:border-primary/50"
                        placeholder="Min"
                      />
                      <Input
                        type="number"
                        min={0}
                        value={localMaxEpisodes || ''}
                        onChange={(e) => setLocalMaxEpisodes(Math.max(0, Number(e.target.value) || 0))}
                        className="h-10 rounded-xl bg-background/80 border-white/10 focus:border-primary/50"
                        placeholder="Max"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-bold">Image Confidence</p>
                      <span className="text-xs font-bold text-primary">{Math.round(imageConfidenceThreshold * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0.5}
                      max={1}
                      step={0.01}
                      value={imageConfidenceThreshold}
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
                Scene <span className="text-primary italic">Identification</span>
                <span className="text-sm font-normal text-muted-foreground ml-1">({filteredImageResults.length} match{filteredImageResults.length !== 1 ? 'es' : ''})</span>
              </h2>
              <button
                onClick={() => { setImageResults(null); setSelectedFile(null); }}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear
              </button>
            </div>
            {filteredImageResults.length === 0 ? (
              <GlassPanel className="p-6 text-sm text-muted-foreground">
                No frame matches above {Math.round(imageConfidenceThreshold * 100)}% confidence. Lower the confidence filter to see more candidates.
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
                          alt={`Frame from ${animeTitle}`}
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
                            EP {result.episode}
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
                            title="Preview scene"
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
                              <span className="font-semibold text-foreground/70">Episode {result.episode}</span>
                            )}
                            {timestampSecs !== null && (
                              <span>at {formatTimestamp(timestampSecs)}</span>
                            )}
                            <span className={`font-black ${similarityColor}`}>{similarityPct}% match</span>
                          </div>
                          <div className="mt-3 flex gap-2">
                            <button
                              onClick={() => navigate(`/anime/${result.anilist}`)}
                              className="flex-1 py-1.5 rounded-lg bg-primary/15 hover:bg-primary/30 text-[10px] font-bold text-primary transition-all border border-primary/20 hover:border-primary/40"
                            >
                              View Anime
                            </button>
                            <button
                              onClick={() => navigate(`/search?q=${encodeURIComponent(animeTitle)}`)}
                              className="flex-1 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-[10px] font-bold text-muted-foreground hover:text-foreground transition-all border border-white/5"
                            >
                              Search
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
            <h2 className="text-xl font-bold mb-6 flex items-center gap-3">
              <Puzzle className="w-5 h-5 text-primary" />
              Community Modules ({extensionResults.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {extensionResults.map((result, idx) => (
                <GlassPanel key={idx} className="p-4 flex gap-4 items-center group hover:border-primary/50 transition-all cursor-pointer" onClick={() => result.url && window.open(result.url, '_blank')}>
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
                      <span className="text-[10px] text-muted-foreground">• {result.type || 'Result'}</span>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </GlassPanel>
              ))}
            </div>
          </div>
        )}

        {hasSearchContext ? (
          hybridLoading ? (
            <PosterGridSkeleton count={14} className="mt-6" />
          ) : (
          <>
            {showCharacterResults && characterResults.length > 0 && (
              <div className="mb-12">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 rounded-xl bg-primary/10 text-primary">
                    <User className="w-5 h-5" />
                  </div>
                  <h2 className="text-2xl font-black tracking-tight">Character <span className="text-primary italic">Matches</span></h2>
                </div>
                <div className={POSTER_GRID_CLASS}>
                  {characterResults.map((character: any) => (
                    <UnifiedMediaCard
                      key={character.id}
                      variant="poster"
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
                    Episode <span className="text-primary italic">Matches</span>
                    <span className="ml-2 text-sm font-normal text-muted-foreground">(by episode title)</span>
                  </h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {episodeTitleResults.map((hit: any, idx: number) => (
                    <GlassPanel
                      key={`ep-${hit.anilistId ?? idx}`}
                      className="p-3 flex items-center gap-4 hover:bg-white/10 transition-all cursor-pointer group border-white/5 hover:border-primary/30"
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
                          <span className="font-semibold text-primary/70">Episode: </span>{hit.episodeTitle}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] font-black uppercase tracking-widest text-primary/50 bg-primary/10 px-1.5 py-0.5 rounded-md">Episode Match</span>
                          <ChevronRight className="w-3 h-3 text-muted-foreground/40 group-hover:translate-x-1 transition-transform" />
                        </div>
                      </div>
                    </GlassPanel>
                  ))}
                </div>
              </div>
            )}

            {(showAnimeResults || showMangaResults) && hasMixedResults && (
              <>
                <div className={POSTER_GRID_CLASS}>
                  {unifiedResults.map((item) => (
                    <UnifiedMediaCard key={item.id} item={item} variant="poster" />
                  ))}
                </div>

                {/* Infinite Scroll Trigger */}
                <div ref={scrollRef} className="h-20 mt-8 flex flex-col items-center justify-center gap-3">
                  {isFetchingMoreResults ? (
                    <div className="flex items-center gap-3 text-primary animate-pulse bg-primary/5 px-6 py-3 rounded-2xl border border-primary/10">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="text-sm font-bold uppercase tracking-wider">Loading more...</span>
                    </div>
                  ) : hasMoreResults ? (
                    <div className="w-1.5 h-1.5 rounded-full bg-primary/20 animate-bounce" />
                  ) : (
                    <div className="flex flex-col items-center gap-2 opacity-40">
                      <div className="h-px w-24 bg-border" />
                      <span className="text-[10px] font-black uppercase tracking-[0.2em]">End of results</span>
                    </div>
                  )}
                </div>
              </>
            )}

            {!hasAnyResult && (
              <div className="text-center py-20">
                <Search className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <h2 className="text-xl font-semibold mb-2">No results found</h2>
                <p className="text-muted-foreground">Try broadening filters or using a different query</p>
              </div>
            )}
          </>
          )
        ) : (
          <div className="mt-8 flex w-full flex-col items-center text-center">
            {recentSearches.length > 0 && (
              <div className="mb-8 w-full max-w-3xl">
                <p className="mb-3 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Recent searches</p>
                <div className="flex flex-wrap justify-center gap-2.5">
                  {recentSearches.map((term, idx) => (
                    <div key={idx} className="group inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-xs transition-all">
                      <button
                        onClick={() => runRecentSearch(term)}
                        className="font-medium text-foreground"
                      >
                        {term}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteSearchItem(term); }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity ml-1 text-muted-foreground hover:text-destructive"
                        title="Remove"
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

