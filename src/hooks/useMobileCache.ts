/**
 * useMobileCache - Hook for using mobile cache service
 * Provides caching for API responses and images for smoother mobile experience
 */
import { useEffect, useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { mobileCache } from '@/services/mobileCacheService';

// Initialize cache on app start
let cacheInitialized = false;

export function useMobileCache() {
  useEffect(() => {
    if (!cacheInitialized && Capacitor.isNativePlatform()) {
      mobileCache.init().then(() => {
        cacheInitialized = true;
      });
    }
  }, []);

  const getCachedImage = useCallback(async (url: string): Promise<string> => {
    if (!Capacitor.isNativePlatform()) return url;
    return mobileCache.cacheImage(url);
  }, []);

  const preloadImages = useCallback(async (urls: string[]): Promise<void> => {
    if (!Capacitor.isNativePlatform()) return;
    return mobileCache.preloadImages(urls);
  }, []);

  const getCachedAnimeData = useCallback(async (animeId: string) => {
    return mobileCache.getAnimeData(animeId);
  }, []);

  const cacheAnimeData = useCallback(async (animeId: string, data: any) => {
    return mobileCache.cacheAnimeData(animeId, data);
  }, []);

  const getCachedEpisodes = useCallback(async (animeId: string) => {
    return mobileCache.getEpisodes(animeId);
  }, []);

  const cacheEpisodes = useCallback(async (animeId: string, episodes: any[]) => {
    return mobileCache.cacheEpisodes(animeId, episodes);
  }, []);

  const getCachedSources = useCallback(async (episodeId: string) => {
    return mobileCache.getSources(episodeId);
  }, []);

  const cacheSources = useCallback(async (episodeId: string, sources: any) => {
    return mobileCache.cacheSources(episodeId, sources);
  }, []);

  const clearCache = useCallback(async () => {
    return mobileCache.clearAll();
  }, []);

  const getCacheSize = useCallback(async () => {
    return mobileCache.getCacheSize();
  }, []);

  return {
    getCachedImage,
    preloadImages,
    getCachedAnimeData,
    cacheAnimeData,
    getCachedEpisodes,
    cacheEpisodes,
    getCachedSources,
    cacheSources,
    clearCache,
    getCacheSize,
  };
}

/**
 * Hook to preload images when component mounts
 * Use this on list pages to preload anime posters
 */
export function useImagePreloader(imageUrls: string[]) {
  useEffect(() => {
    if (Capacitor.isNativePlatform() && imageUrls.length > 0) {
      mobileCache.preloadImages(imageUrls);
    }
  }, [imageUrls]);
}
