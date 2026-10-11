export interface DesktopFullscreenBridge {
  setFullscreen(enabled: boolean): Promise<{ success: boolean; fullscreen?: boolean; error?: string }>;
  onFullscreenChanged?: (callback: (enabled: boolean) => void) => (() => void) | undefined;
}

/** Native notifications and click requests share one transition owner. */
export function createDesktopFullscreenController(
  bridge: DesktopFullscreenBridge,
  paint: (enabled: boolean) => void,
) {
  let active = false;
  let pending = false;
  let disposed = false;
  let exitRequested = false;
  const update = (enabled: boolean) => {
    active = enabled;
    if (!disposed) paint(enabled);
  };
  const request = async (enabled: boolean) => {
    pending = true;
    try {
      const result = await bridge.setFullscreen(enabled);
      if (!result?.success) throw new Error(result?.error || 'Fullscreen request failed');
    } catch {
      // Entry keeps the already-painted CSS fallback; exit always releases it.
    } finally {
      pending = false;
      if (enabled && (exitRequested || disposed)) {
        exitRequested = false;
        await request(false);
      }
    }
  };
  return {
    get active() { return active; },
    get pending() { return pending; },
    toggle() {
      if (disposed || pending) return Promise.resolve();
      const enabled = !active;
      update(enabled);
      return request(enabled);
    },
    exit() {
      if (!active) return Promise.resolve();
      update(false);
      if (pending) { exitRequested = true; return Promise.resolve(); }
      return request(false);
    },
    nativeChanged(enabled: boolean) {
      // A native exit during entry can precede its acknowledgement. An actual
      // exit after the transition must restore player chrome and ancestor styles.
      if (!enabled && active && !pending) update(false);
    },
    dispose() {
      const wasActive = active;
      update(false);
      disposed = true;
      if (pending) exitRequested = true;
      else if (wasActive) void request(false);
    },
  };
}
