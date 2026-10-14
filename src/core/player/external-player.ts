import { Capacitor, registerPlugin } from '@capacitor/core';
import type { PlaybackSubtitle } from './player-core';
export interface ExternalPlayerLaunch {
  url: string; executablePath?: string; title?: string; startTime?: number;
  headers?: Record<string, string>; subtitles?: PlaybackSubtitle[];
}
export async function launchExternalPlayer(options: ExternalPlayerLaunch, saveProgress: () => void) {
  saveProgress();
  if (Capacitor.isNativePlatform()) {
    const localFile = /\/_capacitor_file_(\/.*)/.exec(options.url);
    if (localFile) options = { ...options, url: decodeURIComponent(localFile[1]) };
    return registerPlugin<{ openExternalPlayer(input: ExternalPlayerLaunch): Promise<{ success: boolean; error?: string; progressSupported?: boolean }> }>('TatakaiMedia').openExternalPlayer(options);
  }
  const desktop = (window as any).electron || (window as any).tatakaiRuntime;
  if (!desktop?.launchExternalPlayer) throw new Error('External players require the desktop or mobile app');
  const pref = options.executablePath ? undefined : await desktop.getExternalPlayerPref?.();
  return desktop.launchExternalPlayer({ executablePath: options.executablePath || pref?.executablePath, streamUrl: options.url, options: { title: options.title, startTime: options.startTime, headers: options.headers, subtitles: options.subtitles } });
}
