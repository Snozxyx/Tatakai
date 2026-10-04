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
  getExtensionApiPort?: () => Promise<{ port: number | null; configuredPort: number; defaultPort: number; baseUrl: string | null }>;
  setExtensionApiPort?: (port: number) => Promise<{ success: boolean; port?: number; baseUrl?: string; error?: string }>;
  getStorageInfo?: (downloadsPath?: string, torrentCachePath?: string) => Promise<{
    success: boolean;
    drive?: { root: string; totalBytes: number; freeBytes: number; usedBytes: number };
    appStorage?: { downloadsSize: number; torrentCacheSize: number; appCacheSize: number; totalAppBytes: number };
    paths?: { downloadsPath: string; torrentCachePath: string; appCachePath: string };
    error?: string;
  }>;
  clearStorageCategory?: (category: string, customPath?: string) => Promise<{ success: boolean; category?: string; error?: string }>;
  /** Toggle the OS window into / out of fullscreen; resolves to the new state. */
  setFullscreen?: (enabled: boolean) => Promise<boolean>;
  /** Read the window's current fullscreen state. */
  isFullscreen?: () => Promise<boolean>;
  /** Subscribe to fullscreen changes (F11, native chrome). Returns an unsubscribe fn. */
  onFullscreenChanged?: (cb: (isFullscreen: boolean) => void) => (() => void) | void;
  /** Tail the device-local desktop log file (userData/logs/app.log). */
  logTail?: (lines?: number) => Promise<unknown>;
  /** Main → renderer deep-link channel, e.g. from a clicked native notification. */
  onNavigate?: (cb: (path: string) => void) => void;
  /** Manga chapter downloads + offline library (desktop only). */
  manga?: MangaBridge;
  [key: string]: unknown;
}

/** A chapter in an enqueue payload; the engine re-resolves pages in-main. */
export interface MangaDownloadChapter {
  chapterKey: string;
  provider?: string;
  providerChapterId?: string;
  chapterNumber?: number | null;
  volume?: number | string | null;
  language?: string;
  alternatives?: Array<{ provider?: string; chapterKey?: string; providerChapterId?: string }>;
}

/** manga = JP, manhwa = KR, manhua = CN/TW — drives the Dynamic Island badge. */
export type MangaKind = 'manga' | 'manhwa' | 'manhua';

/** Shared series-level fields for enqueue payloads. */
export interface MangaDownloadSeries {
  anilistId: number;
  title: string;
  posterUrl?: string | null;
  downloadPath?: string;
  /** Origin-derived label; defaults to 'manga' when unknown. */
  kind?: MangaKind;
}

export interface MangaDownloadProgress {
  jobId: string;
  anilistId: number;
  chapterKey: string;
  page: number;
  totalPages: number;
  percent: number;
}

export interface MangaDownloadCompleted {
  jobId: string;
  anilistId: number;
  chapterKey: string;
  chapterNumber?: number | null;
  volume?: number | string | null;
  provider?: string | null;
  title?: string;
  localDir: string;
  pageCount: number;
  sizeBytes: number;
}

export interface MangaDownloadError {
  jobId: string;
  anilistId: number;
  chapterKey: string;
  error: string;
}

export interface OfflineMangaChapterRow {
  chapterKey: string;
  chapterNumber?: number | null;
  volume?: number | string | null;
  provider?: string | null;
  dir: string;
  pageCount: number;
  sizeBytes: number;
  downloadedAt: string;
}

export interface OfflineMangaSeries {
  anilistId: number;
  title: string;
  posterUrl?: string | null;
  poster?: string | null;
  kind?: MangaKind;
  path: string;
  chapters: OfflineMangaChapterRow[];
  chapterCount: number;
}

export interface OfflineMangaPage {
  pageNumber: number;
  imageUrl: string;
}

