import { useCallback, useState, type SetStateAction } from 'react';

/** Small drafts survive route unmounts; a changed key never reuses another user's draft. */
export function usePersistentState<T>(key: string | null, initial: T, storage: 'session' | 'local' = 'session') {
  const read = (draftKey: string | null): T => {
    try {
      const raw = draftKey && window[`${storage}Storage`].getItem(draftKey);
      return raw ? JSON.parse(raw) as T : initial;
    } catch { return initial; }
  };
  const [state, setState] = useState(() => ({ key, value: read(key) }));
  let value = state.value;
  if (state.key !== key) {
    value = read(key);
    setState({ key, value });
  }
  const update = useCallback((next: SetStateAction<T>) => {
    setState(previous => {
      const value = typeof next === 'function'
        ? (next as (value: T) => T)(previous.value) : next;
      try {
        if (key) window[`${storage}Storage`].setItem(key, JSON.stringify(value));
      } catch { /* Private mode / full storage must not prevent editing. */ }
      return { key, value };
    });
  }, [key, storage]);
  return [value, update] as const;
}
