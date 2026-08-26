/**
 * Global video element registry.
 *
 * VideoPlayer registers its <video> element here so the Miniplayer (and any
 * other consumer that cannot hold a direct React ref to the player) can access
 * the live element for Picture-in-Picture without prop drilling.
 *
 * Additionally stores the last known playback position and the watch-page path
 * so the Miniplayer can show accurate time and the expand action resumes from
 * exactly where playback was paused.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyWeakRef = any;

let _videoRef: AnyWeakRef | null = null;
let _watchPath: string | null = null;
let _savedTime: number = 0;
let _animeName: string | null = null;
let _animePoster: string | null = null;
let _pipModeActive: boolean = false;
let _pipExitCallback: (() => void) | null = null;

// Prefer WeakRef when available (modern browsers/Node), fall back to a plain
// nullable reference so the TypeScript lib target doesn't matter.
const supportsWeakRef = typeof (globalThis as any).WeakRef !== 'undefined';

export function registerGlobalVideo(
  el: HTMLVideoElement | null,
  watchPath?: string,
  meta?: { animeName?: string; animePoster?: string },
) {
  _watchPath = watchPath ?? _watchPath;
  if (meta?.animeName !== undefined) _animeName = meta.animeName;
  if (meta?.animePoster !== undefined) _animePoster = meta.animePoster;

  if (el === null) {
    // Preserve the saved time so the Miniplayer can show it after the watch
    // page unmounts. Do NOT clear _watchPath — needed by expand().
    _videoRef = null;
    return;
  }
  _videoRef = supportsWeakRef ? new (globalThis as any).WeakRef(el) : el;
}

export function getGlobalVideo(): HTMLVideoElement | null {
  if (_videoRef === null) return null;
  if (supportsWeakRef) {
    return (_videoRef as AnyWeakRef).deref() ?? null;
  }
  return _videoRef as HTMLVideoElement;
}

export function getLastWatchPath(): string | null {
  return _watchPath;
}

/** Called by VideoPlayer on every time-update to keep the saved position fresh. */
export function updateGlobalVideoTime(time: number): void {
  if (Number.isFinite(time) && time > 0) _savedTime = time;
}

/** Last known playback position — valid even after the watch page unmounts. */
export function getLastSavedTime(): number {
  return _savedTime;
}

export function getGlobalVideoMeta(): { animeName: string | null; animePoster: string | null } {
  return { animeName: _animeName, animePoster: _animePoster };
}

/**
 * Set PiP mode state. When true, prevents video element unmounting.
 */
export function setPipModeActive(active: boolean, onExit?: () => void): void {
  _pipModeActive = active;
  if (active && onExit) {
    _pipExitCallback = onExit;
  } else if (!active) {
    _pipExitCallback = null;
  }
}

/**
 * Check if PiP mode is currently active.
 */
export function isPipModeActive(): boolean {
  return _pipModeActive;
}

/**
 * Trigger the PiP exit callback if set.
 */
export function triggerPipExitCallback(): void {
  if (_pipExitCallback) {
    _pipExitCallback();
    _pipExitCallback = null;
  }
}
