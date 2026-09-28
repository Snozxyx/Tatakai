/**
 * useAniListGenres.ts - React-Query binding for the AniList genre vocabulary.
 *
 * Replaces the hand-maintained `ALL_GENRES` constant: AniList is the source of
 * truth for which genres exist, so adding one there is enough. The constant
 * stays as the offline/error fallback so the genre cloud never renders empty.
 */
import { useQuery } from '@tanstack/react-query';
import { useContentSafetySettings } from '@/hooks/user/useContentSafetySettings';
import { fetchAniListGenres } from '@/lib/anilist';
import { ALL_GENRES } from '@/lib/externalIntegrations';

/** Fallback while the first fetch is in flight and on failure. */
export const FALLBACK_GENRES = ALL_GENRES;

export function useAniListGenres() {
  const { settings } = useContentSafetySettings();

  const query = useQuery({
    queryKey: ['anilist-genres', settings.showAdultEverywhere],
    queryFn: () => fetchAniListGenres(settings.showAdultEverywhere),
    staleTime: 12 * 60 * 60 * 1000, // 12h, matches the module-level cache
    gcTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });

  return {
    /** AniList genres, or the fallback list when the query has no data yet. */
    genres: query.data?.length ? query.data : FALLBACK_GENRES,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
