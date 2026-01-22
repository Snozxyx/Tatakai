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
  category: string = "sub"
) {
  return useQuery<StreamingData & { hasWatchAnimeWorld: boolean; hasAnimeHindiDubbed: boolean; hasTatakaiAPI: boolean; hasAnimelok: boolean; hasAnimeya: boolean; malID?: number }, Error>({
    queryKey: ["combined-sources", episodeId, animeName, episodeNumber, server, category],
    queryFn: async () => {
      const data = await fetchCombinedSources(episodeId, animeName, episodeNumber, server, category);
      return {
        ...data,
        hasWatchAnimeWorld: data.sources.some(s => s.providerName?.includes('WatchAnimeWorld')),
        hasAnimeHindiDubbed: data.sources.some(s => s.providerName === 'Berlin' || s.providerName === 'Madrid'),
        hasAnimelok: data.sources.some(s => s.providerName === 'Animelok'),
        hasAnimeya: data.sources.some(s => s.providerName?.includes('Animeya')),
      };
    },
    enabled: !!episodeId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
