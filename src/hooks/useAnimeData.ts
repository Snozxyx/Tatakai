import { useQuery } from "@tanstack/react-query";
import {
  fetchHome,
  fetchAnimeInfo,
  fetchEpisodes,
  fetchEpisodeServers,
  fetchStreamingSources,
  searchAnime,
  fetchGenreAnimes,
  fetchNextEpisodeSchedule,
} from "@/lib/api";

// Detect mobile for longer cache times
const isMobileNative = typeof window !== 'undefined' && 
  (window as any).Capacitor?.isNativePlatform?.() || false;

// Mobile uses longer stale times to reduce API calls and improve perceived speed
const STALE_TIME = {
  home: isMobileNative ? 15 * 60 * 1000 : 5 * 60 * 1000, // 15 min mobile, 5 min web
  anime: isMobileNative ? 30 * 60 * 1000 : 10 * 60 * 1000, // 30 min mobile
  episodes: isMobileNative ? 15 * 60 * 1000 : 5 * 60 * 1000,
  search: isMobileNative ? 5 * 60 * 1000 : 2 * 60 * 1000,
};

export function useHomeData() {
  return useQuery({
    queryKey: ["home"],
    queryFn: fetchHome,
    staleTime: STALE_TIME.home,
    gcTime: isMobileNative ? 60 * 60 * 1000 : 30 * 60 * 1000, // 1 hour cache on mobile
  });
}

export function useAnimeInfo(animeId: string | undefined) {
  return useQuery({
    queryKey: ["anime", animeId],
    queryFn: () => fetchAnimeInfo(animeId!),
    enabled: !!animeId && !animeId.startsWith('mal-'),
    staleTime: STALE_TIME.anime,
    gcTime: isMobileNative ? 60 * 60 * 1000 : 30 * 60 * 1000,
  });
}

export function useEpisodes(animeId: string | undefined) {
  return useQuery({
    queryKey: ["episodes", animeId],
    queryFn: () => fetchEpisodes(animeId!),
    enabled: !!animeId && !animeId.startsWith('mal-'),
    staleTime: STALE_TIME.episodes,
    gcTime: isMobileNative ? 60 * 60 * 1000 : 30 * 60 * 1000,
  });
}

export function useEpisodeServers(episodeId: string | undefined) {
  return useQuery({
    queryKey: ["servers", episodeId],
    queryFn: () => fetchEpisodeServers(episodeId!),
    enabled: !!episodeId,
  });
}

export function useStreamingSources(
  episodeId: string | undefined,
  server: string = "hd-2",
  category: string = "sub"
) {
  return useQuery({
    queryKey: ["sources", episodeId, server, category],
    queryFn: () => fetchStreamingSources(episodeId!, server, category),
    enabled: !!episodeId,
  });
}

export function useSearch(query: string, page: number = 1) {
  return useQuery({
    queryKey: ["search", query, page],
    queryFn: () => searchAnime(query, page),
    enabled: query.length > 0,
    staleTime: 2 * 60 * 1000,
  });
}

export function useGenreAnimes(genre: string | undefined, page: number = 1) {
  return useQuery({
    queryKey: ["genre", genre, page],
    queryFn: () => fetchGenreAnimes(genre!, page),
    enabled: !!genre,
    staleTime: 5 * 60 * 1000,
  });
}

export function useNextEpisodeSchedule(animeId: string | undefined) {
  return useQuery({
    queryKey: ["next-episode-schedule", animeId],
    queryFn: () => fetchNextEpisodeSchedule(animeId!),
    enabled: !!animeId && !animeId.startsWith('mal-'),
    staleTime: 5 * 60 * 1000,
    retry: false, // Don't retry if anime doesn't have schedule
  });
}
