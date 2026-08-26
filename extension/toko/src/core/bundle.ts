/**
 * Toko Bundle Class
 * Main entry point for the Toko extension runtime
 * Provides all public methods invoked by the Tatakai runtime
 */

import { fetchResponse } from '../utils/http/fetch.js';
import { detectSourceType } from '../utils/scraping/quality.js';
import { withProviderTimeout } from '../utils/common/timeout.js';
import {
  runProviders,
  runProvidersProgressive,
  resolveProviderRunOptions,
} from './provider-runner.js';
import {
  annotateTorrentResults,
  mergeMangaChapters,
} from './result-processor.js';

import {
  STREAM_PROVIDERS,
  TORRENT_PROVIDERS,
  MANGA_PROVIDERS,
  LEAD_STREAM_PROVIDERS,
  providerPriorityOf,
} from '../providers/registry.js';

import type {
  SourceOptions,
  SourceResult,
  LanguageCapability,
  MangaChapterEntry,
  MangaChapterParams,
  MangaPageEntry,
  PreviewResult,
  WebsiteIndexResult,
  ProviderDiagnostic,
  ProviderChunk,
  DebugProviderResult,
} from '../types/index.js';

// Worker sandbox globals injected by extension-worker-pool.cjs
declare const TATAKAI_API_BASE_URL: string | undefined;

/**
 * Custom error for chapter not found scenarios
 */
class ChapterNotFoundError extends Error {
  constructor(chapterKey: string) {
    super(`Chapter not found: ${chapterKey}`);
    this.name = 'ChapterNotFoundError';
  }
}

/**
 * Stamp each result with the registry rank of the provider that produced it.
 *
 * This is the extension stating which server should play, in a form that
 * survives everything downstream: the host's LRU cache, the SSE stream and the
 * app's source list all keep insertion order, and insertion order here is
 * provider *completion* order. `providerPriority` is the only thing that still
 * says "nebula is first" after that trip.
 *
 * `result.source` is the provider's own name; `providerName` is only set by
 * providers that expose several servers, so prefer the former and fall back.
 */
function stampPriority(results: SourceResult[], providerName: string): SourceResult[] {
  const fallback = providerPriorityOf(providerName);
  return results.map(result => ({
    ...result,
    providerPriority: result.source
      ? providerPriorityOf(result.source)
      : fallback,
  }));
}

/**
 * Main Toko Bundle Class
 * Orchestrates provider execution and result aggregation
 */
export class TokoBundleClass {
  /**
   * Validates bundle initialization
   * Ensures at least one provider is available
   */
  validate(): { valid: boolean; reason?: string } {
    const totalProviders =
      STREAM_PROVIDERS.length +
      TORRENT_PROVIDERS.length +
      MANGA_PROVIDERS.length;

    if (totalProviders === 0) {
      return { valid: false, reason: 'No providers initialised' };
    }

    return { valid: true };
  }

  // ── Single Episode Sources ──────────────────────────────────────────────

  /**
   * Returns direct-stream sources for a single episode
   * Torrent providers are never called
   */
  async single(opts: SourceOptions): Promise<SourceResult[]> {
    const results = await runProviders(
      STREAM_PROVIDERS,
      async p => stampPriority(await p.single(opts), p.name),
      undefined,
      resolveProviderRunOptions(opts.providerOptions)
    );
    return annotateTorrentResults(results);
  }

  /**
   * Debug variant of single() with diagnostic information
   */
  async debugSingle(opts: SourceOptions): Promise<DebugProviderResult<SourceResult>> {
    const diagnostics: ProviderDiagnostic[] = [];
    const results = await runProviders(
      STREAM_PROVIDERS,
      async p => stampPriority(await p.single(opts), p.name),
      diagnostics,
      resolveProviderRunOptions(opts.providerOptions)
    );
    return { results: annotateTorrentResults(results), diagnostics };
  }

  /**
   * Progressive variant - calls onChunk as each provider resolves
   * Used for streaming/SSE endpoints
   */
  async streamAll(
    opts: SourceOptions,
    onChunk: (chunk: ProviderChunk<SourceResult>) => void
  ): Promise<SourceResult[]> {
    const options = resolveProviderRunOptions(opts.providerOptions);
    return runProvidersProgressive(
      STREAM_PROVIDERS,
      async p => stampPriority(annotateTorrentResults(await p.single(opts)), p.name),
      onChunk,
      options,
      { lead: LEAD_STREAM_PROVIDERS, priorityOf: providerPriorityOf }
    );
  }

  // ── Batch & Torrent Sources ─────────────────────────────────────────────

