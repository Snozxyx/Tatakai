/**
 * Configurable manga-reader keybindings.
 *
 * A clone of the video keybind layer (`src/lib/video/keybindings.ts`) in its own
 * `reader` namespace: default bindings, localStorage-persisted overrides, a
 * KeyboardEvent → stable-token normalizer, and token → action resolution. Reused
 * by `useReaderKeybinds` and the reader's window keydown handler, and rebindable
 * from the Settings "Reader" panel's Keys tab.
 */

export type ReaderKeybindAction =
  | 'nextPage'
  | 'prevPage'
  | 'nextChapter'
  | 'prevChapter'
  | 'toggleFullscreen'
  | 'toggleDirection'
  | 'zoomIn'
  | 'zoomOut'
  | 'toggleComments'
  | 'reload';

export type ReaderKeybindMap = Record<ReaderKeybindAction, string>;

const STORAGE_KEY = 'tatakai.reader.keybinds';
export const READER_KEYBINDS_UPDATED_EVENT = 'tatakai-reader-keybinds-updated';

export const READER_KEYBIND_ACTIONS: { action: ReaderKeybindAction; label: string; hint: string }[] = [
  { action: 'nextPage', label: 'Next Page', hint: 'Scroll / advance one page' },
  { action: 'prevPage', label: 'Previous Page', hint: 'Scroll / go back one page' },
  { action: 'nextChapter', label: 'Next Chapter', hint: 'Jump to the next chapter' },
  { action: 'prevChapter', label: 'Previous Chapter', hint: 'Jump to the previous chapter' },
  { action: 'toggleFullscreen', label: 'Fullscreen', hint: 'Toggle fullscreen' },
  { action: 'toggleDirection', label: 'Reading Mode', hint: 'Toggle vertical / paged' },
  { action: 'zoomIn', label: 'Wider', hint: 'Increase page width' },
  { action: 'zoomOut', label: 'Narrower', hint: 'Decrease page width' },
  { action: 'toggleComments', label: 'Comments', hint: 'Toggle the comments drawer' },
  { action: 'reload', label: 'Reload', hint: 'Re-fetch the current chapter pages' },
];

export const DEFAULT_READER_KEYBINDS: ReaderKeybindMap = {
  nextPage: 'arrowright',
  prevPage: 'arrowleft',
  nextChapter: 'n',
  prevChapter: 'p',
  toggleFullscreen: 'f',
  toggleDirection: 'd',
  zoomIn: '=',
  zoomOut: '-',
  toggleComments: 'c',
  reload: 'r',
};

/** Turn a KeyboardEvent into a stable, comparable token (matches the video layer). */
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
    '=': '+',
    '-': '−',
  };
  if (map[token]) return map[token];
  return token.length === 1 ? token.toUpperCase() : token.charAt(0).toUpperCase() + token.slice(1);
}

function isReaderKeybindAction(value: string): value is ReaderKeybindAction {
  return value in DEFAULT_READER_KEYBINDS;
}

export function normalizeReaderKeybinds(raw: unknown): ReaderKeybindMap {
  const next: ReaderKeybindMap = { ...DEFAULT_READER_KEYBINDS };
  if (!raw || typeof raw !== 'object') return next;
  for (const [action, key] of Object.entries(raw as Record<string, unknown>)) {
    if (isReaderKeybindAction(action) && typeof key === 'string' && key.trim()) {
      next[action] = key.trim().toLowerCase();
    }
  }
  return next;
}

export function loadReaderKeybinds(): ReaderKeybindMap {
  if (typeof window === 'undefined') return { ...DEFAULT_READER_KEYBINDS };
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return { ...DEFAULT_READER_KEYBINDS };
    return normalizeReaderKeybinds(JSON.parse(stored));
  } catch {
    return { ...DEFAULT_READER_KEYBINDS };
  }
}

export function saveReaderKeybinds(map: ReaderKeybindMap): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
    window.dispatchEvent(new CustomEvent(READER_KEYBINDS_UPDATED_EVENT));
  } catch {
    // Ignore storage failures (quota, private mode).
  }
}

export function resetReaderKeybinds(): ReaderKeybindMap {
  const fresh = { ...DEFAULT_READER_KEYBINDS };
  saveReaderKeybinds(fresh);
  return fresh;
}

/** Assign `key` to `action`, clearing any other action that held it. */
export function assignReaderKeybind(
  map: ReaderKeybindMap,
  action: ReaderKeybindAction,
  key: string,
): ReaderKeybindMap {
  const token = key.trim().toLowerCase();
  const next: ReaderKeybindMap = { ...map };
  if (!token) return next;
  for (const a of Object.keys(next) as ReaderKeybindAction[]) {
    if (next[a] === token) next[a] = '';
  }
  next[action] = token;
  return next;
}

/** Resolve a pressed token to the action it triggers, or null. */
export function resolveReaderAction(map: ReaderKeybindMap, token: string): ReaderKeybindAction | null {
  if (!token) return null;
  for (const action of Object.keys(map) as ReaderKeybindAction[]) {
    if (map[action] === token) return action;
  }
  return null;
}
