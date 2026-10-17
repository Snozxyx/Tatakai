import { Capacitor, registerPlugin } from '@capacitor/core';
import { isAndroid } from '@/lib/platform/platform';
import { isTV } from '@/core/tv/device';

type PlayerEvent = {
  sessionId?: string;
  mediaId?: string;
  episodeId?: string;
  positionMs?: number;
  durationMs?: number;
  completed?: boolean;
  message?: string;
  sourceIndex?: number;
  sourceId?: string;
  playWhenReady?: boolean;
};

export type NativePlayerOpenOptions = {
  mimeType?: string;
  sessionId?: string;
  playWhenReady?: boolean;
  sources?: Array<{ id: string; title: string; detail?: string; selected?: boolean }>;
  canChangeSource?: boolean;
  canBrowseQueue?: boolean;
  mediaId?: string;
  episodeId?: string;
  live?: boolean;
  allowDisplaySwitch?: boolean;
  queue?: Array<{ id: string; title: string; url: string; mimeType?: string }>;
  url: string;
  title?: string;
  startPositionMs?: number;
  intro?: { start: number; end: number } | null;
  outro?: { start: number; end: number } | null;
  subtitles?: Array<{ url: string; lang?: string; label?: string; mime?: string; headers?: Record<string, string> }>;
  headers?: Record<string, string>;
  preferredAudioLanguage?: string;
  preferredSubtitleLanguage?: string;
  subtitlesEnabled?: boolean;
};

export type NativePlayerEventName = 'playerProgress' | 'playerEnded' | 'playerClosed' | 'playerError' | 'playerSourceRequested' | 'playerQueueRequested' | 'playerNextRequested' | 'playerPreviousRequested' | 'playerItemChanged';

type NativePlayerPlugin = {
  open(options: NativePlayerOpenOptions): Promise<{ success: boolean; error?: string }>;
  close(): Promise<{ success: boolean; error?: string }>;
  addListener(eventName: NativePlayerEventName, listener: (event: PlayerEvent) => void): Promise<{ remove: () => Promise<void> }>;
};

let installed = false;

export function installNativePlayerBridge(): void {
  if (installed || typeof window === 'undefined' || !isAndroid()) return;
  if (!Capacitor.isPluginAvailable('NativePlayer')) return;

  const plugin = registerPlugin<NativePlayerPlugin>('NativePlayer');
  const runtime = ((window as any).tatakaiRuntime ||= {});
  const listeners = new Set<(event: PlayerEvent & { type: string }) => void>();

  runtime.openNativePlayer = async (options: Parameters<NativePlayerPlugin['open']>[0]) => {
    try {
      return await plugin.open(options);
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  };
  runtime.closeNativePlayer = async () => {
    try {
      return await plugin.close();
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  };
  runtime.onNativePlayerEvent = (listener: (event: PlayerEvent & { type: string }) => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  (['playerProgress', 'playerEnded', 'playerClosed', 'playerError', 'playerSourceRequested', 'playerQueueRequested', 'playerNextRequested', 'playerPreviousRequested', 'playerItemChanged'] as const).forEach((eventName) => {
    void plugin.addListener(eventName, (event) => {
      listeners.forEach((listener) => {
        try { listener({ ...event, type: eventName }); } catch { /* isolated listener */ }
      });
    }).catch(() => { /* native player unavailable */ });
  });

  installed = true;
}

function readRuntime(): any | null {
  if (typeof window === 'undefined') return null;
  const runtime = (window as any).tatakaiRuntime;
  if (!runtime?.openNativePlayer || !runtime?.onNativePlayerEvent) return null;
  return runtime;
}

export function isNativePlayerAvailable(): boolean {
  if (!isAndroid()) return false;
  return readRuntime() != null || Capacitor.isPluginAvailable('NativePlayer');
}

export async function openNativePlayer(options: NativePlayerOpenOptions): Promise<{ success: boolean; error?: string }> {
  installNativePlayerBridge();
  const runtime = readRuntime();
  if (!runtime) return { success: false, error: 'Native torrent playback is unavailable in this app build.' };
  try {
    return await runtime.openNativePlayer({ ...options, allowDisplaySwitch: options.allowDisplaySwitch ?? (isTV() && localStorage.getItem('tatakai-tv-disruptive-refresh') === 'true') });
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export async function closeNativePlayer(): Promise<{ success: boolean; error?: string }> {
  const runtime = readRuntime();
  if (!runtime?.closeNativePlayer) return { success: true };
  try {
    return await runtime.closeNativePlayer();
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function onNativePlayerEvent(
  listener: (event: PlayerEvent & { type: NativePlayerEventName }) => void,
): () => void {
  installNativePlayerBridge();
  const runtime = readRuntime();
  if (!runtime?.onNativePlayerEvent) return () => undefined;
  return runtime.onNativePlayerEvent(listener) as () => void;
}
