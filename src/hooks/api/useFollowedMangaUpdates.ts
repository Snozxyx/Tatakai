import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { useMangaReadlist } from "@/hooks/user/useMangaReadlist";
import { getMangaChapters } from "@/core/content/manga-client";
import type { MappedMangaChapter } from "@/types/manga";

export interface FollowedMangaUpdate {
  mangaId: string;
  mangaTitle: string;
  mangaPoster: string | null;
  format: string;
  status: string;
  updatedAt: string;
  lastChapterNumber: number | null;
  lastChapterTitle: string | null;
  latestChapterNumber: number | null;
  latestChapterTitle: string | null;
  latestChapterThumbnail: string | null;
  latestPublished: string | null;
  newChaptersCount: number;
  hasNew: boolean;
  latestChapterKey: string | null;
}

/**
 * New chapters from manga the user follows.
 *
 * Takes the readlist (reading / plan_to_read / on_hold first), fetches each
 * title's chapter hierarchy (cached 10min) and diffs the newest chapter number
 * against the stored `last_chapter_number`. Bounded to 10 titles so the rail
 * costs at most 10 cached reads on first paint.
 */
export function useFollowedMangaUpdates(limit = 10) {
  const { data: readlist, isLoading: readlistLoading } = useMangaReadlist();

  const candidates = useMemo(() => {
    const list = Array.isArray(readlist) ? readlist : [];
    const rank: Record<string, number> = {
      reading: 0,
      plan_to_read: 1,
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
  }, [readlist, limit]);

  const chapterQueries = useQueries({
    queries: candidates.map((item) => ({
      queryKey: ["followed-manga-chapters", item.manga_id],
      queryFn: async (): Promise<MappedMangaChapter[]> => {
        try {
          const res = await getMangaChapters(item.manga_id);
          return res?.mappedChapters ?? [];
        } catch {
          return [];
        }
      },
      staleTime: 10 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: false,
    })),
  });

  const updates = useMemo<FollowedMangaUpdate[]>(() => {
    return candidates.map((item, index) => {
      const chapters = (chapterQueries[index]?.data ?? []) as MappedMangaChapter[];
      // Newest numeric chapter in the hierarchy.
      let latest: MappedMangaChapter | null = null;
      for (const c of chapters) {
        if (c?.chapterNumber == null) continue;
        if (!latest || (latest.chapterNumber ?? 0) < (c.chapterNumber ?? 0)) {
          latest = c;
        }
      }

      const lastNum =
        item.last_chapter_number != null && Number.isFinite(Number(item.last_chapter_number))
          ? Number(item.last_chapter_number)
          : null;
      const latestNum = latest?.chapterNumber ?? null;
      const newCount =
        latestNum != null && lastNum != null
          ? Math.max(0, Math.floor(latestNum - lastNum))
          : latestNum != null && lastNum == null
            ? Math.min(Math.floor(latestNum), 99)
            : 0;

      const latestKey =
        latest?.sources?.[0]?.chapterKey ??
        (latestNum != null ? `chapter-${latestNum}` : null);

      return {
        mangaId: item.manga_id,
        mangaTitle: item.manga_title,
        mangaPoster: item.manga_poster,
        format: item.format || "unknown",
        status: item.status,
        updatedAt: item.updated_at,
        lastChapterNumber: lastNum,
        lastChapterTitle: item.last_chapter_title,
        latestChapterNumber: latestNum,
        latestChapterTitle: latest?.chapterTitle ?? null,
        latestChapterThumbnail: latest?.thumbnail ?? null,
        latestPublished: latest?.published ?? null,
        newChaptersCount: newCount,
        hasNew: newCount > 0,
        latestChapterKey: latestKey,
      };
    });
  }, [candidates, chapterQueries]);

  const sorted = useMemo(
    () =>
      [...updates].sort((a, b) => {
        if (a.hasNew !== b.hasNew) return a.hasNew ? -1 : 1;
        if (b.newChaptersCount !== a.newChaptersCount)
          return b.newChaptersCount - a.newChaptersCount;
        return (
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
      }),
    [updates],
  );

  const isLoading =
    readlistLoading || chapterQueries.some((q) => q.isLoading);

  return {
    updates: sorted,
    isLoading,
    hasFollowed: candidates.length > 0,
  };
}
