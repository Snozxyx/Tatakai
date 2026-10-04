/**
 * mobileTorrentBridge.ts — adapts the native Android torrent plugin to the
 * `window.tatakaiRuntime` torrent surface the renderer already speaks.
 *
 * Desktop implements torrent in the Electron main process (WebTorrent) and
 * exposes it on `window.tatakaiRuntime`. On Android the equivalent is a native
 * Capacitor plugin (`TatakaiTorrent`, libtorrent4j + a localhost stream server —
 * see `android-torrent-plugin/`). This bridge maps that plugin onto the SAME
 * method names, so `TorrentSessionPanel`, the magnet modal, and the download
 * torrent branch work on Android with no further changes.
 *
 * If the plugin isn't present (plugin not bundled, or iOS), this is a no-op and
 * `hasTorrentService()` stays false so torrent UI is hidden — never offered-but-
 * broken.
 */

import { Capacitor, registerPlugin } from '@capacitor/core';
import { isAndroid } from '@/lib/platform/platform';

/** Native plugin contract implemented in Kotlin (android-torrent-plugin/). */
interface TatakaiTorrentPlugin {
  addMagnet(opts: { magnet: string; fileIndex?: number }): Promise<{
    success: boolean;
    sessionId?: string;
    infoHash?: string;
    error?: string;
  }>;
  getStreamUrl(opts: { sessionId: string; fileIndex?: number }): Promise<{
    success: boolean;
    url?: string;
    name?: string;
    length?: number;
    fileIndex?: number;
    error?: string;
  }>;
  getPeers(opts: { sessionId: string }): Promise<{
    success: boolean;
    seeders?: number;
    leechers?: number;
    numPeers?: number;
    error?: string;
  }>;
  ensurePrebuffer(opts: { sessionId: string; fileIndex?: number }): Promise<{ success: boolean; ready?: boolean; error?: string }>;
  stopSession(opts: { sessionId: string; destroyStore?: boolean }): Promise<{ success: boolean; error?: string }>;
  listSessions(): Promise<{ success: boolean; sessions?: Array<{ sessionId: string; infoHash: string }> }>;
  clearAll(): Promise<{ success: boolean; error?: string }>;
  addListener(
    eventName: 'torrentProgress',
    listener: (event: TorrentProgressEvent) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

interface TorrentProgressEvent {
  sessionId: string;
  infoHash?: string;
  progress?: number;
  downloadSpeed?: number;
  uploadSpeed?: number;
  numPeers?: number;
  seeders?: number;
  done?: boolean;
  name?: string;
}

let installed = false;

/**
 * Install the torrent adapters onto `window.tatakaiRuntime` when the native
 * plugin is available. Safe to call on every platform; no-ops off Android or
 * when the plugin isn't bundled.
 */
export function installMobileTorrentBridge(): void {
  if (installed || typeof window === 'undefined') return;
  if (!isAndroid()) return;
  if (!Capacitor.isPluginAvailable('TatakaiTorrent')) return;

  const plugin = registerPlugin<TatakaiTorrentPlugin>('TatakaiTorrent');
  const rt = ((window as any).tatakaiRuntime ||= {});
  const progressListeners = new Set<(event: TorrentProgressEvent) => void>();
  let nativeProgressListener: { remove: () => Promise<void> } | null = null;
  let progressListenerPending = false;

  const ensureProgressListener = () => {
    if (nativeProgressListener || progressListenerPending) return;
    progressListenerPending = true;
    void plugin.addListener('torrentProgress', (event) => {
      progressListeners.forEach((listener) => {
        try {
          listener(event);
        } catch {
          // One renderer listener must not prevent the rest receiving progress.
        }
      });
    }).then((handle) => {
      nativeProgressListener = handle;
    }).catch(() => {
      // Progress events are optional: command calls still report current state.
    }).finally(() => {
      progressListenerPending = false;
    });
  };

  rt.startTorrentSession = async (
    infoHashOrMagnet: string,
    options?: { magnet?: string; fileIndex?: number },
  ) => {
    try {
      return await plugin.addMagnet({
        magnet: options?.magnet || infoHashOrMagnet,
        fileIndex: options?.fileIndex,
      });
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  };

  rt.onTorrentProgress = (listener: (event: TorrentProgressEvent) => void) => {
    progressListeners.add(listener);
    ensureProgressListener();
    return () => {
      progressListeners.delete(listener);
      if (progressListeners.size === 0 && nativeProgressListener) {
        const handle = nativeProgressListener;
        nativeProgressListener = null;
        void handle.remove();
      }
    };
  };

  rt.getTorrentStreamUrl = async (
    sessionId: string,
    fileIndex?: number,
  ) => {
    try {
      return await plugin.getStreamUrl({ sessionId, fileIndex });
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  };

  rt.getTorrentPeers = async (sessionId: string) => {
    try {
      return await plugin.getPeers({ sessionId });
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  };

  rt.ensureTorrentPrebuffer = async (sessionId: string, fileIndex?: number) => {
    try {
      return await plugin.ensurePrebuffer({ sessionId, fileIndex });
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  };

  rt.stopTorrentSession = async (
    sessionId: string,
    options?: { destroyStore?: boolean },
  ) => {
    try {
      return await plugin.stopSession({ sessionId, destroyStore: options?.destroyStore });
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  };

  rt.listTorrentSessions = async () => {
    try {
      return await plugin.listSessions();
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  };

  rt.clearAllTorrentData = async () => {
    try {
      return await plugin.clearAll();
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  };

  // Add-magnet helper the magnet modal / download torrent branch can call.
  rt.addTorrentMagnet = async (magnet: string) => {
    try {
      return await plugin.addMagnet({ magnet });
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  };

  installed = true;
}
