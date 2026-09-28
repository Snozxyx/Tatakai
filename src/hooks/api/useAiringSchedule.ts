import { useQuery } from '@tanstack/react-query';

/**
 * Weekly anime airing schedule. Routed through the TatakaiAPI proxy
 * (`/api/v3/anilist/graphql`) like every other AniList call, but with
 * `forceUpstream: true` so it reads real AniList instead of the mirror's stored
 * schedule — airing times are volatile and must stay fresh. The bundled
 * `nextAiringEpisode` per media isn't enough to fill a calendar grid, so the
 * Google-Calendar week view queries `Page.airingSchedules` for the requested
 * window and buckets the results by local day.
 */
import { ANILIST_GRAPHQL_ENDPOINT as ANILIST_ENDPOINT } from '@/lib/api/backendOrigin';

const QUERY = `
query ($start: Int, $end: Int, $page: Int) {
  Page(page: $page, perPage: 50) {
    pageInfo { hasNextPage currentPage }
    airingSchedules(airingAt_greater: $start, airingAt_lesser: $end, sort: TIME) {
      id
      airingAt
      episode
      media {
        id
        idMal
        format
        episodes
        siteUrl
        title { romaji english }
        coverImage { medium large color }
      }
    }
  }
}`;

export interface AiringEntry {
  id: number;
  airingAt: number; // unix seconds
  episode: number;
  mediaId: number;
  malId: number | null;
  title: string;
  coverImage: string | null;
  color: string | null;
  format: string | null;
  totalEpisodes: number | null;
  siteUrl: string | null;
}

async function fetchAiringWindow(startSec: number, endSec: number): Promise<AiringEntry[]> {
  const out: AiringEntry[] = [];
  let page = 1;
  // AniList caps at 50/page; a busy week is comfortably under a few pages.
  for (let i = 0; i < 6; i++) {
    const res = await fetch(ANILIST_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: QUERY, variables: { start: startSec, end: endSec, page }, forceUpstream: true }),
    });
    if (!res.ok) throw new Error(`AniList request failed (${res.status})`);
    const json = await res.json();
    const p = json?.data?.Page;
    const schedules: any[] = p?.airingSchedules ?? [];
    for (const s of schedules) {
      const m = s?.media ?? {};
      out.push({
        id: Number(s.id),
        airingAt: Number(s.airingAt),
        episode: Number(s.episode),
        mediaId: Number(m.id),
        malId: m.idMal ?? null,
        title: m?.title?.english || m?.title?.romaji || 'Unknown',
        coverImage: m?.coverImage?.large || m?.coverImage?.medium || null,
        color: m?.coverImage?.color ?? null,
        format: m?.format ?? null,
        totalEpisodes: m?.episodes ?? null,
        siteUrl: m?.siteUrl ?? null,
      });
    }
    if (!p?.pageInfo?.hasNextPage) break;
    page += 1;
  }
  return out;
}

/**
 * Fetch the airing schedule for the 7-day window starting at `weekStart`
 * (a Date at local midnight). Cached per week.
 */
export function useAiringSchedule(weekStart: Date) {
  const startSec = Math.floor(weekStart.getTime() / 1000);
  const endSec = startSec + 7 * 24 * 60 * 60;

  return useQuery({
    queryKey: ['airing-schedule', startSec],
    queryFn: () => fetchAiringWindow(startSec, endSec),
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });
}
