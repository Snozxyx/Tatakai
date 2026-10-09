import { useEffect, useState } from 'react';

/**
 * Central store for the mobile app's device-level preferences.
 *
 * These live in the `tatakai_mobile_config` localStorage blob, which several
 * call sites already *read* directly (`lib/haptics.ts`, `MobileNav.tsx`,
 * `MainLayout.tsx`, `WatchPage.tsx`) but which — until now — only one place
 * ever *wrote* (`ReduceMotionPrompt.tsx`). This hook centralizes writes behind a
 * typed interface + `normalize` + a cross-tab `CustomEvent`, modeled on
 * `useReaderSettings` / `useVideoSettings`.
 *
 * Deliberately per-device (localStorage only, no guest cookie / account sync):
 * these are hardware/shell preferences — haptics, keep-awake, status-bar style,
 * orientation — that shouldn't follow an account between phones.
 *
 * `reduceMotion` is kept here as a *mirror* for surfaces that read the config
 * blob; the authoritative reduce-motion store is `useTheme` (keyed by
 * `tatakai_reduce_motion` + the `.reduce-motion` DOM class). The Mobile App
 * Settings panel drives `useTheme().setReduceMotion` and mirrors here, exactly
 * as `ReduceMotionPrompt` does.
 */

export type StatusBarStyle = 'auto' | 'light' | 'dark';
export type OrientationLock = 'auto' | 'portrait' | 'landscape';
export type KeyboardResizeMode = 'native' | 'body' | 'ionic' | 'none';
export type MobileLayout = 'focused' | 'classic';

export interface MobileConfig {
  // General
  hapticFeedback: boolean; // honored by lib/haptics.ts (single global gate)
  reduceMotion: boolean; // mirror of useTheme's reduce-motion preference
  keepScreenAwake: boolean; // hold a wake lock app-wide
  devMode: boolean; // expose developer affordances
  // Display & orientation
  mobileLayout: MobileLayout; // focused keeps mobile browsing consistent; classic preserves the prior shell
  statusBarStyle: StatusBarStyle; // 'auto' follows the app theme
  orientationLock: OrientationLock; // lock the whole app, or 'auto' to allow rotation
  forceLandscapeInPlayer: boolean; // rotate to landscape when a video opens
  keyboardResize: KeyboardResizeMode; // how the webview reacts to the soft keyboard
  // Notifications (local notifications; see lib/mobile/notifications.ts)
  downloadNotifications: boolean; // ongoing download-progress notification
  downloadCompleteNotifications: boolean; // completion notification
  generalNotifications: boolean; // route in-app notifications to the tray
  // Data & offline (mobile smooth-experience bundle)
  dataSaver: boolean; // cap quality, preload, autoplay on metered links
  autoDownloadNext: boolean; // queue the next episode/chapter when one finishes
  wifiOnlyDownloads: boolean; // only auto-download on unmetered WiFi
  autoEvictWatched: boolean; // free watched offline items when storage is tight
}

export const DEFAULT_MOBILE_CONFIG: MobileConfig = {
  hapticFeedback: true,
  reduceMotion: false,
  keepScreenAwake: false,
  devMode: false,
  mobileLayout: 'focused',
  statusBarStyle: 'auto',
  orientationLock: 'auto',
  forceLandscapeInPlayer: false,
  keyboardResize: 'native',
  downloadNotifications: true,
  downloadCompleteNotifications: true,
  generalNotifications: true,
  dataSaver: false,
  autoDownloadNext: false,
  wifiOnlyDownloads: true,
  autoEvictWatched: false,
};

const STORAGE_KEY = 'tatakai_mobile_config';
const UPDATE_EVENT = 'tatakai-mobile-config-updated';

const VALID_MOBILE_LAYOUTS = new Set<MobileLayout>(['focused', 'classic']);
const VALID_STATUS_BAR = new Set<StatusBarStyle>(['auto', 'light', 'dark']);
const VALID_ORIENTATION = new Set<OrientationLock>(['auto', 'portrait', 'landscape']);
const VALID_KEYBOARD = new Set<KeyboardResizeMode>(['native', 'body', 'ionic', 'none']);

const asBool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);

