import { useSyncExternalStore } from 'react';
import { triggerHaptic } from '@/lib/haptics';

/**
 * Global download monitor — a single app-lifetime subscription to the Electron
 * download IPC channels, exposed to React via useSyncExternalStore.
 *
 * Why a singleton and not per-hook listeners: the preload bridge's
 * `removeDownloadListeners()` calls `ipcRenderer.removeAllListeners(...)`, so
 * ANY `useDownload` consumer unmounting would tear down EVERY consumer's
 * listeners — breaking a persistent widget like the titlebar Dynamic Island the
 * moment a download modal closed. Subscribing exactly once here (and never
 * removing) keeps every consumer live, and records history a single time.
 */

export type DownloadJobStatus = 'queued' | 'downloading' | 'completed' | 'failed' | 'cancelled';

export interface DownloadMonitorEntry {
  episodeId: string;
  status: DownloadJobStatus;
  progress: number;
  speed?: string;
  eta?: string;
  localUri?: string;
  error?: string;
  // Enriched from the localStorage meta written at download start, so widgets
  // can render name/poster/torrent-badge without re-plumbing the payload.
  animeName?: string;
  episodeNumber?: number;
  posterUrl?: string;
  sourceType?: 'hls' | 'torrent';
  // Torrent-only live swarm stats (raw bytes/sec + counts) so the titlebar
  // widget can show download/upload speed, peers and ratio.
  dlSpeedBps?: number;
  upSpeedBps?: number;
  downloadedBytes?: number;
  uploadedBytes?: number;
  ratio?: number;
  seeders?: number;
  leechers?: number;
  numPeers?: number;
}

type Snapshot = Record<string, DownloadMonitorEntry>;

const EMPTY: Snapshot = {};
let states: Snapshot = EMPTY;
const listeners = new Set<() => void>();
let started = false;

function notify() {
  for (const l of listeners) l();
}

function readMeta(id: string): Partial<DownloadMonitorEntry> {
  try {
    const raw = localStorage.getItem(`tatakai:dl:meta:${id}`);
    if (!raw) return {};
    const m = JSON.parse(raw);
    return {
      animeName: m.animeTitle,
      episodeNumber: m.episodeNumber,
      posterUrl: m.posterUrl,
      sourceType: m.sourceType,
    };
  } catch {
    return {};
  }
}

function upsert(id: string, patch: Partial<DownloadMonitorEntry>) {
  const prev = states[id];
  const meta = prev ? {} : readMeta(id);
  const next: DownloadMonitorEntry = {
    episodeId: id,
    status: patch.status ?? prev?.status ?? 'queued',
    progress: patch.progress ?? prev?.progress ?? 0,
    speed: patch.speed ?? prev?.speed,
    eta: patch.eta ?? prev?.eta,
    localUri: patch.localUri ?? prev?.localUri,
    error: patch.error ?? prev?.error,
    animeName: patch.animeName ?? prev?.animeName ?? meta.animeName,
    episodeNumber: patch.episodeNumber ?? prev?.episodeNumber ?? meta.episodeNumber,
    posterUrl: patch.posterUrl ?? prev?.posterUrl ?? meta.posterUrl,
    sourceType: patch.sourceType ?? prev?.sourceType ?? (meta.sourceType as DownloadMonitorEntry['sourceType']),
    dlSpeedBps: patch.dlSpeedBps ?? prev?.dlSpeedBps,
    upSpeedBps: patch.upSpeedBps ?? prev?.upSpeedBps,
    downloadedBytes: patch.downloadedBytes ?? prev?.downloadedBytes,
    uploadedBytes: patch.uploadedBytes ?? prev?.uploadedBytes,
    ratio: patch.ratio ?? prev?.ratio,
    seeders: patch.seeders ?? prev?.seeders,
    leechers: patch.leechers ?? prev?.leechers,
    numPeers: patch.numPeers ?? prev?.numPeers,
  };
  states = { ...states, [id]: next };
  notify();
}