export interface MangaBridge {
  enqueueAll: (payload: MangaDownloadSeries & { chapters: MangaDownloadChapter[] }) => Promise<{ success: boolean; queued?: number; jobs?: unknown[]; error?: string }>;
  enqueueChapter: (payload: MangaDownloadSeries & { chapter: MangaDownloadChapter }) => Promise<{ success: boolean; jobId?: string; status?: string; error?: string }>;
  cancel: (params: { jobId: string }) => Promise<{ success: boolean; error?: string }>;
  list: () => Promise<{ active: string[]; queued: number }>;
  getOfflineLibrary: (customRoot?: string) => Promise<OfflineMangaSeries[]>;
  getOfflinePages: (params: { anilistId: number; chapterKey: string; customRoot?: string }) => Promise<{ success: boolean; error?: string; pages: OfflineMangaPage[]; title?: string; chapterNumber?: number | null }>;
  deleteChapter: (params: { anilistId: number; chapterKey: string; customRoot?: string }) => Promise<{ success: boolean; remaining?: number; error?: string }>;
  deleteSeries: (params: { anilistId: number; customRoot?: string }) => Promise<{ success: boolean; error?: string }>;
  openFolder: (params: { anilistId?: number; customRoot?: string }) => Promise<{ success: boolean }>;
  onProgress: (cb: (data: MangaDownloadProgress) => void) => () => void;
  onCompleted: (cb: (data: MangaDownloadCompleted) => void) => () => void;
  onError: (cb: (data: MangaDownloadError) => void) => () => void;
}

/** Snapshot returned by `window.tatakaiRuntime.getWarpStatus()`. */
export interface WarpStatus {
  enabled: boolean;
  mode: 'auto' | 'always' | 'on-demand';
  connected: boolean;
  routeExtensions: boolean;
  routeTorrent: boolean;
  egressCity?: string;
  warpEgress?: string;
  egressIp?: string;
  probedAt?: number;
  lastError?: string;
}

export interface TatakaiRuntimeBridge {
  health?: () => Promise<unknown>;
  resolveEpisodeSources?: (options: Record<string, unknown>) => Promise<{ sources?: Array<{ url?: string }>; headers?: Record<string, string> }>;
  loadExtension?: (id: string, manifest: unknown) => Promise<unknown>;
  unloadExtension?: (id: string) => Promise<unknown>;
  sideloadManifest?: (manifest: unknown, bundleCode?: string) => Promise<unknown>;
  setExtensionKillSwitch?: (id: string, blocked: boolean) => Promise<unknown>;
  getExtensionAuditLog?: (limit?: number) => Promise<unknown>;
  startTorrentSession?: (infoHashOrMagnet: string, options?: { magnet?: string; fileIndex?: number; autoSelectLargest?: boolean; optimizeStorage?: boolean }) => Promise<{ success?: boolean; sessionId?: string; infoHash?: string; error?: string }>;
  onTorrentProgress?: (cb: (data: Record<string, unknown>) => void) => (() => void) | void;
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
  setWarpRouting?: (flags: { routeExtensions?: boolean; routeTorrent?: boolean }) => Promise<unknown>;
  getWarpRoutingLog?: () => Promise<unknown>;
  getWarpStatus?: () => Promise<WarpStatus>;
  toggleWarp?: (enabled: boolean) => Promise<WarpStatus | { success?: boolean; error?: string }>;
  probeMedia?: (url: string) => Promise<{ success?: boolean; tracks?: Array<any>; error?: string }>;
  extractSubtitle?: (url: string, trackIndex: number) => Promise<{ success?: boolean; url?: string; error?: string }>;
  extractAudioTrack?: (url: string, trackIndex: number) => Promise<{ success?: boolean; url?: string; error?: string }>;
  readLocalFile?: (filePath: string) => Promise<{ success?: boolean; url?: string; error?: string }>;
  onPlaybackEvent?: (cb: (data: Record<string, unknown>) => void) => (() => void) | void;
  openNativePlayer?: (options: {
    url: string;
    title?: string;
    startPositionMs?: number;
    intro?: { start: number; end: number } | null;
    outro?: { start: number; end: number } | null;
    subtitles?: Array<{ url: string; lang?: string; label?: string; mime?: string }>;
  }) => Promise<{ success?: boolean; error?: string }>;
  closeNativePlayer?: () => Promise<{ success?: boolean; error?: string }>;
  onNativePlayerEvent?: (cb: (data: Record<string, unknown>) => void) => (() => void) | void;
  [key: string]: unknown;
}

declare global {
  interface Window {
    electron?: ElectronBridge;
    tatakaiRuntime?: TatakaiRuntimeBridge;
  }
}

export {};
