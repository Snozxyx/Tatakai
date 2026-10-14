import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { useMangaReadlist } from "@/hooks/user/useMangaReadlist";
import { getMangaChapters } from "@/core/content/manga-client";
import { needsReadlistMetadata, resolveReadlistMetadata } from "@/lib/reader/readlistMetadata";
import type { MangaChapterResponse, MappedMangaChapter } from "@/types/manga";
import { mangaUpdateChapters } from '@/lib/reader/mangaChapterReliability';

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
 * against the stored `last_chapter_number`. Metadata repair and chapter reads
 * are bounded to the selected titles and cached independently.
 */
export function useFollowedMangaUpdates(limit = 10) {
  const { data: readlist, isLoading: readlistLoading } = useMangaReadlist(["reading", "plan_to_read", "on_hold", "completed"]);

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

  const metadataQueries = useQueries({
    queries: candidates.map((item) => ({
      queryKey: ["followed-manga-metadata", item.manga_id, item.manga_title, item.manga_poster, item.anilist_id, item.mal_id, item.format],
      queryFn: () => resolveReadlistMetadata(item),
      enabled: needsReadlistMetadata(item),
      staleTime: 60 * 60 * 1000,
      retry: false,
    })),
  });

  const chapterQueries = useQueries({
    queries: candidates.map((item, index) => ({
      queryKey: ["followed-manga-chapters", metadataQueries[index]?.data?.id || item.manga_id],
      queryFn: async (): Promise<MangaChapterResponse | null> => {
        try {
          const res = await getMangaChapters(metadataQueries[index]?.data?.id || item.manga_id);
          return res ?? null;
        } catch {
          return null;
        }
      },
      staleTime: 10 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: false,
      enabled: !metadataQueries[index]?.isLoading,
    })),
  });

  const updates = useMemo<FollowedMangaUpdate[]>(() => {
    return candidates.map((item, index) => {
      const catalog = chapterQueries[index]?.data;
      const chapters = mangaUpdateChapters(catalog?.mappedChapters ?? []);
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
      const latestNum = catalog?.mangaUpdates?.latestChapter ?? latest?.chapterNumber ?? null;
      if (catalog?.mangaUpdates) latest = chapters.find(c => c.chapterNumber === latestNum) ?? null;
      const listedNewCount = chapters.filter(c => lastNum == null || c.chapterNumber! > lastNum).length;
      const newCount = catalog?.mangaUpdates && latestNum != null && (lastNum == null || latestNum > lastNum)
        ? Math.max(1, listedNewCount) : listedNewCount;

      const latestKey =
        latest?.sources?.find(s => s.chapterKey && s.provider !== 'tatakai_media')?.chapterKey ?? null;

      return {
        mangaId: metadataQueries[index]?.data?.id || item.manga_id,
        mangaTitle: metadataQueries[index]?.data?.title || item.manga_title,
        mangaPoster: metadataQueries[index]?.data?.poster || item.manga_poster,
        format: metadataQueries[index]?.data?.format || item.format || "unknown",
        status: item.status,
        updatedAt: item.updated_at,
        lastChapterNumber: lastNum,
        lastChapterTitle: item.last_chapter_title,
        latestChapterNumber: latestNum,
        latestChapterTitle: latest?.chapterTitle ?? (latestNum != null ? `Chapter ${latestNum}` : null),
        latestChapterThumbnail: latest?.thumbnail ?? null,
        latestPublished: catalog?.mangaUpdates?.latestReleaseDate ?? latest?.published ?? latest?.sources?.map(s => s.releaseDate).filter(Boolean).sort().at(-1) ?? null,
        newChaptersCount: newCount,
        hasNew: newCount > 0,
        latestChapterKey: latestKey,
      };
    });
  }, [candidates, chapterQueries, metadataQueries]);

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
    readlistLoading || metadataQueries.some((q) => q.isLoading) || chapterQueries.some((q) => q.isLoading);

  return {
    updates: sorted,
    isLoading,
    hasFollowed: candidates.length > 0,
  };
}
