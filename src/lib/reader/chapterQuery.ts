import { getMangaReadByKey } from '@/core/content/manga-client';
import type { MangaChapterSource } from '@/types/manga';

/** Foreground navigation, prefetch, and continuous segments use one cache key. */
export function mangaReadQuery(mangaId: string, chapterKey: string, options: {
  provider?: string; providerChapterId?: string; alternatives?: MangaChapterSource[]; reloadNonce?: number;
} = {}) {
  const alternativesKey = (options.alternatives || []).map(source => `${source.provider}::${source.chapterKey}::${source.providerChapterId || ''}`).sort().join('|');
  return {
    queryKey: ['manga-read', mangaId, chapterKey, options.provider || '', options.providerChapterId || '', alternativesKey, options.reloadNonce || 0] as const,
    queryFn: async ({ signal }: { signal: AbortSignal }) => {
      const response = await getMangaReadByKey(mangaId, chapterKey, { ...options, signal });
      if (!response?.data?.pages?.length) throw new Error('This chapter has no readable pages');
      return response;
    },
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  };
}

export function mangaResourceScope(mangaId: string, chapter: { chapterKey: string; provider?: string; providerChapterId?: string }) {
  return JSON.stringify(['manga', mangaId, chapter.chapterKey, chapter.provider || '', chapter.providerChapterId || '']);
}
