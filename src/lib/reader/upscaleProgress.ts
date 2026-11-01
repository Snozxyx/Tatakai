/**
 * Chapter-level upscale progress + native-engine readiness, shared across every
 * page-enhancement hook so the manga reader can show ONE compact pill
 * ("Upscaling 12/45") instead of per-page "Enhancing page…" text sitting in
 * the middle of each page.
 */

export type UpscaleProgress = {
  /** Scope key (the chapter identity this progress belongs to). */
  key: string;
  total: number;
  done: number;
  active: boolean;
};

let current: UpscaleProgress = { key: '', total: 0, done: 0, active: false };
const listeners = new Set<(p: UpscaleProgress) => void>();
const emit = () => { for (const l of listeners) l(current); };

/** The reader declares the chapter being upscaled and its page count. */
export function setUpscaleScope(key: string, total: number) {
  current = {
    key,
    total,
    // Re-declaring the same chapter keeps whatever progress already happened.
    done: current.key === key ? Math.min(current.done, total) : 0,
    active: total > 0,
  };
  emit();
}

/** A page finished enhancing and counts toward the chapter's progress. */
export function markUpscaleDone(key: string) {
  if (current.key !== key || !current.active || current.done >= current.total) return;
  current = { ...current, done: current.done + 1 };
  if (current.done >= current.total) current.active = false;
  emit();
}

export function clearUpscaleScope() {
  current = { key: '', total: 0, done: 0, active: false };
  emit();
}

export function subscribeUpscaleProgress(callback: (p: UpscaleProgress) => void) {
  listeners.add(callback);
  callback(current);
  return () => { listeners.delete(callback); };
}

/** Reactive readiness of the native engines, for the chapter-level pill. */
export type EngineReadiness = { realesrgan: boolean; manga: boolean };
let engineReady: EngineReadiness = { realesrgan: false, manga: false };
const readyListeners = new Set<(r: EngineReadiness) => void>();
const emitReady = () => { for (const l of readyListeners) l(engineReady); };
export function subscribeEngineReadiness(callback: (r: EngineReadiness) => void) {
  readyListeners.add(callback);
  callback(engineReady);
  return () => { readyListeners.delete(callback); };
}

/**
 * Native engines (Real-ESRGAN / Manga Upscaler) must be set up and loaded in
 * the desktop app before the bridge accepts work. All pages wait on ONE shared
 * status poller (single-flight, warm-cached) so enabling the upscaler never
 * fires enhancement against a not-yet-set-up engine, and a whole chapter
 * doesn't spam the bridge with status calls. If setup isn't running yet, it
 * kicks the install off once — "set up the upscaler before enabling it".
 */
let sharedPoll: Promise<void> | null = null;
const readiness: { engine: string; ready: boolean; at: number }[] = [];

const pollStatus = (): Promise<void> => {
  if (sharedPoll) return sharedPoll;
  sharedPoll = (async () => {
    try {
      const bridge = window.electron?.upscaler;
      if (!bridge) return;
      const status = await bridge.status().catch(() => null);
      if (!status) return;
      const at = Date.now();
      for (const engine of ['realesrgan', 'manga'] as const) {
        const ready = Boolean(status[engine]);
        const existing = readiness.find((r) => r.engine === engine);
        if (existing) { existing.ready = ready; existing.at = at; }
        else readiness.push({ engine, ready, at });
        if (engineReady[engine] !== ready) { engineReady = { ...engineReady, [engine]: ready }; emitReady(); }
      }
    } finally {
      sharedPoll = null;
    }
  })();
  return sharedPoll;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function waitForEngineReady(engine: 'realesrgan' | 'manga', signal: AbortSignal): Promise<boolean> {
  const bridge = window.electron?.upscaler;
  if (!bridge) return false;
  // Warm cache: a poll within the last two seconds answers instantly, so an
  // already-set-up engine adds no delay to page display.
  const cached = readiness.find((r) => r.engine === engine);
  if (cached && Date.now() - cached.at < 2000) return cached.ready;
  const deadline = Date.now() + 4 * 60 * 1000;
  let installTriggered = false;
  while (!signal.aborted) {
    await pollStatus();
    const fresh = readiness.find((r) => r.engine === engine);
    if (fresh?.ready) return true;
    if (!installTriggered) {
      installTriggered = true;
      // Setup before enable: start the install once if it isn't already going.
      const status = await bridge.status().catch(() => null);
      if (status && !status.installing) void bridge.install(engine).catch(() => {});
    }
    if (Date.now() > deadline) return false;
    await sleep(1200);
  }
  return false;
}
