import { DEFAULT_SETTINGS, normalizeSettings, type ReaderSettings } from '@/lib/reader/settings';
export * from '@/lib/reader/settings';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  readGuestSettingsFromCookie,
  readProfileAppSettings,
  saveAccountSettingsPatch,
  writeGuestSettingsCookie,
} from '@/lib/appSettingsPersistence';

// Global manga-reader preferences. Mirrors `useVideoSettings` exactly (flat
// interface + DEFAULTS + normalize/clamp + localStorage + guest cookie + account
// patch + cross-tab UPDATE_EVENT) so the reader (MangaReaderPage) and the
// Settings "Reader" panel share one source of truth. Per-device, like video.

const STORAGE_KEY = 'reader-settings';
const UPDATE_EVENT = 'tatakai-reader-settings-updated';
const REVISION_KEY = 'tatakai-reader-settings-revision';
const localRevision = () => { try { return Number(localStorage.getItem(REVISION_KEY)) || 0; } catch { return 0; } };
const markEdited = () => { try { localStorage.setItem(REVISION_KEY, String(Date.now())); } catch { /* in-memory preferences still work */ } };

const areSettingsEqual = (left: ReaderSettings, right: ReaderSettings) =>
  (Object.keys(DEFAULT_SETTINGS) as Array<keyof ReaderSettings>).every((key) => left[key] === right[key]);

// PLACEHOLDER_STORAGE_FNS

function loadSettingsFromStorage(): ReaderSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      const cookieSettings = readGuestSettingsFromCookie().reader;
      if (!cookieSettings || typeof cookieSettings !== 'object') return DEFAULT_SETTINGS;
      return normalizeSettings(cookieSettings as Partial<ReaderSettings>);
    }
    return normalizeSettings(JSON.parse(stored) as Partial<ReaderSettings>);
  } catch (e) {
    console.error('Failed to load reader settings:', e);
    return DEFAULT_SETTINGS;
  }
}

const persistLocalReaderSettings = (settings: ReaderSettings) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  writeGuestSettingsCookie({ reader: { ...settings, __updatedAt: localRevision() } as unknown as Record<string, unknown> });
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
};

export function useReaderSettings() {
  const { user, profile } = useAuth();
  const [settings, setSettings] = useState<ReaderSettings>(() => loadSettingsFromStorage());
  const seededAccountRef = useRef<string | null>(null);
  const editedRef = useRef(false);
  const hadLocalSettings = useRef(localStorage.getItem(STORAGE_KEY) !== null);

  const accountReaderSettings = useMemo(
    () => readProfileAppSettings(profile).reader,
    [profile?.app_settings],
  );

  useEffect(() => {
    try {
      persistLocalReaderSettings(settings);
    } catch (e) {
      console.error('Failed to save reader settings:', e);
    }
  }, [settings]);

  useEffect(() => {
    if (!user?.id) return;
    if (editedRef.current || !accountReaderSettings || typeof accountReaderSettings !== 'object') return;
    const remoteRevision = Number(accountReaderSettings.__updatedAt) || 0;
    if (hadLocalSettings.current && remoteRevision <= localRevision()) return;
    if (remoteRevision) localStorage.setItem(REVISION_KEY, String(remoteRevision));
    const next = normalizeSettings(accountReaderSettings as Partial<ReaderSettings>);
    setSettings((previous) => (areSettingsEqual(previous, next) ? previous : next));
  }, [user?.id, accountReaderSettings]);

  useEffect(() => {
    if (!user?.id) {
      seededAccountRef.current = null;
      return;
    }
    if (accountReaderSettings && typeof accountReaderSettings === 'object') {
      seededAccountRef.current = user.id;
      return;
    }
    if (seededAccountRef.current === user.id) return;
    seededAccountRef.current = user.id;
    void saveAccountSettingsPatch(user.id, {
      reader: { ...settings, __updatedAt: localRevision() } as unknown as Record<string, unknown>,
    }).catch(() => {
      seededAccountRef.current = null;
    });
  }, [user?.id, accountReaderSettings, settings]);

  useEffect(() => {
    const syncSettings = () => {
      const next = loadSettingsFromStorage();
      setSettings((previous) => (areSettingsEqual(previous, next) ? previous : next));
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== STORAGE_KEY) return;
      syncSettings();
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener(UPDATE_EVENT, syncSettings);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(UPDATE_EVENT, syncSettings);
    };
  }, []);

  const currentSettingsRef = useRef(settings);
  currentSettingsRef.current = settings;
  const updateSetting = <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => {
    editedRef.current = true;
    markEdited();
    const next = normalizeSettings({ ...currentSettingsRef.current, [key]: value });
    currentSettingsRef.current = next;
    persistLocalReaderSettings(next);
    setSettings(next);
    if (user?.id) void saveAccountSettingsPatch(user.id, { reader: { ...next, __updatedAt: localRevision() } as unknown as Record<string, unknown> }).catch(() => undefined);
  };

  const replaceSettings = (value: Partial<ReaderSettings>) => {
    editedRef.current = true;
    markEdited();
    const next = normalizeSettings(value);
    persistLocalReaderSettings(next);
    setSettings(next);
    if (user?.id) void saveAccountSettingsPatch(user.id, { reader: { ...next, __updatedAt: localRevision() } as unknown as Record<string, unknown> }).catch(() => undefined);
  };

  const resetSettings = () => {
    editedRef.current = true;
    markEdited();
    persistLocalReaderSettings(DEFAULT_SETTINGS);
    setSettings(DEFAULT_SETTINGS);
    if (user?.id) {
      void saveAccountSettingsPatch(user.id, {
        reader: { ...DEFAULT_SETTINGS, __updatedAt: localRevision() } as unknown as Record<string, unknown>,
      }).catch(() => undefined);
    }
  };

  return { settings, updateSetting, replaceSettings, resetSettings, DEFAULT_READER_SETTINGS: DEFAULT_SETTINGS };
}

export { DEFAULT_SETTINGS as DEFAULT_READER_SETTINGS };

