import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { fetchCombinedSources } from "@/lib/api";
import type { StreamingData, StreamingSource } from "@/lib/api";
import { getCachedCombinedSources, getCombinedSourceCacheKey, setCachedCombinedSources } from "@/lib/watch/sourceIntelligence";

/**
 * Combined hook that fetches TatakaiAPI, HiAnime, WatchAnimeWorld, and AnimeHindiDubbed sources
 */
export function useCombinedSources(
  episodeId: string | undefined,
  animeName: string | undefined,
  episodeNumber: number | undefined,
  server: string = "hd-2",
  category: string = "sub",
  currentUserId?: string
) {
  return useQuery<StreamingData & {
    hasWatchAnimeWorld: boolean;
    hasAnimeHindiDubbed: boolean;
    hasTatakaiAPI: boolean;
    hasTatakaiProviders: boolean;
    hasAnimelok: boolean;
    hasAnimeya: boolean;
    hasDesidubanime: boolean;
    hasAniworld: boolean;
    hasToonStream: boolean;
    hasHindiApi: boolean;
    hasAnilistHindi: boolean;
    hasToonWorld: boolean;
    malID?: number | null;
    anilistID?: number | null;
    nextEpisodeEstimates?: Array<{ lang?: string, server?: string, label: string }>;
  }, Error>({
    queryKey: ["combined-sources", episodeId, animeName, episodeNumber, server, category, currentUserId],
    queryFn: async () => {
      const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error(`combined sources timeout (${timeoutMs}ms)`)), timeoutMs);
        });
        try {
          return await Promise.race([promise, timeoutPromise]);
        } finally {
          if (timeoutId) clearTimeout(timeoutId);
        }
      };

      const hasWatchAnimeWorldSource = (sources: StreamingSource[]) => sources.some(s =>
        s.langCode?.startsWith('watchanimeworld') ||
        s.langCode?.startsWith('watchaw') ||
        s.providerKey === 'watchaw' ||
        s.providerName?.toLowerCase().includes('watchaw') ||
        s.providerName?.includes('Goku') ||
        s.providerName?.includes('Luffy') ||
        s.providerName?.includes('Z-Fighter')
      );

      const cacheKey = getCombinedSourceCacheKey(episodeId!, server, category, currentUserId);
      const cached = getCachedCombinedSources(cacheKey);

      let data: StreamingData & { hasTatakaiAPI: boolean };
      try {
        data = await withTimeout(
          fetchCombinedSources(episodeId, animeName, episodeNumber, server, category, currentUserId),
          9000
        );
      } catch (error) {
        if (cached) {
          return {
            ...cached,
            hasTatakaiProviders: (cached.providerServers?.length || 0) > 0,
            hasWatchAnimeWorld: hasWatchAnimeWorldSource(cached.sources),
            hasAnimeHindiDubbed: cached.sources.some(s => s.providerName === 'Berlin' || s.providerName === 'Madrid' || s.langCode?.startsWith('animehindidubbed')),
            hasAnimelok: cached.sources.some(s =>
              s.langCode?.startsWith('animelok') ||
              s.providerName?.includes('Pain') ||
              s.providerName?.includes('Sukuna') ||
              s.providerName?.toLowerCase().includes('abyess') ||
              s.providerName?.includes('Broly') ||
              s.providerName?.includes('Kaido')
            ),
            hasAnimeya: cached.sources.some(s => s.providerName?.includes('Animeya') || s.providerName?.includes('Bebop') || s.langCode?.startsWith('animeya')),
            hasDesidubanime: cached.sources.some(s => s.langCode?.startsWith('desidubanime')),
            hasAniworld: cached.sources.some(s => s.langCode?.startsWith('aniworld')),
            hasToonStream: cached.sources.some(s => s.langCode?.startsWith('toonstream') || s.providerName?.includes('ToonStream')),
            hasHindiApi: cached.sources.some(s => s.langCode?.startsWith('hindiapi')),
            hasAnilistHindi: cached.sources.some(s => s.langCode?.startsWith('anilisthindi')),
            hasToonWorld: cached.sources.some(s => s.langCode?.startsWith('toonworld') || s.providerName?.includes('ToonWorld')),
          };
        }
        throw error;
      }
      setCachedCombinedSources(cacheKey, data);

      if (import.meta.env.DEV) {
        const hindiApiSources = data.sources.filter(s => s.langCode?.startsWith('hindiapi'));
        const toonStreamSources = data.sources.filter(s => s.langCode?.startsWith('toonstream'));
        const hindiDubbedSources = data.sources.filter(s => s.langCode?.startsWith('animehindidubbed'));
        console.debug('[useCombinedSources] Sources breakdown:', {
          total: data.sources?.length,
          malID: data.malID,
          anilistID: data.anilistID,
          hindiApi: hindiApiSources.length,
          toonStream: toonStreamSources.length,
          hindiDubbed: hindiDubbedSources.length,
          hindiApiProviders: hindiApiSources.map(s => s.providerName),
        });
      }

      return {
        ...data,
        hasTatakaiProviders: (data.providerServers?.length || 0) > 0,
        hasWatchAnimeWorld: hasWatchAnimeWorldSource(data.sources),
        hasAnimeHindiDubbed: data.sources.some(s => s.providerName === 'Berlin' || s.providerName === 'Madrid' || s.langCode?.startsWith('animehindidubbed')),
        hasAnimelok: data.sources.some(s =>
          s.langCode?.startsWith('animelok') ||
          s.providerName?.includes('Pain') ||
          s.providerName?.includes('Sukuna') ||
          s.providerName?.toLowerCase().includes('abyess') ||
          s.providerName?.includes('Broly') ||
          s.providerName?.includes('Kaido')
        ),
        hasAnimeya: data.sources.some(s => s.providerName?.includes('Animeya') || s.providerName?.includes('Bebop') || s.langCode?.startsWith('animeya')),
        hasDesidubanime: data.sources.some(s => s.langCode?.startsWith('desidubanime')),
        hasAniworld: data.sources.some(s => s.langCode?.startsWith('aniworld')),
        hasToonStream: data.sources.some(s => s.langCode?.startsWith('toonstream') || s.providerName?.includes('ToonStream')),
        hasHindiApi: data.sources.some(s => s.langCode?.startsWith('hindiapi')),
        hasAnilistHindi: data.sources.some(s => s.langCode?.startsWith('anilisthindi')),
        hasToonWorld: data.sources.some(s => s.langCode?.startsWith('toonworld') || s.providerName?.includes('ToonWorld')),
      };
    },
    enabled: !!episodeId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook that refetches combined sources after background retries complete (2-3 seconds)
 * This ensures newly cached provider sources become available to the UI
 */
