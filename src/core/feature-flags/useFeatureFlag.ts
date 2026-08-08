import { useSyncExternalStore } from 'react';
import { isEnabled, setFlag, clearFlag, FeatureFlag } from './feature-flags';
import { trackEvent } from '@/core/analytics/AnalyticsService';

/**
 * Subscribe to feature flag changes. When setFlag/clearFlag is called,
 * components using this hook will re-render.
 */
let _listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

function notify() {
  _listeners.forEach((l) => l());
}

// Snapshot is a stringified map so useSyncExternalStore can detect changes.
let _snapshot = '';
function getSnapshot(): string {
  const flags: Record<string, boolean> = {};
  for (const f of Object.values(FeatureFlag)) {
    flags[f] = isEnabled(f);
  }
  const next = JSON.stringify(flags);
  if (next !== _snapshot) _snapshot = next;
  return _snapshot;
}

/**
 * React hook – returns true/false for a single feature flag.
 *
 * ```tsx
 * const torrentEnabled = useFeatureFlag(FeatureFlag.TORRENT_ENGINE);
 * ```
 */
export function useFeatureFlag(flag: FeatureFlag): boolean {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const flags: Record<string, boolean> = JSON.parse(snap);

  const enabled = flags[flag] ?? false;

  // Avoid spamming analytics on every render; record once per session per flag.
  // Note: in-memory set is fine here because this is a client-only hook.
  if (enabled && !_trackedFlags.has(flag)) {
    _trackedFlags.add(flag);
    trackEvent('feature_flag_used', { flag });
  }

  return enabled;
}

// Tracks which flags have already emitted `feature_flag_used`.
const _trackedFlags: Set<FeatureFlag> = new Set();

/**
 * Imperative toggle that also triggers React re-renders.
 */
export function toggleFlag(flag: FeatureFlag, enabled: boolean): void {
  if (enabled) {
    setFlag(flag, true);
  } else {
    clearFlag(flag);
  }
  notify();
}

export { FeatureFlag } from './feature-flags';
