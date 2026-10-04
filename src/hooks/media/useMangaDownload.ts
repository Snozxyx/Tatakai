import { useCallback, useMemo } from 'react';
import { isEnabled, FeatureFlag } from '@/core/feature-flags/feature-flags';
import { useIsDesktopApp, useIsMobileApp } from '@/hooks/ui/useIsNativeApp';
import type { MangaDownloadChapter, MangaDownloadSeries } from '@/types/electron-bridge';
import {
  useMangaDownloadStates as useMonitorStates,
  mangaJobId,
  rememberMangaJobMeta,
  markMangaQueued,
  markMangaFailedStart,
  markMangaCancelled,
} from '@/core/download/manga-download-monitor';

/**
 * Thin binding over the app-lifetime `manga-download-monitor` singleton. The
 * monitor owns the (single) IPC subscription + offline-chapter persistence; this
 * hook exposes the live state map and enqueue/cancel actions. Mirrors
 * `useDownload.ts` (anime) but on the dedicated `window.electron.manga` bridge.
 */
export function useMangaDownload() {
  const isDesktop = useIsDesktopApp();
  const isMobileApp = useIsMobileApp();
  const featureEnabled = isEnabled(FeatureFlag.MANGA_DOWNLOAD);
  const downloadStates = useMonitorStates();

  const bridgeReady =
    (typeof window !== 'undefined' && !!window.electron?.manga?.enqueueChapter) || isMobileApp;

  const resolveDownloadPath = useCallback(
    (explicit?: string) =>
      explicit ||
      (typeof localStorage !== 'undefined' && localStorage.getItem('tatakai_download_path')) ||
      undefined,
    [],
  );

  const optimisticQueue = useCallback((series: MangaDownloadSeries, chapter: MangaDownloadChapter) => {
    const jobId = mangaJobId(series.anilistId, chapter.chapterKey);
    const numLabel = chapter.chapterNumber != null ? `Ch. ${chapter.chapterNumber}` : 'Chapter';
    const chapterLabel = `${chapter.volume != null ? `Vol ${chapter.volume} · ` : ''}${numLabel}`;
    rememberMangaJobMeta(jobId, {
      title: series.title,
      posterUrl: series.posterUrl ?? null,
      chapterNumber: chapter.chapterNumber ?? null,
      volume: chapter.volume ?? null,
      provider: chapter.provider ?? null,
    });
    markMangaQueued(jobId, {
      anilistId: series.anilistId,
      chapterKey: chapter.chapterKey,
      title: series.title,
      posterUrl: series.posterUrl ?? null,
      kind: series.kind ?? 'manga',
      chapterLabel,
    });
    return jobId;
  }, []);

  const enqueueChapter = useCallback(
    async (series: MangaDownloadSeries, chapter: MangaDownloadChapter) => {
      if (!featureEnabled) {
        console.warn('[MangaDL] enqueueChapter blocked — feature flag MANGA_DOWNLOAD disabled');
        return { ok: false as const, reason: 'feature_disabled' as const };
      }

      // ── Mobile (Capacitor): native page-image downloader ────────────────────
      if (isMobileApp) {
        const jobId = optimisticQueue(series, chapter);
        const { downloadMangaChapterMobile } = await import(
          '@/core/download/mobile/mobileMangaDownloader'
        );
        void downloadMangaChapterMobile(series, chapter);
        return { ok: true as const, jobId };
      }

      if (!isDesktop || !window.electron?.manga?.enqueueChapter) {
        console.warn('[MangaDL] enqueueChapter blocked — not desktop or bridge missing', { isDesktop, hasBridge: !!window.electron?.manga?.enqueueChapter });
        return { ok: false as const, reason: 'not_desktop' as const };
      }

      const downloadPath = resolveDownloadPath(series.downloadPath);
      const jobId = optimisticQueue(series, chapter);
      console.log('[MangaDL] enqueueChapter →', { jobId, provider: chapter.provider, chapterKey: chapter.chapterKey, downloadPath });
      const res = await window.electron.manga.enqueueChapter({ ...series, downloadPath, chapter });
      console.log('[MangaDL] enqueueChapter IPC response', res);
      if (!res?.success) {
        markMangaFailedStart(jobId, typeof res?.error === 'string' ? res.error : 'start_failed');
        return { ok: false as const, reason: 'ipc_error' as const, error: res?.error };
      }
      return { ok: true as const, jobId };
    },
    [isDesktop, isMobileApp, featureEnabled, resolveDownloadPath, optimisticQueue],
  );

  const enqueueAll = useCallback(
    async (series: MangaDownloadSeries, chapters: MangaDownloadChapter[]) => {
      if (!featureEnabled) {
        console.warn('[MangaDL] enqueueAll blocked — feature flag MANGA_DOWNLOAD disabled');
        return { ok: false as const, reason: 'feature_disabled' as const };
      }
      if (!chapters.length) return { ok: false as const, reason: 'empty' as const };

      // ── Mobile (Capacitor): native sequential downloader ────────────────────
      if (isMobileApp) {
        for (const chapter of chapters) optimisticQueue(series, chapter);
        const { downloadMangaChaptersMobile } = await import(
          '@/core/download/mobile/mobileMangaDownloader'
        );
        void downloadMangaChaptersMobile(series, chapters);
        return { ok: true as const, queued: chapters.length };
      }

      if (!isDesktop || !window.electron?.manga?.enqueueAll) {
        console.warn('[MangaDL] enqueueAll blocked — not desktop or bridge missing', { isDesktop, hasBridge: !!window.electron?.manga?.enqueueAll });
        return { ok: false as const, reason: 'not_desktop' as const };
      }

      const downloadPath = resolveDownloadPath(series.downloadPath);
      for (const chapter of chapters) optimisticQueue(series, chapter);
      console.log('[MangaDL] enqueueAll →', { anilistId: series.anilistId, title: series.title, count: chapters.length, downloadPath });
      const res = await window.electron.manga.enqueueAll({ ...series, downloadPath, chapters });
      console.log('[MangaDL] enqueueAll IPC response', res);
      if (!res?.success) {
        for (const chapter of chapters) {
          markMangaFailedStart(
            mangaJobId(series.anilistId, chapter.chapterKey),
            typeof res?.error === 'string' ? res.error : 'start_failed',
          );
        }
        return { ok: false as const, reason: 'ipc_error' as const, error: res?.error };
      }
      return { ok: true as const, queued: res.queued };
    },
    [isDesktop, isMobileApp, featureEnabled, resolveDownloadPath, optimisticQueue],
  );

  const cancelChapter = useCallback(async (anilistId: number, chapterKey: string) => {
    const jobId = mangaJobId(anilistId, chapterKey);
    if (isMobileApp) {
      const { cancelMangaChapterMobile } = await import(
        '@/core/download/mobile/mobileMangaDownloader'
      );
      cancelMangaChapterMobile(anilistId, chapterKey);
      markMangaCancelled(jobId);
      return;
    }
    if (window.electron?.manga?.cancel) await window.electron.manga.cancel({ jobId });
    markMangaCancelled(jobId);
  }, [isMobileApp]);

  return useMemo(
    () => ({
      isEnabled: (isMobileApp || isDesktop) && featureEnabled && bridgeReady,
      downloadStates,
      enqueueChapter,
      enqueueAll,
      cancelChapter,
    }),
    [isDesktop, isMobileApp, featureEnabled, bridgeReady, downloadStates, enqueueChapter, enqueueAll, cancelChapter],
  );
}
