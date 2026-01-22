import { useQuery } from "@tanstack/react-query";
import { fetchWatchanimeworldSources } from "@/lib/api";
import type { StreamingData } from "@/lib/api";

/**
 * Hook to fetch streaming sources from WatchAnimeWorld
 * @param episodeUrl - Full URL or slug (e.g., "naruto-shippuden-1x1")
 * @param enabled - Whether to enable the query
 */
export function useWatchanimeworldSources(
  episodeUrl: string | null,
  enabled: boolean = true
) {
  return useQuery<StreamingData, Error>({
    queryKey: ["watchanimeworld-sources", episodeUrl],
    queryFn: () => {
      if (!episodeUrl) {
        throw new Error("Episode URL is required");
      }
      return fetchWatchanimeworldSources(episodeUrl);
    },
    enabled: enabled && !!episodeUrl,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: 2,
  });
}
