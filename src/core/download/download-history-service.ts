/**
 * src/core/download/download-history-service.ts
 *
 * CRUD service for the downloadHistory IndexedDB table (Dexie v4).
 *
 * This module is the single point of truth for recording and querying
 * the history of auto-download attempts. Both the automation engine (on
 * every attempt) and the UI (Download History tab) use this service.
 *
 * Design decisions:
 *  - Entries are append-only; we never update existing rows.
 *  - IDs are deterministic: `${animeId}:${episodeNumber}:${startedAt}` so
 *    duplicate-recording bugs produce a visible conflict rather than silent data loss.
 *  - Queries are capped at 500 rows to keep IndexedDB response times fast.
 */

import { db, type DownloadHistoryEntry } from '../db/tatakai-db';

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Records a completed, failed, or cancelled download attempt.
 * Silently swallows write errors so a DB failure never breaks downloads.
 */
export async function recordDownload(
  entry: Omit<DownloadHistoryEntry, 'id'>,
): Promise<void> {
  const id = `${entry.animeId}:${entry.episodeNumber}:${entry.startedAt}`;
  try {
    await db.downloadHistory.put({ ...entry, id });
  } catch (err) {
    console.warn('[DownloadHistory] Failed to record entry:', err);
  }
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Returns the most recent download history entries, newest first.
 * @param limit  Maximum number of rows to return. Defaults to 200.
 */
export async function getHistory(limit = 200): Promise<DownloadHistoryEntry[]> {
  try {
    const all = await db.downloadHistory
      .orderBy('startedAt')
      .reverse()
      .limit(Math.min(limit, 500))
      .toArray();
    return all;
  } catch (err) {
    console.warn('[DownloadHistory] Failed to read history:', err);
    return [];
  }
}

/**
 * Returns download history for a single anime, newest first.
 */
export async function getHistoryForAnime(animeId: number): Promise<DownloadHistoryEntry[]> {
  try {
    return await db.downloadHistory
      .where('animeId')
      .equals(animeId)
      .reverse()
      .sortBy('startedAt');
  } catch (err) {
    console.warn('[DownloadHistory] Failed to read history for anime:', err);
    return [];
  }
}

/**
 * Returns download history filtered by status.
 */
export async function getHistoryByStatus(
  status: DownloadHistoryEntry['status'],
  limit = 100,
): Promise<DownloadHistoryEntry[]> {
  try {
    return await db.downloadHistory
      .where('status')
      .equals(status)
      .reverse()
      .limit(limit)
      .sortBy('startedAt');
  } catch (err) {
    console.warn('[DownloadHistory] Failed to read history by status:', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export interface DownloadStats {
  total: number;
  completed: number;
  failed: number;
  cancelled: number;
  /** Sum of fileSizeBytes for completed entries (bytes). */
  totalSizeBytes: number;
}

/**
 * Aggregates download stats from the local history table.
 * Cheap O(n) scan — suitable for rendering a stats bar.
 */
export async function getDownloadStats(): Promise<DownloadStats> {
  const stats: DownloadStats = {
    total: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    totalSizeBytes: 0,
  };

  try {
    await db.downloadHistory.each((entry) => {
      stats.total++;
      if (entry.status === 'completed') {
        stats.completed++;
        stats.totalSizeBytes += entry.fileSizeBytes ?? 0;
      } else if (entry.status === 'failed') {
        stats.failed++;
      } else if (entry.status === 'cancelled') {
        stats.cancelled++;
      }
    });
  } catch (err) {
    console.warn('[DownloadHistory] Failed to compute stats:', err);
  }

  return stats;
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/**
 * Clears all download history. Used by the "Clear History" button in the UI.
 */
export async function clearHistory(): Promise<void> {
  try {
    await db.downloadHistory.clear();
  } catch (err) {
    console.warn('[DownloadHistory] Failed to clear history:', err);
  }
}

/**
 * Prunes entries older than `daysOld` days.
 * Run on app startup to prevent unbounded growth.
 */
export async function pruneOldHistory(daysOld = 90): Promise<number> {
  const cutoff = new Date(Date.now() - daysOld * 86_400_000).toISOString();
  try {
    const keys = await db.downloadHistory
      .where('startedAt')
      .below(cutoff)
      .primaryKeys();
    await db.downloadHistory.bulkDelete(keys);
    return keys.length;
  } catch (err) {
    console.warn('[DownloadHistory] Failed to prune old history:', err);
    return 0;
  }
}
