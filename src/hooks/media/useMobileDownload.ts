export type MobileDownloadQueueItem = {
  id: string;
  title?: string;
  animeTitle?: string;
  season?: number;
  episode?: number;
  status: 'queued' | 'downloading' | 'completed' | 'failed' | 'cancelled';
  progress?: number;
  error?: string;
};

/**
 * V6 transition stub:
 * old mobile download pipeline removed; rebuilding with new architecture.
 */
export function useMobileDownload() {
  const queue: MobileDownloadQueueItem[] = [];
  const activeDownloads: MobileDownloadQueueItem[] = [];

  return {
    isNative: false,
    queue,
    activeDownloads,
    startDownload: async (_payload: unknown) => {
      return { ok: false, reason: 'mobile_download_rebuild_pending' as const };
    },
    cancelDownload: (_id: string) => {},
    retryDownload: (_id: string) => {},
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
    isNative: false,
    loading: false,
    episodes: [] as OfflineEpisode[],
    deleteEpisode: async (_animeId: string, _season: number, _episode: number) => ({ ok: false, reason: 'offline_library_rebuild_pending' as const }),
  };
}
