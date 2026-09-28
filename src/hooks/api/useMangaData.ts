import { useEffect } from "react";
import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import {
  searchManga,
  getMangaDetail,
  getMangaChapters,
  getMangaReadByKey,
  mangaChaptersCacheKey,
  type MangaSearchOptions,
} from "@/core/content/manga-client";
import { fetchMangaBakaSeries, type MangaBakaSeries } from "@/lib/mapping/mangabaka";
import { fetchKitsuChapterHierarchy, type KitsuChapterHierarchy } from "@/lib/mapping/kitsu";
import { readCachedItemsSync, hydrateCachedItems } from "@/lib/cache/extensionResultCache";
import type { MangaChapterResponse, MappedMangaChapter } from "@/types/manga";

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
    String(row?.id || row?.anilistId || row?.malId || "");

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
  const cacheKey = id ? mangaChaptersCacheKey(id, providers, language) : "";

  // Warm the in-memory cache tier from Dexie on mount so revisits after an app
  // restart can seed instantly too. Correctness is already handled inside
  // getMangaChapters (which hydrates + unions); this just primes the Map so a
  // later render's synchronous placeholderData has something to show.
  useEffect(() => {
    if (!cacheKey) return;
    void hydrateCachedItems<MappedMangaChapter>(cacheKey);
  }, [cacheKey]);

  return useQuery({
    queryKey: ["manga-chapters", id, providers, language],
    queryFn: () => getMangaChapters(id!, providers, language),
    enabled: !!id,
    staleTime: FORCE_FRESH_MANGA_READS ? 0 : STALE_TIME.chapters,
    refetchOnMount: FORCE_FRESH_MANGA_READS ? "always" : true,
    refetchOnWindowFocus: FORCE_FRESH_MANGA_READS,
    refetchOnReconnect: FORCE_FRESH_MANGA_READS,
    // Instant display on revisit: seed from the persistent cache while the
    // background refetch unions in any updates. FORCE_FRESH still refetches —
    // this only removes the blank/loader frame; nothing is dropped.
    placeholderData: () => {
      if (!cacheKey) return undefined;
      const cached = readCachedItemsSync<MappedMangaChapter>(cacheKey);
      if (!cached || !cached.length) return undefined;
      const anilistId = Number(String(id).replace(/^anilist:/i, ""));
      const providersAvailable = Array.from(
        new Set(
          cached.flatMap((c) => (c.sources || []).map((s) => s.provider).filter(Boolean)),
        ),
      );
      return {
        anilistId: Number.isFinite(anilistId) ? anilistId : 0,
        partial: true,
        failedProviders: [],
        chapters: [],
        mappedChapters: cached,
        ...(providersAvailable.length ? ({ providersAvailable } as any) : {}),
      } as MangaChapterResponse;
    },
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

export function useMangaBakaSeries(anilistId: number | null | undefined) {
  return useQuery({
    queryKey: ["mangabaka-series", anilistId],
    queryFn: () => fetchMangaBakaSeries(anilistId),
    enabled: typeof anilistId === "number" && anilistId > 0,
    staleTime: 6 * 60 * 60 * 1000, // 6 hours — near-static metadata
    retry: false,
  });
}

export function useMangaKitsuHierarchy(anilistId: number | null | undefined) {
  return useQuery({
    queryKey: ["kitsu-chapters", anilistId],
    queryFn: () => fetchKitsuChapterHierarchy(anilistId),
    enabled: typeof anilistId === "number" && anilistId > 0,
    staleTime: 6 * 60 * 60 * 1000,
    retry: false,
  });
}