function normalizeConfig(raw: Partial<MobileConfig> | null | undefined): MobileConfig {
  return {
    ...DEFAULT_MOBILE_CONFIG,
    ...raw,
    hapticFeedback: asBool(raw?.hapticFeedback, DEFAULT_MOBILE_CONFIG.hapticFeedback),
    reduceMotion: asBool(raw?.reduceMotion, DEFAULT_MOBILE_CONFIG.reduceMotion),
    keepScreenAwake: asBool(raw?.keepScreenAwake, DEFAULT_MOBILE_CONFIG.keepScreenAwake),
    devMode: asBool(raw?.devMode, DEFAULT_MOBILE_CONFIG.devMode),
    mobileLayout: VALID_MOBILE_LAYOUTS.has(raw?.mobileLayout as MobileLayout)
      ? (raw!.mobileLayout as MobileLayout)
      : DEFAULT_MOBILE_CONFIG.mobileLayout,
    statusBarStyle: VALID_STATUS_BAR.has(raw?.statusBarStyle as StatusBarStyle)
      ? (raw!.statusBarStyle as StatusBarStyle)
      : DEFAULT_MOBILE_CONFIG.statusBarStyle,
    orientationLock: VALID_ORIENTATION.has(raw?.orientationLock as OrientationLock)
      ? (raw!.orientationLock as OrientationLock)
      : DEFAULT_MOBILE_CONFIG.orientationLock,
    forceLandscapeInPlayer: asBool(raw?.forceLandscapeInPlayer, DEFAULT_MOBILE_CONFIG.forceLandscapeInPlayer),
    keyboardResize: VALID_KEYBOARD.has(raw?.keyboardResize as KeyboardResizeMode)
      ? (raw!.keyboardResize as KeyboardResizeMode)
      : DEFAULT_MOBILE_CONFIG.keyboardResize,
    downloadNotifications: asBool(raw?.downloadNotifications, DEFAULT_MOBILE_CONFIG.downloadNotifications),
    downloadCompleteNotifications: asBool(
      raw?.downloadCompleteNotifications,
      DEFAULT_MOBILE_CONFIG.downloadCompleteNotifications,
    ),
    generalNotifications: asBool(raw?.generalNotifications, DEFAULT_MOBILE_CONFIG.generalNotifications),
    dataSaver: asBool(raw?.dataSaver, DEFAULT_MOBILE_CONFIG.dataSaver),
    autoDownloadNext: asBool(raw?.autoDownloadNext, DEFAULT_MOBILE_CONFIG.autoDownloadNext),
    wifiOnlyDownloads: asBool(raw?.wifiOnlyDownloads, DEFAULT_MOBILE_CONFIG.wifiOnlyDownloads),
    autoEvictWatched: asBool(raw?.autoEvictWatched, DEFAULT_MOBILE_CONFIG.autoEvictWatched),
  };
}

const configsEqual = (left: MobileConfig, right: MobileConfig) =>
  (Object.keys(DEFAULT_MOBILE_CONFIG) as Array<keyof MobileConfig>).every((key) => left[key] === right[key]);

export function loadMobileConfig(): MobileConfig {
  if (typeof window === 'undefined') return DEFAULT_MOBILE_CONFIG;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return DEFAULT_MOBILE_CONFIG;
    return normalizeConfig(JSON.parse(stored) as Partial<MobileConfig>);
  } catch {
    return DEFAULT_MOBILE_CONFIG;
  }
}

/**
 * Merge a patch into the stored config and persist. Re-reads the current blob
 * first so a write never clobbers a key another surface set (e.g. the reduce-
 * motion prompt). Safe to call outside React.
 */
export function patchMobileConfig(patch: Partial<MobileConfig>): MobileConfig {
  const next = normalizeConfig({ ...loadMobileConfig(), ...patch });
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
  } catch {
    /* ignore quota / serialization errors */
  }
  return next;
}

export function useMobileConfig() {
  const [config, setConfig] = useState<MobileConfig>(() => loadMobileConfig());

  useEffect(() => {
    const sync = () => {
      const next = loadMobileConfig();
      setConfig((prev) => (configsEqual(prev, next) ? prev : next));
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== STORAGE_KEY) return;
      sync();
    };
    window.addEventListener('storage', handleStorage);
    window.addEventListener(UPDATE_EVENT, sync);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(UPDATE_EVENT, sync);
    };
  }, []);

  const updateConfig = (patch: Partial<MobileConfig>) => {
    // Build from the live state (not a storage re-read) and bail when nothing
    // changed: every toggle previously allocated a new object + sync-broadcast,
    // re-rendering this panel and every other subscriber even for no-ops.
    // The broadcast is deferred so the toggle animation paints first.
    setConfig((prev) => {
      const next = normalizeConfig({ ...prev, ...patch });
      if (configsEqual(prev, next)) return prev;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore quota / serialization errors */
      }
      queueMicrotask(() => {
        try {
          window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
        } catch {
          /* ignore */
        }
      });
      return next;
    });
  };

  const resetConfig = () => {
    setConfig((prev) => {
      if (configsEqual(prev, DEFAULT_MOBILE_CONFIG)) return prev;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_MOBILE_CONFIG));
      } catch {
        /* ignore */
      }
      queueMicrotask(() => {
        try {
          window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
        } catch {
          /* ignore */
        }
      });
      return normalizeConfig(DEFAULT_MOBILE_CONFIG);
    });
  };

  return { config, updateConfig, resetConfig };
}
