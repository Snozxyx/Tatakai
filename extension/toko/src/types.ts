/**
 * Toko Extension — Shared Type Definitions
 *
 * All data shapes exchanged between TokoBundleClass and its provider adapters.
 * Requirements: 2.1, 5.3
 */

// ── Source result types ───────────────────────────────────────────────────────

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
}

export interface LanguageCapability {
  language: string;
  label: string;
  type: 'audio' | 'subtitle';
  sourceHint?: string;
}

// ── Manga types ───────────────────────────────────────────────────────────────

export interface MangaChapterSource {
  provider: string;
  /** Format: "<provider>:<providerChapterId>" */
  chapterKey: string;
  providerChapterId: string;
  language: string;
  scanlator: string | null;
  releaseDate: string | null;
}

export interface MangaChapterEntry {
  number: number;
  title: string | null;
  volume: string | null;
  sources: MangaChapterSource[];
}

export interface MangaPageEntry {
  pageNumber: number;
  imageUrl: string;
}

export interface MangaChapterParams {
  anilistId?: number;
  malId?: number;
  title?: string;
}

// ── Preview and index types ───────────────────────────────────────────────────

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

// ── Provider interfaces ───────────────────────────────────────────────────────

export interface StreamProvider {
  name: string;
  single(opts: SourceOptions): Promise<SourceResult[]>;
  movie?(opts: SourceOptions): Promise<SourceResult[]>;
  getLanguages?(opts: SourceOptions): Promise<LanguageCapability[]>;
}

export interface TorrentProvider {
  name: string;
  batch(opts: SourceOptions): Promise<SourceResult[]>;
}

export interface MangaProvider {
  name: string;
  getChapters(params: MangaChapterParams): Promise<MangaChapterEntry[]>;
  getPages(chapterKey: string): Promise<MangaPageEntry[]>;
}
