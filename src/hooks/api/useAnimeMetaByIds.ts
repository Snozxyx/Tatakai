import { useQuery } from '@tanstack/react-query';

/**
 * Resolve anime title + cover image for a set of AniList ids in one request.
 *
 * Ratings only store `anime_id` (the AniList numeric id used across the app), so
 * a review for a show that isn't in the user's watchlist/history has no local
 * title or poster. This batch-fetches that metadata from AniList's public API so
 * the profile Reviews card can render it instead of "Unknown title". Routed
 * through the TatakaiAPI proxy (mirror-first) — see src/lib/anilist.ts.
 */
import { ANILIST_GRAPHQL_ENDPOINT as ANILIST_ENDPOINT } from '@/lib/api/backendOrigin';

const QUERY = `
query ($ids: [Int]) {
  Page(perPage: 50) {
    media(id_in: $ids) {
      id
      title { romaji english }
      coverImage { large medium }
    }
  }
}`;

export interface AnimeMeta {
  id: number;
  title: string;
  coverImage: string | null;
}

async function fetchMeta(ids: number[]): Promise<Record<number, AnimeMeta>> {
  const out: Record<number, AnimeMeta> = {};
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const res = await fetch(ANILIST_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: QUERY, variables: { ids: chunk } }),
    });
    if (!res.ok) throw new Error(`AniList request failed (${res.status})`);
    const json = await res.json();
    const media: any[] = json?.data?.Page?.media ?? [];
    for (const m of media) {
      const id = Number(m?.id);
      if (!Number.isFinite(id)) continue;
      out[id] = {
        id,
        title: m?.title?.english || m?.title?.romaji || 'Unknown',
        coverImage: m?.coverImage?.large || m?.coverImage?.medium || null,
      };
    }
  }
  return out;
}

/**
 * Look up title/cover for AniList ids. Non-numeric ids are ignored; the query
 * stays disabled (returns `{}`) when there's nothing to resolve.
 */
export function useAnimeMetaByIds(animeIds: (string | number | null | undefined)[]) {
  const ids = Array.from(
    new Set(
      animeIds
        .map((v) => {
          if (typeof v === 'number') return v;
          const m = String(v ?? '').match(/(\d+)/);
          return m ? Number(m[1]) : NaN;
        })
        .filter((n) => Number.isFinite(n) && n > 0),
    ),
  ).sort((a, b) => a - b);

  return useQuery({
    queryKey: ['anime-meta-by-ids', ids],
    queryFn: () => fetchMeta(ids),
    enabled: ids.length > 0,
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });
}
