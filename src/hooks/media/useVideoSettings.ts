import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  readGuestSettingsFromCookie,
  readProfileAppSettings,
  saveAccountSettingsPatch,
  writeGuestSettingsCookie,
} from '@/lib/appSettingsPersistence';

export type Anime4KPreset =
  | 'off'
  | 'light' // Restore CNN S + Upscale CNN x2 S — cheap sharpen/upscale
  | 'standard' // Restore CNN M + Upscale CNN x2 M
  | 'high'; // Denoise + Restore CNN M + Upscale CNN x2 M

export type SleepTimerOption = 'off' | '15' | '30' | '45' | '60' | 'end-of-episode';

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
    | 'korean'
    | 'chinese'
    | 'thai'
    | 'indonesian'
    | 'vietnamese'
    | 'italian'
    | 'russian'
    | 'turkish'
    | 'dutch'
    | 'polish'
    | 'auto'
    | string;
  playbackSpeed: number;
  volume: number;
  autoSkipIntro: boolean;
  autoNextEpisode: boolean;
  autoNextCountdownSeconds: number; // Up-Next countdown length before auto-advance
  // Subtitle styling
  subtitleSize: 'small' | 'medium' | 'large' | 'xlarge';
  subtitleFont: 'default' | 'serif' | 'mono' | 'comic' | 'custom';
  subtitleBackground: 'none' | 'semi' | 'solid';
  subtitleColor: string; // hex text color
  subtitleOpacity: number; // backdrop opacity 0..1
  subtitleOutline: boolean; // draw text outline/shadow
  subtitlePosition: number; // vertical offset from bottom, 0..40 (vh-ish steps)
  subtitleOffset: number; // manual sync offset in seconds, negative = earlier
  alwaysUseExternalPlayer: boolean;
  // Playback modes / player behavior
  loopVideo: boolean;
  ambientMode: boolean; // ambient glow behind player
  stableVolume: boolean; // dynamic-range compression via WebAudio
  theaterMode: boolean; // wide layout
  sleepTimer: SleepTimerOption;
  // Anime4K upscaling
  anime4kPreset: Anime4KPreset;
}

const DEFAULT_SETTINGS: VideoSettings = {
  defaultQuality: 'auto',
  autoplay: true,
  subtitleLanguage: 'english',
  playbackSpeed: 1,
  volume: 1,
  autoSkipIntro: false,
  autoNextEpisode: true,
  autoNextCountdownSeconds: 10,
  subtitleSize: 'medium',
  subtitleFont: 'default',
  subtitleBackground: 'semi',
  subtitleColor: '#ffffff',
  subtitleOpacity: 0.7,
  subtitleOutline: true,
  subtitlePosition: 0,
  subtitleOffset: 0,
  alwaysUseExternalPlayer: false,
  loopVideo: false,
  ambientMode: false,
  stableVolume: false,
  theaterMode: false,
  sleepTimer: 'off',
  anime4kPreset: 'off',
};

const STORAGE_KEY = 'video-player-settings';
const UPDATE_EVENT = 'tatakai-video-settings-updated';
const VALID_DEFAULT_QUALITIES = new Set(['auto', '1080p', '720p', '480p', '360p']);
const VALID_ANIME4K_PRESETS = new Set<Anime4KPreset>(['off', 'light', 'standard', 'high']);
const VALID_SLEEP_TIMERS = new Set<SleepTimerOption>(['off', '15', '30', '45', '60', 'end-of-episode']);
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
  'korean',
  'chinese',
  'thai',
  'indonesian',
  'vietnamese',
  'italian',
  'russian',
  'turkish',
  'dutch',
  'polish',
  'auto',
]);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const asBool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);
const isHexColor = (value: unknown): value is string =>
  typeof value === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value);

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
    subtitleLanguage: (() => {
      const value = String(raw?.subtitleLanguage || '');
      return VALID_SUBTITLE_LANGUAGES.has(value) || value.startsWith('sub:') || value.startsWith('custom:')
        ? (value as VideoSettings['subtitleLanguage'])
        : DEFAULT_SETTINGS.subtitleLanguage;
    })(),
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
    autoplay: asBool(raw?.autoplay, DEFAULT_SETTINGS.autoplay),
    autoSkipIntro: asBool(raw?.autoSkipIntro, DEFAULT_SETTINGS.autoSkipIntro),
    alwaysUseExternalPlayer: asBool(raw?.alwaysUseExternalPlayer, DEFAULT_SETTINGS.alwaysUseExternalPlayer),
    autoNextEpisode,
    subtitleColor: isHexColor(raw?.subtitleColor) ? raw!.subtitleColor! : DEFAULT_SETTINGS.subtitleColor,
    subtitleOpacity: clamp(
      Number.isFinite(Number(raw?.subtitleOpacity)) ? Number(raw?.subtitleOpacity) : DEFAULT_SETTINGS.subtitleOpacity,
      0,
      1,
    ),
    subtitleOutline: asBool(raw?.subtitleOutline, DEFAULT_SETTINGS.subtitleOutline),
    subtitlePosition: clamp(
      Number.isFinite(Number(raw?.subtitlePosition)) ? Number(raw?.subtitlePosition) : DEFAULT_SETTINGS.subtitlePosition,
      0,
      40,
    ),
    subtitleOffset: clamp(
      Number.isFinite(Number(raw?.subtitleOffset)) ? Number(raw?.subtitleOffset) : DEFAULT_SETTINGS.subtitleOffset,
      -30,
      30,
    ),
    autoNextCountdownSeconds: clamp(
      Number.isFinite(Number(raw?.autoNextCountdownSeconds))
        ? Math.round(Number(raw?.autoNextCountdownSeconds))
        : DEFAULT_SETTINGS.autoNextCountdownSeconds,
      3,
      30,
    ),
    loopVideo: asBool(raw?.loopVideo, DEFAULT_SETTINGS.loopVideo),
    ambientMode: asBool(raw?.ambientMode, DEFAULT_SETTINGS.ambientMode),
    stableVolume: asBool(raw?.stableVolume, DEFAULT_SETTINGS.stableVolume),
    theaterMode: asBool(raw?.theaterMode, DEFAULT_SETTINGS.theaterMode),
    sleepTimer: VALID_SLEEP_TIMERS.has(raw?.sleepTimer as SleepTimerOption)
      ? (raw!.sleepTimer as SleepTimerOption)
      : DEFAULT_SETTINGS.sleepTimer,
    anime4kPreset: VALID_ANIME4K_PRESETS.has(raw?.anime4kPreset as Anime4KPreset)
      ? (raw!.anime4kPreset as Anime4KPreset)
      : DEFAULT_SETTINGS.anime4kPreset,
  };
};

// Key-based compare over the full settings shape so new fields never drift out of sync.
const areSettingsEqual = (left: VideoSettings, right: VideoSettings) =>
  (Object.keys(DEFAULT_SETTINGS) as Array<keyof VideoSettings>).every((key) => left[key] === right[key]);

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
