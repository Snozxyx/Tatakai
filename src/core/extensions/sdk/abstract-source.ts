/**
 * src/core/extensions/sdk/abstract-source.ts
 * AbstractSource base class for the Tatakai Extension SDK.
 *
 * Every extension must extend this class and implement all abstract members.
 * The Tatakai runtime uses the `type` property to route invocations and the
 * `validate()` method to confirm the extension is operational before use.
 *
 * Requirements: 8.1, 8.2, 8.3
 */

export type { SourceOptions, SourceResult, SubtitleTrack, LanguageCapability } from './types';
import type { SourceOptions, SourceResult, LanguageCapability } from './types';

/**
 * Base class for all Tatakai extensions.
 *
 * Extension authors must extend this class and implement every abstract member.
 * The runtime will call `validate()` before the first invocation to confirm
 * the extension can reach its upstream source. If `validate()` returns `false`,
 * the extension is marked as unavailable and no further calls are made.
 *
 * @example
 * ```typescript
 * import { AbstractSource, SourceOptions, SourceResult } from 'tatakai-sdk';
 *
 * export class NyaaSearchExtension extends AbstractSource {
 *   readonly id = 'nyaasearch';
 *   readonly name = 'Nyaa Search';
 *   readonly version = '1.0.0';
 *   readonly type = 'torrent' as const;
 *
 *   async validate(): Promise<boolean> {
 *     const res = await fetch('https://nyaa.si');
 *     return res.ok;
 *   }
 *
 *   async single(options: SourceOptions): Promise<SourceResult[]> {
 *     // resolve single-episode torrent sources
 *     return [];
 *   }
 *
 *   async batch(options: SourceOptions): Promise<SourceResult[]> {
 *     // resolve batch/season pack torrent sources
 *     return [];
 *   }
 *
 *   async movie(options: SourceOptions): Promise<SourceResult[]> {
 *     // resolve movie torrent sources
 *     return [];
 *   }
 * }
 * ```
 */
export abstract class AbstractSource {
  // ── Identity ────────────────────────────────────────────────────────────────

  /**
   * Unique, stable identifier for this extension.
   * Must match the `id` field in the extension's manifest JSON.
   * Use lowercase kebab-case, e.g. `"nyaasearch"`.
   */
  abstract readonly id: string;

  /**
   * Human-readable display name shown in the Extension Hub.
   * e.g. `"Nyaa Search"`.
   */
  abstract readonly name: string;

  /**
   * Semantic version string matching the manifest, e.g. `"1.2.0"`.
   */
  abstract readonly version: string;

  /**
   * Extension category. Determines which source methods the runtime calls
   * and which UI sections the extension appears in.
   *
   * - `'torrent'`      — resolves magnet links / torrent info hashes
   * - `'onlinestream'` — resolves HLS/MP4 streaming URLs
   * - `'custom'`       — any other source type
   */
  abstract readonly type: 'torrent' | 'onlinestream' | 'custom';

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  /**
   * Validates that the extension's upstream source is reachable and operational.
   *
   * Called by the runtime before the first invocation in a session. If this
   * returns `false`, the extension is marked unavailable and `single()`,
   * `batch()`, and `movie()` will not be called until the next health check.
   *
   * @returns `true` if the source is operational, `false` otherwise.
   */
  abstract validate(): Promise<boolean>;

  // ── Language capability ─────────────────────────────────────────────────────

  /**
   * Returns the list of audio languages available for a given episode.
   *
   * The Tatakai automation engine calls this **before** `single()` to know
   * which languages this extension can serve for a specific episode. The engine
   * then matches against the user's ordered `preferredLanguages` list.
   *
   * This is a **live, per-episode query** — extensions should fetch or derive
   * the actual language tracks available for the given anilistId + episode.
   *
   * Extensions that cannot determine available languages should return `[]`.
   * The engine will then treat this extension as language-agnostic and fall back
   * to heuristics (inspecting `SourceResult.audioLanguage` from `single()`).
   *
   * @param options - Same invocation context as `single()`, with `episode` set.
   * @returns Array of language capabilities available for this episode.
   */
  async getLanguages(_options: SourceOptions): Promise<LanguageCapability[]> {
    return [];
  }

  // ── Source resolution ───────────────────────────────────────────────────────

  /**
   * Resolves sources for a single episode.
   *
   * Called when the user requests playback of a specific episode.
   * `options.episode` is always set for single-episode calls.
   *
   * @param options - Invocation context including AniList ID, titles, and episode number.
   * @returns An array of resolved source results, ordered by preference (best first).
   *          Return an empty array if no sources are found.
   */
  abstract single(options: SourceOptions): Promise<SourceResult[]>;

  /**
   * Resolves sources for a batch of episodes (e.g. a season pack).
   *
   * Called when the runtime wants to pre-resolve multiple episodes at once,
   * or when the user requests a batch download. `options.episodeCount` indicates
   * the total number of episodes expected in the batch.
   *
   * @param options - Invocation context including AniList ID, titles, and episode count.
   * @returns An array of resolved source results covering the batch.
   *          Return an empty array if no batch sources are found.
   */
  abstract batch(options: SourceOptions): Promise<SourceResult[]>;

  /**
   * Resolves sources for a movie or standalone OVA.
   *
   * Called when the media format is a movie (no episode number applies).
   * `options.episode` is typically `undefined` for movie calls.
   *
   * @param options - Invocation context including AniList ID and titles.
   * @returns An array of resolved source results for the movie.
   *          Return an empty array if no sources are found.
   */
  abstract movie(options: SourceOptions): Promise<SourceResult[]>;
}
