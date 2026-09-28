/**
 * src/contexts/IdleReclaimProvider.tsx
 * ------------------------------------------------------------------------------
 * Renderer-side idle memory reclaim. After the app has been idle (no pointer /
 * key activity) for a while — or backgrounded — it runs the *light* reclaim
 * (sweep expired caches + ask main to close idle Cloudflare contexts and GC).
 *
 * Two hard rules:
 *   - Never reclaim while a video is actively playing. A paused/ended player is
 *     fair game; a playing one is not (checked via the global video ref).
 *   - Light, not full: we only sweep *expired* entries, so a user returning to
 *     an idle window doesn't pay to rebuild caches they were about to reuse.
 *
 * Mirrors BackendStatusContext's visibility/activity wiring. Renders nothing.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { reclaimIdleMemory } from '@/lib/memoryReclaim';
import { getGlobalVideo } from '@/core/player/global-video-ref';

/** Idle while the window is visible before we reclaim. */
const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
/** Shorter grace once the window is hidden/backgrounded. */
const HIDDEN_TIMEOUT_MS = 2 * 60 * 1000;

const isBrowser = typeof window !== 'undefined';

/** True only when a real <video> is mid-playback (paused/ended don't count). */
function isMediaPlaying(): boolean {
  try {
    const el = getGlobalVideo();
    return !!el && !el.paused && !el.ended && el.currentTime > 0;
  } catch {
    return false;
  }
}

function IdleReclaimManager() {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runningRef = useRef(false);

  useEffect(() => {
    if (!isBrowser) return;

    const clear = () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const fire = async () => {
      timerRef.current = null;
      // Playing video takes precedence — reschedule instead of reclaiming.
      if (isMediaPlaying()) {
        schedule(IDLE_TIMEOUT_MS);
        return;
      }
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        await reclaimIdleMemory();
      } finally {
        runningRef.current = false;
      }
      // Re-arm so a long idle window keeps its footprint low over time.
      schedule(document.visibilityState === 'hidden' ? HIDDEN_TIMEOUT_MS : IDLE_TIMEOUT_MS);
    };

    const schedule = (ms: number) => {
      clear();
      timerRef.current = setTimeout(fire, ms);
    };

    // Any user activity resets the (visible) idle countdown.
    const onActivity = () => {
      if (document.visibilityState === 'hidden') return;
      schedule(IDLE_TIMEOUT_MS);
    };

    const onVisibility = () => {
      // Hidden → count down faster; visible → reset to the normal idle window.
      schedule(document.visibilityState === 'hidden' ? HIDDEN_TIMEOUT_MS : IDLE_TIMEOUT_MS);
    };

    const activityEvents: (keyof WindowEventMap)[] = [
      'pointerdown',
      'pointermove',
      'keydown',
      'wheel',
      'touchstart',
    ];
    // Passive + coarse: pointermove fires a lot, but all we do is reset a timer.
    for (const ev of activityEvents) {
      window.addEventListener(ev, onActivity, { passive: true });
    }
    document.addEventListener('visibilitychange', onVisibility);

    schedule(IDLE_TIMEOUT_MS);

    return () => {
      clear();
      for (const ev of activityEvents) window.removeEventListener(ev, onActivity);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return null;
}

/**
 * Drop-in provider (renders children untouched + mounts the idle manager). Safe
 * on web/mobile: the main-side reclaim simply no-ops when the desktop bridge is
 * absent, and the cache sweep is cheap everywhere.
 */
export function IdleReclaimProvider({ children }: { children?: ReactNode }) {
  return (
    <>
      <IdleReclaimManager />
      {children}
    </>
  );
}

export default IdleReclaimProvider;