  /**
   * Returns combined stream + torrent sources
   * Both provider sets run concurrently
   */
  async batch(opts: SourceOptions): Promise<SourceResult[]> {
    const options = resolveProviderRunOptions(opts.providerOptions);
    const [stream, torrent] = await Promise.all([
      runProviders(STREAM_PROVIDERS, async p => stampPriority(await p.single(opts), p.name), undefined, options),
      runProviders(TORRENT_PROVIDERS, async p => stampPriority(await p.batch(opts), p.name), undefined, options),
    ]);
    return annotateTorrentResults([...stream, ...torrent]);
  }

  /**
   * Debug variant of batch() with diagnostics
   */
  async debugBatch(opts: SourceOptions): Promise<DebugProviderResult<SourceResult>> {
    const diagnostics: ProviderDiagnostic[] = [];
    const options = resolveProviderRunOptions(opts.providerOptions);
    const [stream, torrent] = await Promise.all([
      runProviders(STREAM_PROVIDERS, async p => stampPriority(await p.single(opts), p.name), diagnostics, options),
      runProviders(TORRENT_PROVIDERS, async p => stampPriority(await p.batch(opts), p.name), diagnostics, options),
    ]);
    return { results: annotateTorrentResults([...stream, ...torrent]), diagnostics };
  }

  /**
   * Progressive variant of torrent batch
   */
  async torrentAll(
    opts: SourceOptions,
    onChunk: (chunk: ProviderChunk<SourceResult>) => void
  ): Promise<SourceResult[]> {
    const options = resolveProviderRunOptions(opts.providerOptions);
    return runProvidersProgressive(
      TORRENT_PROVIDERS,
      async p => stampPriority(annotateTorrentResults(await p.batch(opts)), p.name),
      onChunk,
      options,
      { priorityOf: providerPriorityOf }
    );
  }

  /**
   * Progressive variant streaming BOTH stream and torrent results
   */
  async sourcesAll(
    opts: SourceOptions,
    onChunk: (chunk: ProviderChunk<SourceResult>) => void
  ): Promise<SourceResult[]> {
    const options = resolveProviderRunOptions(opts.providerOptions);
    const [streamResults, torrentResults] = await Promise.all([
      runProvidersProgressive(
        STREAM_PROVIDERS,
        async p => stampPriority(annotateTorrentResults(await p.single(opts)), p.name),
        onChunk,
        options,
        // Nebula's sources reach the app before any other provider's, so the
        // watch page opens on it rather than on whichever site happened to be
        // quickest. Bounded: a slow or dead nebula just loses the head start.
        { lead: LEAD_STREAM_PROVIDERS, priorityOf: providerPriorityOf }
      ),
      runProvidersProgressive(
        TORRENT_PROVIDERS,
        async p => stampPriority(annotateTorrentResults(await p.batch(opts)), p.name),
        onChunk,
        options,
        { priorityOf: providerPriorityOf }
      ),
    ]);
    return [...streamResults, ...torrentResults];
  }

  // ── Per-provider introspection & execution ──────────────────────────────
  //
  // The aggregate calls above run every provider behind one request, which makes
  // a single misbehaving provider indistinguishable from a slow one. These two
  // methods are the debugging/scalability counterpart the host mounts as
  // `/providers` and `/providers/<name>`: one provider, one API call, one
  // diagnostic. Any extension implementing this pair gets the same endpoints —
  // nothing here is Toko-specific beyond the registry it reads.

  /**
   * Every provider this bundle can run, with the kind of call it answers.
   * `kind` tells the caller which entry point a provider uses: stream providers
   * resolve one episode (`single`), torrent providers query an indexer (`batch`).
   */
  listProviders(): Array<{ name: string; kind: 'stream' | 'torrent' | 'manga'; priority: number }> {
    return [
      ...STREAM_PROVIDERS.map(p => ({ name: p.name, kind: 'stream' as const, priority: providerPriorityOf(p.name) })),
      ...TORRENT_PROVIDERS.map(p => ({ name: p.name, kind: 'torrent' as const, priority: providerPriorityOf(p.name) })),
      ...MANGA_PROVIDERS.map((p, i) => ({ name: p.name, kind: 'manga' as const, priority: i })),
    ];
  }

