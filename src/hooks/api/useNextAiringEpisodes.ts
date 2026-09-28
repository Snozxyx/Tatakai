import { useQuery } from '@tanstack/react-query';

/**
 * Per-show next-episode lookup for the profile "Tatakai Calendar" card.
 *
 * Routed through the TatakaiAPI proxy (`/api/v3/anilist/graphql`) with
 * `forceUpstream: true` — next-airing times are volatile and must come from real
 * AniList, not the mirror's stored snapshot. `useAiringSchedule` only covers a
 * fixed 7-day window, which is not enough to show a countdown for a saved show
 * whose next episode is weeks away; AniList's `Media.nextAiringEpisode` gives the
 * single upcoming episode for any show regardless of how far out it is, so this
 * batch-queries it for a set of AniList ids in one request (`id_in`) and returns
 * a lookup keyed by id.
 */
import { ANILIST_GRAPHQL_ENDPOINT as ANILIST_ENDPOINT } from '@/lib/api/backendOrigin';

const QUERY = `
query ($ids: [Int]) {
  Page(perPage: 50) {
    media(id_in: $ids, type: ANIME) {
      id
      status
      episodes
      title { romaji english }
      coverImage { large medium color }
      nextAiringEpisode { airingAt episode timeUntilAiring }
    }
  }
}`;

export interface NextAiringInfo {
  mediaId: number;
  title: string;
  coverImage: string | null;
  color: string | null;
  status: string | null;
  totalEpisodes: number | null;
  /** unix seconds; null when the show has no scheduled next episode. */
  airingAt: number | null;
  episode: number | null;
}

async function fetchNextAiring(ids: number[]): Promise<Record<number, NextAiringInfo>> {
  const out: Record<number, NextAiringInfo> = {};
  // AniList caps `id_in` results at the page size (50); chunk to be safe.
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const res = await fetch(ANILIST_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: QUERY, variables: { ids: chunk }, forceUpstream: true }),
    });
    if (!res.ok) throw new Error(`AniList request failed (${res.status})`);
    const json = await res.json();
    const media: any[] = json?.data?.Page?.media ?? [];
    for (const m of media) {
      const id = Number(m?.id);
      if (!Number.isFinite(id)) continue;
      out[id] = {
        mediaId: id,
        title: m?.title?.english || m?.title?.romaji || 'Unknown',
        coverImage: m?.coverImage?.large || m?.coverImage?.medium || null,
        color: m?.coverImage?.color ?? null,
        status: m?.status ?? null,
        totalEpisodes: m?.episodes ?? null,
        airingAt: m?.nextAiringEpisode?.airingAt ?? null,
        episode: m?.nextAiringEpisode?.episode ?? null,
      };
    }
  }
  return out;
}

/**
 * Look up the next airing episode for each AniList id. Cached per sorted id set;
 * the query stays disabled (and returns `{}`) when there are no ids to fetch.
 */
export function useNextAiringEpisodes(anilistIds: number[]) {
  const ids = Array.from(new Set(anilistIds.filter((n) => Number.isFinite(n) && n > 0))).sort(
    (a, b) => a - b,
  );

  return useQuery({
    queryKey: ['next-airing-episodes', ids],
    queryFn: () => fetchNextAiring(ids),
    enabled: ids.length > 0,
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });
}