export function useCombinedSourcesWithRefetch(
  episodeId: string | undefined,
  animeName: string | undefined,
  episodeNumber: number | undefined,
  server: string = "hd-2",
  category: string = "sub",
  currentUserId?: string
) {
  const query = useCombinedSources(episodeId, animeName, episodeNumber, server, category, currentUserId);

  useEffect(() => {
    if (!query.isSuccess || !episodeId) return;

    let stopped = false;
    let refetchInFlight = false;
    let attempts = 0;
    let stagnantAttempts = 0;
    let lastSourceCount = query.data?.sources?.length ?? 0;
    const MAX_ATTEMPTS = 12; // ~30s progressive polling window
    const MAX_STAGNANT_ATTEMPTS = 4;

    const runRefetch = async () => {
      if (stopped || refetchInFlight) return;

      refetchInFlight = true;

      attempts += 1;
      try {
        const result = await query.refetch();
        const sourceCount = result.data?.sources?.length ?? 0;
        if (sourceCount > lastSourceCount) {
          lastSourceCount = sourceCount;
          stagnantAttempts = 0;
        } else {
          stagnantAttempts += 1;
        }
      } catch (err) {
        if (import.meta.env.DEV) {
          console.error('Refetch failed:', err);
        }
      } finally {
        refetchInFlight = false;
      }
    };

    // Kick once quickly, then keep polling while backend retries are still resolving providers.
    const firstTimer = setTimeout(() => {
      runRefetch();
    }, 1000);

    const interval = setInterval(() => {
      if (stopped) return;
      runRefetch();
      if (attempts >= MAX_ATTEMPTS || stagnantAttempts >= MAX_STAGNANT_ATTEMPTS) {
        clearInterval(interval);
      }
    }, 2500);

    return () => {
      stopped = true;
      clearTimeout(firstTimer);
      clearInterval(interval);
    };
  }, [episodeId, category, query.isSuccess, query.refetch]);

  return query;
}
