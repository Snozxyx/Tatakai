import { useSyncExternalStore } from 'react';
import { triggerHaptic } from '@/lib/haptics';
import { db } from '@/core/db/tatakai-db';
import type { MangaKind } from '@/types/electron-bridge';

/**
 * Global manga-chapter download monitor — a single app-lifetime subscription to
 * the dedicated `manga-download-*` Electron IPC channels, exposed to React via
 * useSyncExternalStore. Parallel to `download-monitor.ts` (anime), kept separate
 * so the two monitors never share state.
 *
 * The preload `manga.onProgress/onCompleted/onError` listeners return PER-CHANNEL
 * removers (never a global `removeAllListeners`), so subscribing here exactly once
 * and never removing keeps every consumer live — same reasoning as the anime
 * monitor, but without the global-teardown hazard.
 *
 * On completion we also persist an `OfflineChapter` row into Dexie so the offline
 * library + offline reader can find downloaded chapters without re-reading disk.
 */

export type MangaDownloadStatus = 'queued' | 'downloading' | 'completed' | 'failed' | 'cancelled';

export interface MangaDownloadEntry {
  jobId: string;
  anilistId: number;
  chapterKey: string;
  status: MangaDownloadStatus;
  /** 0-100 */
  progress: number;
  page?: number;
  totalPages?: number;
  localDir?: string;
  pageCount?: number;
  sizeBytes?: number;
  error?: string;
  // ── Display fields (set optimistically at enqueue; carried through) ──
  /** Series title, for the Dynamic Island row. */
  title?: string;
  /** Series poster, for the Dynamic Island row. */
  posterUrl?: string | null;
  /** manga | manhwa | manhua — drives the Island badge + label. */
  kind?: MangaKind;
  /** Human chapter label, e.g. "Ch. 12" / "Vol 2 · Ch. 12". */
  chapterLabel?: string;
}

type Snapshot = Record<string, MangaDownloadEntry>;

/** jobId = `manga:<anilistId>:<chapterKey>` — matches the main-process engine. */
export function mangaJobId(anilistId: number, chapterKey: string): string {
  return `manga:${anilistId}:${chapterKey}`;
}

const EMPTY: Snapshot = {};
let states: Snapshot = EMPTY;
const listeners = new Set<() => void>();
let started = false;

function notify() {
  for (const l of listeners) l();
}

function upsert(jobId: string, patch: Partial<MangaDownloadEntry>) {
  const prev = states[jobId];
  const next: MangaDownloadEntry = {
    jobId,
    anilistId: patch.anilistId ?? prev?.anilistId ?? 0,
    chapterKey: patch.chapterKey ?? prev?.chapterKey ?? '',
    status: patch.status ?? prev?.status ?? 'queued',
    progress: patch.progress ?? prev?.progress ?? 0,
    page: patch.page ?? prev?.page,
    totalPages: patch.totalPages ?? prev?.totalPages,
    localDir: patch.localDir ?? prev?.localDir,
    pageCount: patch.pageCount ?? prev?.pageCount,
    sizeBytes: patch.sizeBytes ?? prev?.sizeBytes,
    error: patch.error ?? prev?.error,
    title: patch.title ?? prev?.title,
    posterUrl: patch.posterUrl ?? prev?.posterUrl,
    kind: patch.kind ?? prev?.kind,
    chapterLabel: patch.chapterLabel ?? prev?.chapterLabel,
  };
  states = { ...states, [jobId]: next };
  notify();
}

/** Metadata cached at enqueue so the completed row can carry title/number/volume. */
const jobMeta = new Map<
  string,
  { title?: string; posterUrl?: string | null; chapterNumber?: number | null; volume?: number | string | null; provider?: string | null }
>();

export function rememberMangaJobMeta(
  jobId: string,
  meta: { title?: string; posterUrl?: string | null; chapterNumber?: number | null; volume?: number | string | null; provider?: string | null },
) {
  jobMeta.set(jobId, { ...jobMeta.get(jobId), ...meta });
}

