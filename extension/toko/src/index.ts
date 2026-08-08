/**
 * TokoBundleClass — Toko Unified Extension entry point.
 *
 * Exposes all public methods invoked by the Tatakai runtime:
 *   validate(), single(), batch(), movie(), getLanguages()
 *   getMangaChapters(), getMangaPages()
 *   getPreviewSource(), getWebsiteEpisodeIndex()
 *
 * Requirements: 2.1–2.11, 4.4, 5.3–5.5, 9.8, 12.6
 */

// Worker sandbox globals injected by extension-worker-pool.cjs
declare const __tatakai_fetch__: (url: string, init?: RequestInit) => Promise<Response>;
declare const TATAKAI_API_BASE_URL: string | undefined;

import { withProviderTimeout } from './utils/timeout.js';
import { detectSourceType } from './utils/quality.js';
import type {
  SourceOptions,
  SourceResult,
  LanguageCapability,
  MangaChapterEntry,
  MangaChapterParams,
  MangaPageEntry,
  PreviewResult,
  WebsiteIndexResult,
  StreamProvider,
  TorrentProvider,
  MangaProvider,
} from './types.js';

// ── Provider imports ──────────────────────────────────────────────────────────
import animepahe from './providers/stream/animepahe.js';
import animeya from './providers/stream/animeya.js';
import toonstream from './providers/stream/toonstream.js';
import animelok from './providers/stream/animelok.js';
import watchanimeworld from './providers/stream/watchanimeworld.js';
import desidub from './providers/stream/desidub.js';
import hindidubbed from './providers/stream/hindidubbed.js';
import aniworld from './providers/stream/aniworld.js';
import senshi from './providers/stream/senshi.js';
import reanime from './providers/stream/reanime.js';
import fouranime from './providers/stream/fouranime.js';
import anikoto from './providers/stream/anikoto.js';
import mkissa from './providers/stream/mkissa.js';
import anizone from './providers/stream/anizone.js';
import animesalt from './providers/stream/animesalt.js';
import { I18N_STREAM_PROVIDERS } from './providers/i18n/index.js';

import nyaa from './providers/torrent/nyaa.js';
import acgrip from './providers/torrent/acgrip.js';
import animetosho from './providers/torrent/animetosho.js';
import subplease from './providers/torrent/subplease.js';
import seadex from './providers/torrent/seadex.js';
import nekobt from './providers/torrent/nekobt.js';
import acgnx from './providers/torrent/acgnx.js';
import aniliberty from './providers/torrent/aniliberty.js';

import allmanga from './providers/manga/allmanga.js';
import atsu from './providers/manga/atsu.js';
import mangafire from './providers/manga/mangafire.js';
import animesama from './providers/manga/animesama.js';
import asura from './providers/manga/asura.js';

// ── Provider lists ────────────────────────────────────────────────────────────

const STREAM_PROVIDERS: StreamProvider[] = [
  animepahe, animeya, toonstream, animelok, watchanimeworld,
  desidub, hindidubbed, aniworld, senshi, reanime, fouranime,
  anikoto, mkissa, anizone, animesalt,
  // Multilingual dubs (Arabic/French/German/Polish/Chinese/…)
  ...I18N_STREAM_PROVIDERS,
];

const TORRENT_PROVIDERS: TorrentProvider[] = [
  nyaa, acgrip, animetosho, subplease, seadex, nekobt, acgnx, aniliberty,
];

const MANGA_PROVIDERS: MangaProvider[] = [
  allmanga, atsu, mangafire, animesama, asura,
];

// ── ChapterNotFoundError ──────────────────────────────────────────────────────

class ChapterNotFoundError extends Error {
  constructor(chapterKey: string) {
    super(`Chapter not found: ${chapterKey}`);
    this.name = 'ChapterNotFoundError';
  }
}

type ProviderDiagnostic = {
  provider: string;
  status: 'ok' | 'empty' | 'error' | 'timeout';
  durationMs: number;
  resultCount: number;
  error?: string;
};

type DebugProviderResult<T> = {
  results: T[];
  diagnostics: ProviderDiagnostic[];
};

// ── runProviders helper ───────────────────────────────────────────────────────

/**
 * Runs all providers concurrently with a per-provider timeout.
 * Failed or timed-out providers are silently dropped; their results are excluded.
 * Requirements: 2.11
 */
