import uiI18n from '@/lib/uiI18n';
import { useUiTranslation } from '@/hooks/ui/useUiTranslation';
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
import { startMobileDownload, type MobileDownloadInput } from '@/core/download/mobile/mobileDownloader';
import { useNativeDownloadJobs, deleteNativeDownload } from '@/core/download/mobile/nativeDownloads';

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
  useUiTranslation();
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

  const retryDownload = (id: string) => {
    const item = queue.find((q) => q.id === id);
    // Manga re-downloads need the chapter's source resolution, which only the
    // manga page holds — the offline hub renders an "Open manga" button for
    // those rows instead of retrying here.
    if (!item || item.kind === 'manga') {
      toast.info(uiI18n.t('app.re_download_from_the_manga_page_42bf3435'), {
        get description() { return uiI18n.t('app.open_the_manga_and_pick_the_chapter_again_c4806b72'); },
      });
      return;
    }
    void (async () => {
      try {
        const { retryMobileDownload } = await import('@/core/download/mobile/mobileDownloader');
        const res = await retryMobileDownload(id);
        if (res.ok) {
          toast.success(uiI18n.t('app.download_restarted_54bef814'));
          return;
        }
        const reason = 'reason' in res && typeof res.reason === 'string' ? res.reason : 'unknown';
        if (reason === 'missing_stream_url') {
          toast.info(uiI18n.t('app.re_download_from_the_series_page_6fb02b8d'), {
            get description() { return uiI18n.t('app.the_original_stream_link_expired_open_the_anime__c8bb671d'); },
          });
        } else if (reason === 'already_downloading') {
          toast.info(uiI18n.t('app.already_downloading_7a98b1fa'));
        } else {
          toast.error(uiI18n.t('app.could_not_restart_the_download_86256d4a'), { description: String(reason || '') });
        }
      } catch (error) {
        toast.error(uiI18n.t('app.could_not_restart_the_download_86256d4a'), {
          description: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  };

  return {
    isNative: isMobileNative(),
    queue,
    activeDownloads,
    startDownload: (payload: MobileDownloadInput) => startMobileDownload(payload),
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
  useUiTranslation();
  const { jobs, error, available, ready } = useNativeDownloadJobs();
  const episodes: OfflineEpisode[] = jobs.filter((job) => job.status === 'completed').map((job) => ({
    animeId: job.animeId || job.episodeId,
    animeTitle: job.animeName,
    poster: job.posterUrl,
    episodeId: job.episodeId,
    episode: job.episodeNumber,
    season: 1,
    localPath: `native-offline://${encodeURIComponent(job.episodeId)}`,
    downloadedAt: new Date(job.completedAt || 0).toISOString(),
  }));
  return {
    isNative: isMobileNative(),
    loading: available && !ready,
    episodes, error, available,
    deleteEpisode: async (animeId: string, season: number, episode: number) => {
      const item = episodes.find((entry) => entry.animeId === animeId && entry.season === season && entry.episode === episode);
      if (!item) return { ok: false, reason: 'episode_not_found' };
      await deleteNativeDownload(item.episodeId); return { ok: true };
    },
  };
}
