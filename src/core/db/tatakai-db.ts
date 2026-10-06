/**
 * src/core/db/tatakai-db.ts
 * Dexie.js IndexedDB abstraction for Tatakai.
 *
 * Provides offline-first storage for:
 *  - Content metadata cache (browse without network)
 *  - Watch history & progress (instant resume)
 *  - Extension data (scraping results, domain permissions)
 *  - Feature flag overrides (future remote sync)
 *
 * Schema versioning is managed by Dexie — add new stores or
 * indexes by bumping the version number and adding a new
 * .stores() block.
 */

import Dexie, { type EntityTable } from 'dexie';

// ── Row shapes ────────────────────────────────────────────────────────────────

export interface CachedMedia {
  /** Tatakai internal ID (or AniList ID stringified as fallback) */
  id: string;
  anilistId?: number;
  malId?: number;
  title: string;
  titleJp?: string;
  poster?: string;
  blurhash?: string;
  format?: string;
  status?: string;
  season?: string;
  seasonYear?: number;
  genres?: string[];
  /** ISO timestamp of last cache refresh */
  cachedAt: string;
  /** Raw JSON blob so we never lose data across schema changes */
  raw?: string;
}

export interface WatchProgress {
  /** Composite key: `${mediaId}:${episodeId}` */
  id: string;
  mediaId: string;
  episodeId: string;
  animeName?: string;
  animePoster?: string;
  episodeNumber?: number;
  /** Seconds into the episode */
  progress: number;
  /** Total episode duration in seconds */
  duration: number;
  /** ISO timestamp */
  updatedAt: string;
  /** Has the user finished this episode? */
  completed: boolean;
}

export interface OfflineEpisode {
  /** Composite key: `${mediaId}:${episodeId}` */
  id: string;
  mediaId: string;
  episodeId: string;
  title?: string;
  /** Blob URL or file:// path (Electron/Capacitor) */
  localPath: string;
  /** Bytes on disk */
  sizeBytes: number;
  /** ISO timestamp of download completion */
  downloadedAt: string;
  /** Quality label (e.g. "1080p", "720p") */
  quality?: string;
}

export interface ExtensionMeta {
  /** Extension manifest ID */
  id: string;
  name: string;
  version: string;
  /** Domains the extension is allowed to fetch from */
  allowedDomains: string[];
  enabled: boolean;
  /** ISO timestamp of last update check */
  updatedAt: string;
}

export interface KeyValueEntry {
  key: string;
  value: string;
  /** Optional TTL in seconds (0 = no expiry) */
  ttl?: number;
  /** ISO timestamp of when this was written */
  createdAt: string;
}

export interface DownloadRule {
  id: string;
  animeId: number;
  animeTitle: string;
  enabled: boolean;
  preferredQuality: '1080p' | '720p' | '480p' | 'auto';
  /**
   * Ordered list of preferred audio languages (BCP 47 or shorthands).
   * The automation engine tries each in order until one is available from an extension.
   * e.g. ['hi', 'en', 'ja']
   */
  preferredLanguages: string[];
  /**
   * Ordered list of extension IDs to try, in priority order.
   * The engine will query each extension for language availability before falling back to the next.
   */
  sourceExtensionIds: string[];
  /**
   * What to do when no extension can serve any of the preferred languages for an episode.
   * - 'switch-source': try the next extension even if language doesn't match
   * - 'default': fall back to the global default language setting
   * - 'error': show error toast and skip this episode
   */
  languageFallbackMode: 'switch-source' | 'default' | 'error';
  /** @deprecated Use preferredLanguages[0]. Kept for backward compat with old rules. */
  audioLanguage: string;
  /** @deprecated Use languageFallbackMode. Kept for backward compat with old rules. */
  fallbackLanguage: string;
  autoDownloadSubtitles: boolean;
  preferredProviderId?: string;
  providerPriority: string[];
  titleComparisonType?: 'exact' | 'contains' | 'fuzzy';
  releaseGroups?: string[];
  resolutions?: string[];
  additionalTerms?: string[];
  excludeTerms?: string[];
  episodeOffset?: number;
  seasonNumber?: number;
  preferredSourceType?: 'any' | 'torrent' | 'stream' | 'local';
  subtitleLanguage?: string;
  minimumScore?: number;
  lastCheckedEpisode: number;
  createdAt: string;
  /** v4: Maximum times to retry a failed download before giving up. Defaults to 3. */
  maxRetries?: number;
  /** v4: Seconds to wait before retrying a failed download. Defaults to 120. */
  retryDelaySeconds?: number;
  /** v4: Human-readable description of the last error (populated by automation engine). */
  lastError?: string;
  /** v4: ISO timestamp of last successful episode download. */
  lastSuccessAt?: string;
  /** v4: ISO timestamp of when the automation engine should next check this rule. */
  nextCheckAt?: string;
}

