import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  readGuestSettingsFromCookie,
  readProfileAppSettings,
  saveAccountSettingsPatch,
  writeGuestSettingsCookie,
} from '@/lib/appSettingsPersistence';

export interface VideoSettings {
  defaultQuality: 'auto' | '1080p' | '720p' | '480p' | '360p';
  autoplay: boolean;
  subtitleLanguage:
    | 'off'
    | 'english'
    | 'spanish'
    | 'french'
    | 'german'
    | 'japanese'
    | 'portuguese'
    | 'arabic'
    | 'hindi'
    | 'auto';
  playbackSpeed: number;
  volume: number;
  autoSkipIntro: boolean;
  autoNextEpisode: boolean;
  // Subtitle styling
  subtitleSize: 'small' | 'medium' | 'large' | 'xlarge';
  subtitleFont: 'default' | 'serif' | 'mono' | 'comic';
  subtitleBackground: 'none' | 'semi' | 'solid';
}

const DEFAULT_SETTINGS: VideoSettings = {
  defaultQuality: 'auto',
  autoplay: true,
  subtitleLanguage: 'auto',
  playbackSpeed: 1,
  volume: 1,
  autoSkipIntro: false,
  autoNextEpisode: true,
  subtitleSize: 'medium',
  subtitleFont: 'default',
  subtitleBackground: 'semi',
};

const STORAGE_KEY = 'video-player-settings';
const UPDATE_EVENT = 'tatakai-video-settings-updated';
const VALID_DEFAULT_QUALITIES = new Set(['auto', '1080p', '720p', '480p', '360p']);
const VALID_SUBTITLE_LANGUAGES = new Set([
  'off',
  'english',
  'spanish',
  'french',
  'german',
  'japanese',
  'portuguese',
  'arabic',
  'hindi',
  'auto',
]);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const normalizeSettings = (raw: Partial<VideoSettings> & { autoPlayNext?: boolean } | null | undefined): VideoSettings => {
  const autoNextEpisode =
    typeof raw?.autoNextEpisode === 'boolean'
      ? raw.autoNextEpisode
      : typeof raw?.autoPlayNext === 'boolean'
        ? raw.autoPlayNext
        : DEFAULT_SETTINGS.autoNextEpisode;

  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    defaultQuality: VALID_DEFAULT_QUALITIES.has(String(raw?.defaultQuality))
      ? (raw?.defaultQuality as VideoSettings['defaultQuality'])
      : DEFAULT_SETTINGS.defaultQuality,
    subtitleLanguage: VALID_SUBTITLE_LANGUAGES.has(String(raw?.subtitleLanguage))
      ? (raw?.subtitleLanguage as VideoSettings['subtitleLanguage'])
      : DEFAULT_SETTINGS.subtitleLanguage,
    playbackSpeed: clamp(
      Number.isFinite(Number(raw?.playbackSpeed)) ? Number(raw?.playbackSpeed) : DEFAULT_SETTINGS.playbackSpeed,
      0.1,
      3,
    ),
    volume: clamp(
      Number.isFinite(Number(raw?.volume)) ? Number(raw?.volume) : DEFAULT_SETTINGS.volume,
      0,
      1,
    ),
    autoplay: typeof raw?.autoplay === 'boolean' ? raw.autoplay : DEFAULT_SETTINGS.autoplay,
    autoSkipIntro: typeof raw?.autoSkipIntro === 'boolean' ? raw.autoSkipIntro : DEFAULT_SETTINGS.autoSkipIntro,
    autoNextEpisode,
  };
};

const areSettingsEqual = (left: VideoSettings, right: VideoSettings) =>
  left.defaultQuality === right.defaultQuality &&
  left.autoplay === right.autoplay &&
  left.subtitleLanguage === right.subtitleLanguage &&
  left.playbackSpeed === right.playbackSpeed &&
  left.volume === right.volume &&
  left.autoSkipIntro === right.autoSkipIntro &&
  left.autoNextEpisode === right.autoNextEpisode &&
  left.subtitleSize === right.subtitleSize &&
  left.subtitleFont === right.subtitleFont &&
  left.subtitleBackground === right.subtitleBackground;

function loadSettingsFromStorage(): VideoSettings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      const cookieSettings = readGuestSettingsFromCookie().video;
      if (!cookieSettings || typeof cookieSettings !== 'object') return DEFAULT_SETTINGS;
      return normalizeSettings(cookieSettings as Partial<VideoSettings> & { autoPlayNext?: boolean });
    }
    const parsed = JSON.parse(stored) as Partial<VideoSettings> & { autoPlayNext?: boolean };
    return normalizeSettings(parsed);
  } catch (e) {
    console.error('Failed to load video settings:', e);
    const cookieSettings = readGuestSettingsFromCookie().video;
    if (!cookieSettings || typeof cookieSettings !== 'object') return DEFAULT_SETTINGS;
    return normalizeSettings(cookieSettings as Partial<VideoSettings> & { autoPlayNext?: boolean });
  }
}

const persistLocalVideoSettings = (settings: VideoSettings) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  writeGuestSettingsCookie({ video: settings as unknown as Record<string, unknown> });
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
};

export function useVideoSettings() {
  const { user, profile } = useAuth();
  const [settings, setSettings] = useState<VideoSettings>(() => loadSettingsFromStorage());
  const seededAccountRef = useRef<string | null>(null);

  const accountVideoSettings = useMemo(
    () => readProfileAppSettings(profile).video,
    [profile?.app_settings],
  );

  useEffect(() => {
    try {
      persistLocalVideoSettings(settings);
    } catch (e) {
      console.error('Failed to save video settings:', e);
    }
  }, [settings]);

  useEffect(() => {
    if (!user?.id) return;
    if (!accountVideoSettings || typeof accountVideoSettings !== 'object') return;

    const next = normalizeSettings(accountVideoSettings as Partial<VideoSettings> & { autoPlayNext?: boolean });
    setSettings((previous) => (areSettingsEqual(previous, next) ? previous : next));
  }, [user?.id, accountVideoSettings]);

  useEffect(() => {
    if (!user?.id) {
      seededAccountRef.current = null;
      return;
    }

    if (accountVideoSettings && typeof accountVideoSettings === 'object') {
      seededAccountRef.current = user.id;
      return;
    }

    if (seededAccountRef.current === user.id) return;
    seededAccountRef.current = user.id;

    void saveAccountSettingsPatch(user.id, {
      video: settings as unknown as Record<string, unknown>,
    }).catch(() => {
      seededAccountRef.current = null;
    });
  }, [user?.id, accountVideoSettings, settings]);

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

  const updateSetting = <K extends keyof VideoSettings>(
    key: K,
    value: VideoSettings[K]
  ) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      if (user?.id) {
        void saveAccountSettingsPatch(user.id, {
          video: next as unknown as Record<string, unknown>,
        }).catch(() => undefined);
      }
      return next;
    });
  };

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
    if (user?.id) {
      void saveAccountSettingsPatch(user.id, {
        video: DEFAULT_SETTINGS as unknown as Record<string, unknown>,
      }).catch(() => undefined);
    }
  };

  return {
    settings,
    updateSetting,
    resetSettings,
  };
}
