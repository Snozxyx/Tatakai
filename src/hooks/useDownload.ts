/**
 * useDownload - Unified hook that works for both desktop and mobile
 * Routes to desktop or mobile system based on platform
 */
import { useDesktopDownload } from '@/contexts/DesktopDownloadContext';
import { useMobileDownload } from '@/hooks/useMobileDownload';
import { useIsMobileApp, useIsDesktopApp } from '@/hooks/useIsNativeApp';
import { useCallback, useMemo } from 'react';
import { fetchCombinedSources, getProxiedVideoUrl } from '@/lib/api';

// Unified download hook that works on both platforms
export function useDownload() {
  const isMobile = useIsMobileApp();
  const isDesktop = useIsDesktopApp();
  const desktopDownload = useDesktopDownload();
  const mobileDownload = useMobileDownload();

  // Unified startDownload that handles both platforms
  const startDownload = useCallback(async (params: {
    episodeId: string;
    animeName: string;
    episodeNumber: number;
    posterUrl: string;
    animeId?: string;
  }) => {
    const { episodeId, animeName, episodeNumber, posterUrl, animeId } = params;

    if (isMobile) {
      // For mobile, we need to fetch sources first then pass video URL
      try {
        const sources = await fetchCombinedSources(episodeId, animeName, episodeNumber, 'hd-2', 'sub');
        const bestSource = sources.sources[0];
        if (!bestSource?.url) throw new Error('No source found');

        const proxiedUrl = getProxiedVideoUrl(bestSource.url, sources.headers?.Referer, sources.headers?.["User-Agent"]);

        await mobileDownload.startDownload({
          animeId: animeId || episodeId,
          animeTitle: animeName,
          season: 1,
          episode: episodeNumber,
          videoUrl: proxiedUrl,
          poster: posterUrl,
        });
      } catch (error: any) {
        console.error('Mobile download error:', error);
        throw error;
      }
    } else if (isDesktop) {
      await desktopDownload.startDownload(params);
    } else {
      console.warn('Downloads only available in native apps');
    }
  }, [isMobile, isDesktop, mobileDownload, desktopDownload]);

  // Unified cancel
  const cancelDownload = useCallback(async (episodeId: string) => {
    if (isMobile) {
      await mobileDownload.cancelDownload(episodeId);
    } else if (isDesktop) {
      await desktopDownload.cancelDownload(episodeId);
    }
  }, [isMobile, isDesktop, mobileDownload, desktopDownload]);

  // Unified retry (mobile only has this)
  const retryDownload = useCallback(async (episodeId: string) => {
    if (isMobile) {
      await mobileDownload.retryDownload(episodeId);
    }
  }, [isMobile, mobileDownload]);

  // Clear completed (desktop only)
  const clearCompleted = useCallback(() => {
    if (isDesktop) {
      desktopDownload.clearCompleted();
    }
  }, [isDesktop, desktopDownload]);

  // Unified download states
  const downloadStates = useMemo(() => {
    if (isMobile) {
      // Convert mobile queue to downloadStates format
      const states: Record<string, {
        progress: number;
        status: 'idle' | 'queued' | 'downloading' | 'completed' | 'error';
        error?: string;
        animeName?: string;
        episodeNumber?: number;
        speed?: string;
        eta?: string;
      }> = {};

      for (const item of mobileDownload.queue) {
        states[item.id] = {
          progress: item.progress,
          status: item.status === 'failed' ? 'error' : item.status,
          error: item.error,
          animeName: item.animeTitle,
          episodeNumber: item.episode,
          speed: item.speed,
          eta: item.eta,
        };
      }

      return states;
    }

    return desktopDownload.downloadStates;
  }, [isMobile, mobileDownload.queue, desktopDownload.downloadStates]);

  return {
    downloadStates,
    startDownload,
    cancelDownload,
    retryDownload,
    clearCompleted,
  };
}

export { useDesktopDownload };
