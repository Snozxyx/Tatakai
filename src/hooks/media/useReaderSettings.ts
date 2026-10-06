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

export type ReaderReadingMode = 'vertical' | 'paged';
export type ReaderSizing = 'clamp' | 'natural';
export type ReaderProgressIndicator = 'page' | 'chapter';
export type ReaderPreloading = 'none' | 'partial' | 'full';
export type ReaderLoadingMethod = 'native' | 'blob';
export type ReaderLoadingStrategy = 'eager' | 'lazy';
export type ReaderDirection = 'ltr' | 'rtl';
export type ReaderPageFit = 'width' | 'height' | 'both' | 'original';

export interface ReaderSettings {
  readingMode: ReaderReadingMode; // vertical = infinite webtoon scroll; paged = one page at a time
  readingDirection: ReaderDirection; // paged tap-zone / spread direction (rtl = manga)
  widthPercent: number; // 30..100, page width within the reader column
  sizing: ReaderSizing; // clamp to widthPercent vs render at natural size
  pageFit: ReaderPageFit; // paged mode: fit page to width / height / both / original
  zoom: number; // 50..300, user zoom multiplier (pinch / ctrl-wheel / keybinds)
  maxWidthPx: number; // 0 = off, else cap page width in px (large screens)
  doublePage: boolean; // paged mode: two-page spread
  gap: number; // 0..48 px vertical gap between pages
  brightness: number; // 20..100, dim the pages
  clickToTurn: boolean; // left/right tap zones turn pages (paged mode)
  zoomWithWheel: boolean; // ctrl+wheel / trackpad pinch to zoom
  keepScreenAwake: boolean; // hold a wake lock while reading
  continuousScroll: boolean; // vertical mode: load the next chapter at the end / previous at the top so reading never stops
  autoScroll: boolean; // auto-advance scroll (vertical mode)
  autoScrollSpeed: number; // 1..10
  progressIndicator: ReaderProgressIndicator;
  showProgressBar: boolean;
  showComments: boolean;
  autoFullscreen: boolean; // enter fullscreen when the reader opens
  hideChromeInFullscreen: boolean; // auto-hide reader chrome (and app header/tray) in fullscreen
  showNotifications: boolean;
  showCaptureButton: boolean;
  showReloadButton: boolean;
  backgroundColor: string; // hex, reader page background
  preloading: ReaderPreloading;
  loadingMethod: ReaderLoadingMethod;
  loadingStrategy: ReaderLoadingStrategy;
  panelCrop: boolean; // small phones: full-bleed pages (vertical) / height-fit (paged)
}

const DEFAULT_SETTINGS: ReaderSettings = {
  readingMode: 'vertical',
  readingDirection: 'ltr',
  widthPercent: 70,
  sizing: 'clamp',
  pageFit: 'width',
  zoom: 100,
  maxWidthPx: 0,
  doublePage: false,
  gap: 0,
  brightness: 100,
  clickToTurn: true,
  zoomWithWheel: true,
  keepScreenAwake: false,
  continuousScroll: true,
  autoScroll: false,
  autoScrollSpeed: 4,
  progressIndicator: 'page',
  showProgressBar: true,
  showComments: true,
  autoFullscreen: false,
  hideChromeInFullscreen: true,
  showNotifications: true,
  showCaptureButton: true,
  showReloadButton: true,
  backgroundColor: '#0a0a0f',
  preloading: 'partial',
  loadingMethod: 'native',
  loadingStrategy: 'lazy',
  panelCrop: false,
};

const STORAGE_KEY = 'reader-settings';
const UPDATE_EVENT = 'tatakai-reader-settings-updated';

const VALID_MODES = new Set<ReaderReadingMode>(['vertical', 'paged']);
const VALID_DIRECTION = new Set<ReaderDirection>(['ltr', 'rtl']);
const VALID_PAGE_FIT = new Set<ReaderPageFit>(['width', 'height', 'both', 'original']);
const VALID_SIZING = new Set<ReaderSizing>(['clamp', 'natural']);
const VALID_PROGRESS = new Set<ReaderProgressIndicator>(['page', 'chapter']);
const VALID_PRELOADING = new Set<ReaderPreloading>(['none', 'partial', 'full']);
const VALID_METHOD = new Set<ReaderLoadingMethod>(['native', 'blob']);
const VALID_STRATEGY = new Set<ReaderLoadingStrategy>(['eager', 'lazy']);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const asBool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
const isHexColor = (value: unknown): value is string =>
  typeof value === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);
const asNum = (value: unknown, fallback: number) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

