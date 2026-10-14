import { QueryClient } from "@tanstack/react-query";
import { Capacitor } from '@capacitor/core';
import { startMediaMetadataCache } from './cache/mediaMetadataCache';

const isMobileApp = Capacitor.isNativePlatform();
const MAX_QUERY_RETRIES = isMobileApp ? 1 : 2;
const RETRYABLE_CLIENT_STATUSES = new Set([408, 429]);

function getErrorStatus(error: unknown): number | null {
  const status = Number(
    (error as any)?.status ??
    (error as any)?.response?.status ??
    (error as any)?.cause?.status
  );

  return Number.isFinite(status) ? status : null;
}

function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_QUERY_RETRIES) {
    return false;
  }

  const status = getErrorStatus(error);
  if (status && status >= 400 && status < 500 && !RETRYABLE_CLIENT_STATUSES.has(status)) {
    return false;
  }

  return true;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetryQuery,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      staleTime: isMobileApp ? 10 * 60 * 1000 : 5 * 60 * 1000,
      gcTime: isMobileApp ? 30 * 60 * 1000 : 15 * 60 * 1000,
      networkMode: isMobileApp ? 'offlineFirst' : 'online',
    },
  },
});

const METADATA_STORAGE_KEY = 'media-metadata:v1';
let metadataCache: Awaited<ReturnType<typeof startMediaMetadataCache>> | undefined;
let metadataInitialization: Promise<void> | undefined;

export function initializeMediaMetadataCache(): Promise<void> {
  return metadataInitialization ??= (async () => {
    const { db } = await import('@/core/db/tatakai-db');
    metadataCache = await startMediaMetadataCache(queryClient, {
      read: async () => (await db.kv.get(METADATA_STORAGE_KEY))?.value ?? null,
      write: async value => { await db.kv.put({ key: METADATA_STORAGE_KEY, value, createdAt: new Date().toISOString() }); },
      remove: async () => { await db.kv.delete(METADATA_STORAGE_KEY); },
    });
  })().catch(() => { /* Metadata caching must never prevent app startup. */ });
}

export async function clearMediaMetadataCache(): Promise<void> {
  await initializeMediaMetadataCache();
  await metadataCache?.clear();
}
