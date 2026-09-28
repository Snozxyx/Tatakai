/**
 * Configurable video-player keybindings.
 *
 * A small, dependency-free layer over the raw keyboard: it owns the default
 * bindings, persists user overrides to localStorage, normalizes a KeyboardEvent
 * into a stable key token, and resolves a token to the action bound to it.
 *
 * Desktop player only — the mobile player has its own gesture layer.
 */

export type KeybindAction =
  | 'playPause'
  | 'seekBack'
  | 'seekForward'
  | 'fullscreen'
  | 'mute'
  | 'pip'
  | 'prevEpisode'
  | 'nextEpisode';

export interface KeybindDefinition {
  action: KeybindAction;
  label: string;
  /** Normalized key token (see normalizeKeyToken). */
  key: string;
}

export type KeybindMap = Record<KeybindAction, string>;

const STORAGE_KEY = 'tatakai.video.keybinds';
export const KEYBINDS_UPDATED_EVENT = 'tatakai-video-keybinds-updated';

export const KEYBIND_ACTIONS: { action: KeybindAction; label: string; hint: string }[] = [
  { action: 'playPause', label: 'Play / Pause', hint: 'Toggle playback' },
  { action: 'seekBack', label: 'Seek Back', hint: 'Rewind 10 seconds' },
  { action: 'seekForward', label: 'Seek Forward', hint: 'Forward 10 seconds' },
  { action: 'fullscreen', label: 'Fullscreen', hint: 'Toggle fullscreen' },
  { action: 'mute', label: 'Mute', hint: 'Toggle mute' },
  { action: 'pip', label: 'Picture in Picture', hint: 'Toggle PiP' },
  { action: 'prevEpisode', label: 'Previous Episode', hint: 'Go to previous episode' },
  { action: 'nextEpisode', label: 'Next Episode', hint: 'Go to next episode' },
];

export const DEFAULT_KEYBINDS: KeybindMap = {
  playPause: 'space',
  seekBack: 'arrowleft',
  seekForward: 'arrowright',
  fullscreen: 'f',
  mute: 'm',
  pip: 'p',
  prevEpisode: 'j',
  nextEpisode: 'k',
};

/**
 * Turn a KeyboardEvent into a stable, comparable token.
 * Space becomes "space"; everything else is the lowercased `key`
 * ("arrowleft", "f", "1"). Modifier-only presses return "".
 */
export function normalizeKeyToken(e: Pick<KeyboardEvent, 'key'>): string {
  const key = e.key;
  if (!key) return '';
  if (key === ' ' || key === 'Spacebar') return 'space';
  const lowered = key.toLowerCase();
  if (lowered === 'control' || lowered === 'shift' || lowered === 'alt' || lowered === 'meta') return '';
  return lowered;
}

/** Human-readable label for a stored key token, for the editor UI. */
export function formatKeyToken(token: string): string {
  if (!token) return 'None';
  const map: Record<string, string> = {
    space: 'Space',
    arrowleft: '←',
    arrowright: '→',
    arrowup: '↑',
    arrowdown: '↓',
    escape: 'Esc',
    enter: 'Enter',
    tab: 'Tab',
  };
  if (map[token]) return map[token];
  return token.length === 1 ? token.toUpperCase() : token.charAt(0).toUpperCase() + token.slice(1);
}

function isKeybindAction(value: string): value is KeybindAction {
  return value in DEFAULT_KEYBINDS;
}

export function normalizeKeybinds(raw: unknown): KeybindMap {
  const next: KeybindMap = { ...DEFAULT_KEYBINDS };
  if (!raw || typeof raw !== 'object') return next;
  for (const [action, key] of Object.entries(raw as Record<string, unknown>)) {
    if (isKeybindAction(action) && typeof key === 'string' && key.trim()) {
      next[action] = key.trim().toLowerCase();
    }
  }
  return next;
}

export function loadKeybinds(): KeybindMap {
  if (typeof window === 'undefined') return { ...DEFAULT_KEYBINDS };
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return { ...DEFAULT_KEYBINDS };
    return normalizeKeybinds(JSON.parse(stored));
  } catch {
    return { ...DEFAULT_KEYBINDS };
  }
}

export function saveKeybinds(map: KeybindMap): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent(KEYBINDS_UPDATED_EVENT));
  } catch {
    // Ignore storage failures (quota, private mode).
  }
}

export function resetKeybinds(): KeybindMap {
  const fresh = { ...DEFAULT_KEYBINDS };
  saveKeybinds(fresh);
  return fresh;
}

/**
 * Assign `key` to `action`, clearing any other action that held it (a token
 * can only drive one action). Returns a new map; does not persist.
 */
export function assignKeybind(map: KeybindMap, action: KeybindAction, key: string): KeybindMap {
  const token = key.trim().toLowerCase();
  const next: KeybindMap = { ...map };
  if (!token) return next;
  for (const a of Object.keys(next) as KeybindAction[]) {
    if (next[a] === token) next[a] = '';
  }
  next[action] = token;
  return next;
}

/** Resolve a pressed token to the action it triggers, or null. */
export function resolveAction(map: KeybindMap, token: string): KeybindAction | null {
  if (!token) return null;
  for (const action of Object.keys(map) as KeybindAction[]) {
    if (map[action] === token) return action;
  }
  return null;
}
