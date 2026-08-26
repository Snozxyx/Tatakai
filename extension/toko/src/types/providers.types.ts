/**
 * Provider interface definitions
 * Defines the contracts that all providers must implement
 */

import type {
  SourceOptions,
  SourceResult,
  LanguageCapability,
} from './source.types.js';

import type {
  MangaChapterParams,
  MangaChapterEntry,
  MangaPageEntry,
} from './manga.types.js';

/**
 * The origins a provider talks to, primary first.
 *
 * Declared so the provider inventory can be *checked* without resolving an
 * episode: `TokoBundleClass.checkProviders()` pings these to answer "is this
 * site up right now", which is the only health question a status page can ask
 * with no anime in hand. Resolution never reads this — each provider still owns
 * its own URL building — so the list is documentation that happens to be
 * machine-readable, and it points at whatever constant the provider already
 * uses rather than repeating it.
 *
 * Optional: a provider with no `sites` reports as unchecked, not as down.
 */
export interface ProviderSites {
  sites?: string[];
}

export interface StreamProvider extends ProviderSites {
  name: string;
  single(opts: SourceOptions): Promise<SourceResult[]>;
  movie?(opts: SourceOptions): Promise<SourceResult[]>;
  getLanguages?(opts: SourceOptions): Promise<LanguageCapability[]>;
}

export interface TorrentProvider extends ProviderSites {
  name: string;
  batch(opts: SourceOptions): Promise<SourceResult[]>;
}

export interface MangaProvider extends ProviderSites {
  name: string;
  getChapters(params: MangaChapterParams): Promise<MangaChapterEntry[]>;
  getPages(chapterKey: string): Promise<MangaPageEntry[]>;
}

/** One provider's reachability verdict, from `TokoBundleClass.checkProviders()`. */
export interface ProviderHealth {
  provider: string;
  kind: 'stream' | 'torrent' | 'manga';
  /** Registry rank, lowest first — the same number stamped onto sources. */
  priority: number;
  /** The origin that was actually probed, or `''` when none is declared. */
  site: string;
  /**
   * `up` — answered below 400.
   * `degraded` — answered, but with a client/server error status. The site is
   *   alive; whether the provider can scrape it is a different question.
   * `down` — no answer at all (DNS, TLS, connection refused, timeout).
   * `unchecked` — the provider declares no origin, so nothing was probed.
   */
  status: 'up' | 'degraded' | 'down' | 'unchecked';
  /** HTTP status when one was received, else 0. */
  httpStatus: number;
  latencyMs: number;
  error?: string;
}

/** Diagnostic information for provider execution */
export interface ProviderDiagnostic {
  provider: string;
  status: 'ok' | 'empty' | 'error' | 'timeout';
  durationMs: number;
  resultCount: number;
  /** Number of provider attempts, including the initial request. */
  attempts?: number;
  error?: string;
}

/** Chunk emitted by progressive runners */
export interface ProviderChunk<T> {
  provider: string;
  results: T[];
  diagnostic: ProviderDiagnostic;
  /**
   * Registry rank of `provider`, lowest first. Present so a consumer that
   * receives chunks out of order (which is the normal case — they arrive as
   * providers complete) can still order them the way the extension intended.
   */
  providerPriority?: number;
}

/** Result structure for debug mode */
export interface DebugProviderResult<T> {
  results: T[];
  diagnostics: ProviderDiagnostic[];
}
