import { useState, useEffect } from 'react';

export interface VideoSettings {
  defaultQuality: 'auto' | '1080p' | '720p' | '480p' | '360p';
  autoplay: boolean;
  subtitleLanguage: 'off' | 'english' | 'spanish' | 'french' | 'german' | 'japanese' | 'auto';
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

export function useVideoSettings() {
  const [settings, setSettings] = useState<VideoSettings>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.error('Failed to load video settings:', e);
    }
    return DEFAULT_SETTINGS;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save video settings:', e);
    }
  }, [settings]);

  const updateSetting = <K extends keyof VideoSettings>(
    key: K,
    value: VideoSettings[K]
  ) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
  };

  return {
    settings,
    updateSetting,
    resetSettings,
  };
}
