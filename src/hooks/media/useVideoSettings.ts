import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { ANIME4K_QUALITY, normalizeVideoEnhancement, type VideoEnhancementEngine, type VideoEnhancementQuality } from '@/lib/video/enhancement-settings';
import {
  readGuestSettingsFromCookie,
  readAccountSettingsFromLocal,
  readProfileAppSettings,
  saveAccountSettingsPatch,
  writeGuestSettingsCookie,
} from '@/lib/appSettingsPersistence';

export type Anime4KPreset =
  | 'off'
  | 'light' // Restore CNN S at the original resolution
  | 'standard' // Restore CNN M + Upscale CNN x2 S
  | 'high'
  | 'upscale'
  | 'restore';

export type SleepTimerOption = 'off' | '15' | '30' | '45' | '60' | 'end-of-episode';

export interface VideoSettings {
  videoEnhancementEngine: VideoEnhancementEngine;
  videoEnhancementQuality: VideoEnhancementQuality;
  playerEngine: 'builtin' | 'jwplayer' | 'vidstack';
  jwPlayerLibraryId: string;
  audioLanguage: string;
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
  videoEnhancementEngine: 'off',
  videoEnhancementQuality: 'balanced',
  playerEngine: 'builtin',
  jwPlayerLibraryId: '',
  audioLanguage: 'auto',
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
const REVISION_KEY = 'tatakai-video-settings-revision';
type VideoSettingsRevision = { accountId: string | null; updatedAt: number };
const settingsRevision = (settings: Record<string, unknown>) => {
  const value = Number(settings.__updatedAt);
  return Number.isFinite(value) && value > 0 ? value : 0;
};
function readLocalRevision(): VideoSettingsRevision | undefined {
  try {
    const value = JSON.parse(window.localStorage.getItem(REVISION_KEY) || 'null');
    if (value && (value.accountId === null || typeof value.accountId === 'string') && Number.isFinite(value.updatedAt)) return value;
  } catch { /* Storage may be unavailable. */ }
}
const VALID_DEFAULT_QUALITIES = new Set(['auto', '1080p', '720p', '480p', '360p']);
const VALID_ANIME4K_PRESETS = new Set<Anime4KPreset>(['off', 'light', 'standard', 'high', 'upscale', 'restore']);
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
  const enhancement = normalizeVideoEnhancement(raw);
  // Older processing-selector saves changed the active preset without updating
  // the quality field. Display the quality the renderer actually uses.
  if (enhancement.videoEnhancementEngine === 'anime4k') {
    if (raw?.anime4kPreset === 'high') enhancement.videoEnhancementQuality = 'high';
    if (raw?.anime4kPreset === 'light') enhancement.videoEnhancementQuality = 'light';
    if (raw?.anime4kPreset === 'standard') enhancement.videoEnhancementQuality = 'balanced';
  }
  const autoNextEpisode =
    typeof raw?.autoNextEpisode === 'boolean'
      ? raw.autoNextEpisode
      : typeof raw?.autoPlayNext === 'boolean'
        ? raw.autoPlayNext
        : DEFAULT_SETTINGS.autoNextEpisode;

  return {
    ...DEFAULT_SETTINGS,
    ...raw,
    ...enhancement,
    playerEngine: raw?.playerEngine === 'jwplayer' || raw?.playerEngine === 'vidstack' ? raw.playerEngine : 'builtin',
    jwPlayerLibraryId: typeof raw?.jwPlayerLibraryId === 'string' ? raw.jwPlayerLibraryId.trim() : '',
    audioLanguage: typeof raw?.audioLanguage === 'string' && /^(auto|[a-z]{2,3})$/.test(raw.audioLanguage) ? raw.audioLanguage : 'auto',
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
    anime4kPreset: VALID_ANIME4K_PRESETS.has(raw?.anime4kPreset as Anime4KPreset) && raw?.anime4kPreset !== 'off'
      ? (raw!.anime4kPreset as Anime4KPreset)
      : enhancement.videoEnhancementEngine === 'anime4k'
        ? ANIME4K_QUALITY[enhancement.videoEnhancementQuality]
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

const persistLocalVideoSettings = (settings: VideoSettings, revision: VideoSettingsRevision) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    window.localStorage.setItem(REVISION_KEY, JSON.stringify(revision));
    writeGuestSettingsCookie({ video: { ...settings, __updatedAt: revision.updatedAt } });
  } catch (error) {
    console.error('Failed to save video settings:', error);
  }
  // Consumers only read this notification; they never write stale snapshots back.
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: settings }));
};