async function runProviders<T, P extends { name: string }>(
  providers: P[],
  fn: (p: P) => Promise<T[]>,
  diagnostics?: ProviderDiagnostic[],
): Promise<T[]> {
  const results = await Promise.all(providers.map(async (provider) => {
    const startedAt = Date.now();
    try {
      // Convert an accidental synchronous provider throw into a failure for
      // that provider instead of aborting the entire fan-out.
      const value = await withProviderTimeout(
        Promise.resolve().then(() => fn(provider)),
        15_000,
      );
      diagnostics?.push({
        provider: provider.name,
        status: value.length > 0 ? 'ok' : 'empty',
        durationMs: Date.now() - startedAt,
        resultCount: value.length,
      });
      return value;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      diagnostics?.push({
        provider: provider.name,
        status: /timed out/i.test(message) ? 'timeout' : 'error',
        durationMs: Date.now() - startedAt,
        resultCount: 0,
        error: message,
      });
      return [] as T[];
    }
  }));
  return results.flat() as T[];
}

function mergeMangaChapters(all: MangaChapterEntry[]): MangaChapterEntry[] {
  const map = new Map<number, MangaChapterEntry>();
  for (const ch of all) {
    if (map.has(ch.number)) {
      map.get(ch.number)!.sources.push(...ch.sources);
    } else {
      map.set(ch.number, { ...ch, sources: [...ch.sources] });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.number - b.number);
}

// ── TokoBundleClass ───────────────────────────────────────────────────────────

class TokoBundleClass {
  /**
   * Validates that the bundle is properly initialised with at least one provider.
   * Requirements: 2.2
   */
  validate(): { valid: boolean; reason?: string } {
    const totalProviders =
      STREAM_PROVIDERS.length + TORRENT_PROVIDERS.length + MANGA_PROVIDERS.length;
    if (totalProviders === 0) {
      return { valid: false, reason: 'No providers initialised' };
    }
    return { valid: true };
  }

  /**
   * Returns direct-stream sources for a single episode.
   * Torrent providers are never called.
   * Requirements: 2.4
   */
  async single(opts: SourceOptions): Promise<SourceResult[]> {
    return runProviders(STREAM_PROVIDERS, p => p.single(opts));
  }

  /** Diagnostic variant of single() for the desktop extension debugger. */
  async debugSingle(opts: SourceOptions): Promise<DebugProviderResult<SourceResult>> {
    const diagnostics: ProviderDiagnostic[] = [];
    const results = await runProviders(STREAM_PROVIDERS, p => p.single(opts), diagnostics);
    return { results, diagnostics };
  }

  /**
   * Returns direct-stream + torrent sources.
   * Both provider sets run concurrently; results are merged.
   * Requirements: 2.5, 4.4
   */
  async batch(opts: SourceOptions): Promise<SourceResult[]> {
    const [stream, torrent] = await Promise.all([
      runProviders(STREAM_PROVIDERS, p => p.single(opts)),
      runProviders(TORRENT_PROVIDERS, p => p.batch(opts)),
    ]);
    return [...stream, ...torrent];
  }

  /** Diagnostic variant of batch() for the desktop extension debugger. */
  async debugBatch(opts: SourceOptions): Promise<DebugProviderResult<SourceResult>> {
    const diagnostics: ProviderDiagnostic[] = [];
    const [stream, torrent] = await Promise.all([
      runProviders(STREAM_PROVIDERS, p => p.single(opts), diagnostics),
      runProviders(TORRENT_PROVIDERS, p => p.batch(opts), diagnostics),
    ]);
    return { results: [...stream, ...torrent], diagnostics };
  }

  /**
   * Returns direct-stream sources for a movie (no episode constraint).
   * Torrent providers are never called.
   * Requirements: 2.6
   */
  async movie(opts: SourceOptions): Promise<SourceResult[]> {
    return runProviders(STREAM_PROVIDERS, p =>
      p.movie ? p.movie(opts) : p.single(opts),
    );
  }

  /**
   * Aggregates language capabilities from all direct-stream providers.
   * Requirements: 2.10
   */
  async getLanguages(opts: SourceOptions): Promise<LanguageCapability[]> {
    const results = await runProviders(STREAM_PROVIDERS, async p => {
      if (p.getLanguages) return p.getLanguages(opts);
      return [];
    });
    return results as LanguageCapability[];
  }

  /**
   * Returns all manga chapters merged and deduplicated by chapter number.
   * When multiple providers return the same chapter number, their source entries
   * are merged into a single chapter object.
   * Sorted ascending by chapter number.
   * Requirements: 2.7, 5.5
   */
  async getMangaChapters(params: MangaChapterParams): Promise<MangaChapterEntry[]> {
    const all = await runProviders(MANGA_PROVIDERS, p => p.getChapters(params)) as MangaChapterEntry[];
    return mergeMangaChapters(all);
  }

  /** Diagnostic variant of getMangaChapters() for the desktop debugger. */
  async debugMangaChapters(params: MangaChapterParams): Promise<DebugProviderResult<MangaChapterEntry>> {
    const diagnostics: ProviderDiagnostic[] = [];
    const all = await runProviders(MANGA_PROVIDERS, p => p.getChapters(params), diagnostics) as MangaChapterEntry[];
    return { results: mergeMangaChapters(all), diagnostics };
  }

  /**
   * Returns pages for a specific chapter from the named provider.
   * Parses `chapterKey` as `"<provider>:<providerChapterId>"`.
   * Throws ChapterNotFoundError if the provider is not registered or returns no pages.
   * Requirements: 2.8, 5.4
   */
  async getMangaPages(params: {
    chapterKey: string;
    /** Optional explicit provider name; if omitted, extracted from chapterKey prefix */
    provider?: string;
    providerChapterId?: string;
    anilistId?: number;
  }): Promise<MangaPageEntry[]> {
    const { chapterKey } = params;

    // Derive provider name: prefer explicit params.provider, otherwise parse from chapterKey
    let providerName = params.provider;
    if (!providerName) {
      const colonIdx = chapterKey.indexOf(':');
      providerName = colonIdx >= 0 ? chapterKey.slice(0, colonIdx) : chapterKey;
    }

    const provider = MANGA_PROVIDERS.find(p => p.name === providerName);
    if (!provider) throw new ChapterNotFoundError(chapterKey);
    const pages = await provider.getPages(chapterKey);
    if (pages.length === 0) throw new ChapterNotFoundError(chapterKey);
    return pages;
  }

  /**
   * Returns a preview stream source for hover/detail video previews.
   * Never throws — returns a null-source object on any failure.
   * Only uses direct-stream providers; torrent results are never returned.
   * Requirements: 2.1, 9.8, 12.6
   */
  async getPreviewSource(params: {
    anilistId: number;
    titles: string[];
    episode?: number;
  }): Promise<PreviewResult> {
    const NULL_RESULT: PreviewResult = {
      provider: null,
      streamUrl: null,
      isHls: false,
      previewTimestampSec: 0,
    };

    try {
      const opts: SourceOptions = {
        anilistId: params.anilistId,
        titles: params.titles,
        episode: params.episode,
        resolution: '1080p',
      };
      const results = await runProviders(STREAM_PROVIDERS, p => p.single(opts)) as SourceResult[];
      const first = results.find(r => r.url && r.sourceType !== 'torrent');
      if (!first) return NULL_RESULT;

      return {
        provider: first.source,
        streamUrl: first.url,
        isHls: detectSourceType(first.url) === 'hls',
        previewTimestampSec: 0,
      };
    } catch {
      return NULL_RESULT;
    }
  }

  /**
   * Returns episode count and episode list from website-first indexing.
   * Delegates to TatakaiAPI /toko/index/episodes when TATAKAI_API_BASE_URL is available;
   * otherwise tries direct provider scraping.
   * Never throws — returns a zero-count object on all-provider failure.
   * Requirements: 2.1, 8.1
   */
  async getWebsiteEpisodeIndex(params: {
    anilistId: number;
    tatakaiId?: string;
    titles: string[];
  }): Promise<WebsiteIndexResult> {
    const NULL_RESULT: WebsiteIndexResult = {
      provider: null,
      episodeCount: 0,
      episodes: [],
    };

    try {
      // If TatakaiAPI base URL is available, delegate to TatakaiAPI's /toko/index/episodes
      if (typeof TATAKAI_API_BASE_URL !== 'undefined' && TATAKAI_API_BASE_URL) {
        const url = new URL('/toko/index/episodes', TATAKAI_API_BASE_URL);
        url.searchParams.set('anilistId', String(params.anilistId));
        if (params.tatakaiId) url.searchParams.set('tatakaiId', params.tatakaiId);
        params.titles.forEach(t => url.searchParams.append('titles[]', t));

        try {
          const res = await __tatakai_fetch__(url.toString());
          if (res.ok) {
            const data = await res.json() as WebsiteIndexResult;
            if (data.provider && data.episodeCount > 0) return data;
          }
        } catch {
          // Fall through to direct provider attempt
        }
      }

      // Fallback: try to resolve the series with a sample episode to confirm availability
      // Note: Without a dedicated episode-index method on providers, we can only
      // verify that the series is available, not extract full episode counts.
      const opts: SourceOptions = {
        anilistId: params.anilistId,
        titles: params.titles,
        episode: 1,
        resolution: '1080p',
      };

      for (const p of STREAM_PROVIDERS.slice(0, 3)) {
        try {
          const results = await withProviderTimeout(p.single(opts), 15_000);
          if (results.length > 0) {
            // Provider resolved the series; we can't get full count without a dedicated API,
            // so return a minimal positive result
            return {
              provider: p.name,
              episodeCount: 1,
              episodes: [{ number: 1 }],
            };
          }
        } catch {
          continue;
        }
      }

      return NULL_RESULT;
    } catch {
      return NULL_RESULT;
    }
  }
}

export default TokoBundleClass;
