import { useMemo } from 'react';
import { toast } from 'sonner';
import { isMobileNative } from '@/lib/platform/platform';
import {
  useDownloadStates,
  markCancelled,
} from '@/core/download/download-monitor';
import {
  useMangaDownloadStates,
  markMangaCancelled,
} from '@/core/download/manga-download-monitor';
import { cancelMobileDownload } from '@/core/download/mobile/mobileDownloader';

export type MobileDownloadQueueItem = {
  id: string;
  kind: 'anime' | 'manga';
  title?: string;
  animeTitle?: string;
  /** Anime episode number / manga chapter number (when known). */
  season?: number;
  episode?: number;
  /** Human line under the title, e.g. "Ch. 12" or "S1 E5". */
  subtitle?: string;
  posterUrl?: string;
  status: 'queued' | 'downloading' | 'completed' | 'failed' | 'cancelled';
  progress?: number;
  error?: string;
  /** Manga only — needed to cancel. */
  anilistId?: number;
  chapterKey?: string;
};

const isActiveStatus = (s: MobileDownloadQueueItem['status']) =>
  s === 'queued' || s === 'downloading';

/**
 * Live mobile download queue, derived from the two global monitors (anime +
 * manga). Previously a stub that always returned empty lists, so the downloads
 * page / floating panel never showed anything even while downloads ran.
 */
export function useMobileDownload() {
  const animeStates = useDownloadStates();
  const mangaStates = useMangaDownloadStates();

  const queue = useMemo<MobileDownloadQueueItem[]>(() => {
    const items: MobileDownloadQueueItem[] = [];
    for (const entry of Object.values(animeStates)) {
      items.push({
        id: entry.episodeId,
        kind: 'anime',
        animeTitle: entry.animeName,
        episode: entry.episodeNumber,
        subtitle:
          entry.episodeNumber != null ? `Episode ${entry.episodeNumber}` : undefined,
        posterUrl: entry.posterUrl,
        status: entry.status,
        progress: entry.progress,
        error: entry.error,
      });
    }
    for (const entry of Object.values(mangaStates)) {
      items.push({
        id: entry.jobId,
        kind: 'manga',
        animeTitle: entry.title,
        subtitle: entry.chapterLabel || undefined,
        posterUrl: entry.posterUrl || undefined,
        status: entry.status,
        progress: entry.progress,
        error: entry.error,
        anilistId: entry.anilistId,
        chapterKey: entry.chapterKey,
      });
    }
    // Active first, then terminal — most relevant on top.
    return items.sort((a, b) => Number(isActiveStatus(b.status)) - Number(isActiveStatus(a.status)));
  }, [animeStates, mangaStates]);

  const activeDownloads = useMemo(
    () => queue.filter((item) => isActiveStatus(item.status)),
    [queue],
  );

  const cancelDownload = (id: string) => {
    const item = queue.find((q) => q.id === id);
    if (item?.kind === 'manga' && item.anilistId != null && item.chapterKey) {
      // The downloader checks its cancelled-set per page; the monitor flips
      // to cancelled immediately so UI reacts at once.
      void import('@/core/download/mobile/mobileMangaDownloader').then((m) => {
        m.cancelMangaChapterMobile(item.anilistId as number, item.chapterKey as string);
      }).catch(() => {});
      markMangaCancelled(id);
      return;
    }
    cancelMobileDownload(id);
    markCancelled(id);
  };

  const retryDownload = (_id: string) => {
    toast.info('Re-download from the series page', {
      description: 'Open the anime or manga and pick the episode / chapter again.',
    });
  };

  return {
    isNative: isMobileNative(),
    queue,
    activeDownloads,
    startDownload: async (_payload: unknown) => {
      return { ok: false, reason: 'mobile_download_rebuild_pending' as const };
    },
    cancelDownload,
    retryDownload,
  };
}

export type OfflineEpisode = {
  animeId: string;
  animeTitle: string;
  poster?: string;
  episodeId: string;
  episodeTitle?: string;
  episode: number;
  season: number;
  localPath: string;
  downloadedAt: string;
};

export function useOfflineLibrary() {
  return {
    isNative: isMobileNative(),
    loading: false,
    episodes: [] as OfflineEpisode[],
    deleteEpisode: async (_animeId: string, _season: number, _episode: number) => ({ ok: false, reason: 'offline_library_rebuild_pending' as const }),
  };
}