function recordHistory(
  id: string,
  status: 'completed' | 'failed' | 'cancelled',
  extra: { fileSizeBytes?: number; localPath?: string; errorMessage?: string },
) {
  const raw = localStorage.getItem(`tatakai:dl:meta:${id}`);
  if (!raw) return;
  try {
    const meta = JSON.parse(raw);
    import('@/core/download/download-history-service').then(({ recordDownload }) => {
      recordDownload({
        animeId: meta.animeId || 0,
        animeTitle: meta.animeTitle,
        posterUrl: meta.posterUrl,
        episodeNumber: meta.episodeNumber,
        status,
        sourceType: meta.sourceType,
        resolvedLanguage: meta.resolvedLanguage || 'unknown',
        fileSizeBytes: extra.fileSizeBytes,
        localPath: extra.localPath,
        errorMessage: extra.errorMessage,
        startedAt: meta.startedAt,
        completedAt: new Date().toISOString(),
        retryCount: 0,
      });
    });
    localStorage.removeItem(`tatakai:dl:meta:${id}`);
  } catch (e) {
    console.error('[download-monitor] Failed to record history:', e);
  }
}

/** Subscribe to the Electron IPC channels exactly once, for the app's lifetime. */
export function ensureDownloadMonitor() {
  if (started || typeof window === 'undefined') return;
  const bridge = (window as { electron?: any }).electron;
  if (!bridge?.onDownloadProgress || !bridge.onDownloadCompleted || !bridge.onDownloadError) return;
  started = true;

  bridge.onDownloadProgress((data: Record<string, unknown>) => {
    const id = String(data?.episodeId || '');
    if (!id) return;
    const pct = typeof data.percent === 'number' ? data.percent : Number(data.percent) || 0;
    const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
    upsert(id, {
      status: 'downloading',
      progress: pct,
      speed: typeof data.speed === 'string' ? data.speed : undefined,
      eta: typeof data.eta === 'string' ? data.eta : undefined,
      dlSpeedBps: num(data.dlSpeedBps),
      upSpeedBps: num(data.upSpeedBps),
      downloadedBytes: num(data.downloadedBytes),
      uploadedBytes: num(data.uploadedBytes),
      ratio: num(data.ratio),
      seeders: num(data.seeders),
      leechers: num(data.leechers),
      numPeers: num(data.numPeers),
    });
  });
  bridge.onDownloadCompleted((data: Record<string, unknown>) => {
    const id = String(data?.episodeId || '');
    if (!id) return;
    upsert(id, { status: 'completed', progress: 100, localUri: typeof data.path === 'string' ? data.path : undefined });
    recordHistory(id, 'completed', {
      fileSizeBytes: typeof data.size === 'number' ? data.size : undefined,
      localPath: typeof data.path === 'string' ? data.path : undefined,
    });
    void triggerHaptic('download-complete');
  });
  bridge.onDownloadError((data: Record<string, unknown>) => {
    const id = String(data?.episodeId || '');
    if (!id) return;
    const errMsg = typeof data.error === 'string' ? data.error : 'Download failed';
    upsert(id, { status: 'failed', error: errMsg });
    recordHistory(id, 'failed', { errorMessage: errMsg });
  });
}

// ── Optimistic actions (called by useDownload) ─────────────────────────────
export function markQueued(id: string, meta: Partial<DownloadMonitorEntry>) {
  upsert(id, { status: 'queued', progress: 0, ...meta });
}
export function markFailedStart(id: string, error: string) {
  upsert(id, { status: 'failed', error });
  try {
    localStorage.removeItem(`tatakai:dl:meta:${id}`);
  } catch {
    /* ignore */
  }
}
export function markCancelled(id: string) {
  upsert(id, { status: 'cancelled' });
  recordHistory(id, 'cancelled', {});
}

// ── Mobile-driven progress (Capacitor downloader) ──────────────────────────
// On desktop the Electron IPC channels drive `upsert`. On mobile there is no
// such bridge; the Capacitor downloader pushes progress/terminal states through
// these so the SAME store (and every widget reading it) stays live and history
// is recorded identically.
export function markProgress(id: string, percent: number, extra?: { speed?: string; eta?: string }) {
  upsert(id, { status: 'downloading', progress: Math.max(0, Math.min(100, percent)), ...extra });
}
export function markCompleted(id: string, opts?: { localUri?: string; fileSizeBytes?: number }) {
  upsert(id, { status: 'completed', progress: 100, localUri: opts?.localUri });
  recordHistory(id, 'completed', { localPath: opts?.localUri, fileSizeBytes: opts?.fileSizeBytes });
  void triggerHaptic('download-complete');
}
export function markError(id: string, error: string) {
  upsert(id, { status: 'failed', error });
  recordHistory(id, 'failed', { errorMessage: error });
}

// ── React binding ──────────────────────────────────────────────────────────
function subscribe(cb: () => void) {
  ensureDownloadMonitor();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
function getSnapshot() {
  return states;
}

/** Live map of every download this session, keyed by episodeId. */
export function useDownloadStates(): Snapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
