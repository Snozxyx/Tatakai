/**
 * Preload-exposed `window.electron` + `window.tatakaiRuntime` (desktop only).
 */
export interface ElectronThemePersistPayload {
  theme: string;
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  foreground: string;
  mutedForeground: string;
  border: string;
  card: string;
}

export interface ElectronBridge {
  getPlatform?: () => Promise<string>;
  persistTheme?: (payload: ElectronThemePersistPayload) => Promise<{ success?: boolean; error?: string }>;
  startDownload?: (payload: Record<string, unknown>) => Promise<{ success?: boolean; error?: string; status?: string }>;
  cancelDownload?: (params: { episodeId?: string; animePath?: string }) => Promise<{ success?: boolean }>;
  getDownloadsDir?: (customPath?: string) => Promise<string>;
  onDownloadProgress?: (cb: (data: Record<string, unknown>) => void) => void;
  onDownloadCompleted?: (cb: (data: Record<string, unknown>) => void) => void;
  onDownloadError?: (cb: (data: Record<string, unknown>) => void) => void;
  removeDownloadListeners?: () => void;
  removeAllListeners?: (channel: string) => void;
  selectDirectory?: () => Promise<string | null>;
  openDownloadsFolder?: (path?: string) => Promise<void>;
  [key: string]: unknown;
}

export interface TatakaiRuntimeBridge {
  health?: () => Promise<unknown>;
  resolveEpisodeSources?: (options: Record<string, unknown>) => Promise<{ sources?: Array<{ url?: string }>; headers?: Record<string, string> }>;
  loadExtension?: (id: string, manifest: unknown) => Promise<unknown>;
  unloadExtension?: (id: string) => Promise<unknown>;
  sideloadManifest?: (manifest: unknown, bundleCode?: string) => Promise<unknown>;
  setExtensionKillSwitch?: (id: string, blocked: boolean) => Promise<unknown>;
  getExtensionAuditLog?: (limit?: number) => Promise<unknown>;
  searchTorrentCandidates?: (options: Record<string, unknown>) => Promise<unknown>;
  restoreTorrentSession?: (snapshot: { staging?: unknown[]; seeding?: unknown[]; completed?: unknown[]; current?: Record<string, unknown> | null }) => Promise<{ success?: boolean; restored?: { staging?: number; seeding?: number; completed?: number }; current?: unknown }>;
  stopTorrentSession?: (sessionId: string, options?: { destroyStore?: boolean }) => Promise<{ success?: boolean; error?: string }>;
  disconnectTorrentPeers?: (sessionId: string) => Promise<{ success?: boolean; error?: string; peersDisconnected?: number }>;
  getTorrentStreamUrl?: (sessionId: string, fileIndex?: number, options?: { audioTrackIndex?: number; startTime?: number }) => Promise<{ success?: boolean; url?: string; error?: string; infoHash?: string; fileIndex?: number; name?: string; length?: number; prebuffered?: boolean; ready?: boolean; transcoded?: boolean }>;
  getTorrentPeers?: (sessionId: string) => Promise<{ success?: boolean; seeders?: number | null; leechers?: number | null; error?: string }>;
  getTorrentFilePath?: (sessionId: string) => Promise<{ success?: boolean; path?: string; fileIndex?: number; name?: string | null; error?: string }>;
  getTorrentStoragePaths?: () => Promise<{ success?: boolean; torrentPath?: string; cachePath?: string; usage?: Record<string, unknown> }>;
  setTorrentStoragePath?: (path: string) => Promise<{ success?: boolean; path?: string; error?: string }>;
  ensureTorrentPrebuffer?: (sessionId: string, fileIndex?: number, options?: { requireMetadataTail?: boolean }) => Promise<{ success?: boolean; ready?: boolean; error?: string }>;
  restartTorrentService?: () => Promise<{ success?: boolean; error?: string; activeSessionsCleared?: number }>;
  listTorrentSessions?: () => Promise<{ success?: boolean; sessions?: Array<{ sessionId: string; infoHash: string }> }>;
  clearAllTorrentData?: () => Promise<{ success?: boolean; error?: string }>;
  onTorrentRestartShortcut?: (cb: (data: Record<string, unknown>) => void) => (() => void) | void;
  setWarpMode?: (mode: 'auto' | 'always' | 'on-demand') => Promise<unknown>;
  getWarpRoutingLog?: () => Promise<unknown>;
  probeMedia?: (url: string) => Promise<{ success?: boolean; tracks?: Array<any>; error?: string }>;
  extractSubtitle?: (url: string, trackIndex: number) => Promise<{ success?: boolean; url?: string; error?: string }>;
  extractAudioTrack?: (url: string, trackIndex: number) => Promise<{ success?: boolean; url?: string; error?: string }>;
  readLocalFile?: (filePath: string) => Promise<{ success?: boolean; url?: string; error?: string }>;
  onPlaybackEvent?: (cb: (data: Record<string, unknown>) => void) => (() => void) | void;
  [key: string]: unknown;
}

declare global {
  interface Window {
    electron?: ElectronBridge;
    tatakaiRuntime?: TatakaiRuntimeBridge;
  }
}

export {};
