import { useCallback, useMemo } from 'react';
import { isEnabled, FeatureFlag } from '@/core/feature-flags/feature-flags';
import { useIsDesktopApp, useIsMobileApp } from '@/hooks/ui/useIsNativeApp';
import type { MobileDownloadInput } from '@/core/download/mobile/mobileDownloader';
import {
  useDownloadStates as useMonitorStates,
  markQueued,
  markFailedStart,
  markCancelled,
} from '@/core/download/download-monitor';

export type DownloadJobStatus = 'queued' | 'downloading' | 'completed' | 'failed' | 'cancelled';

export type DownloadJobEntry = {
  status: DownloadJobStatus;
  progress: number;
  speed?: string;
  eta?: string;
  localUri?: string;
  error?: string;
};

export type StartDownloadPayload = {
  episodeId: string;
  animeName: string;
  episodeNumber: number;
  url: string;
  originalUrl?: string;
  headers?: Record<string, string>;
  downloadPath?: string;
  posterUrl?: string;
  subtitles?: Array<{
    url: string;
    lang?: string;
    label?: string;
    language?: string;
    originalUrl?: string;
    headers?: unknown;
  }>;
  animeId?: number;
  /** Torrent file index within a multi-file torrent (optional). */
  fileIndex?: number;
  /** Real audio language (e.g. 'ja', 'en'). Omit when the caller can't tell — history stores 'unknown' rather than guessing. */
  resolvedLanguage?: string;
};

/**
 * Shared torrent-URL sniff. Covers magnets, .torrent files AND the desktop
 * torrent bridge (`http://127.0.0.1:<port>/webtorrent/<hash>/…`), whose
 * `rawUrl` is an http URL but must still take the torrent session path —
 * routing it into ffmpeg/HLS is what made "stream" downloads crawl.
 */
function isTorrentDownloadUrl(url: string): boolean {
  const u = String(url || '');
  const low = u.toLowerCase();
  return (
    low.startsWith('magnet:') ||
    low.includes('.torrent') ||
    low.includes('/webtorrent/') ||
    low.startsWith('torrent-session://')
  );
}
/**
 * Thin binding over the app-lifetime `download-monitor` singleton. The monitor
 * owns the (single) IPC subscription + history recording; this hook only
 * exposes the live state map and the start/cancel actions. See
 * `src/core/download/download-monitor.ts` for why the subscription can't live
 * here (preload's `removeDownloadListeners` is global/destructive).
 */