async function persistOfflineChapter(data: {
  anilistId: number;
  chapterKey: string;
  chapterNumber?: number | null;
  volume?: number | string | null;
  provider?: string | null;
  title?: string;
  localDir: string;
  pageCount: number;
  sizeBytes: number;
}) {
  try {
    const meta = jobMeta.get(mangaJobId(data.anilistId, data.chapterKey)) || {};
    await db.offlineChapters.put({
      id: `${data.anilistId}:${data.chapterKey}`,
      anilistId: data.anilistId,
      title: data.title || meta.title || 'Untitled',
      posterUrl: meta.posterUrl ?? null,
      chapterKey: data.chapterKey,
      chapterNumber: data.chapterNumber ?? meta.chapterNumber ?? null,
      volume: data.volume ?? meta.volume ?? null,
      localDir: data.localDir,
      pageCount: data.pageCount,
      sizeBytes: data.sizeBytes,
      provider: data.provider ?? meta.provider ?? null,
      downloadedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[manga-download-monitor] Failed to persist offline chapter:', e);
  }
}

/** Subscribe to the dedicated manga IPC channels exactly once, app-lifetime. */
export function ensureMangaDownloadMonitor() {
  if (started || typeof window === 'undefined') return;
  const bridge = (window as { electron?: any }).electron?.manga;
  if (!bridge?.onProgress || !bridge.onCompleted || !bridge.onError) {
    console.warn('[MangaDL] monitor: manga bridge listeners missing — download events will not be received', {
      hasManga: !!bridge,
      onProgress: !!bridge?.onProgress,
      onCompleted: !!bridge?.onCompleted,
      onError: !!bridge?.onError,
    });
    return;
  }
  started = true;
  console.log('[MangaDL] monitor subscribed to manga-download-* channels');

  bridge.onProgress((data: any) => {
    const jobId = String(data?.jobId || '');
    if (!jobId) return;
    if (Number(data.page) === 1 || Number(data.page) === Number(data.totalPages)) {
      console.debug('[MangaDL] progress', jobId, `${data.page}/${data.totalPages} (${data.percent}%)`);
    }
    upsert(jobId, {
      anilistId: Number(data.anilistId) || 0,
      chapterKey: String(data.chapterKey || ''),
      status: 'downloading',
      progress: typeof data.percent === 'number' ? data.percent : Number(data.percent) || 0,
      page: typeof data.page === 'number' ? data.page : undefined,
      totalPages: typeof data.totalPages === 'number' ? data.totalPages : undefined,
    });
  });

  bridge.onCompleted((data: any) => {
    const jobId = String(data?.jobId || '');
    if (!jobId) return;
    console.log('[MangaDL] completed', jobId, `${data.pageCount} pages → ${data.localDir}`);
    upsert(jobId, {
      anilistId: Number(data.anilistId) || 0,
      chapterKey: String(data.chapterKey || ''),
      status: 'completed',
      progress: 100,
      localDir: typeof data.localDir === 'string' ? data.localDir : undefined,
      pageCount: typeof data.pageCount === 'number' ? data.pageCount : undefined,
      sizeBytes: typeof data.sizeBytes === 'number' ? data.sizeBytes : undefined,
    });
    void triggerHaptic('download-complete');
    if (data.localDir && Number(data.anilistId)) {
      void persistOfflineChapter({
        anilistId: Number(data.anilistId),
        chapterKey: String(data.chapterKey || ''),
        chapterNumber: data.chapterNumber ?? null,
        volume: data.volume ?? null,
        provider: data.provider ?? null,
        title: typeof data.title === 'string' ? data.title : undefined,
        localDir: String(data.localDir),
        pageCount: Number(data.pageCount) || 0,
        sizeBytes: Number(data.sizeBytes) || 0,
      });
    }
  });

  bridge.onError((data: any) => {
    const jobId = String(data?.jobId || '');
    if (!jobId) return;
    const err = typeof data.error === 'string' ? data.error : 'Download failed';
    console.error('[MangaDL] error', jobId, err);
    upsert(jobId, {
      anilistId: Number(data.anilistId) || 0,
      chapterKey: String(data.chapterKey || ''),
      status: err === 'cancelled' ? 'cancelled' : 'failed',
      error: err,
    });
  });
}

// ── Optimistic actions (called by useMangaDownload) ─────────────────────────
export function markMangaQueued(jobId: string, meta: Partial<MangaDownloadEntry>) {
  upsert(jobId, { status: 'queued', progress: 0, ...meta });
}
export function markMangaFailedStart(jobId: string, error: string) {
  upsert(jobId, { status: 'failed', error });
}
export function markMangaCancelled(jobId: string) {
  upsert(jobId, { status: 'cancelled' });
}

// ── Mobile-driven progress (Capacitor manga downloader) ────────────────────
// Desktop drives these via the manga IPC channels; mobile has no such bridge,
// so the Capacitor manga downloader pushes progress/terminal states here and
// persists the OfflineChapter row on completion — identical to the IPC path.
export function markMangaProgress(
  jobId: string,
  patch: { anilistId?: number; chapterKey?: string; page?: number; totalPages?: number; percent?: number },
) {
  upsert(jobId, {
    anilistId: patch.anilistId,
    chapterKey: patch.chapterKey,
    status: 'downloading',
    progress: typeof patch.percent === 'number' ? patch.percent : 0,
    page: patch.page,
    totalPages: patch.totalPages,
  });
}
export function markMangaCompleted(data: {
  anilistId: number;
  chapterKey: string;
  chapterNumber?: number | null;
  volume?: number | string | null;
  provider?: string | null;
  title?: string;
  localDir: string;
  pageCount: number;
  sizeBytes: number;
}) {
  const jobId = mangaJobId(data.anilistId, data.chapterKey);
  upsert(jobId, {
    anilistId: data.anilistId,
    chapterKey: data.chapterKey,
    status: 'completed',
    progress: 100,
    localDir: data.localDir,
    pageCount: data.pageCount,
    sizeBytes: data.sizeBytes,
  });
  void persistOfflineChapter(data);
}
export function markMangaError(jobId: string, error: string) {
  upsert(jobId, { status: error === 'cancelled' ? 'cancelled' : 'failed', error });
}

// ── React binding ──────────────────────────────────────────────────────────
function subscribe(cb: () => void) {
  ensureMangaDownloadMonitor();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
function getSnapshot() {
  return states;
}

/** Live map of every manga-chapter download this session, keyed by jobId. */
export function useMangaDownloadStates(): Snapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
