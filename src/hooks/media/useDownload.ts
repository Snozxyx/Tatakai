import { useCallback, useEffect, useMemo, useState } from 'react';
import { isEnabled, FeatureFlag } from '@/core/feature-flags/feature-flags';
import { useIsDesktopApp } from '@/hooks/ui/useIsNativeApp';

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
};

export function useDownload() {
  const isDesktop = useIsDesktopApp();
  const managerEnabled = isEnabled(FeatureFlag.DOWNLOAD_MANAGER);
  const [downloadStates, setDownloadStates] = useState<Record<string, DownloadJobEntry>>({});

  useEffect(() => {
    if (!isDesktop || typeof window === 'undefined') return;
    const bridge = window.electron;
    if (!bridge?.onDownloadProgress || !bridge.onDownloadCompleted || !bridge.onDownloadError) return;

    const onProg = (data: Record<string, unknown>) => {
      const id = String(data.episodeId || '');
      if (!id) return;
      const pct = typeof data.percent === 'number' ? data.percent : Number(data.percent) || 0;
      setDownloadStates((prev) => ({
        ...prev,
        [id]: {
          ...prev[id],
          status: 'downloading',
          progress: pct,
          speed: typeof data.speed === 'string' ? data.speed : undefined,
          eta: typeof data.eta === 'string' ? data.eta : undefined,
        },
      }));
    };
    const onDone = (data: Record<string, unknown>) => {
      const id = String(data.episodeId || '');
      if (!id) return;
      setDownloadStates((prev) => ({
        ...prev,
        [id]: {
          ...prev[id],
          status: 'completed',
          progress: 100,
          localUri: typeof data.path === 'string' ? data.path : undefined,
        },
      }));

      // Record in download history
      const metaRaw = localStorage.getItem(`tatakai:dl:meta:${id}`);
      if (metaRaw) {
        try {
          const meta = JSON.parse(metaRaw);
          import('@/core/download/download-history-service').then(({ recordDownload }) => {
            recordDownload({
              animeId: meta.animeId || 0,
              animeTitle: meta.animeTitle,
              episodeNumber: meta.episodeNumber,
              status: 'completed',
              sourceType: meta.sourceType,
              resolvedLanguage: meta.resolvedLanguage || 'ja',
              fileSizeBytes: typeof data.size === 'number' ? data.size : undefined,
              localPath: typeof data.path === 'string' ? data.path : undefined,
              startedAt: meta.startedAt,
              completedAt: new Date().toISOString(),
              retryCount: 0,
            });
          });
          localStorage.removeItem(`tatakai:dl:meta:${id}`);
        } catch (e) {
          console.error('[useDownload] Failed to parse/record download completed history:', e);
        }
      }
    };
    const onErr = (data: Record<string, unknown>) => {
      const id = String(data.episodeId || '');
      if (!id) return;
      const errMsg = typeof data.error === 'string' ? data.error : 'Download failed';
      setDownloadStates((prev) => ({
        ...prev,
        [id]: {
          ...prev[id],
          status: 'failed',
          progress: prev[id]?.progress ?? 0,
          error: errMsg,
        },
      }));

      // Record in download history
      const metaRaw = localStorage.getItem(`tatakai:dl:meta:${id}`);
      if (metaRaw) {
        try {
          const meta = JSON.parse(metaRaw);
          import('@/core/download/download-history-service').then(({ recordDownload }) => {
            recordDownload({
              animeId: meta.animeId || 0,
              animeTitle: meta.animeTitle,
              episodeNumber: meta.episodeNumber,
              status: 'failed',
              sourceType: meta.sourceType,
              resolvedLanguage: meta.resolvedLanguage || 'ja',
              errorMessage: errMsg,
              startedAt: meta.startedAt,
              completedAt: new Date().toISOString(),
              retryCount: 0,
            });
          });
          localStorage.removeItem(`tatakai:dl:meta:${id}`);
        } catch (e) {
          console.error('[useDownload] Failed to parse/record download failed history:', e);
        }
      }
    };

    bridge.onDownloadProgress(onProg);
    bridge.onDownloadCompleted(onDone);
    bridge.onDownloadError(onErr);

    return () => {
      bridge.removeDownloadListeners?.();
    };
  }, [isDesktop]);

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

      setDownloadStates((prev) => ({
        ...prev,
        [payload.episodeId]: { status: 'queued', progress: 0 },
      }));

      // Store download metadata in localStorage to preserve across page reloads/states
      const meta = {
        animeId: payload.animeId || 0,
        animeTitle: payload.animeName,
        episodeNumber: payload.episodeNumber,
        sourceType: url.startsWith('magnet:') || url.includes('.torrent') ? 'torrent' : 'hls',
        resolvedLanguage: 'ja',
        startedAt: new Date().toISOString()
      };
      localStorage.setItem(`tatakai:dl:meta:${payload.episodeId}`, JSON.stringify(meta));

      const res = await window.electron.startDownload({
        episodeId: payload.episodeId,
        animeName: payload.animeName,
        episodeNumber: payload.episodeNumber,
        url,
        headers: payload.headers || {},
        downloadPath,
        posterUrl: payload.posterUrl,
        subtitles: payload.subtitles,
      });

      if (!res?.success) {
        setDownloadStates((prev) => ({
          ...prev,
          [payload.episodeId]: {
            status: 'failed',
            progress: 0,
            error: typeof res?.error === 'string' ? res.error : 'start_failed',
          },
        }));
        localStorage.removeItem(`tatakai:dl:meta:${payload.episodeId}`);
        return { ok: false as const, reason: 'ipc_error' as const, error: res?.error };
      }
      return { ok: true as const };
    },
    [isDesktop, managerEnabled],
  );

  const cancelDownload = useCallback(async (episodeId: string, animePath?: string) => {
    if (!window.electron?.cancelDownload) return;
    await window.electron.cancelDownload({ episodeId, animePath });
    setDownloadStates((prev) => ({
      ...prev,
      [episodeId]: {
        ...prev[episodeId],
        status: 'cancelled',
        progress: prev[episodeId]?.progress ?? 0,
      },
    }));

    // Record in history
    const metaRaw = localStorage.getItem(`tatakai:dl:meta:${episodeId}`);
    if (metaRaw) {
      try {
        const meta = JSON.parse(metaRaw);
        import('@/core/download/download-history-service').then(({ recordDownload }) => {
          recordDownload({
            animeId: meta.animeId || 0,
            animeTitle: meta.animeTitle,
            episodeNumber: meta.episodeNumber,
            status: 'cancelled',
            sourceType: meta.sourceType,
            resolvedLanguage: meta.resolvedLanguage || 'ja',
            startedAt: meta.startedAt,
            completedAt: new Date().toISOString(),
            retryCount: 0,
          });
        });
        localStorage.removeItem(`tatakai:dl:meta:${episodeId}`);
      } catch (e) {
        console.error('[useDownload] Failed to parse/record download cancelled history:', e);
      }
    }
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
