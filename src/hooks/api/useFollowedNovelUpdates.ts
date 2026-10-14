import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useNovelReadlist } from '@/hooks/user/useNovelReadlist';
import { getNovelChapters } from '@/core/content/novel-client';
import type { MappedNovelChapter } from '@/types/novel';

export interface FollowedNovelUpdate {
  novelId: string;
  novelTitle: string;
  novelPoster: string | null;
  status: string;
  updatedAt: string;
  lastChapterNumber: number | null;
  lastChapterTitle: string | null;
  latestChapterNumber: number | null;
  latestChapterTitle: string | null;
  newChaptersCount: number;
  hasNew: boolean;
  latestChapterKey: string | null;
}

/**
 * New chapters from novels the user follows.
 *
 * Mirrors `useFollowedMangaUpdates`: takes the novel readlist (reading /
 * plan_to_read / on_hold first), fetches each title's chapter hierarchy
 * (cached 10min) and diffs the newest chapter number against the stored
 * `last_chapter_number`.
 */
export function useFollowedNovelUpdates(limit = 10) {
  const { data: readlist, isLoading: readlistLoading } = useNovelReadlist();

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
      .filter((item) => item.status !== 'dropped')
      .sort((a, b) => {
        const ra = rank[a.status] ?? 9;
        const rb = rank[b.status] ?? 9;
        if (ra !== rb) return ra - rb;
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      })
      .slice(0, limit);
  }, [readlist, limit]);

  const chapterQueries = useQueries({
    queries: candidates.map((item) => ({
      queryKey: ['followed-novel-chapters', item.manga_id],
      queryFn: async (): Promise<MappedNovelChapter[]> => {
        try {
          const res = await getNovelChapters(item.manga_id);
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

  const updates = useMemo<FollowedNovelUpdate[]>(() => {
    return candidates.map((item, index) => {
      const chapters = (chapterQueries[index]?.data ?? []) as MappedNovelChapter[];
      let latest: MappedNovelChapter | null = null;
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
        novelId: item.manga_id,
        novelTitle: item.manga_title,
        novelPoster: item.manga_poster,
        status: item.status,
        updatedAt: item.updated_at,
        lastChapterNumber: lastNum,
        lastChapterTitle: item.last_chapter_title,
        latestChapterNumber: latestNum,
        latestChapterTitle: latest?.chapterTitle ?? null,
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
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
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
