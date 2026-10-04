import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * Global controller for the Discord-style settings popup.
 *
 * Settings used to be a route (`/settings`); it is now a single modal mounted
 * once in the layout. Anything that used to `navigate("/settings?tab=x")` now
 * calls `openSettings("x")`. The `/settings` route still exists as a thin
 * opener so external/bookmarked deep-links keep working.
 */

export type SettingsCategoryId =
  | 'account'
  | 'saved'
  | 'privacy'
  | 'integrations'
  | 'appearance'
  | 'display'
  | 'player'
  | 'reader'
  | 'app'
  | 'mobile'
  | 'extensions'
  | 'about'
  | 'changelog';

const DEFAULT_CATEGORY: SettingsCategoryId = 'account';

/** Legacy `?tab=` values that don't match a category id 1:1. */
const TAB_ALIASES: Record<string, SettingsCategoryId> = {
  desktop: 'app',
  appsettings: 'app',
  mobileapp: 'mobile',
  mobilesettings: 'mobile',
  videoplayer: 'player',
  video: 'player',
  integration: 'integrations',
  savedcontent: 'saved',
  manga: 'reader',
  mangareader: 'reader',
  reading: 'reader',
};

export function normalizeSettingsCategory(value?: string | null): SettingsCategoryId {
  if (!value) return DEFAULT_CATEGORY;
  const key = value.trim().toLowerCase();
  if (key in TAB_ALIASES) return TAB_ALIASES[key];
  const known: SettingsCategoryId[] = [
    'account', 'saved', 'privacy', 'integrations', 'appearance',
    'display', 'player', 'reader', 'app', 'mobile', 'extensions', 'about', 'changelog',
  ];
  return (known as string[]).includes(key) ? (key as SettingsCategoryId) : DEFAULT_CATEGORY;
}

interface SettingsModalContextValue {
  open: boolean;
  category: SettingsCategoryId;
  /** Optional sub-anchor a caller wants scrolled into view once the panel mounts. */
  section?: string;
  openSettings: (category?: string, section?: string) => void;
  closeSettings: () => void;
  setCategory: (category: SettingsCategoryId) => void;
}

const SettingsModalContext = createContext<SettingsModalContextValue | null>(null);

export function SettingsModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [category, setCategoryState] = useState<SettingsCategoryId>(DEFAULT_CATEGORY);
  const [section, setSection] = useState<string | undefined>(undefined);

  const openSettings = useCallback((next?: string, nextSection?: string) => {
    setCategoryState(normalizeSettingsCategory(next));
    setSection(nextSection);
    setOpen(true);
  }, []);

  const closeSettings = useCallback(() => {
    setOpen(false);
    setSection(undefined);
  }, []);

  const setCategory = useCallback((next: SettingsCategoryId) => {
    setCategoryState(next);
    setSection(undefined);
  }, []);

  const value = useMemo(
    () => ({ open, category, section, openSettings, closeSettings, setCategory }),
    [open, category, section, openSettings, closeSettings, setCategory],
  );

  return <SettingsModalContext.Provider value={value}>{children}</SettingsModalContext.Provider>;
}

export function useSettingsModal() {
  const ctx = useContext(SettingsModalContext);
  if (!ctx) {
    throw new Error('useSettingsModal must be used within a SettingsModalProvider');
  }
  return ctx;
}
