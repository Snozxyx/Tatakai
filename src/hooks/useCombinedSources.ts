import { useQuery } from "@tanstack/react-query";
import { fetchCombinedSources } from "@/lib/api";
import type { StreamingData, StreamingSource } from "@/lib/api";
import { slugToSearchQuery, parseEpisodeUrl, stringSimilarity } from "@/integrations/watchanimeworld";
import { parseEpisodeNumber } from "@/integrations/animehindidubbed";

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
      const data = await fetchCombinedSources(episodeId, animeName, episodeNumber, server, category, currentUserId);

      // Debug log sources breakdown
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

      return {
        ...data,
        hasWatchAnimeWorld: data.sources.some(s => s.langCode?.startsWith('watchanimeworld') || s.providerName?.includes('Goku') || s.providerName?.includes('Luffy') || s.providerName?.includes('Z-Fighter')),
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
