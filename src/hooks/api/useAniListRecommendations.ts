/**
 * useAniListRecommendations — per-media "Recommended" picks curated on AniList.
 *
 * AniList keeps a crowd-voted `recommendations` list on every Media (the
 * "if you liked X, try Y" rail on anilist.co). This hook surfaces that list for
 * one title so the detail pages can blend AniList's human-curated picks with the
 * app's own recommendation engine.
 *
 * It NEVER calls https://graphql.anilist.co directly. Every request goes through
 * the TatakaiAPI proxy at `/api/v3/anilist/graphql`, which serves the in-process
 * mirror first and only falls back to upstream AniList on a mirror miss. The
 * mirror's `recommendations` field takes no arguments, so we ask for the whole
 * connection and sort/slice by vote `rating` client-side.
 */

import { useQuery } from '@tanstack/react-query';

import { ANILIST_GRAPHQL_ENDPOINT as ANILIST_GRAPHQL_URL } from '@/lib/api/backendOrigin';

/** One normalized AniList recommendation, shaped to feed both anime + manga cards. */
export interface AniListRecommendation {
  anilistId: number;
  malId?: number | null;
  title: string;
  jtitle?: string;
  poster: string;
  color?: string | null;
  format?: string | null;
  /** AniList media type of the *recommended* title. */
  type: 'ANIME' | 'MANGA';
  seasonYear?: number | null;
  /** AniList average score, 0–100. */
  averageScore?: number | null;
  isAdult: boolean;
  /** Crowd-vote tally for this recommendation — the ranking signal. */
  rating: number;
}

const RECOMMENDATIONS_QUERY = /* GraphQL */ `
  query ($id: Int) {
    Media(id: $id) {
      id
      recommendations {
        nodes {
          rating
          mediaRecommendation {
            id
            idMal
            type
            format
            seasonYear
            averageScore
            isAdult
            title { romaji english native }
            coverImage { large medium color }
          }
        }
      }
    }
  }
`;

interface RawRecNode {
  rating: number | null;
  mediaRecommendation: {
    id: number;
    idMal: number | null;
    type: 'ANIME' | 'MANGA' | null;
    format: string | null;
    seasonYear: number | null;
    averageScore: number | null;
    isAdult: boolean | null;
    title: { romaji: string | null; english: string | null; native: string | null } | null;
    coverImage: { large: string | null; medium: string | null; color: string | null } | null;
  } | null;
}

async function fetchAniListRecommendations(
  anilistId: number,
  signal?: AbortSignal,
): Promise<AniListRecommendation[]> {
  const res = await fetch(ANILIST_GRAPHQL_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: RECOMMENDATIONS_QUERY, variables: { id: anilistId } }),
    signal,
  });
  if (!res.ok) throw new Error(`AniList ${res.status}`);

  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0]?.message || 'AniList GraphQL error');

  const nodes: RawRecNode[] = json?.data?.Media?.recommendations?.nodes ?? [];
  return nodes
    .map((n): AniListRecommendation | null => {
      const m = n.mediaRecommendation;
      if (!m?.id) return null;
      const poster = m.coverImage?.large ?? m.coverImage?.medium ?? '';
      if (!poster) return null;
      return {
        anilistId: m.id,
        malId: m.idMal,
        title: m.title?.english ?? m.title?.romaji ?? m.title?.native ?? 'Unknown',
        jtitle: m.title?.native ?? m.title?.romaji ?? undefined,
        poster,
        color: m.coverImage?.color ?? null,
        format: m.format,
        type: m.type ?? 'ANIME',
        seasonYear: m.seasonYear,
        averageScore: m.averageScore,
        isAdult: !!m.isAdult,
        rating: n.rating ?? 0,
      };
    })
    .filter((r): r is AniListRecommendation => r !== null);
}

export interface UseAniListRecommendationsOptions {
  /** Only keep recs whose recommended media is this type. Omit to keep all. */
  mediaType?: 'ANIME' | 'MANGA';
  /** Include 18+ titles. Defaults to false (safe). */
  includeAdult?: boolean;
  /** Max recs to return after sorting by vote. Default 24. */
  limit?: number;
}

/**
 * Fetches AniList's curated recommendations for one media id, normalized and
 * sorted by crowd-vote `rating` (desc). Returns `[]` until an id is known.
 */
export function useAniListRecommendations(
  anilistId: number | null | undefined,
  opts: UseAniListRecommendationsOptions = {},
) {
  const { mediaType, includeAdult = false, limit = 24 } = opts;

  const query = useQuery({
    queryKey: ['anilist-recommendations', anilistId],
    enabled: !!anilistId && anilistId > 0,
    staleTime: 60 * 60 * 1000, // 1h — a title's rec list barely moves
    gcTime: 2 * 60 * 60 * 1000,
    queryFn: ({ signal }) => fetchAniListRecommendations(anilistId as number, signal),
  });

  const recommendations = (query.data ?? [])
    .filter((r) => (mediaType ? r.type === mediaType : true))
    .filter((r) => (includeAdult ? true : !r.isAdult))
    .sort((a, b) => b.rating - a.rating)
    .slice(0, limit);

  return {
    recommendations,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
