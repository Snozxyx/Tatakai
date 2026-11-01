import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { readProfileAppSettings, saveAccountSettingsPatch } from '@/lib/appSettingsPersistence';
import { DEFAULT_READER_SETTINGS, normalizeSettings, type ReaderSettings } from './useReaderSettings';

export { normalizeReaderPresets } from '@/lib/reader/presets';
import { normalizeReaderPresets, type ReaderPresets } from '@/lib/reader/presets';
export type { ReaderPreset, ReaderPresets } from '@/lib/reader/presets';
const KEY = 'tatakai-reader-presets-v1';
const EVENT = 'tatakai-reader-presets-updated';
function read(): ReaderPresets {
  try { return normalizeReaderPresets(JSON.parse(localStorage.getItem(KEY) || 'null')); }
  catch { return normalizeReaderPresets(null); }
}
export function useReaderPresets(apply: (settings: ReaderSettings) => void) {
  const { user, profile } = useAuth();
  const [state, setState] = useState(read);
  const commit = (next: ReaderPresets) => {
    localStorage.setItem(KEY, JSON.stringify(next)); setState(next);
    window.dispatchEvent(new Event(EVENT));
    if (user) void saveAccountSettingsPatch(user.id, { readerPresets: next }).catch(() => undefined);
  };
  useEffect(() => {
    const sync = () => setState(read());
    window.addEventListener(EVENT, sync); window.addEventListener('storage', sync);
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener('storage', sync); };
  }, []);
  useEffect(() => {
    const remote = normalizeReaderPresets(readProfileAppSettings(profile).readerPresets);
    if (remote.updatedAt > read().updatedAt) {
      localStorage.setItem(KEY, JSON.stringify(remote)); setState(remote); window.dispatchEvent(new Event(EVENT));
    }
  }, [profile?.app_settings]);
  return {
    ...state,
    presets: [{ id: 'default', name: 'Default', settings: DEFAULT_READER_SETTINGS }, ...state.items],
    select: (id: string) => {
      const preset = id === 'default' ? DEFAULT_READER_SETTINGS : state.items.find(item => item.id === id)?.settings;
      if (!preset) return;
      apply(preset); commit({ ...state, active: id, updatedAt: Date.now() });
    },
    save: (name: string, settings: ReaderSettings, id?: string) => {
      if (!name.trim() || id === 'default') return;
      const item = { id: id || crypto.randomUUID(), name: name.trim().slice(0, 80), settings: normalizeSettings(settings) };
      commit({ active: item.id, items: [...state.items.filter(p => p.id !== item.id), item], updatedAt: Date.now() });
    },
    remove: (id: string) => {
      if (id === 'default') return;
      if (state.active === id) apply(DEFAULT_READER_SETTINGS);
      commit({ ...state, active: state.active === id ? 'default' : state.active, items: state.items.filter(p => p.id !== id), updatedAt: Date.now() });
    },
  };
}
