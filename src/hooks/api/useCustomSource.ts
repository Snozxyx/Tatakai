/**
 * React Query hooks for custom sources (isolated read/watch verticals shipped
 * by extensions). These never touch the anime/manga watchlist or readlist —
 * they read straight from `custom-source-runtime` and are keyed by
 * `(namespace, sourceId, …)` so multiple sources across multiple extensions
 * stay independent.
 */

import { useEffect, useMemo } from "react";
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/core/db/tatakai-db';
import { libraryKey } from '@/core/extensions/compatibility/library';
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
import { groupCustomSources } from '@/core/content/custom-source-model';
import { useContentSafetySettings } from '@/hooks/user/useContentSafetySettings';
import { isExplicitExtensionContent } from '@/lib/contentSafety';
import { extensionDeadline } from '@/core/extensions/remote/deadline';

export function useCustomProviderGroups() {
  const result = useCustomSources();
  const data = useMemo(() => groupCustomSources(result.data || []), [result.data]);
  return { ...result, data };
}

/** Every custom source across every installed extension (powers the sidebar). */
export function useCustomSources() {
  const { settings: safety } = useContentSafetySettings();
  const queryClient = useQueryClient();
  useEffect(() => {
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ["custom-sources"] });
    };
    window.addEventListener('tatakai-extensions-changed', refresh);
    window.addEventListener('tatakai:extension-installed', refresh);
    return () => { window.removeEventListener('tatakai-extensions-changed', refresh); window.removeEventListener('tatakai:extension-installed', refresh); };
  }, [queryClient]);

  return useQuery<CustomSourceEntry[]>({
    queryKey: ["custom-sources"],
    queryFn: () => listAllCustomSources(),
    select: rows => safety.showAdultEverywhere ? rows : rows.filter(row => !isExplicitExtensionContent(row)),
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

export function useCustomHome(namespace?: string, sourceId?: string, page = 1) {
  const { settings: safety } = useContentSafetySettings();
  return useQuery<CustomHomeData>({
    queryKey: ["custom", namespace, sourceId, "home", page],
    queryFn: ({ signal }) => extensionDeadline(deadline => fetchCustomHome(namespace!, sourceId!, page, deadline), 45000, signal),
    retry: false,
    select: data => safety.showAdultEverywhere ? data : { ...data, sections: data.sections.map(section => ({ ...section, items: section.items.filter(item => !isExplicitExtensionContent(item)) })) },
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
  const { settings: safety } = useContentSafetySettings();
  const filterKey = filters ? JSON.stringify(filters) : "";
  const hasFilters = Boolean(
    filters &&
      ((filters.tags && filters.tags.length) ||
        Object.keys(filters).some((k) => k !== "tags" && filters[k])),
  );
  return useQuery<CustomSearchData>({
    queryKey: ["custom", namespace, sourceId, "search", trimmed, page, filterKey],
    queryFn: ({ signal }) => extensionDeadline(deadline => fetchCustomSearch(namespace!, sourceId!, trimmed, page, filters, deadline), 45000, signal),
    retry: false,
    select: data => safety.showAdultEverywhere ? data : { ...data, results: data.results.filter(item => !isExplicitExtensionContent(item)) },
    enabled: Boolean(namespace && sourceId && (trimmed || hasFilters)),
    staleTime: 2 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useCustomInfo(namespace?: string, sourceId?: string, id?: string) {
  const { user } = useAuth();
  return useQuery<CustomInfoData | null>({
    queryKey: ["custom", namespace, sourceId, "info", id, user?.id || 'guest'],
    queryFn: async ({ signal }) => {
      try { return await extensionDeadline(deadline => fetchCustomInfo(namespace!, sourceId!, id!, deadline), 45000, signal); }
      catch (error) {
        if (signal.aborted) throw error;
        const row = await db.kv.get(libraryKey(user?.id || 'guest', { namespace: namespace!, sourceId: sourceId!, id: id! }));
        if (!row) throw error;
        const cached = JSON.parse(row.value);
        return { id: id!, title: cached.title, image: cached.image, entries: cached.catalog || [] };
      }
    },
    enabled: Boolean(namespace && sourceId && id),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useCustomWatch(namespace?: string, sourceId?: string, id?: string, episodeId?: string) {
  return useQuery<CustomWatchData>({
    queryKey: ["custom", namespace, sourceId, "watch", id, episodeId],
    queryFn: ({ signal }) => extensionDeadline(() => fetchCustomWatch(namespace!, sourceId!, id!, episodeId!), 45000, signal),
    retry: false,
    enabled: Boolean(namespace && sourceId && id && episodeId),
    staleTime: 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

export function useCustomRead(namespace?: string, sourceId?: string, id?: string, chapterId?: string) {
  return useQuery<CustomReadData>({
    queryKey: ["custom", namespace, sourceId, "read", id, chapterId],
    queryFn: ({ signal }) => extensionDeadline(() => fetchCustomRead(namespace!, sourceId!, id!, chapterId!), 45000, signal),
    retry: false,
    enabled: Boolean(namespace && sourceId && id && chapterId),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
