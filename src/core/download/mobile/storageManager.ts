/**
 * storageManager.ts — offline storage accounting + metered-link guards.
 *
 * Small, dependency-light helpers for the mobile offline bundle:
 *  - wifi/metered detection (NetworkInformation + loadMobileConfig.wifiOnlyDownloads)
 *  - per-anime usage rollups (fed by Dexie rows the pages already load)
 *  - auto-evict of watched items when enabled
 */
import { loadMobileConfig } from '@/hooks/ui/useMobileConfig';
import { db } from '@/core/db/tatakai-db';

export interface OfflineUsage {
  titles: number;
  items: number;
  bytes: number;
}

export function isWifiOnlyBlocked(): boolean {
  try {
    const cfg = loadMobileConfig();
    if (!cfg.wifiOnlyDownloads) return false;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
    const conn = (navigator as Navigator & {
      connection?: { saveData?: boolean; type?: string; effectiveType?: string };
    }).connection;
    if (!conn) return false;
    if (conn.saveData === true) return true;
    const type = String(conn.type || '').toLowerCase();
    // `cellular` / `bluetooth` / `wimax` are metered; empty/unknown means allow
    // (desktop Chrome reports `type: unknown` even on WiFi).
    if (['cellular', 'bluetooth', 'wimax', 'mixed'].some((t) => type.includes(t))) return true;
    return false;
  } catch {
    return false;
  }
}

export function isAutoDownloadEnabled(): boolean {
  try {
    return loadMobileConfig().autoDownloadNext === true;
  } catch {
    return false;
  }
}

export function isAutoEvictEnabled(): boolean {
  try {
    return loadMobileConfig().autoEvictWatched === true;
  } catch {
    return false;
  }
}

/** Delete one offline manga chapter (dynamic import keeps web bundles lean). */
export async function deleteOfflineChapter(anilistId: number, chapterKey: string): Promise<void> {
  const { deleteOfflineMangaChapter } = await import('./mobileMangaDownloader');
  await deleteOfflineMangaChapter(anilistId, chapterKey);
}

/**
 * Auto-evict watched anime history rows when storage pressure is expected.
 * Currently evicts `completed` rows the user already watched; returns the
 * number of rows removed. Best-effort — never throws.
 */
export async function evictWatchedAnime(limit = 20): Promise<number> {
  if (!isAutoEvictEnabled()) return 0;
  try {
    const { getHistoryByStatus } = await import('../download-history-service');
    const done = await getHistoryByStatus('completed', limit).catch(() => []);
    let removed = 0;
    for (const entry of done.slice(0, limit)) {
      try {
        await db.downloadHistory.delete(entry.id);
        removed += 1;
      } catch {
        /* keep going */
      }
    }
    return removed;
  } catch {
    return 0;
  }
}