export function useDownload() {
  const isDesktop = useIsDesktopApp();
  const isMobileApp = useIsMobileApp();
  const managerEnabled = isEnabled(FeatureFlag.DOWNLOAD_MANAGER);
  const downloadStates = useMonitorStates();

  const startDownload = useCallback(
    async (
      payload: Partial<StartDownloadPayload> &
        Pick<StartDownloadPayload, 'episodeId' | 'animeName' | 'episodeNumber'>,
    ) => {
      // ── Mobile (Capacitor): route to the native downloader ─────────────────
      if (isMobileApp) {
        const url = payload.url;
        if (!url || typeof url !== 'string') {
          return { ok: false as const, reason: 'missing_stream_url' as const };
        }
        const sourceType: 'hls' | 'torrent' = isTorrentDownloadUrl(url) ? 'torrent' : 'hls';
        localStorage.setItem(
          `tatakai:dl:meta:${payload.episodeId}`,
          JSON.stringify({
            animeId: payload.animeId || 0,
            animeTitle: payload.animeName,
            episodeNumber: payload.episodeNumber,
            posterUrl: payload.posterUrl,
            sourceType,
            resolvedLanguage: payload.resolvedLanguage || 'unknown',
            startedAt: new Date().toISOString(),
            // Resumable fields: the offline hub's Retry button re-enqueues
            // from this meta without needing the series page (and its fresh
            // source resolution) again.
            url,
            headers: payload.headers,
            originalUrl: payload.originalUrl,
            subtitles: payload.subtitles,
          }),
        );
        markQueued(payload.episodeId, {
          animeName: payload.animeName,
          episodeNumber: payload.episodeNumber,
          posterUrl: payload.posterUrl,
          sourceType,
        });
        const { startMobileDownload } = await import('@/core/download/mobile/mobileDownloader');
        const res = await startMobileDownload({
          episodeId: payload.episodeId,
          url,
          animeName: payload.animeName,
          episodeNumber: payload.episodeNumber,
          headers: payload.headers,
          originalUrl: payload.originalUrl,
          subtitles: payload.subtitles as MobileDownloadInput['subtitles'],
        });
        return res.ok
          ? { ok: true as const }
          : {
              ok: false as const,
              reason: 'mobile_download_failed' as const,
              error: 'reason' in res ? res.reason : 'mobile_download_failed',
            };
      }

      if (!isDesktop || !window.electron?.startDownload) {
        return { ok: false as const, reason: 'not_desktop' as const };
      }
      if (!managerEnabled) {
        return { ok: false as const, reason: 'feature_disabled' as const };
      }
      const url = payload.url;
      if (!url || typeof url !== 'string') {
        return { ok: false as const, reason: 'missing_stream_url' as const };
      }
      const downloadPath =
        payload.downloadPath ||
        (typeof localStorage !== 'undefined' && localStorage.getItem('tatakai_download_path')) ||
        undefined;
      if (!downloadPath) {
        return { ok: false as const, reason: 'missing_download_path' as const };
      }

      const sourceType: 'hls' | 'torrent' = isTorrentDownloadUrl(url) ? 'torrent' : 'hls';

      // Persist metadata BEFORE the optimistic markQueued so the monitor can
      // enrich the entry (name/poster/torrent-badge) on first sight.
      const meta = {
        animeId: payload.animeId || 0,
        animeTitle: payload.animeName,
        episodeNumber: payload.episodeNumber,
        posterUrl: payload.posterUrl,
        sourceType,
        resolvedLanguage: payload.resolvedLanguage || 'unknown',
        startedAt: new Date().toISOString(),
      };
      localStorage.setItem(`tatakai:dl:meta:${payload.episodeId}`, JSON.stringify(meta));

      markQueued(payload.episodeId, {
        animeName: payload.animeName,
        episodeNumber: payload.episodeNumber,
        posterUrl: payload.posterUrl,
        sourceType,
      });

      const res = await window.electron.startDownload({
        episodeId: payload.episodeId,
        animeName: payload.animeName,
        episodeNumber: payload.episodeNumber,
        // The main process branches on `sourceType`, and the torrent branch
        // reads `magnet` (NOT `url`). Passing only `url` for a magnet routed
        // torrents into the ffmpeg/HLS branch → "ffmpeg exit code 1". Send both
        // so torrent downloads take the torrent session path from any caller.
        sourceType,
        url,
        magnet: sourceType === 'torrent' ? url : undefined,
        fileIndex: payload.fileIndex,
        headers: payload.headers || {},
        downloadPath,
        posterUrl: payload.posterUrl,
        subtitles: payload.subtitles,
      });

      if (!res?.success) {
        markFailedStart(
          payload.episodeId,
          typeof res?.error === 'string' ? res.error : 'start_failed',
        );
        return { ok: false as const, reason: 'ipc_error' as const, error: res?.error };
      }
      return { ok: true as const };
    },
    [isDesktop, isMobileApp, managerEnabled],
  );

  const cancelDownload = useCallback(async (episodeId: string, animePath?: string) => {
    if (isMobileApp) {
      const { cancelMobileDownload } = await import('@/core/download/mobile/mobileDownloader');
      cancelMobileDownload(episodeId);
      markCancelled(episodeId);
      return;
    }
    if (!window.electron?.cancelDownload) return;
    await window.electron.cancelDownload({ episodeId, animePath });
    markCancelled(episodeId);
  }, [isMobileApp]);

  const bridgeReady = typeof window !== 'undefined' && !!window.electron?.startDownload;

  return useMemo(
    () => ({
      // Mobile: always enabled (native downloader). Desktop: needs the IPC bridge.
      isEnabled: isMobileApp || (isDesktop && managerEnabled && bridgeReady),
      downloadStates,
      startDownload,
      cancelDownload,
    }),
    [isDesktop, isMobileApp, managerEnabled, bridgeReady, downloadStates, startDownload, cancelDownload],
  );
}
