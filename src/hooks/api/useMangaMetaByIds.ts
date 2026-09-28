import { useQuery } from '@tanstack/react-query';

/**
 * Batch-resolve manga metadata (format, genres, chapters) for a set of AniList
 * ids in one request.
 *
 * The `manga_readlist` rows only carry status + title + poster — no genres or
 * origin — so the profile's manga analytics has nothing to chart on its own.
 * This pulls the missing fields from AniList's public API so the manga/manhwa/
 * manhua split and genre breakdown are backed by real data. `countryOfOrigin`
 * classifies the written-work format (KR = manhwa, CN/TW = manhua, else manga),
 * matching how the rest of the app (`manga-client.ts`) does it. Routed through
 * the TatakaiAPI proxy (mirror-first) — see src/lib/anilist.ts.
 */
import { ANILIST_GRAPHQL_ENDPOINT as ANILIST_ENDPOINT } from '@/lib/api/backendOrigin';

const QUERY = `
query ($ids: [Int]) {
  Page(perPage: 50) {
    media(id_in: $ids, type: MANGA) {
      id
      format
      countryOfOrigin
      chapters
      volumes
      genres
      tags { name rank isMediaSpoiler isGeneralSpoiler }
      averageScore
      title { romaji english }
    }
  }
}`;

export type MangaFormatBucket = 'manga' | 'manhwa' | 'manhua';

export interface MangaMetaInfo {
  id: number;
  bucket: MangaFormatBucket;
  format: string | null;
  genres: string[];
  tags: string[]; // non-spoiler tag names, highest-ranked first
  chapters: number | null;
  volumes: number | null;
  averageScore: number | null;
  title: string;
}

function classify(countryOfOrigin: string | null | undefined): MangaFormatBucket {
  const c = String(countryOfOrigin || '').toUpperCase();
  if (c === 'KR') return 'manhwa';
  if (c === 'CN' || c === 'TW') return 'manhua';
  return 'manga';
}

async function fetchMangaMeta(ids: number[]): Promise<Record<number, MangaMetaInfo>> {
  const out: Record<number, MangaMetaInfo> = {};
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
        bucket: classify(m?.countryOfOrigin),
        format: m?.format ?? null,
        genres: Array.isArray(m?.genres) ? m.genres : [],
        tags: Array.isArray(m?.tags)
          ? m.tags
              .filter((t: any) => t && !t.isMediaSpoiler && !t.isGeneralSpoiler)
              .sort((a: any, b: any) => (b?.rank ?? 0) - (a?.rank ?? 0))
              .map((t: any) => String(t?.name || ''))
              .filter(Boolean)
          : [],
        chapters: m?.chapters ?? null,
        volumes: m?.volumes ?? null,
        averageScore: m?.averageScore ?? null,
        title: m?.title?.english || m?.title?.romaji || 'Unknown',
      };
    }
  }
  return out;
}

/**
 * Look up manga metadata for AniList ids. Non-numeric ids are ignored; the query
 * stays disabled (returns `{}`) when there's nothing to resolve.
 */
export function useMangaMetaByIds(anilistIds: (string | number | null | undefined)[]) {
  const ids = Array.from(
    new Set(
      anilistIds
        .map((v) => {
          if (typeof v === 'number') return v;
          const m = String(v ?? '').match(/(\d+)/);
          return m ? Number(m[1]) : NaN;
        })
        .filter((n) => Number.isFinite(n) && n > 0),
    ),
  ).sort((a, b) => a - b);

  return useQuery({
    queryKey: ['manga-meta-by-ids', ids],
    queryFn: () => fetchMangaMeta(ids),
    enabled: ids.length > 0,
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });
}
