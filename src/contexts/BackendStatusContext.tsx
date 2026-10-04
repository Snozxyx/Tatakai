import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { Capacitor, CapacitorHttp } from '@capacitor/core';

/**
 * BackendStatusContext
 *
 * Distinguishes three connectivity states that the app must treat differently:
 *
 *   - 'online'      → internet is up AND at least one Tatakai origin answers.
 *   - 'no-internet' → the device has no network at all (navigator.onLine === false).
 *   - 'server-down' → the device HAS internet, but every Tatakai origin (API +
 *                     Supabase) failed to answer. This is the case the plain
 *                     `navigator.onLine` check misses entirely: maintenance,
 *                     API outage, or the whole backend being unreachable while
 *                     the user's connection is perfectly fine.
 *
 * The distinction matters because in 'server-down' we still want the desktop /
 * native user to reach their downloaded library (which is served locally over
 * IPC + IndexedDB and needs no network), instead of a silently broken UI.
 *
 * Health probing is intentionally cheap and false-positive-averse:
 *   - We probe origins with `mode: 'no-cors'`. A resolved (even opaque)
 *     response means the origin answered at the network layer → reachable.
 *     Only a rejected fetch (DNS failure, connection refused, timeout) counts
 *     as unreachable, so a CORS quirk never masquerades as an outage.
 *   - The backend is considered reachable if ANY probed origin answers.
 *   - Probing pauses while the document is hidden and resumes (with an
 *     immediate check) on focus / `online` events, so a backgrounded window
 *     costs nothing.
 */

export type BackendStatus = 'online' | 'no-internet' | 'server-down';

interface BackendStatusValue {
  /** navigator.onLine — is there any network at all. */
  internetOnline: boolean;
  /** Did the most recent probe reach a Tatakai origin. */
  backendReachable: boolean;
  /** Derived tri-state used by gates/banners. */
  status: BackendStatus;
  /** Epoch ms of the last completed probe (0 if never). */
  lastCheckedAt: number;
  /** Force an immediate re-probe (e.g. from a "Retry" button). */
  recheck: () => void;
}

const BackendStatusContext = createContext<BackendStatusValue | null>(null);

// ── Config ──────────────────────────────────────────────────────────────────

const SUPABASE_ORIGIN = (() => {
  try {
    const raw = String(import.meta.env.VITE_SUPABASE_URL || '').trim();
    return raw ? new URL(raw).origin : '';
  } catch {
    return '';
  }
})();

const API_ORIGIN = (() => {
  const raw = String(import.meta.env.VITE_API_ORIGIN || '').trim();
  return raw || 'https://api.tatakai.me';
})();

/** Origins probed for reachability. Empty entries are filtered out. */
const PROBE_ORIGINS = [API_ORIGIN, SUPABASE_ORIGIN].filter(Boolean);

const PROBE_TIMEOUT_MS = 6_000;
const POLL_INTERVAL_MS = 30_000;
/** Faster retry cadence while we believe the backend is down. */
const POLL_INTERVAL_DOWN_MS = 10_000;

const isBrowser = typeof window !== 'undefined';

function readNavigatorOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}

