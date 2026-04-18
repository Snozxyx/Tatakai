import { useQuery } from "@tanstack/react-query";
import { fetchCombinedSources } from "@/lib/api";
import type { StreamingData, StreamingSource } from "@/lib/api";
import { getCachedCombinedSources, getCombinedSourceCacheKey, setCachedCombinedSources } from "@/lib/watch/sourceIntelligence";
import { isProviderSourceRefreshPending } from "@/services/provider.service";

/**
 * Combined hook that fetches TatakaiAPI, HiAnime, WatchAnimeWorld, and AnimeHindiDubbed sources
 */
export function useCombinedSources(
  episodeId: string | undefined,
  animeName: string | undefined,
  episodeNumber: number | undefined,
  server: string = "hd-2",
  category: string = "sub",
  currentUserId?: string,
  knownAnilistId?: number | string | null,
  knownMalId?: number | string | null
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
    queryKey: ["combined-sources", episodeId, animeName, episodeNumber, server, category, currentUserId, knownAnilistId, knownMalId],
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

      const ENABLE_COMBINED_SOURCE_CACHE =
        String(import.meta.env.VITE_ENABLE_COMBINED_SOURCE_CACHE ?? "false").toLowerCase() === "true";

      const cacheKey = getCombinedSourceCacheKey(episodeId!, server, category, currentUserId);
      const cached = ENABLE_COMBINED_SOURCE_CACHE ? getCachedCombinedSources(cacheKey) : null;

      let data: StreamingData & { hasTatakaiAPI: boolean };
      try {
        data = await withTimeout(
          fetchCombinedSources(episodeId, animeName, episodeNumber, server, category, currentUserId, knownAnilistId, knownMalId),
          45000
        );
      } catch (error) {
        if (ENABLE_COMBINED_SOURCE_CACHE && cached && !isProviderSourceRefreshPending()) {
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
      if (ENABLE_COMBINED_SOURCE_CACHE) {
        setCachedCombinedSources(cacheKey, data);
      }

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
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
  });
}

/**
 * One-shot variant kept for API compatibility with existing WatchPage callsites.
 */
export function useCombinedSourcesWithRefetch(
  episodeId: string | undefined,
  animeName: string | undefined,
  episodeNumber: number | undefined,
  server: string = "hd-2",
  category: string = "sub",
  currentUserId?: string,
  knownAnilistId?: number | string | null,
  knownMalId?: number | string | null
) {
  return useCombinedSources(episodeId, animeName, episodeNumber, server, category, currentUserId, knownAnilistId, knownMalId);
}
