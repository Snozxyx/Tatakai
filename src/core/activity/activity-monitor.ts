import { useSyncExternalStore } from 'react';

/**
 * Global "live activity" monitor — an app-lifetime store of what the user is
 * actively doing beyond downloads: hosting a Watch-Together room (Streaming),
 * watching one as a guest (Watching), or streaming a torrent (Torrenting).
 *
 * Mirrors the download-monitor pattern (module-level state + a Set of listeners
 * + useSyncExternalStore) so the Dynamic Island — which only ever reads global
 * singletons — can render animated activity pills without any prop plumbing.
 * Feature code pushes into it from an effect and clears on unmount.
 */

export type ActivityKind = 'streaming' | 'watching' | 'torrenting';

export interface ActivityEntry {
  /** Stable id so re-renders update in place (e.g. 'watchroom', 'torrent'). */
  id: string;
  kind: ActivityKind;
  /** Primary line, e.g. the room name or the torrent's display title. */
  label?: string;
  /** Secondary line, e.g. "3 watching" or "1.2 MB/s ↓". */
  detail?: string;
  /** 0-100 optional progress (torrent buffer / playback %). */
  progress?: number;
  startedAt: number;
}

type Snapshot = Record<string, ActivityEntry>;

const EMPTY: Snapshot = {};
let states: Snapshot = EMPTY;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

/** Upsert an activity. Merges into any existing entry with the same id. */
export function setActivity(
  id: string,
  patch: Omit<Partial<ActivityEntry>, 'id'> & { kind: ActivityKind },
) {
  const prev = states[id];
  const next: ActivityEntry = {
    id,
    kind: patch.kind,
    label: patch.label ?? prev?.label,
    detail: patch.detail ?? prev?.detail,
    progress: patch.progress ?? prev?.progress,
    startedAt: prev?.startedAt ?? Date.now(),
  };
  states = { ...states, [id]: next };
  notify();
}

/** Remove an activity entry (no-op if absent). */
export function clearActivity(id: string) {
  if (!states[id]) return;
  const next = { ...states };
  delete next[id];
  states = next;
  notify();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
function getSnapshot() {
  return states;
}

/** Live map of the user's current activities, keyed by id. */
export function useActivityStates(): Snapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