/** Resolve true if the origin answers at the network layer within the timeout. */
async function probeOrigin(origin: string): Promise<boolean> {
  // Avoid Capacitor's patched fetch interceptor for native health checks.
  // Browser-only fetch options can reject even while the native network stack
  // is healthy. Any HTTP status proves the origin was reached.
  if (Capacitor.isNativePlatform()) {
    try {
      const normalizedOrigin = origin.replace(/\/+$/, '');
      const url = normalizedOrigin === API_ORIGIN.replace(/\/+$/, '')
        ? `${normalizedOrigin}/health`
        : normalizedOrigin;
      const response = await CapacitorHttp.request({
        url,
        method: 'GET',
        connectTimeout: PROBE_TIMEOUT_MS,
        readTimeout: PROBE_TIMEOUT_MS,
        responseType: 'text',
      });
      return Number(response.status) > 0;
    } catch {
      return false;
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    await fetch(origin, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
      // A bare origin fetch is enough to learn "is anything answering here".
      // We never read the body — an opaque response is a success signal.
    });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** Reachable if ANY origin answers. No origins configured → assume reachable. */
async function probeBackend(): Promise<boolean> {
  if (PROBE_ORIGINS.length === 0) return true;
  const results = await Promise.allSettled(PROBE_ORIGINS.map(probeOrigin));
  return results.some((r) => r.status === 'fulfilled' && r.value === true);
}

function deriveStatus(internetOnline: boolean, backendReachable: boolean): BackendStatus {
  if (!internetOnline) return 'no-internet';
  if (!backendReachable) return 'server-down';
  return 'online';
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function BackendStatusProvider({ children }: { children: ReactNode }) {
  const [internetOnline, setInternetOnline] = useState<boolean>(readNavigatorOnline);
  // Optimistic default: assume the backend is reachable until a probe says
  // otherwise, so a healthy first paint never flashes an outage banner.
  const [backendReachable, setBackendReachable] = useState<boolean>(true);
  const [lastCheckedAt, setLastCheckedAt] = useState<number>(0);

  // Refs keep the polling loop stable across renders and let us cancel a probe
  // that resolves after unmount / after a newer probe already superseded it.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const probeSeqRef = useRef(0);
  const runningRef = useRef(false);
  const reachableRef = useRef(backendReachable);
  reachableRef.current = backendReachable;

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const runProbe = useCallback(async () => {
    // Skip entirely when the tab is hidden — a backgrounded window costs nothing.
    if (isBrowser && document.visibilityState === 'hidden') return;
    // No network at all: skip the probe, mark offline, don't touch reachability
    // (we can't learn anything about the backend without a connection).
    if (!readNavigatorOnline()) {
      setInternetOnline(false);
      setLastCheckedAt(Date.now());
      return;
    }
    if (runningRef.current) return;
    runningRef.current = true;
    const seq = ++probeSeqRef.current;
    try {
      const reachable = await probeBackend();
      // Ignore a stale result if a newer probe started meanwhile.
      if (seq !== probeSeqRef.current) return;
      setInternetOnline(readNavigatorOnline());
      setBackendReachable(reachable);
      setLastCheckedAt(Date.now());
    } finally {
      if (seq === probeSeqRef.current) runningRef.current = false;
    }
  }, []);

  // Self-rescheduling poll: cadence tightens while the backend looks down so
  // recovery is noticed quickly, and relaxes to the normal interval when healthy.
  const scheduleNext = useCallback(() => {
    clearTimer();
    if (isBrowser && document.visibilityState === 'hidden') return;
    const interval = reachableRef.current ? POLL_INTERVAL_MS : POLL_INTERVAL_DOWN_MS;
    timerRef.current = setTimeout(async () => {
      await runProbe();
      scheduleNext();
    }, interval);
  }, [clearTimer, runProbe]);

  const recheck = useCallback(() => {
    void runProbe().then(scheduleNext);
  }, [runProbe, scheduleNext]);

  useEffect(() => {
    if (!isBrowser) return;

    // Kick off an immediate probe, then start the self-scheduling loop.
    void runProbe().then(scheduleNext);

    const onOnline = () => {
      setInternetOnline(true);
      recheck();
    };
    const onOffline = () => {
      setInternetOnline(false);
      setLastCheckedAt(Date.now());
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        recheck();
      } else {
        clearTimer();
      }
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearTimer();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [runProbe, scheduleNext, recheck, clearTimer]);

  const status = deriveStatus(internetOnline, backendReachable);

  const value: BackendStatusValue = {
    internetOnline,
    backendReachable,
    status,
    lastCheckedAt,
    recheck,
  };

  return (
    <BackendStatusContext.Provider value={value}>
      {children}
    </BackendStatusContext.Provider>
  );
}

/**
 * Read the current backend connectivity state. Safe to call outside the
 * provider: it degrades to an optimistic 'online' so nothing is gated on a
 * missing provider (the provider is desktop/native-oriented but harmless on web).
 */
export function useBackendStatus(): BackendStatusValue {
  const ctx = useContext(BackendStatusContext);
  if (ctx) return ctx;
  return {
    internetOnline: readNavigatorOnline(),
    backendReachable: true,
    status: readNavigatorOnline() ? 'online' : 'no-internet',
    lastCheckedAt: 0,
    recheck: () => {},
  };
}
