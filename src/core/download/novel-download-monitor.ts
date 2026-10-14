import { useSyncExternalStore } from 'react';
import { triggerHaptic } from '@/lib/haptics';
import { recordDownload } from './download-history-service';

/**
 * Global novel-chapter download monitor — same singleton shape as the manga
 * monitor, minus the Electron IPC (novel chapters are plain text fetched by
 * the renderer on every platform, so progress is published directly by the
 * download calls in `novelOffline.ts` / `NovelDownloadModal`).
 *
 * The Dynamic Island fuses these states so novel downloads surface exactly
 * like anime/manga rows, badged "Novel".
 */

export type NovelDownloadStatus = 'queued' | 'downloading' | 'completed' | 'failed' | 'cancelled';

export interface NovelDownloadEntry {
  jobId: string;
  anilistId: number;
  chapterKey: string;
  status: NovelDownloadStatus;
  /** 0-100 */
  progress: number;
  chapterNumber?: number | null;
  chapterTitle?: string | null;
  error?: string;
  // ── Display fields (set optimistically at enqueue; carried through) ──
  /** Series title, for the Dynamic Island row. */
  title?: string;
  /** Series poster, for the Dynamic Island row. */
  posterUrl?: string | null;
  /** Sub-provider/translator that served the text. */
  provider?: string | null;
  /** Human chapter label, e.g. "Ch. 12". */
  chapterLabel?: string;
  paragraphCount?: number;
  sizeBytes?: number;
}

type Snapshot = Record<string, NovelDownloadEntry>;

/** jobId = `novel:<anilistId>:<chapterKey>` */
export function novelJobId(anilistId: number, chapterKey: string): string {
  return `novel:${anilistId}:${chapterKey}`;
}

const EMPTY: Snapshot = {};
let states: Snapshot = EMPTY;
const listeners = new Set<() => void>();
const cancelledJobs = new Set<string>();

function notify() {
  for (const l of listeners) l();
}

function upsert(jobId: string, patch: Partial<NovelDownloadEntry>) {
  const prev = states[jobId];
  const next: NovelDownloadEntry = {
    jobId,
    anilistId: patch.anilistId ?? prev?.anilistId ?? 0,
    chapterKey: patch.chapterKey ?? prev?.chapterKey ?? '',
    status: patch.status ?? prev?.status ?? 'queued',
    progress: patch.progress ?? prev?.progress ?? 0,
    chapterNumber: patch.chapterNumber ?? prev?.chapterNumber,
    chapterTitle: patch.chapterTitle ?? prev?.chapterTitle,
    error: patch.error ?? prev?.error,
    title: patch.title ?? prev?.title,
    posterUrl: patch.posterUrl ?? prev?.posterUrl,
    provider: patch.provider ?? prev?.provider,
    chapterLabel: patch.chapterLabel ?? prev?.chapterLabel,
    paragraphCount: patch.paragraphCount ?? prev?.paragraphCount,
    sizeBytes: patch.sizeBytes ?? prev?.sizeBytes,
  };
  states = { ...states, [jobId]: next };
  notify();
  if (next.status === 'completed' || next.status === 'failed' || next.status === 'cancelled') {
    const attempt = attempts.get(jobId);
    if (attempt && !attempt.recorded) {
      attempt.recorded = true;
      void recordDownload({
        mediaType: 'manga', animeId: next.anilistId, animeTitle: next.title || 'Untitled',
        posterUrl: next.posterUrl || undefined,
        episodeNumber: next.chapterNumber ?? 0, episodeId: jobId,
        chapterKey: next.chapterKey, chapterNumber: next.chapterNumber,
        chapterLabel: next.chapterLabel, volume: null,
        status: next.status, sourceType: 'unknown', resolvedLanguage: 'en',
        extensionName: next.provider || undefined, fileSizeBytes: next.sizeBytes,
        errorMessage: next.error,
        startedAt: attempt.startedAt, completedAt: new Date().toISOString(), retryCount: 0,
      });
    }
  }
}

const attempts = new Map<string, { startedAt: string; recorded: boolean }>();

export function isNovelJobCancelled(jobId: string): boolean {
  return cancelledJobs.has(jobId);
}

export function markNovelQueued(jobId: string, meta: Partial<NovelDownloadEntry>) {
  cancelledJobs.delete(jobId);
  attempts.set(jobId, { startedAt: new Date().toISOString(), recorded: false });
  const { [jobId]: _dropped, ...remaining } = states;
  states = remaining;
  upsert(jobId, { status: 'queued', progress: 0, ...meta });
}

export function markNovelProgress(jobId: string, progress: number) {
  upsert(jobId, { status: 'downloading', progress: Math.max(0, Math.min(100, progress)) });
}

export function markNovelCompleted(
  jobId: string,
  patch: Partial<NovelDownloadEntry> = {},
) {
  upsert(jobId, { status: 'completed', progress: 100, ...patch });
  void triggerHaptic('download-complete');
}

export function markNovelFailed(jobId: string, error: string) {
  upsert(jobId, { status: 'failed', error });
}

export function markNovelCancelled(jobId: string) {
  cancelledJobs.add(jobId);
  upsert(jobId, { status: 'cancelled' });
}

export function clearNovelCancelled(jobId: string) {
  cancelledJobs.delete(jobId);
}

// ── React binding ──────────────────────────────────────────────────────────
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
function getSnapshot() {
  return states;
}

/** Live map of every novel-chapter download this session, keyed by jobId. */
export function useNovelDownloadStates(): Snapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
