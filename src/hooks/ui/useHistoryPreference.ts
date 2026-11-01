import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { useLocation } from 'react-router-dom';

/** UI filters belong to a browser history entry, rather than the whole session. */
export function useHistoryPreference<T>(name: string, initial: T | (() => T)): [T, Dispatch<SetStateAction<T>>] {
  const location = useLocation();
  const key = `tatakai-history:${location.key}:${location.pathname}:${location.search}:${name}`;
  const read = (): T => {
    try { const raw = sessionStorage.getItem(key); if (raw !== null) return JSON.parse(raw); } catch { /* storage unavailable */ }
    return typeof initial === 'function' ? (initial as () => T)() : initial;
  };
  const [slot, setSlot] = useState(() => ({ key, value: read() }));
  const current = slot.key === key ? slot : { key, value: read() };
  if (slot.key !== key) setSlot(current);
  useEffect(() => { try { sessionStorage.setItem(key, JSON.stringify(current.value)); } catch { /* storage unavailable */ } }, [key, current.value]);
  return [current.value, action => setSlot(previous => {
    const value = previous.key === key ? previous.value : read();
    return { key, value: typeof action === 'function' ? (action as (previous: T) => T)(value) : action };
  })];
}
