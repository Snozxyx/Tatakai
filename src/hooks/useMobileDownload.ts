/**
 * Hook for mobile downloads - Capacitor/Android ONLY
 */
import { useState, useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { mobileDownloadService, MobileDownload, OfflineEpisode, MOBILE_DOWNLOAD_UPDATE } from '@/services/mobileDownloadService';

export function useMobileDownload() {
  const [queue, setQueue] = useState<MobileDownload[]>([]);
  const [isNative] = useState(() => Capacitor.isNativePlatform());

  useEffect(() => {
    if (!isNative) return;

    // Initial load
    setQueue(mobileDownloadService.getQueue());

    // Listen for updates
    const handler = (e: CustomEvent) => setQueue([...e.detail]);
    window.addEventListener(MOBILE_DOWNLOAD_UPDATE, handler as EventListener);

    return () => {
      window.removeEventListener(MOBILE_DOWNLOAD_UPDATE, handler as EventListener);
    };
  }, [isNative]);

  const startDownload = useCallback(async (params: {
    animeId: string;
    animeTitle: string;
    season: number;
    episode: number;
    videoUrl: string;
    poster?: string;
  }) => {
    if (!isNative) throw new Error('Mobile only');
    return mobileDownloadService.download(params);
  }, [isNative]);

  const cancelDownload = useCallback(async (id: string) => {
    if (!isNative) return;
    await mobileDownloadService.cancel(id);
  }, [isNative]);

  const retryDownload = useCallback(async (id: string) => {
    if (!isNative) return;
    await mobileDownloadService.retry(id);
  }, [isNative]);

  return {
    isNative,
    queue,
    activeDownloads: queue.filter(d => d.status === 'queued' || d.status === 'downloading'),
    failedDownloads: queue.filter(d => d.status === 'failed'),
    startDownload,
    cancelDownload,
    retryDownload,
  };
}

export function useOfflineLibrary() {
  const [episodes, setEpisodes] = useState<OfflineEpisode[]>([]);
  const [loading, setLoading] = useState(true);
  const [isNative] = useState(() => Capacitor.isNativePlatform());

  const refresh = useCallback(async () => {
    if (!isNative) {
      setEpisodes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const lib = await mobileDownloadService.getLibrary();
    setEpisodes(lib);
    setLoading(false);
  }, [isNative]);

  useEffect(() => {
    refresh();

    // Refresh when downloads update
    const handler = () => refresh();
    window.addEventListener(MOBILE_DOWNLOAD_UPDATE, handler);
    return () => window.removeEventListener(MOBILE_DOWNLOAD_UPDATE, handler);
  }, [refresh]);

  const deleteEpisode = useCallback(async (animeId: string, season: number, episode: number) => {
    if (!isNative) return;
    await mobileDownloadService.deleteEpisode(animeId, season, episode);
    await refresh();
  }, [isNative, refresh]);

  const getVideoUrl = useCallback(async (animeId: string, season: number, episode: number) => {
    if (!isNative) return null;
    return mobileDownloadService.getVideoUrl(animeId, season, episode);
  }, [isNative]);

  const isDownloaded = useCallback(async (animeId: string, season: number, episode: number) => {
    if (!isNative) return false;
    return mobileDownloadService.isDownloaded(animeId, season, episode);
  }, [isNative]);

  return {
    isNative,
    episodes,
    loading,
    refresh,
    deleteEpisode,
    getVideoUrl,
    isDownloaded,
  };
}
