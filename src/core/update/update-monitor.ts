import { useSyncExternalStore } from 'react';

/**
 * Global desktop-update monitor — an app-lifetime store of where the auto-updater
 * currently is (checking → available → downloading → downloaded → installing), so
 * the Dynamic Island can surface an "app is updating" indicator without any prop
 * plumbing, exactly like the download- and activity-monitors it sits beside.
 *
 * The store is fed by a single subscriber to `window.electron.onUpdaterEvent`
 * (see useUpdateOrchestrator) which maps the main-process `updater-event`
 * broadcasts (update-manager.cjs `_broadcast`) into this shape. Nothing here
 * touches Electron directly, so it stays inert (phase 'idle') on web/mobile.
 */

export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'installing'
  | 'error';

export interface UpdateState {
  phase: UpdatePhase;
  /** Target version once known, e.g. "5.2.0". */
  version?: string;
  /** 0-100 download progress; only meaningful while phase === 'downloading'. */
  progress: number;
  /** A mandatory policy is driving this — the main process installs on its own. */
  mandatory: boolean;
  /** Last error message when phase === 'error'. */
  message?: string;
  /** User hid the ready-to-install pill; keep the update but stop nagging. */
  dismissed: boolean;
}

const IDLE: UpdateState = {
  phase: 'idle',
  progress: 0,
  mandatory: false,
  dismissed: false,
};

let state: UpdateState = IDLE;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function set(patch: Partial<UpdateState>) {
  state = { ...state, ...patch };
  notify();
}

/** Raw shape of the `updater-event` broadcast from update-manager.cjs. */
export interface UpdaterEvent {
  type:
    | 'checking'
    | 'available'
    | 'mandatory-update'
    | 'not-available'
    | 'downloading'
    | 'downloaded'
    | 'error';
  info?: { version?: string } | null;
  progress?: { percent?: number } | null;
  message?: string;
  dismissible?: boolean;
}

/**
 * Fold a main-process updater broadcast into the store. Central so both the
 * Dynamic Island and the Settings panel read one source of truth.
 */
export function ingestUpdaterEvent(event: UpdaterEvent): void {
  switch (event.type) {
    case 'checking':
      // Don't stomp a download already in flight with a late re-check.
      if (state.phase === 'downloading' || state.phase === 'downloaded') return;
      set({ phase: 'checking', message: undefined });
      break;

    case 'available':
      set({
        phase: 'available',
        version: event.info?.version ?? state.version,
        mandatory: false,
        dismissed: false,
        message: undefined,
      });
      break;

    case 'mandatory-update':
      set({
        phase: 'available',
        version: event.info?.version ?? state.version,
        mandatory: true,
        dismissed: false,
        message: undefined,
      });
      break;

    case 'not-available':
      // Only reset when we weren't mid-download; a stray not-available shouldn't
      // wipe a real pending install.
      if (state.phase === 'checking' || state.phase === 'idle') set({ ...IDLE });
      break;

    case 'downloading':
      set({
        phase: 'downloading',
        progress: Math.max(0, Math.min(100, Math.round(event.progress?.percent ?? state.progress))),
      });
      break;

    case 'downloaded':
      set({
        phase: 'downloaded',
        version: event.info?.version ?? state.version,
        progress: 100,
      });
      break;

    case 'error':
      // A background error shouldn't tear down a completed download the user can
      // still install; only surface it when nothing useful is pending.
      if (state.phase === 'downloaded' || state.phase === 'downloading') return;
      set({ phase: 'error', message: event.message });
      break;
  }
}

/** Mark that we've asked the main process to install (drives the DI spinner). */
export function markInstalling(): void {
  set({ phase: 'installing' });
}

/** Hide the ready-to-install pill without discarding the downloaded update. */
export function dismissUpdateNotice(): void {
  set({ dismissed: true });
}

/** Reset to idle — used when a manual check starts a fresh cycle. */
export function resetUpdateState(): void {
  state = { ...IDLE };
  notify();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
function getSnapshot() {
  return state;
}

/** Live desktop-update state. Returns the idle snapshot on non-Electron builds. */
export function useUpdateState(): UpdateState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
