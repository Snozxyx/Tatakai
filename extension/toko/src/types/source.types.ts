/**
 * Source-related type definitions
 * Defines structures for source options, results, and streaming sources
 */

/** Video container inferred from a torrent release name or its file list. */
export type TorrentFileFormat = 'mkv' | 'mp4' | 'webm' | 'avi' | 'mov' | 'm4v' | 'video';

/** Runtime limits for a single source lookup. */
export interface ProviderRunOptions {
  /** Number of providers that may scrape at once. */
  maxConcurrency?: number;
  /** Extra attempts after an empty or failed provider call. */
  maxRetries?: number;
  /** Base delay before a retry. Each attempt adds a small linear backoff. */
  retryDelayMs?: number;
  /** Hard timeout for one provider attempt. */
  timeoutMs?: number;
}

export interface SourceOptions {
  anilistId: number;
  titles: string[];
  episode?: number;
  episodeCount?: number;
  resolution: string;
  tatakaiId?: string;
  countryCode?: string;
  exclusions?: string[];
  preferredLanguage?: string;
  preferredLanguages?: string[];
  /**
   * Optional, caller-controlled limits for the provider fan-out.  These are
   * deliberately bounded by the bundle before use so a stale UI value cannot
   * create an unbounded retry/request loop.
   */
  providerOptions?: ProviderRunOptions;
}

export interface SubtitleTrack {
  url: string;
  label: string;
  language: string;
  default?: boolean;
}

export interface SourceResult {
  source: string;
  url: string;
  quality: string;
  headers: Record<string, string>;
  subtitles: SubtitleTrack[];
  /**
   * BCP 47 / ISO 639-1 code for the audio track (e.g. "ar", "fr", "ja").
   * The Watch page uses this (or `language`) to build language tabs and the
   * auto-download engine matches it against preferredLanguages.
   */
  audioLanguage?: string;
  /**
   * Optional human-readable language label such as "Arabic Dub" or "French".
   * Passed through to the app's SourceLanguageTabs for display.
   */
  language?: string;
  sourceType?: 'torrent' | 'hls' | 'mp4' | 'custom';
  /** Provider/server identity used by the Watch page for server selection. */
  providerName?: string;
  providerKey?: string;
  server?: string;
  /**
   * Rank of the producing provider, lowest first — the extension's own
   * statement of which server should play.
   *
   * Set from the registry index (`providerPriorityOf`), not from the order
   * results happened to arrive in: the progressive runner emits chunks as
   * providers *complete*, so arrival order is whichever site was quickest that
   * minute. Consumers sort by this to get the registry's intended order back.
   */
  providerPriority?: number;
  /** Torrent metadata — only set when sourceType === 'torrent' */
  seeders?: number;
  leechers?: number;
  peers?: number;      // seeders + leechers
  torrentTitle?: string;
  fileSize?: string;   // human-readable size string e.g. "1.4 GB"
  /** Magnet link — always set for torrents when available. url may be a .torrent file URL */
  magnetLink?: string;
  /** 0–100 relevance score: how well title + episode match the request */
  matchScore?: number;
  /** Parsed release group name e.g. "SubsPlease" */
  releaseGroup?: string;
  /** Container tag for torrent results, e.g. `mkv`, `mp4`, or generic `video`. */
  fileFormat?: TorrentFileFormat;
}

export interface LanguageCapability {
  language: string;
  label: string;
  type: 'audio' | 'subtitle';
  sourceHint?: string;
}

export interface PreviewResult {
  provider: string | null;
  streamUrl: string | null;
  isHls: boolean;
  previewTimestampSec: number;
}

export interface WebsiteIndexEpisode {
  number: number;
  title?: string;
  aired?: string;
}

export interface WebsiteIndexResult {
  provider: string | null;
  episodeCount: number;
  episodes: WebsiteIndexEpisode[];
}
