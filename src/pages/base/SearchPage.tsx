import { useSearchParams, useNavigate, useParams } from "react-router-dom";
import { Background } from "@/components/layout/Background";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import { Header } from "@/components/layout/Header";
import { useIsNativeApp } from "@/hooks/ui/useIsNativeApp";
import { cn } from "@/lib/utils";
import { CardSkeleton } from "@/components/ui/skeleton-custom";
import { Input } from "@/components/ui/input";
import { Search, X, Loader2, Film, User, ExternalLink, Users, BookOpen,Camera, Puzzle, ArrowRight, SlidersHorizontal, ChevronRight, Sparkles, Play } from "lucide-react";
import { useAniListCharacterSearch } from '@/hooks/user/useProfileFeatures';
import { GlassPanel } from "@/components/ui/GlassPanel";
import { ALL_GENRES } from "@/lib/externalIntegrations";
import { useInfiniteSearch as useInfSearch, type AnimeSearchFilters } from "@/hooks/api/useAnimeData";
import { useInfiniteMangaSearch } from "@/hooks/api/useMangaData";
import { useRef, useCallback, useState, useEffect, useMemo } from "react";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { searchCharacters } from "@/core/content/character-client";
import { fetchProducerAnimes } from "@/lib/api";
import { type MangaSearchOptions } from "@/core/content/manga-client";
import { getProxiedImageUrl } from "@/lib/api";
import { UnifiedMediaCard } from "@/components/UnifiedMediaCard";
import { useContentSafetySettings } from "@/hooks/user/useContentSafetySettings";
import { inferMangaAdultFlag, isExplicitMangaSearchQuery } from "@/lib/contentSafety";
import { VirtualAnimeGrid } from "@/components/virtualized/VirtualAnimeGrid";
import { FeatureFlag, useFeatureFlag } from "@/core/feature-flags";
import { extensionRegistry } from "@/core/extensions/ExtensionRegistry";

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
  const [page, setPage] = useState(1);
  const [resultType, setResultType] = useState<'all' | 'anime' | 'manga' | 'character'>('all');
  const [enableSecondaryResultStreams, setEnableSecondaryResultStreams] = useState(false);
  const [animeTypeFilter, setAnimeTypeFilter] = useState<string>('all');
  const [animeStatusFilter, setAnimeStatusFilter] = useState<string>('all');
  const [animeGenreFilter, setAnimeGenreFilter] = useState<string>('all');
  const [animeSortFilter, setAnimeSortFilter] = useState<string>('default');
  const [mangaTypeFilter, setMangaTypeFilter] = useState<string>('all');
  const [mangaStatusFilter, setMangaStatusFilter] = useState<string>('all');
  const [mangaGenreFilter, setMangaGenreFilter] = useState<string>('all');
  const [mangaAdultFilter, setMangaAdultFilter] = useState(false);
  const [minRating, setMinRating] = useState<number>(0);
  const [minReleaseYear, setMinReleaseYear] = useState<number>(0);
  const [sortMode, setSortMode] = useState<'relevance' | 'rating' | 'title' | 'popularity'>('relevance');
  const [imageConfidenceThreshold, setImageConfidenceThreshold] = useState<number>(0.85);
  const [showAdvancedAssist, setShowAdvancedAssist] = useState(false);

  // Local state for filters to avoid triggering searches on every change
  const [localAnimeType, setLocalAnimeType] = useState(animeTypeFilter);
  const [localAnimeStatus, setLocalAnimeStatus] = useState(animeStatusFilter);
  const [localAnimeGenre, setLocalAnimeGenre] = useState(animeGenreFilter);
  const [localAnimeSort, setLocalAnimeSort] = useState(animeSortFilter);
  const [localMangaType, setLocalMangaType] = useState(mangaTypeFilter);
  const [localMangaStatus, setLocalMangaStatus] = useState(mangaStatusFilter);
  const [localMangaGenre, setLocalMangaGenre] = useState(mangaGenreFilter);
  const [localMinRating, setLocalMinRating] = useState(minRating);
  const [localMinReleaseYear, setLocalMinReleaseYear] = useState(minReleaseYear);
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
    setMinRating(localMinRating);
    setMinReleaseYear(localMinReleaseYear);
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
    setLocalMangaGenre(mangaGenreFilter);
    setLocalMinRating(minRating);
    setLocalMinReleaseYear(minReleaseYear);
    setLocalSortMode(sortMode);
    setLocalMangaAdult(mangaAdultFilter);
  }, [
    animeTypeFilter,
    animeStatusFilter,
    animeGenreFilter,
    animeSortFilter,
    mangaTypeFilter,
    mangaStatusFilter,
    mangaGenreFilter,
    minRating,
    minReleaseYear,
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
  const useVirtualGrid = useFeatureFlag(FeatureFlag.VIRTUAL_GRID);
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
      minReleaseYear > 0
    );
  }, [
    animeTypeFilter,
    animeStatusFilter,
    animeGenreFilter,
    animeSortFilter,
    minRating,
    minReleaseYear,
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

    return ALL_GENRES.map((genre) => ({
      label: genre,
      value: normalizeGenreValue(genre),
    })).filter((option, index, rows) => {
      if (!option.value) return false;
      return rows.findIndex((row) => row.value === option.value) === index;
    });
  }, []);

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
  const mangaFilterActive = useMemo(() => {
    return (
      mangaGenreFilter !== 'all' ||
      mangaTypeFilter !== 'all' ||
      mangaStatusFilter !== 'all' ||
      mangaAdultFilter
    );
  }, [mangaGenreFilter, mangaTypeFilter, mangaStatusFilter, mangaAdultFilter]);

  const shouldEnableMangaSearch =
    shouldSearchManga &&
    (query.length > 0 || mangaFilterActive || genreFilterActive) &&
    (!shouldDelaySecondaryStreams || enableSecondaryResultStreams || genreFilterActive || mangaFilterActive);

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
    filters.isAdult = allowAdultAnime ? true : false;
    return filters;
  }, [
    animeTypeFilter,
    animeStatusFilter,
    animeGenreFilter,
    animeSortFilter,
    minRating,
    minReleaseYear,
    allowAdultAnime,
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
      sort: hasGenre ? 'POPULARITY_DESC' : undefined,
      adult: mangaAdultFilter || explicitMangaQuery || contentSafetySettings.showAdultEverywhere,
      types: types.length > 0 ? Array.from(new Set(types)) : undefined,
      mangaType: normalizedMangaTypeFilter !== 'all' ? (normalizedMangaTypeFilter as any) : undefined,
      // Allow genre-only AniList browse (no text query required)
      requiresQuery: !(hasGenre || mangaSearchMode === 'genre' || mangaSearchMode === 'explore' || mangaSearchMode === 'latest' || mangaSearchMode === 'category'),
    };
  }, [
    mangaSearchMode,
    resolvedMangaGenre,
    mangaAdultFilter,
    explicitMangaQuery,
    contentSafetySettings.showAdultEverywhere,
    normalizedMangaTypeFilter,
  ]);

  const atsuGenreOptions = useMemo(() => {
    return [
      { label: "Action", value: "action" },
      { label: "Adventure", value: "adventure" },
      { label: "Comedy", value: "comedy" },
      { label: "Drama", value: "drama" },
      { label: "Fantasy", value: "fantasy" },
      { label: "Horror", value: "horror" },
      { label: "Psychological", value: "psychological" },
      { label: "Romance", value: "romance" },
      { label: "Sci-Fi", value: "sci-fi" },
      { label: "Slice of Life", value: "slice-of-life" },
      { label: "Sports", value: "sports" },
      { label: "Supernatural", value: "supernatural" },
      { label: "Thriller", value: "thriller" },
    ];
  }, []);

  const shouldEnableAnimeSearch =
    shouldSearchAnime && !isProducerRoute && (query.length > 0 || animeFilterActive || genreFilterActive);

  const { 
    data: infiniteData, 
    fetchNextPage: fetchNextSearchPage,
    hasNextPage: hasNextSearchPage,
    isFetchingNextPage: isFetchingNextSearchPage,
    isLoading: isLoadingSearch,
  } = useInfSearch(query, animeBackendFilters, shouldEnableAnimeSearch, animeFilterActive);

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
            type: manga?.mediaType || manga?.type || "manga",
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
      arr.push(...filteredAnimeResults.map(a => ({ ...a, mediaType: 'anime' as const })));
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
      mangaAdultFilter,
      minRating > 0,
      minReleaseYear > 0,
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
    mangaAdultFilter,
    minRating,
    minReleaseYear,
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
      setImageResults(data.result || []);
    } catch (error) {
      console.error("Image search error:", error);
    } finally {
      setIsSearchingImage(false);
    }
  };

  useEffect(() => {
    setQuery(queryParam);
    setSearchInput(queryParam);
  }, [queryParam]);

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
    if (searchInput.trim()) {
      const term = searchInput.trim();
      try {
        const history = localStorage.getItem('tatakai_search_history');
        let searches: string[] = history ? JSON.parse(history) : [];
        searches = [term, ...searches.filter(s => s !== term)].slice(0, 20); // keep 20 max
        localStorage.setItem('tatakai_search_history', JSON.stringify(searches));
      } catch { }
      navigate(`/search?q=${encodeURIComponent(term)}`);
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

  const showAnimeResults = (resultType === 'all' || resultType === 'anime') && (query.length > 0 || animeFilterActive || genreFilterActive);
  const showMangaResults = shouldSearchManga && (query.length > 0 || mangaFilterActive || genreFilterActive);
  const showCharacterResults = shouldEnableCharacterSearch && query.length > 1;
  const isQuerylessMangaMode = showMangaResults && mangaSearchMode !== 'search';
  const hasSearchContext = query.length > 0 || isQuerylessMangaMode || animeFilterActive || genreFilterActive;
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

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      {!isNative && <Background />}
      {!isNative && <Sidebar />}

      <main className={cn(
        "relative z-10 pr-6 py-6 max-w-[1800px] mx-auto pb-24 md:pb-6",
        isNative ? "p-6" : "pl-6 md:pl-32"
      )}>
        <Header />

        {/* Mobile Search Bar */}
        <form onSubmit={handleSearch} className="mb-6 md:hidden">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <Input
              id="tatakai-global-search"
              type="text"
              placeholder="Search anime or manga..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-10 pr-20 h-12 bg-muted/50 border-border/50 rounded-xl text-base"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
              {searchInput && (
                <button
                  type="button"
                  onClick={() => setSearchInput('')}
                  className="p-1 rounded-full hover:bg-muted"
                >
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              )}
              <label className="p-1 rounded-full hover:bg-muted cursor-pointer text-muted-foreground hover:text-primary transition-colors">
                <Camera className="w-5 h-5" />
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setSelectedFile(file);
                      // Optional: auto-scroll to image search section or trigger search
                    }
                  }}
                />
              </label>
            </div>
          </div>
        </form>

        <div className="mb-8 md:mb-12">
          <h1 className="font-display text-2xl md:text-4xl font-bold mb-4 md:mb-6 flex items-center gap-3">
            <Search className="w-6 h-6 md:w-8 md:h-8 text-primary" />
            {hasSearchContext ? 'Search Results' : 'Search'}
          </h1>

          <div className="flex flex-col md:flex-row gap-6 items-start md:items-center mb-6">
            <div className="flex-1">
              {(query || isQuerylessMangaMode) && (
                <p className="text-muted-foreground text-sm md:text-base mb-2">
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

            {/* Type Filters */}
            <div className="flex bg-muted/50 p-1 rounded-xl w-full md:w-auto overflow-x-auto hide-scrollbar">
              {[
                { id: 'all', label: 'All Results' },
                { id: 'anime', label: 'Anime', icon: <Film className="w-4 h-4" /> },
                { id: 'manga', label: 'Manga', icon: <BookOpen className="w-4 h-4" /> },
                { id: 'character', label: 'Characters' }
              ].map(type => (
                <button
                  key={type.id}
                  onClick={() => setResultType(type.id as any)}
                  className={cn(
                    "px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all whitespace-nowrap",
                    resultType === type.id
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-white/5"
                  )}
                >
                  {type.icon}
                  {type.label}
                </button>
              ))}
            </div>

            {/* Image Search Integration */}
            <div className="w-full md:w-auto p-4 rounded-2xl bg-muted/30 border border-white/5 backdrop-blur-sm">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-1">Search by Image (trace.moe)</p>
              <div className="flex gap-2">
                <label className="flex-1 cursor-pointer group">
                  <div className="flex items-center gap-2 px-4 h-10 rounded-xl bg-white/5 border border-white/10 group-hover:border-primary/50 transition-colors">
                    <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors overflow-hidden truncate">
                      {selectedFile ? selectedFile.name : 'Choose frame...'}
                    </span>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    />
                  </div>
                </label>
                <button
                  onClick={handleImageSearch}
                  disabled={!selectedFile || isSearchingImage}
                  className="px-4 h-10 rounded-xl bg-primary text-primary-foreground font-medium hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-primary/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center min-w-[100px]"
                >
                  {isSearchingImage ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Identify'
                  )}
                </button>
              </div>
            </div>
          </div>

          <GlassPanel className="mt-5 p-4 md:p-6 space-y-6 border border-white/10 shadow-xl overflow-hidden relative">
            <div className="flex flex-wrap items-center justify-between gap-4 relative z-10">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowAdvancedAssist((value) => !value)}
                  className={cn(
                    "h-10 px-4 rounded-xl text-sm font-bold bg-background/70 border transition-all flex items-center gap-2",
                    showAdvancedAssist 
                      ? "border-primary text-primary shadow-lg shadow-primary/10" 
                      : "border-white/10 text-muted-foreground hover:text-foreground hover:border-white/20"
                  )}
                >
                  <SlidersHorizontal className="w-4 h-4" />
                  {showAdvancedAssist ? 'Hide Power Filters' : 'Show Power Filters'}
                  {activeFilterCount > 0 && (
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] ml-1">
                      {activeFilterCount}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setLocalAnimeType('all');
                    setLocalAnimeStatus('all');
                    setLocalAnimeGenre('all');
                    setLocalAnimeSort('default');
                    setLocalMangaType('all');
                    setLocalMangaStatus('all');
                    setLocalMangaGenre('all');
                    setLocalMangaAdult(false);
                    setLocalMinRating(0);
                    setLocalMinReleaseYear(0);
                    setLocalSortMode('relevance');
                    
                    // Immediately apply reset
                    setAnimeTypeFilter('all');
                    setAnimeStatusFilter('all');
                    setAnimeGenreFilter('all');
                    setAnimeSortFilter('default');
                    setMangaTypeFilter('all');
                    setMangaStatusFilter('all');
                    setMangaGenreFilter('all');
                    setMangaAdultFilter(false);
                    setMinRating(0);
                    setMinReleaseYear(0);
                    setSortMode('relevance');
                  }}
                  className="h-10 px-4 rounded-xl text-xs font-bold uppercase tracking-wide bg-background/70 border border-white/10 text-muted-foreground hover:text-foreground hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 transition-all"
                >
                  Reset all
                </button>
              </div>

              {showAdvancedAssist && (
                <button
                  onClick={applyFilters}
                  className="h-10 px-8 rounded-xl bg-primary text-primary-foreground font-bold hover:scale-105 active:scale-95 transition-all shadow-lg shadow-primary/20 flex items-center gap-2"
                >
                  <Search className="w-4 h-4" />
                  Apply Filters
                </button>
              )}
            </div>

            {showAdvancedAssist && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 pt-4 animate-in fade-in slide-in-from-top-2 duration-300">
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
                      {atsuGenreOptions.map((genre) => (
                        <option key={genre.value} value={genre.value}>
                          {genre.label}
                        </option>
                      ))}
                    </select>
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
            )}
          </GlassPanel>

        {/* Image Search Results Overlay/Section */}
        </div>
        {imageResults && (
          <div className="mb-12 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Film className="w-5 h-5 text-primary" />
                Identification Results ({filteredImageResults.length})
              </h2>
              <button
                onClick={() => setImageResults(null)}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear Results
              </button>
            </div>
            {filteredImageResults.length === 0 ? (
              <GlassPanel className="p-6 text-sm text-muted-foreground">
                No frame matches above {Math.round(imageConfidenceThreshold * 100)}% confidence. Lower the confidence filter to see more candidates.
              </GlassPanel>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredImageResults.map((result, idx) => (
                <GlassPanel key={idx} className="p-4 flex gap-4 items-start group hover:border-primary/50 transition-colors">
                  <div className="relative w-32 aspect-video rounded-lg overflow-hidden flex-shrink-0 bg-muted ring-1 ring-white/10">
                    <img
                      src={result.image}
                      alt="Result frame"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      <Play className="w-8 h-8 text-white fill-white" />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-sm line-clamp-1 mb-1" title={result.filename}>
                      {result.filename}
                    </h3>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-bold">
                        <span className="text-primary">{(result.similarity * 100).toFixed(1)}% Match</span>
                        <span className="text-muted-foreground/60">EP {result.episode || '?'}</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground/60">
                        At {new Date(result.at * 1000).toISOString().substr(11, 8)}
                      </div>
                    </div>
                    <button
                      onClick={() => navigate(`/search?q=${encodeURIComponent(result.filename.split('] ')[1]?.split(' - ')[0] || result.filename)}`)}
                      className="mt-3 w-full py-1.5 rounded-lg bg-white/5 hover:bg-primary/20 text-[10px] font-bold text-primary transition-all border border-white/5 hover:border-primary/30"
                    >
                      Search on Tatakai
                    </button>
                  </div>
                </GlassPanel>
                ))}
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
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {characterResults.map((character: any) => (
                    <GlassPanel 
                      key={character.id} 
                      className="p-3 flex items-center gap-4 hover:bg-white/10 transition-all cursor-pointer group border-white/5 hover:border-primary/30"
                      onClick={() => navigate(`/character/${character.id}?name=${encodeURIComponent(character.name)}`)}
                    >
                      <div className="relative w-16 h-16 flex-shrink-0 overflow-hidden rounded-2xl border border-white/10">
                        <img
                          src={character.poster}
                          alt={character.name}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-sm truncate group-hover:text-primary transition-colors">{character.name.full}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">Registry: AniList</span>
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
                {resultType === 'anime' && useVirtualGrid ? (
                  <VirtualAnimeGrid animes={filteredAnimeResults} compact />
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                    {unifiedResults.map((item) => (
                      <UnifiedMediaCard key={item.id} item={item} />
                    ))}
                  </div>
                )}

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
          <div className="text-center py-20">
            <Search className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Search anime, manga, and characters</h2>
            <p className="text-muted-foreground">Use the search bar above or switch Manga Feed filters for queryless discovery.</p>

            {recentSearches.length > 0 && (
              <div className="mt-6">
                <p className="text-sm text-muted-foreground mb-3">Recent searches</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {recentSearches.map((term, idx) => (
                    <div key={idx} className="group inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-muted hover:bg-muted/80 text-sm">
                      <button
                        onClick={() => runRecentSearch(term)}
                        className="font-medium"
                      >
                        {term}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteSearchItem(term); }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity ml-1 text-destructive hover:text-destructive/80"
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