export function useVideoSettings() {
  const { user, profile } = useAuth();
  const [settings, setSettings] = useState<VideoSettings>(() => loadSettingsFromStorage());
  const currentSettingsRef = useRef(settings);
  currentSettingsRef.current = settings;
  const seededAccountRef = useRef<string | null>(null);

  const accountVideoSettings = useMemo(
    () => readProfileAppSettings(profile).video,
    [profile],
  );

  useEffect(() => {
    if (!user?.id || profile?.user_id !== user.id) return;

    const localRevision = readLocalRevision();
    const cachedAccountSettings = readAccountSettingsFromLocal(user.id).video;
    const remoteSettings = accountVideoSettings && typeof accountVideoSettings === 'object' ? accountVideoSettings : undefined;
    if (!remoteSettings && !cachedAccountSettings) return;
    const remoteRevision = remoteSettings ? settingsRevision(remoteSettings) : 0;
    const cachedRevision = cachedAccountSettings ? settingsRevision(cachedAccountSettings) : 0;
    // The per-account cache also protects edits when switching away and back.
    const latest = !remoteSettings || cachedRevision > remoteRevision ? cachedAccountSettings : remoteSettings;
    const latestRevision = Math.max(cachedRevision, remoteRevision);
    // The profile stays unchanged after an account save. A newly mounted drawer
    // must keep this account's newer local choices instead of reloading that profile.
    if (localRevision?.accountId === user.id && latestRevision <= localRevision.updatedAt) return;

    const next = normalizeSettings(latest as Partial<VideoSettings> & { autoPlayNext?: boolean });
    currentSettingsRef.current = next;
    persistLocalVideoSettings(next, { accountId: user.id, updatedAt: latestRevision });
    setSettings((previous) => (areSettingsEqual(previous, next) ? previous : next));
  }, [user?.id, profile?.user_id, accountVideoSettings]);

  useEffect(() => {
    if (!user?.id) {
      seededAccountRef.current = null;
      return;
    }
    if (profile?.user_id !== user.id) return;

    if (accountVideoSettings && typeof accountVideoSettings === 'object') {
      seededAccountRef.current = user.id;
      return;
    }

    if (seededAccountRef.current === user.id) return;
    seededAccountRef.current = user.id;

    void saveAccountSettingsPatch(user.id, {
      video: { ...currentSettingsRef.current, __updatedAt: readLocalRevision()?.updatedAt || 0 },
    }).catch(() => {
      seededAccountRef.current = null;
    });
  }, [user?.id, profile?.user_id, accountVideoSettings, settings]);

  useEffect(() => {
    const syncSettings = (event?: Event) => {
      const next = event?.type === UPDATE_EVENT && (event as CustomEvent<VideoSettings>).detail
        ? (event as CustomEvent<VideoSettings>).detail
        : loadSettingsFromStorage();
      currentSettingsRef.current = next;
      setSettings((previous) => (areSettingsEqual(previous, next) ? previous : next));
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== STORAGE_KEY) return;
      syncSettings();
    };

    window.addEventListener(UPDATE_EVENT, syncSettings);
    window.addEventListener('storage', handleStorage);
    // Account hydration in a sibling can run before this subscription mounts.
    syncSettings();
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(UPDATE_EVENT, syncSettings);
    };
  }, []);

  const updateSetting = <K extends keyof VideoSettings>(
    key: K,
    value: VideoSettings[K]
  ) => {
    let next = { ...currentSettingsRef.current, [key]: value };
    if (key === 'anime4kPreset') {
      next.videoEnhancementEngine = value === 'off' ? 'off' : 'anime4k';
      if (value !== 'off') next.videoEnhancementQuality = value === 'high' ? 'high' : value === 'light' ? 'light' : 'balanced';
    }
    if (key === 'videoEnhancementQuality') next.anime4kPreset = ANIME4K_QUALITY[value as VideoEnhancementQuality];
    if (key === 'videoEnhancementEngine' && value === 'anime4k' && next.anime4kPreset === 'off') next.anime4kPreset = ANIME4K_QUALITY[next.videoEnhancementQuality];
    next = normalizeSettings(next);
    const revision = { accountId: user?.id || null, updatedAt: Math.max(Date.now(), (readLocalRevision()?.updatedAt || 0) + 1) };
    currentSettingsRef.current = next;
    persistLocalVideoSettings(next, revision);
    setSettings(next);
    if (user?.id) {
      void saveAccountSettingsPatch(user.id, {
        video: { ...next, __updatedAt: revision.updatedAt },
      }).catch(() => undefined);
    }
  };

  const resetSettings = () => {
    const revision = { accountId: user?.id || null, updatedAt: Math.max(Date.now(), (readLocalRevision()?.updatedAt || 0) + 1) };
    currentSettingsRef.current = DEFAULT_SETTINGS;
    persistLocalVideoSettings(DEFAULT_SETTINGS, revision);
    setSettings(DEFAULT_SETTINGS);
    if (user?.id) {
      void saveAccountSettingsPatch(user.id, {
        video: { ...DEFAULT_SETTINGS, __updatedAt: revision.updatedAt },
      }).catch(() => undefined);
    }
  };

  return {
    settings,
    updateSetting,
    resetSettings,
  };
}
