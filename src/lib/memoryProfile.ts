/**
 * src/lib/memoryProfile.ts
 * ------------------------------------------------------------------------------
 * The single "master knob" for the app's memory footprint. A user picks one of
 * three profiles; every RAM-sensitive subsystem reads its tunables from here.
 *
 *   - low       — smallest footprint (aggressive caps, tiny media buffers)
 *   - balanced  — the new default; lowers steady-state RAM vs. the old behaviour
 *   - unlimited — the app's historical behaviour (large buffers/caches), for
 *                 users who prefer speed over RAM.
 *
 * Persistence mirrors the existing `tatakai_*` single-key localStorage pattern
 * (see StorageSettingsPanel's `tatakai_storage_limit_gb`). On change we also
 * mirror the choice to the main process so the V8 heap cap can be applied at the
 * next launch (main reads a small JSON in userData before `app.whenReady`).
 *
 * SSR/Electron-main safe: every `window`/`localStorage` access is guarded.
 */

export type MemoryProfile = "low" | "balanced" | "unlimited";

export const MEMORY_PROFILE_STORAGE_KEY = "tatakai_memory_profile";
export const MEMORY_PROFILE_UPDATE_EVENT = "tatakai:memory-profile-changed";
export const DEFAULT_MEMORY_PROFILE: MemoryProfile = "balanced";

export interface HlsBufferKnobs {
  backBufferLength: number;
  maxBufferLength: number;
  maxMaxBufferLength: number;
}

export interface MemoryProfileKnobs {
  hls: HlsBufferKnobs;
  cacheCaps: {
    /** Max entries in extensionResultCache's in-memory tier. */
    extResult: number;
    /** Max entries in the mapping-client cache. */
    mapping: number;
    /** Max entries in the combined-source cache. */
    combinedSource: number;
  };
  /** Default manga-reader preload window (overridden by an explicit user choice). */
  readerPreload: "none" | "partial" | "full";
  /** Suggested V8 --max-old-space-size in MB; null = leave V8 at its default. */
  v8HeapCapMb: number | null;
}

const KNOBS: Record<MemoryProfile, MemoryProfileKnobs> = {
  low: {
    hls: { backBufferLength: 30, maxBufferLength: 30, maxMaxBufferLength: 60 },
    cacheCaps: { extResult: 50, mapping: 100, combinedSource: 50 },
    readerPreload: "none",
    v8HeapCapMb: 1024,
  },
  balanced: {
    hls: { backBufferLength: 90, maxBufferLength: 60, maxMaxBufferLength: 90 },
    cacheCaps: { extResult: 150, mapping: 250, combinedSource: 150 },
    readerPreload: "partial",
    v8HeapCapMb: 1536,
  },
  unlimited: {
    hls: { backBufferLength: 300, maxBufferLength: 600, maxMaxBufferLength: 1200 },
    cacheCaps: { extResult: 500, mapping: 1000, combinedSource: 500 },
    readerPreload: "full",
    v8HeapCapMb: null,
  },
};

function isProfile(value: unknown): value is MemoryProfile {
  return value === "low" || value === "balanced" || value === "unlimited";
}

/** Read the active profile from localStorage, falling back to the default. */
export function getMemoryProfile(): MemoryProfile {
  try {
    if (typeof localStorage === "undefined") return DEFAULT_MEMORY_PROFILE;
    const raw = localStorage.getItem(MEMORY_PROFILE_STORAGE_KEY);
    return isProfile(raw) ? raw : DEFAULT_MEMORY_PROFILE;
  } catch {
    return DEFAULT_MEMORY_PROFILE;
  }
}

/** Resolve the tunables for a profile (defaults to the active one). */
export function getProfileKnobs(profile?: MemoryProfile): MemoryProfileKnobs {
  return KNOBS[profile ?? getMemoryProfile()];
}

/**
 * Persist a new profile, notify in-process listeners, and mirror the choice to
 * the main process (so the V8 cap applies next launch). Best-effort throughout.
 */
export function setMemoryProfile(profile: MemoryProfile): void {
  if (!isProfile(profile)) return;
  try {
    localStorage.setItem(MEMORY_PROFILE_STORAGE_KEY, profile);
  } catch {
    /* ignore quota / private-mode failures */
  }
  try {
    window.dispatchEvent(
      new CustomEvent(MEMORY_PROFILE_UPDATE_EVENT, { detail: { profile } }),
    );
  } catch {
    /* no window (SSR/main) */
  }
  try {
    const bridge = (window as any)?.electron;
    if (bridge?.setMemoryProfile) {
      void bridge.setMemoryProfile(profile);
    } else if (bridge?.invoke) {
      void bridge.invoke("system:set-memory-profile", profile);
    }
  } catch {
    /* not desktop, or bridge not ready */
  }
}

/**
 * Subscribe to profile changes (this tab via the custom event, other tabs via
 * `storage`). Returns an unsubscribe function.
 */
export function subscribeMemoryProfile(cb: (profile: MemoryProfile) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onCustom = () => cb(getMemoryProfile());
  const onStorage = (e: StorageEvent) => {
    if (e.key === MEMORY_PROFILE_STORAGE_KEY) cb(getMemoryProfile());
  };
  window.addEventListener(MEMORY_PROFILE_UPDATE_EVENT, onCustom as EventListener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(MEMORY_PROFILE_UPDATE_EVENT, onCustom as EventListener);
    window.removeEventListener("storage", onStorage);
  };
}
