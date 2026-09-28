import { useCallback, useMemo } from 'react';
import { isEnabled, FeatureFlag } from '@/core/feature-flags/feature-flags';
import { useIsDesktopApp } from '@/hooks/ui/useIsNativeApp';
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
  headers?: Record<string, string>;
  downloadPath?: string;
  posterUrl?: string;
  subtitles?: Array<{ url: string; lang?: string; label?: string; language?: string }>;
  animeId?: number;
  /** Torrent file index within a multi-file torrent (optional). */
  fileIndex?: number;
  /** Real audio language (e.g. 'ja', 'en'). Omit when the caller can't tell — history stores 'unknown' rather than guessing. */
  resolvedLanguage?: string;
};

/**
 * Thin binding over the app-lifetime `download-monitor` singleton. The monitor
 * owns the (single) IPC subscription and history recording; this hook only
 * exposes the live state map and the start/cancel actions. See
 * `src/core/download/download-monitor.ts` for why the subscription can't live
 * here (preload's `removeDownloadListeners` is global/destructive).
 */
export function useDownload() {
  const isDesktop = useIsDesktopApp();
  const managerEnabled = isEnabled(FeatureFlag.DOWNLOAD_MANAGER);
  const downloadStates = useMonitorStates();

  const startDownload = useCallback(
    async (
      payload: Partial<StartDownloadPayload> &
        Pick<StartDownloadPayload, 'episodeId' | 'animeName' | 'episodeNumber'>,
    ) => {
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

      const sourceType: 'hls' | 'torrent' =
        url.startsWith('magnet:') || url.includes('.torrent') ? 'torrent' : 'hls';

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
    [isDesktop, managerEnabled],
  );

  const cancelDownload = useCallback(async (episodeId: string, animePath?: string) => {
    if (!window.electron?.cancelDownload) return;
    await window.electron.cancelDownload({ episodeId, animePath });
    markCancelled(episodeId);
  }, []);

  const bridgeReady = typeof window !== 'undefined' && !!window.electron?.startDownload;

  return useMemo(
    () => ({
      isEnabled: isDesktop && managerEnabled && bridgeReady,
      downloadStates,
      startDownload,
      cancelDownload,
    }),
    [isDesktop, managerEnabled, bridgeReady, downloadStates, startDownload, cancelDownload],
  );
}
