import { useQuery } from "@tanstack/react-query";
import { fetchUpcomingAniListAnime, type AniListMedia } from "@/lib/externalIntegrations";

export type UpcomingAnimeItem = AniListMedia;

/**
 * Upcoming anime via AniList (NOT_YET_RELEASED by popularity), served through
 * the TatakaiAPI GraphQL proxy. Previously this called Jikan's
 * seasons/upcoming endpoint directly from the browser — retired now that
 * Jikan is unreliable (aggressive rate limits, hanging hosts).
 */
export function useUpcomingAnime(page: number = 1) {
  return useQuery({
    queryKey: ["upcoming_anime", page],
    queryFn: () => fetchUpcomingAniListAnime(page, 12),
    staleTime: 10 * 60 * 1000, // 10 minutes
    // The proxy already retries internally (rate-limit aware); one client
    // retry is enough to avoid console spam before the section gives up.
    retry: 1,
  });
}
