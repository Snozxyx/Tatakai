import { useSyncExternalStore } from 'react';

export type MediaCardStyle = 'poster' | 'overlay';
const key = 'tatakai_media_card_style';
const event = 'tatakai-media-card-style';
const snapshot = (): MediaCardStyle => localStorage.getItem(key) === 'poster' ? 'poster' : 'overlay';
const subscribe = (notify: () => void) => {
  const storage = (change: StorageEvent) => { if (change.key === key || change.key === null) notify(); };
  window.addEventListener(event, notify);
  window.addEventListener('storage', storage);
  return () => { window.removeEventListener(event, notify); window.removeEventListener('storage', storage); };
};
export function useMediaCardStyle() {
  const style = useSyncExternalStore(subscribe, snapshot, () => 'overlay' as const);
  return { style, setStyle: (value: MediaCardStyle) => {
    localStorage.setItem(key, value);
    window.dispatchEvent(new Event(event));
  } };
}