/**
 * Immutable record of a single download attempt (success, failure, or cancellation).
 * Written by the automation engine after every download attempt.
 */
export interface DownloadHistoryEntry {
  /** Composite key: `${animeId}:${episodeNumber}:${startedAt}` */
  id: string;
  animeId: number;
  animeTitle: string;
  /** Poster captured when the download started (used by grouped offline rows). */
  posterUrl?: string;
  episodeNumber: number;
  episodeName?: string;
  /**
   * Download-monitor job id for this episode (the player's episode id). Links
   * the row to the `tatakai:dl:retry:<episodeId>` snapshot so completed rows
   * can be retried in place. Absent on rows written by older builds.
   */
  episodeId?: string;
  /** Final outcome of this attempt. */
  status: 'completed' | 'failed' | 'cancelled';
  sourceType: 'hls' | 'torrent' | 'unknown';
  /** Canonical language code used (e.g. 'ja', 'en', 'hi'). */
  resolvedLanguage: string;
  /** Extension ID that served the content. */
  extensionId?: string;
  /** Human-readable extension name. */
  extensionName?: string;
  /** Quality label if known (e.g. '1080p'). */
  quality?: string;
  /** Approximate file size in bytes, populated on completion. */
  fileSizeBytes?: number;
  /** Local filesystem path if completed. */
  localPath?: string;
  /** Error message if status === 'failed'. */
  errorMessage?: string;
  /** ISO timestamp when download started. */
  startedAt: string;
  /** ISO timestamp when download ended (success, fail, or cancel). */
  completedAt: string;
  /** How many times this specific episode was retried before this outcome. */
  retryCount: number;
}

/**
 * A single downloaded manga chapter, available for fully offline reading.
 * Pages live on disk under `localDir`; the reader loads them through the
 * `tatakai-media://` protocol (no raw file paths reach the renderer).
 */
export interface OfflineChapter {
  /** Composite key: `${anilistId}:${chapterKey}` */
  id: string;
  anilistId: number;
  title: string;
  /** Series poster captured at enqueue time. */
  posterUrl?: string | null;
  chapterKey: string;
  chapterNumber?: number | null;
  volume?: number | string | null;
  /** Absolute chapter folder on disk (main process owns it). */
  localDir: string;
  pageCount: number;
  sizeBytes: number;
  /** Sub-provider that served the pages. */
  provider?: string | null;
  /** ISO timestamp of download completion. */
  downloadedAt: string;
}

/**
 * A downloaded extension bundle cached for the in-WebView mobile runtime.
 * On desktop, bundles ship as extraResources and run in a Node worker; on
 * mobile there is no such host, so the marketplace `.kai` is unzipped and its
 * `manifest.json` + `dist/bundle.js` cached here, then registered into the
 * in-WebView runtime on launch (network-first refresh, cache for offline).
 */
export interface MobileExtensionBundle {
  /** Extension manifest id (also the primary key). */
  id: string;
  /** Namespace the bundle mounts under (manifest.apiServer.namespace or id). */
  namespace: string;
  version: string;
  /** Full manifest JSON (parsed object stored verbatim). */
  manifest: unknown;
  /** The extension bundle source (dist/bundle.js contents). */
  bundleCode: string;
  /** Whether the user has this extension enabled. */
  enabled: boolean;
  /** ISO timestamp of last download/refresh. */
  updatedAt: string;
}

// ── Database ──────────────────────────────────────────────────────────────────

