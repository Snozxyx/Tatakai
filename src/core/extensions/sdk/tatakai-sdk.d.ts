/**
 * src/core/extensions/sdk/tatakai-sdk.d.ts
 * TypeScript declarations for globals injected into the extension Web Worker.
 *
 * These globals are injected by the Tatakai main process before extension code
 * runs. Extension authors receive full IDE autocompletion for all injected APIs.
 *
 * Requirements: 8.4, 8.5
 */

// ── Injected global API types ─────────────────────────────────────────────────

/**
 * Metadata extracted from an anime release filename by anitomyscript.
 */
interface ParsedReleaseMetadata {
  /** Release group name, e.g. "SubsPlease". */
  releaseGroup?: string;
  /** Parsed anime title from the filename. */
  animeTitle?: string;
  /** Episode number parsed from the filename. */
  episodeNumber?: number;
  /** Video resolution string, e.g. "1080p". */
  videoResolution?: string;
  /** Audio term, e.g. "AAC", "FLAC". */
  audioTerm?: string;
  /** Source medium, e.g. "BluRay", "WEB". */
  source?: string;
  /** True if the release contains dual audio tracks. */
  isDualAudio?: boolean;
  /** True if the release is a batch/season pack. */
  isBatch?: boolean;
}

/**
 * Minimal jQuery/cheerio-like API for HTML parsing inside extension workers.
 * Returned by `__tatakai_parse_html__`.
 */
interface CheerioLikeAPI {
  /**
   * Find descendant elements matching a CSS selector.
   * @param selector - CSS selector string.
   */
  find(selector: string): CheerioLikeAPI;
  /** Return a new collection containing only the first matched element. */
  first(): CheerioLikeAPI;
  /**
   * Get the value of an attribute on the first matched element.
   * @param name - Attribute name.
   */
  attr(name: string): string | undefined;
  /** Get the combined text content of all matched elements. */
  text(): string;
  /** Get the inner HTML of the first matched element. */
  html(): string;
  /**
   * Iterate over matched elements.
   * @param fn - Callback receiving the index and a single-element CheerioLikeAPI.
   */
  each(fn: (index: number, el: CheerioLikeAPI) => void): void;
}

// ── Worker global augmentation ────────────────────────────────────────────────

declare global {
  /**
   * Domain-allowlisted fetch proxy injected by the Tatakai runtime.
   *
   * Behaves identically to the standard `fetch` API, but rejects requests to
   * domains not declared in the extension's `permissions` manifest field with
   * a `PermissionDeniedError`.
   *
   * Use this instead of the native `fetch` — direct `fetch` calls are blocked
   * inside the extension sandbox.
   */
  // eslint-disable-next-line no-var
  var __tatakai_fetch__: (url: string, init?: RequestInit) => Promise<Response>;

  /**
   * Anitomyscript-based release name parser injected by the Tatakai runtime.
   *
   * Parses an anime release filename into structured metadata including the
   * release group, episode number, resolution, audio terms, and batch flag.
   *
   * @param filename - Raw release filename, e.g. "[SubsPlease] Frieren - 01 (1080p) [ABC12345].mkv"
   * @returns Parsed release metadata object.
   */
  // eslint-disable-next-line no-var
  var __tatakai_anitomy__: (filename: string) => ParsedReleaseMetadata;

  /**
   * Cheerio-like HTML parser injected by the Tatakai runtime.
   *
   * Parses an HTML string and returns a jQuery-like API for traversal and
   * data extraction. Useful for scraping extension source pages.
   *
   * @param html - Raw HTML string to parse.
   * @returns A CheerioLikeAPI instance rooted at the document body.
   */
  // eslint-disable-next-line no-var
  var __tatakai_parse_html__: (html: string) => CheerioLikeAPI;
}

export { };