  /**
   * Runs exactly one provider by name, with the same timeout/retry policy the
   * aggregate calls use, and returns its diagnostic alongside the results.
   * Manga providers are rejected — they answer a different contract.
   *
   * @throws Error when `providerName` matches no stream/torrent provider.
   */
  async runProvider(
    providerName: string,
    opts: SourceOptions
  ): Promise<ProviderChunk<SourceResult> & { kind: 'stream' | 'torrent' }> {
    const wanted = String(providerName || '').trim().toLowerCase();
    if (!wanted) throw new Error('provider name is required');

    const options = resolveProviderRunOptions(opts.providerOptions);
    const stream = STREAM_PROVIDERS.find(p => p.name.toLowerCase() === wanted);
    const torrent = stream ? undefined : TORRENT_PROVIDERS.find(p => p.name.toLowerCase() === wanted);

    if (!stream && !torrent) {
      throw new Error(`unknown provider: ${providerName}`);
    }

    let chunk: ProviderChunk<SourceResult> | undefined;
    const capture = (c: ProviderChunk<SourceResult>) => { chunk = c; };

    if (stream) {
      await runProvidersProgressive(
        [stream],
        async p => stampPriority(annotateTorrentResults(await p.single(opts)), p.name),
        capture,
        options,
        { priorityOf: providerPriorityOf }
      );
    } else {
      await runProvidersProgressive(
        [torrent!],
        async p => stampPriority(annotateTorrentResults(await p.batch(opts)), p.name),
        capture,
        options,
        { priorityOf: providerPriorityOf }
      );
    }

    const name = (stream || torrent)!.name;
    return {
      provider: name,
      kind: stream ? 'stream' : 'torrent',
      results: chunk?.results ?? [],
      diagnostic: chunk?.diagnostic ?? {
        provider: name,
        status: 'empty',
        durationMs: 0,
        resultCount: 0,
        attempts: 0,
      },
    };
  }

  // ── Movie Sources ───────────────────────────────────────────────────────

  /**
   * Returns direct-stream sources for movies (no episode constraint)
   * Torrent providers are never called
   */
  async movie(opts: SourceOptions): Promise<SourceResult[]> {
    const results = await runProviders(
      STREAM_PROVIDERS,
      p => (p.movie ? p.movie(opts) : p.single(opts)),
      undefined,
      resolveProviderRunOptions(opts.providerOptions)
    );
    return annotateTorrentResults(results);
  }

  // ── Language Capabilities ───────────────────────────────────────────────

  /**
   * Aggregates language capabilities from all stream providers
   */
  async getLanguages(opts: SourceOptions): Promise<LanguageCapability[]> {
    const results = await runProviders(
      STREAM_PROVIDERS,
      async p => {
        if (p.getLanguages) return p.getLanguages(opts);
        return [];
      },
      undefined,
      resolveProviderRunOptions(opts.providerOptions)
    );
    return results as LanguageCapability[];
  }

  // ── Manga Support ───────────────────────────────────────────────────────

  /**
   * Returns manga chapters merged by chapter number
   * Multiple providers returning the same chapter number are merged
   */
  async getMangaChapters(params: MangaChapterParams): Promise<MangaChapterEntry[]> {
    const all = await runProviders(
      MANGA_PROVIDERS,
      p => p.getChapters(params)
    ) as MangaChapterEntry[];
    return mergeMangaChapters(all);
  }

  /**
   * Debug variant of getMangaChapters() with diagnostics
   */
  async debugMangaChapters(
    params: MangaChapterParams
  ): Promise<DebugProviderResult<MangaChapterEntry>> {
    const diagnostics: ProviderDiagnostic[] = [];
    const all = await runProviders(
      MANGA_PROVIDERS,
      p => p.getChapters(params),
      diagnostics
    ) as MangaChapterEntry[];
    return { results: mergeMangaChapters(all), diagnostics };
  }

  /**
   * Returns pages for a specific chapter from named provider
   * Parses chapterKey as "<provider>:<providerChapterId>"
   */
  async getMangaPages(params: {
    chapterKey: string;
    provider?: string;
    providerChapterId?: string;
    anilistId?: number;
  }): Promise<MangaPageEntry[]> {
    const { chapterKey } = params;

    // Derive provider name from explicit param or chapterKey prefix
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

  // ── Preview & Indexing ──────────────────────────────────────────────────

  /**
   * Returns preview stream source for hover/detail video previews
   * Never throws - returns null result on failure
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

      const results = await runProviders(
        STREAM_PROVIDERS,
        p => p.single(opts)
      ) as SourceResult[];

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
   * Returns episode count and list from website-first indexing
   * Delegates to TatakaiAPI when available, otherwise tries direct scraping
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
      // Try TatakaiAPI first if available
      if (typeof TATAKAI_API_BASE_URL !== 'undefined' && TATAKAI_API_BASE_URL) {
        const url = new URL('/toko/index/episodes', TATAKAI_API_BASE_URL);
        url.searchParams.set('anilistId', String(params.anilistId));
        if (params.tatakaiId) {
          url.searchParams.set('tatakaiId', params.tatakaiId);
        }
        params.titles.forEach(t => url.searchParams.append('titles[]', t));

        try {
          const res = await fetchResponse(url.toString());
          if (res.ok) {
            const data = await res.json() as WebsiteIndexResult;
            if (data.provider && data.episodeCount > 0) return data;
          }
        } catch {
          // Fall through to direct provider attempt
        }
      }

      // Fallback: try sample episode to confirm availability
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