const normalizeSettings = (raw: Partial<ReaderSettings> | null | undefined): ReaderSettings => ({
  ...DEFAULT_SETTINGS,
  ...raw,
  readingMode: VALID_MODES.has(raw?.readingMode as ReaderReadingMode)
    ? (raw!.readingMode as ReaderReadingMode)
    : DEFAULT_SETTINGS.readingMode,
  readingDirection: VALID_DIRECTION.has(raw?.readingDirection as ReaderDirection)
    ? (raw!.readingDirection as ReaderDirection)
    : DEFAULT_SETTINGS.readingDirection,
  widthPercent: clamp(asNum(raw?.widthPercent, DEFAULT_SETTINGS.widthPercent), 30, 100),
  sizing: VALID_SIZING.has(raw?.sizing as ReaderSizing) ? (raw!.sizing as ReaderSizing) : DEFAULT_SETTINGS.sizing,
  pageFit: VALID_PAGE_FIT.has(raw?.pageFit as ReaderPageFit)
    ? (raw!.pageFit as ReaderPageFit)
    : DEFAULT_SETTINGS.pageFit,
  zoom: clamp(asNum(raw?.zoom, DEFAULT_SETTINGS.zoom), 50, 300),
  maxWidthPx: clamp(asNum(raw?.maxWidthPx, DEFAULT_SETTINGS.maxWidthPx), 0, 5000),
  doublePage: asBool(raw?.doublePage, DEFAULT_SETTINGS.doublePage),
  gap: clamp(asNum(raw?.gap, DEFAULT_SETTINGS.gap), 0, 48),
  brightness: clamp(asNum(raw?.brightness, DEFAULT_SETTINGS.brightness), 20, 100),
  clickToTurn: asBool(raw?.clickToTurn, DEFAULT_SETTINGS.clickToTurn),
  zoomWithWheel: asBool(raw?.zoomWithWheel, DEFAULT_SETTINGS.zoomWithWheel),
  keepScreenAwake: asBool(raw?.keepScreenAwake, DEFAULT_SETTINGS.keepScreenAwake),
  continuousScroll: asBool(raw?.continuousScroll, DEFAULT_SETTINGS.continuousScroll),
  autoScroll: asBool(raw?.autoScroll, DEFAULT_SETTINGS.autoScroll),
  autoScrollSpeed: clamp(asNum(raw?.autoScrollSpeed, DEFAULT_SETTINGS.autoScrollSpeed), 1, 10),
  progressIndicator: VALID_PROGRESS.has(raw?.progressIndicator as ReaderProgressIndicator)
    ? (raw!.progressIndicator as ReaderProgressIndicator)
    : DEFAULT_SETTINGS.progressIndicator,
  showProgressBar: asBool(raw?.showProgressBar, DEFAULT_SETTINGS.showProgressBar),
  showComments: asBool(raw?.showComments, DEFAULT_SETTINGS.showComments),
  autoFullscreen: asBool(raw?.autoFullscreen, DEFAULT_SETTINGS.autoFullscreen),
  hideChromeInFullscreen: asBool(raw?.hideChromeInFullscreen, DEFAULT_SETTINGS.hideChromeInFullscreen),
  showNotifications: asBool(raw?.showNotifications, DEFAULT_SETTINGS.showNotifications),
  showCaptureButton: asBool(raw?.showCaptureButton, DEFAULT_SETTINGS.showCaptureButton),
  showReloadButton: asBool(raw?.showReloadButton, DEFAULT_SETTINGS.showReloadButton),
  backgroundColor: isHexColor(raw?.backgroundColor) ? raw!.backgroundColor! : DEFAULT_SETTINGS.backgroundColor,
  preloading: VALID_PRELOADING.has(raw?.preloading as ReaderPreloading)
    ? (raw!.preloading as ReaderPreloading)
    : DEFAULT_SETTINGS.preloading,
  loadingMethod: VALID_METHOD.has(raw?.loadingMethod as ReaderLoadingMethod)
    ? (raw!.loadingMethod as ReaderLoadingMethod)
    : DEFAULT_SETTINGS.loadingMethod,
  loadingStrategy: VALID_STRATEGY.has(raw?.loadingStrategy as ReaderLoadingStrategy)
    ? (raw!.loadingStrategy as ReaderLoadingStrategy)
    : DEFAULT_SETTINGS.loadingStrategy,
  panelCrop: asBool(raw?.panelCrop, DEFAULT_SETTINGS.panelCrop),
});

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
  writeGuestSettingsCookie({ reader: settings as unknown as Record<string, unknown> });
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
};

export function useReaderSettings() {
  const { user, profile } = useAuth();
  const [settings, setSettings] = useState<ReaderSettings>(() => loadSettingsFromStorage());
  const seededAccountRef = useRef<string | null>(null);

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
    if (!accountReaderSettings || typeof accountReaderSettings !== 'object') return;
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
      reader: settings as unknown as Record<string, unknown>,
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

  const updateSetting = <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      if (user?.id) {
        void saveAccountSettingsPatch(user.id, {
          reader: next as unknown as Record<string, unknown>,
        }).catch(() => undefined);
      }
      return next;
    });
  };

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
    if (user?.id) {
      void saveAccountSettingsPatch(user.id, {
        reader: DEFAULT_SETTINGS as unknown as Record<string, unknown>,
      }).catch(() => undefined);
    }
  };

  return { settings, updateSetting, resetSettings, DEFAULT_READER_SETTINGS: DEFAULT_SETTINGS };
}

export { DEFAULT_SETTINGS as DEFAULT_READER_SETTINGS };

