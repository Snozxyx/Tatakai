import { useMemo } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useWatchlist } from "@/hooks/user/useWatchlist";
import { useWatchHistory } from "@/hooks/user/useWatchHistory";
import { fetchAniZipMapping, type AniZipEpisode } from "@/lib/mapping/anizip";
import { contentGraph } from "@/core/content/content-graph";

export interface FollowedAnimeUpdate {
  animeId: string;
  animeName: string;
  animePoster: string | null;
  anilistId: number | null;
  status: string;
  updatedAt: string;
  lastWatchedEpisode: number | null;
  latestEpisode: AniZipEpisode | null;
  latestEpisodeNumber: number | null;
  newEpisodesCount: number;
  hasNew: boolean;
  episodeTitle: string | null;
  episodeImage: string | null;
  airDateUtc: string | null;
}

function resolveAnilistId(animeId: string, anilistId?: number | null, malId?: number | null): number | null {
  if (anilistId && Number.isFinite(Number(anilistId)) && Number(anilistId) > 0) {
    return Number(anilistId);
  }
  const raw = String(animeId || "").trim();
  if (!raw) return null;
  const prefixed = raw.match(/^anilist[:_-]?(\d+)$/i);
  if (prefixed?.[1]) return Number(prefixed[1]);
  if (/^\d+$/.test(raw)) return Number(raw);
  // mal:xxx can't be resolved synchronously — handled async via getMedia
  void malId;
  return null;
}

async function resolveAnilistIdAsync(
  animeId: string,
  anilistId?: number | null,
): Promise<number | null> {
  const sync = resolveAnilistId(animeId, anilistId);
  if (sync) return sync;
  // UUID / slug / tatakai id — resolve through the content graph (cached).
  try {
    const media = await contentGraph.getMedia(animeId);
    if (media?.anilistId && Number.isFinite(media.anilistId) && media.anilistId > 0) {
      return media.anilistId;
    }
  } catch {
    /* unresolvable — caller shows the card without episode detail */
  }
  return null;
}

/**
 * New episodes from anime the user follows.
 *
 * Takes the watchlist (watching / plan_to_watch / on_hold first), resolves each
 * entry to an AniList id, then reads the latest aired episode from the cached
 * ani.zip mapping. Compared against watch_history so the rail can badge
 * "3 new" and deep-link straight to the first unwatched episode.
 *
 * Bounded to 10 titles so the rail costs at most 10 cached mapping reads
 * (1h TTL) on first paint and zero on remount.
 */
export function useFollowedAnimeUpdates(limit = 10) {
  const { data: watchlist, isLoading: watchlistLoading } = useWatchlist();
  const { data: history } = useWatchHistory(100);

  const candidates = useMemo(() => {
    const list = Array.isArray(watchlist) ? watchlist : [];
    const rank: Record<string, number> = {
      watching: 0,
      plan_to_watch: 1,
      on_hold: 2,
      completed: 3,
      dropped: 4,
    };
    return [...list]
      .filter((item) => item.status !== "dropped")
      .sort((a, b) => {
        const ra = rank[a.status] ?? 9;
        const rb = rank[b.status] ?? 9;
        if (ra !== rb) return ra - rb;
        return (
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );
      })
      .slice(0, limit);
  }, [watchlist, limit]);

  const lastWatchedByAnime = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of history || []) {
      const prev = map.get(row.anime_id);
      if (prev == null || row.episode_number > prev) {
        map.set(row.anime_id, row.episode_number);
      }
    }
    return map;
  }, [history]);

  // Resolve AniList ids first (cached getMedia for non-numeric ids).
  const resolution = useQuery({
    queryKey: [
      "followed-anime-anilist-ids",
      candidates.map((c) => c.anime_id).join(","),
    ],
    queryFn: async () => {
      const out = new Map<string, number>();
      await Promise.all(
        candidates.map(async (item) => {
          const rawAnilist = (item as unknown as { anilist_id?: number | null })
            .anilist_id;
          const id = await resolveAnilistIdAsync(item.anime_id, rawAnilist);
          if (id) out.set(item.anime_id, id);
        }),
      );
      return out;
    },
    enabled: candidates.length > 0,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });

  const anilistByAnime = resolution.data ?? new Map<string, number>();

  const episodeQueries = useQueries({
    queries: candidates.map((item) => {
      const anilistId = anilistByAnime.get(item.anime_id) ?? null;
      return {
        queryKey: ["anizip-latest", anilistId ?? item.anime_id],
        queryFn: async () => {
          if (!anilistId) return null;
          try {
            const mapping = await fetchAniZipMapping(anilistId);
            return mapping?.lastAiredEpisode ?? null;
          } catch {
            return null;
          }
        },
        enabled: anilistId != null,
        staleTime: 10 * 60 * 1000,
        gcTime: 60 * 60 * 1000,
        retry: false,
      };
    }),
  });

  const updates = useMemo<FollowedAnimeUpdate[]>(() => {
    return candidates.map((item, index) => {
      const anilistId = anilistByAnime.get(item.anime_id) ?? null;
      const latest = (episodeQueries[index]?.data as AniZipEpisode | null) ?? null;
      const lastWatched = lastWatchedByAnime.get(item.anime_id) ?? null;
      const latestNumber = latest?.number ?? null;
      const newCount =
        latestNumber != null && lastWatched != null
          ? Math.max(0, latestNumber - lastWatched)
          : latestNumber != null && lastWatched == null
            ? Math.min(latestNumber, 99)
            : 0;

      return {
        animeId: item.anime_id,
        animeName: item.anime_name,
        animePoster: item.anime_poster,
        anilistId,
        status: item.status,
        updatedAt: item.updated_at,
        lastWatchedEpisode: lastWatched,
        latestEpisode: latest,
        latestEpisodeNumber: latestNumber,
        newEpisodesCount: newCount,
        hasNew: newCount > 0,
        episodeTitle: latest?.title ?? null,
        episodeImage: latest?.image ?? null,
        airDateUtc: latest?.airDateUtc ?? null,
      };
    });
  }, [candidates, anilistByAnime, episodeQueries, lastWatchedByAnime]);

  // New-first, then most recently followed.
  const sorted = useMemo(
    () =>
      [...updates].sort((a, b) => {
        if (a.hasNew !== b.hasNew) return a.hasNew ? -1 : 1;
        if (b.newEpisodesCount !== a.newEpisodesCount)
          return b.newEpisodesCount - a.newEpisodesCount;
        return (
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
      }),
    [updates],
  );

  const isLoading =
    watchlistLoading ||
    resolution.isLoading ||
    episodeQueries.some((q) => q.isLoading);

  return {
    updates: sorted,
    isLoading,
    hasFollowed: candidates.length > 0,
  };
}