class TatakaiDB extends Dexie {
  cachedMedia!: EntityTable<CachedMedia, 'id'>;
  watchProgress!: EntityTable<WatchProgress, 'id'>;
  offlineEpisodes!: EntityTable<OfflineEpisode, 'id'>;
  extensions!: EntityTable<ExtensionMeta, 'id'>;
  kv!: EntityTable<KeyValueEntry, 'key'>;
  downloadRules!: EntityTable<DownloadRule, 'id'>;
  /** v4: Immutable log of every download attempt. */
  downloadHistory!: EntityTable<DownloadHistoryEntry, 'id'>;
  /** v5: Downloaded manga chapters for offline reading. */
  offlineChapters!: EntityTable<OfflineChapter, 'id'>;
  /** v6: Cached extension bundles for the in-WebView mobile runtime. */
  mobileExtensionBundles!: EntityTable<MobileExtensionBundle, 'id'>;

  constructor() {
    super('tatakai');

    // Keep version 1 for backward compatibility
    this.version(1).stores({
      cachedMedia: 'id, anilistId, malId, *genres, cachedAt',
      watchProgress: 'id, mediaId, updatedAt',
      offlineEpisodes: 'id, mediaId, downloadedAt',
      extensions: 'id, name',
      kv: 'key',
    });

    // Version 2 adds downloadRules for automated episode downloads
    this.version(2).stores({
      cachedMedia: 'id, anilistId, malId, *genres, cachedAt',
      watchProgress: 'id, mediaId, updatedAt',
      offlineEpisodes: 'id, mediaId, downloadedAt',
      extensions: 'id, name',
      kv: 'key',
      downloadRules: 'id, animeId, enabled',
    });

    // Version 3 adds preferredLanguages, sourceExtensionIds, languageFallbackMode to downloadRules
    // Old rules without these fields will gracefully use the legacy audioLanguage field.
    this.version(3).stores({
      cachedMedia: 'id, anilistId, malId, *genres, cachedAt',
      watchProgress: 'id, mediaId, updatedAt',
      offlineEpisodes: 'id, mediaId, downloadedAt',
      extensions: 'id, name',
      kv: 'key',
      downloadRules: 'id, animeId, enabled',
    });

    // Version 4 adds downloadHistory table and retry fields on DownloadRule.
    // Existing rules keep working — new fields default to undefined (graceful).
    this.version(4).stores({
      cachedMedia: 'id, anilistId, malId, *genres, cachedAt',
      watchProgress: 'id, mediaId, updatedAt',
      offlineEpisodes: 'id, mediaId, downloadedAt',
      extensions: 'id, name',
      kv: 'key',
      downloadRules: 'id, animeId, enabled',
      downloadHistory: 'id, animeId, status, startedAt',
    });

    // Version 5 adds offlineChapters for downloaded manga (offline reading).
    // Append-only: every prior table is carried forward unchanged.
    this.version(5).stores({
      cachedMedia: 'id, anilistId, malId, *genres, cachedAt',
      watchProgress: 'id, mediaId, updatedAt',
      offlineEpisodes: 'id, mediaId, downloadedAt',
      extensions: 'id, name',
      kv: 'key',
      downloadRules: 'id, animeId, enabled',
      downloadHistory: 'id, animeId, status, startedAt',
      offlineChapters: 'id, anilistId, downloadedAt',
    });

    // Version 6 adds mobileExtensionBundles for the in-WebView extension
    // runtime. Append-only: every prior table is carried forward unchanged.
    this.version(6).stores({
      cachedMedia: 'id, anilistId, malId, *genres, cachedAt',
      watchProgress: 'id, mediaId, updatedAt',
      offlineEpisodes: 'id, mediaId, downloadedAt',
      extensions: 'id, name',
      kv: 'key',
      downloadRules: 'id, animeId, enabled',
      downloadHistory: 'id, animeId, status, startedAt',
      offlineChapters: 'id, anilistId, downloadedAt',
      mobileExtensionBundles: 'id, namespace, enabled, updatedAt',
    });
  }
}

/** Singleton database instance. Import this everywhere. */
export const db = new TatakaiDB();
