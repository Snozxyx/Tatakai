export interface DesktopFullscreenBridge {
  setFullscreen(enabled: boolean): Promise<{ success: boolean; fullscreen?: boolean; error?: string }>;
  isFullscreen?: () => Promise<{ success: boolean; fullscreen?: boolean; error?: string } | boolean>;
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
  let ourEnterAt = 0;
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  let reassertTimer: ReturnType<typeof setTimeout> | undefined;
  let lastRelinquishedAt = 0;
  const update = (enabled: boolean) => {
    active = enabled;
    if (!disposed) paint(enabled);
  };
  const isNativeFullscreen = async (): Promise<boolean> => {
    if (!bridge.isFullscreen) return false;
    try {
      const raw = await bridge.isFullscreen();
      return typeof raw === 'boolean' ? raw : raw?.success ? !!raw.fullscreen : false;
    } catch {
      return false;
    }
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
  // Windows can emit a spurious leave-full-screen while unmaximize → fullscreen
  // transitions; unpainting on it would drop the player back into the page while
  // the window stays fullscreen. A native leave is only trusted after a short
  // settle delay and a re-check of the real window state; a real exit still
  // unpaints, a transition artifact does not. While the session is still
  // player-owned (entered through this controller), the check tolerates one
  // mid-transition false snapshot, and a late re-assert re-takes the paint if
  // the window only later completed the fullscreen transition.
  const scheduleReassert = () => {
    if (reassertTimer !== undefined) return;
    reassertTimer = setTimeout(async () => {
      reassertTimer = undefined;
      if (disposed || active || pending || exitRequested || lastRelinquishedAt === 0) return;
      if (Date.now() - lastRelinquishedAt > 4000) {
        lastRelinquishedAt = 0;
        return;
      }
      if (await isNativeFullscreen()) {
        lastRelinquishedAt = 0;
        if (!disposed && !active && !pending && !exitRequested) update(true);
      }
    }, 900);
  };

  const confirmExit = async () => {
    if (!active || pending || disposed) return;
    if (!bridge.isFullscreen) {
      update(false);
      return;
    }
    if (!(await isNativeFullscreen())) {
      const playerOwned = ourEnterAt > 0 && Date.now() - ourEnterAt < 15_000;
      if (playerOwned) {
        // The unmaximize → fullscreen transition can still report a false
        // window state; re-check once before dropping a player-owned paint.
        await new Promise((resolve) => setTimeout(resolve, 350));
        if (!active || pending || disposed) return;
        if (await isNativeFullscreen()) return;
      }
      if (active && !pending && !disposed && !(await isNativeFullscreen())) {
        // A re-enter right after this can be the same transition resuming.
        lastRelinquishedAt = Date.now();
        update(false);
        scheduleReassert();
      }
    }
  };
  const settleAndVerifyExit = () => {
    if (settleTimer !== undefined) return;
    settleTimer = setTimeout(() => {
      settleTimer = undefined;
      void confirmExit();
    }, 300);
  };
  const clearTimers = () => {
    if (settleTimer !== undefined) {
      clearTimeout(settleTimer);
      settleTimer = undefined;
    }
    if (reassertTimer !== undefined) {
      clearTimeout(reassertTimer);
      reassertTimer = undefined;
    }
  };
  return {
    get active() { return active; },
    get pending() { return pending; },
    toggle() {
      if (disposed || pending) return Promise.resolve();
      const enabled = !active;
      ourEnterAt = enabled ? Date.now() : 0;
      if (!enabled) {
        lastRelinquishedAt = 0;
        if (reassertTimer !== undefined) {
          clearTimeout(reassertTimer);
          reassertTimer = undefined;
        }
      }
      update(enabled);
      return request(enabled);
    },
    exit() {
      if (!active) return Promise.resolve();
      update(false);
      ourEnterAt = 0;
      lastRelinquishedAt = 0;
      if (reassertTimer !== undefined) {
        clearTimeout(reassertTimer);
        reassertTimer = undefined;
      }
      if (pending) { exitRequested = true; return Promise.resolve(); }
      return request(false);
    },
    nativeChanged(enabled: boolean) {
      if (enabled) {
        // Our own entry already painted; native enter confirms ownership only.
        // Repaint only when the paint was just dropped by the verified-exit
        // check while the same transition resumed — never on outside enters
        // (F11 / Display settings own unpainted window fullscreen).
        if (!active && !disposed && Date.now() - lastRelinquishedAt < 1500) {
          lastRelinquishedAt = 0;
          update(true);
        }
        return;
      }
      if (!active || pending) return;
      // No verification capability — trust the notification immediately.
      if (!bridge.isFullscreen) {
        update(false);
        return;
      }
      if (reassertTimer !== undefined) {
        clearTimeout(reassertTimer);
        reassertTimer = undefined;
      }
      settleAndVerifyExit();
    },
    dispose() {
      const wasActive = active;
      ourEnterAt = 0;
      lastRelinquishedAt = 0;
      clearTimers();
      update(false);
      disposed = true;
      if (pending) exitRequested = true;
      else if (wasActive) void request(false);
    },
  };
}
