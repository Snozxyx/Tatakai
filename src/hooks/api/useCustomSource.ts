/**
 * React Query hooks for custom sources (isolated read/watch verticals shipped
 * by extensions). These never touch the anime/manga watchlist or readlist —
 * they read straight from `custom-source-runtime` and are keyed by
 * `(namespace, sourceId, …)` so multiple sources across multiple extensions
 * stay independent.
 */

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listAllCustomSources,
  fetchCustomHome,
  fetchCustomSearch,
  fetchCustomInfo,
  fetchCustomWatch,
  fetchCustomRead,
  type CustomSourceEntry,
  type CustomHomeData,
  type CustomSearchData,
  type CustomInfoData,
  type CustomWatchData,
  type CustomReadData,
} from "@/core/content/custom-source-runtime";
import type { CustomSearchFilters } from "@/core/extensions/sdk/types";

/** Every custom source across every installed extension (powers the sidebar). */
export function useCustomSources() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ["custom-sources"] });
    };
    window.addEventListener('tatakai-extensions-changed', refresh);
    return () => window.removeEventListener('tatakai-extensions-changed', refresh);
  }, [queryClient]);

  return useQuery<CustomSourceEntry[]>({
    queryKey: ["custom-sources"],
    queryFn: listAllCustomSources,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

/** Resolve a single source descriptor from the discovered list. */
export function useCustomSource(namespace?: string, sourceId?: string) {
  const { data, ...rest } = useCustomSources();
  const source = data?.find((s) => s.namespace === namespace && s.id === sourceId);
  return { source, ...rest };
}

export function useCustomHome(namespace?: string, sourceId?: string) {
  return useQuery<CustomHomeData>({
    queryKey: ["custom", namespace, sourceId, "home"],
    queryFn: () => fetchCustomHome(namespace!, sourceId!),
    enabled: Boolean(namespace && sourceId),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useCustomSearch(
  namespace?: string,
  sourceId?: string,
  query = "",
  page = 1,
  filters?: CustomSearchFilters,
) {
  const trimmed = query.trim();
  const filterKey = filters ? JSON.stringify(filters) : "";
  const hasFilters = Boolean(
    filters &&
      ((filters.tags && filters.tags.length) ||
        Object.keys(filters).some((k) => k !== "tags" && filters[k])),
  );
  return useQuery<CustomSearchData>({
    queryKey: ["custom", namespace, sourceId, "search", trimmed, page, filterKey],
    queryFn: () => fetchCustomSearch(namespace!, sourceId!, trimmed, page, filters),
    enabled: Boolean(namespace && sourceId && (trimmed || hasFilters)),
    staleTime: 2 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useCustomInfo(namespace?: string, sourceId?: string, id?: string) {
  return useQuery<CustomInfoData | null>({
    queryKey: ["custom", namespace, sourceId, "info", id],
    queryFn: () => fetchCustomInfo(namespace!, sourceId!, id!),
    enabled: Boolean(namespace && sourceId && id),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useCustomWatch(namespace?: string, sourceId?: string, id?: string, episodeId?: string) {
  return useQuery<CustomWatchData>({
    queryKey: ["custom", namespace, sourceId, "watch", id, episodeId],
    queryFn: () => fetchCustomWatch(namespace!, sourceId!, id!, episodeId!),
    enabled: Boolean(namespace && sourceId && id && episodeId),
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useCustomRead(namespace?: string, sourceId?: string, id?: string, chapterId?: string) {
  return useQuery<CustomReadData>({
    queryKey: ["custom", namespace, sourceId, "read", id, chapterId],
    queryFn: () => fetchCustomRead(namespace!, sourceId!, id!, chapterId!),
    enabled: Boolean(namespace && sourceId && id && chapterId),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
