import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import {
  searchManga,
  getMangaDetail,
  getMangaChapters,
  getMangaReadByKey,
  type MangaSearchOptions,
} from "@/services/manga.service";

// Detect mobile for longer cache times
const isMobileNative = typeof window !== 'undefined' && 
  (window as any).Capacitor?.isNativePlatform?.() || false;

const STALE_TIME = {
  manga: isMobileNative ? 30 * 60 * 1000 : 10 * 60 * 1000, 
  chapters: isMobileNative ? 15 * 60 * 1000 : 5 * 60 * 1000,
  search: isMobileNative ? 5 * 60 * 1000 : 2 * 60 * 1000,
  read: isMobileNative ? 60 * 60 * 1000 : 30 * 60 * 1000 // Pages read shouldn't update often
};

const FORCE_FRESH_MANGA_READS =
  String(import.meta.env.VITE_ALWAYS_FRESH_MANGA_READS ?? "true").toLowerCase() !== "false";

export function useMangaSearch(
  query: string,
  page: number = 1,
  limit: number = 20,
  options: MangaSearchOptions = {}
) {
  const requiresQuery = options.requiresQuery ?? true;

  return useQuery({
    queryKey: ["manga-search", query, page, limit, options],
    queryFn: () => searchManga(query, page, limit, options),
    enabled: requiresQuery ? query.length > 0 : true,
    staleTime: STALE_TIME.search,
  });
}

export function useInfiniteMangaSearch(
  query: string,
  limit: number = 20,
  enabled: boolean = true,
  options: MangaSearchOptions = {}
) {
  const requiresQuery = options.requiresQuery ?? true;

  const getResultRows = (page: any) =>
    Array.isArray(page?.results) ? page.results : [];

  const getResultId = (row: any) =>
    String(row?.anilistId ?? row?.malId ?? row?.id ?? "");

  return useInfiniteQuery({
    queryKey: ["manga-search-infinite", query, limit, options],
    queryFn: ({ pageParam = 1 }) => searchManga(query, pageParam, limit, options),
    getNextPageParam: (lastPage: any, allPages: any[]) => {
      const lastResults = getResultRows(lastPage);
      if (lastResults.length === 0) {
        return undefined;
      }

      if (allPages.length > 1) {
        const seenIds = new Set<string>();
        allPages.slice(0, -1).forEach((page) => {
          getResultRows(page).forEach((row: any) => {
            const id = getResultId(row);
            if (id) seenIds.add(id);
          });
        });

        const hasAnyNewResult = lastResults.some((row: any) => {
          const id = getResultId(row);
          return id ? !seenIds.has(id) : true;
        });

        if (!hasAnyNewResult) {
          return undefined;
        }
      }

      if (typeof lastPage?.hasNextPage === "boolean") {
        if (!lastPage.hasNextPage) return undefined;

        const currentPage =
          typeof lastPage?.currentPage === "number" ? lastPage.currentPage : allPages.length;

        return currentPage + 1;
      }

      if (lastResults.length < limit) return undefined;

      const currentPage =
        typeof lastPage?.page === "number" ? lastPage.page : allPages.length;

      return currentPage + 1;
    },
    initialPageParam: 1,
    enabled: enabled && (requiresQuery ? query.length > 0 : true),
    staleTime: STALE_TIME.search,
  });
}

export function useMangaDetail(id: string | undefined) {
  return useQuery({
    queryKey: ["manga-detail", id],
    queryFn: () => getMangaDetail(id!),
    enabled: !!id,
    staleTime: FORCE_FRESH_MANGA_READS ? 0 : STALE_TIME.manga,
    refetchOnMount: FORCE_FRESH_MANGA_READS ? "always" : true,
    refetchOnWindowFocus: FORCE_FRESH_MANGA_READS,
    refetchOnReconnect: FORCE_FRESH_MANGA_READS,
  });
}

export function useMangaChapters(id: string | undefined, providers?: string, language?: string) {
  return useQuery({
    queryKey: ["manga-chapters", id, providers, language],
    queryFn: () => getMangaChapters(id!, providers, language),
    enabled: !!id,
    staleTime: FORCE_FRESH_MANGA_READS ? 0 : STALE_TIME.chapters,
    refetchOnMount: FORCE_FRESH_MANGA_READS ? "always" : true,
    refetchOnWindowFocus: FORCE_FRESH_MANGA_READS,
    refetchOnReconnect: FORCE_FRESH_MANGA_READS,
  });
}

export function useMangaRead(id: string | undefined, chapterKey: string | undefined) {
  return useQuery({
    queryKey: ["manga-read", id, chapterKey],
    queryFn: () => getMangaReadByKey(id!, chapterKey!),
    enabled: !!id && !!chapterKey,
    staleTime: FORCE_FRESH_MANGA_READS ? 0 : STALE_TIME.read,
    refetchOnMount: FORCE_FRESH_MANGA_READS ? "always" : true,
    refetchOnWindowFocus: FORCE_FRESH_MANGA_READS,
    refetchOnReconnect: FORCE_FRESH_MANGA_READS,
  });
}