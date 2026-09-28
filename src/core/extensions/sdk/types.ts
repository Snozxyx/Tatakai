/**
 * Extension SDK — shared type definitions.
 *
 * This file is the single source of truth for all data shapes exchanged between
 * the Tatakai runtime and extension code. It MUST NOT import anything from
 * outside `src/core/extensions/`.
 *
 * @see Requirements 8.2, 8.3, 8.6
 */

// ---------------------------------------------------------------------------
// Source invocation types
// ---------------------------------------------------------------------------

/**
 * Parameters passed to every AbstractSource method.
 *
 * @see Requirements 8.2
 */
export interface SourceOptions {
  /** AniList media ID for the anime being resolved. */
  anilistId: number;

  /** All known titles for the anime (romaji, english, native, synonyms). */
  titles: string[];

  /** Target episode number (1-based). Omitted for movies and batch requests. */
  episode?: number;

  /** Total episode count for the series, if known. */
  episodeCount?: number;

  /** Preferred video resolution (e.g. "1080p", "720p"). */
  resolution: string;

  /** Tatakai-internal media ID, if available. */
  tatakaiId?: string;

  /** ISO 3166-1 alpha-2 country code of the requesting user. */
  countryCode?: string;

  /** List of source IDs to exclude from results. */
  exclusions?: string[];

  /**
   * Preferred audio language (single, e.g. "ja", "en", "hi").
   * @deprecated Prefer `preferredLanguages` for ordered fallback. Kept for backward compat.
   */
  preferredLanguage?: string;

  /**
   * Ordered list of preferred audio languages (BCP 47 tags or shorthands like 'sub', 'dub').
   * The engine will try languages in order and use the first available match.
   * e.g. ['hi', 'en', 'ja']
   */
  preferredLanguages?: string[];
}

/**
 * A single resolved source returned by an AbstractSource method.
 *
 * @see Requirements 8.3
 */
export interface SourceResult {
  /** Human-readable source label (e.g. "Nyaa", "SubsPlease"). */
  source: string;

  /** Direct playback URL (HLS manifest, MP4, magnet link, etc.). */
  url: string;

  /** Quality label (e.g. "1080p", "720p", "480p"). */
  quality: string;

  /** HTTP headers required to access the URL (e.g. `Referer`, `User-Agent`). */
  headers: Record<string, string>;

  /**
   * Ordered list of `Referer` values to try (best-first) when proxying this
   * stream. The core proxy is content-agnostic, so extensions supply the
   * per-CDN referer knowledge here; `headers.Referer` is the primary and the
   * first candidate. Only meaningful for direct-stream (hls/mp4) results.
   */
  refererCandidates?: string[];

  /** Available subtitle tracks for this source. */
  subtitles: SubtitleTrack[];

  /**
   * BCP 47 language tag of the audio track in this result (e.g. "ja", "en", "hi").
   * Extensions should set this so the language resolver can match without guessing.
   */
  audioLanguage?: string;

  /**
   * Source type for this result, used to determine download strategy.
   * 'torrent' = magnet/torrent, 'hls' = HLS stream (will be transcoded to MP4).
   */
  sourceType?: 'torrent' | 'hls' | 'mp4' | 'custom';
}

/**
 * A subtitle track associated with a SourceResult.
 */
export interface SubtitleTrack {
  /** URL to the subtitle file (SRT, VTT, ASS, etc.). */
  url: string;

  /** Human-readable label shown in the player UI (e.g. "English", "Japanese"). */
  label: string;

  /** BCP 47 language tag (e.g. "en", "ja"). */
  language: string;

  /** Whether this track should be selected by default. */
  default?: boolean;
}

// ---------------------------------------------------------------------------
// Language capability types (used by the language resolution engine)
// ---------------------------------------------------------------------------

/**
 * A single language+type combination that an extension can serve for a given
 * episode. Extensions return an array of these from `getLanguages()`.
 */
export interface LanguageCapability {
  /**
   * BCP 47 language tag (e.g. "ja", "en", "hi") or shorthand ("sub", "dub").
   * Extensions should prefer full ISO 639-1 codes.
   */
  language: string;

  /** Human-readable label for this language (e.g. "Japanese", "English Dub"). */
  label: string;

  /** Whether this is an audio track or subtitle track. */
  type: 'audio' | 'subtitle';

  /** Optional: URL or source hint for this specific language track. */
  sourceHint?: string;
}

// ---------------------------------------------------------------------------
// Extension manifest types
// ---------------------------------------------------------------------------

/**
 * Descriptor for an extension's in-process HTTP API server.
 * The runtime mounts the bundle's routes under `/api/v3/<namespace>/…`.
 *
 * @see Requirements 8.6
 */
export interface ExtensionApiServer {
  /** URL-safe namespace segment (e.g. "toko", "aurora"). Must be unique per extension. */
  namespace: string;

  /** Contract identifier the bundle implements (e.g. "streaming-sources-v3", "custom-source-v1"). */
  contract: string;

  /**
   * Route families this bundle serves. Gated families (`sources`, `stream`, `torrent`,
   * `download`) must be listed here to be reachable. Ungated families (`providers`,
   * `manga/*`, `custom/*`) are always reachable and 501 when the bundle method is absent.
   */
  routes: string[];

  /** Optional health-check path relative to the namespace mount. */
  healthPath?: string;
}

/**
 * Describes a single custom source (an isolated read/watch vertical) an extension provides.
 * Custom sources have their own home/info/watch/read UI and are NEVER tied to the
 * app's anime/manga watchlist or readlist.
 */
export interface CustomSourceDescriptor {
  /** Stable id, unique within the extension (used in routes: `/x/<namespace>/<id>`). */
  id: string;

  /** `watch` → gets a watch page fed by `SourceResult[]`; `read` → gets a reader page. */
  kind: 'read' | 'watch';

  /** Human-readable label shown in the sidebar "+" menu and page headers. */
  name: string;

  /** Base64 data URL or remote URL for the source's icon. */
  icon?: string;

  /** Short description shown in the source's home header. */
  description?: string;
}

/**
 * Known capability strings an extension can advertise for IPC/runtime discovery.
 * Arbitrary strings are still accepted for forward compatibility.
 */
export type ExtensionCapability =
  | 'manga'
  | 'preview'
  | 'websiteIndex'
  | 'theme'
  | 'analytics'
  | 'service'
  | 'module'
  | 'ui'
  | 'custom-source';

/**
 * A theme contributed declaratively via the manifest (data-driven — no renderer code).
 * The `colors` map is written verbatim as CSS custom properties on `:root`.
 */
export interface ContributedTheme {
  /** Unique theme id (namespaced by the extension at registration time). */
  id: string;

  /** Display name shown in the theme switcher. */
  name: string;

  /** CSS custom-property token map, e.g. `{ "--primary": "340 82% 66%", ... }`. */
  colors: Record<string, string>;

  /** Optional display metadata for the switcher. */
  info?: { label?: string; description?: string; accent?: string };
}

/**
 * A declarative analytics sink (data-driven). Events are POSTed to `ingestUrl`.
 */
export interface ContributedAnalytics {
  /** HTTPS endpoint that receives `{ type, name, payload, ts }` JSON bodies. */
  ingestUrl: string;

  /** Optional allowlist of event names to forward. Empty/absent = forward all. */
  events?: string[];
}

/**
 * Data-driven + code-driven contributions declared in the manifest.
 */
export interface ExtensionContributions {
  /** Path within the bundle to a renderer ESM entry (code-driven; trust-gated). */
  rendererEntry?: string;

  /** Declarative themes (data-driven). */
  themes?: ContributedTheme[];

  /** Declarative analytics sinks (data-driven). */
  analytics?: ContributedAnalytics[];
}

/**
 * JSON descriptor stored on disk alongside the extension bundle.
 * Curated extensions include a `signature` and `signedBy` field;
 * sideloaded extensions set `sideloaded: true` and omit the signature.
 */
export interface ExtensionManifest {
  /** Unique, URL-safe identifier (e.g. "nyaasearch"). */
  id: string;

  /** Human-readable display name. */
  name: string;

  /** Semantic version string (e.g. "1.2.0"). */
  version: string;

  /** Extension category. */
  type: 'torrent' | 'onlinestream' | 'custom';

  /** Short description shown in the Extension Hub grid. */
  description: string;

  /** Base64-encoded icon image, or a URL. */
  icon?: string;

  /**
   * Declared permission strings.
   * Network permissions use the format `network:domain:<hostname>`.
   * Parser permissions use the format `parse:<parser>`.
   */
  permissions: string[];

  /** Ed25519 signature of the extension bundle (curated extensions only). */
  signature?: string;

  /** Identity of the signing authority (e.g. "tatakai-marketplace"). */
  signedBy?: string;

  /** ISO 8601 timestamp when the extension was approved. */
  approvedAt?: string;

  /** `true` for extensions installed via sideloading. */
  sideloaded?: boolean;

  /** `true` if the extension has been deprecated and should not be installed. */
  deprecated?: boolean;

  /** Base64-encoded screenshot images shown on the detail page. */
  screenshots?: string[];

  /** Changelog entries for previous versions. */
  versionHistory?: VersionEntry[];

  /**
   * Multi-category labels for hub display (e.g. `["Anime Stream","Torrent","Manga"]`).
   * When `type` is `"custom"` and this array is non-empty, the hub renders one chip per
   * entry instead of the raw type string. Falls back to `"Unified Extension"` when
   * absent or empty.
   *
   * @see Requirements 11.1, 11.3
   */
  categories?: string[];

  /**
   * Named capabilities this extension advertises for IPC discovery.
   * Known values: `"manga"`, `"preview"`, `"websiteIndex"`.
   * Returned by `electron.listInstalledExtensions` so that runtime bridges can
   * determine whether an extension supports a given method before invoking it.
   *
   * @see Requirements 12.3
   */
  capabilities?: (ExtensionCapability | string)[];

  /**
   * Base64-encoded banner image, or a URL, shown at the top of the detail page.
   *
   * @see Requirements 7.5
   */
  banner?: string;

  /**
   * Descriptor for this extension's in-process HTTP API server.
   * Present when the extension serves data over the extension-API host.
   */
  apiServer?: ExtensionApiServer;

  /**
   * Isolated read/watch verticals this extension provides. Required (non-empty)
   * when `capabilities` includes `'custom-source'`.
   */
  customSources?: CustomSourceDescriptor[];

  /**
   * Ordering hint across extensions (lower = earlier). Defaults to 100.
   * Used to order source-resolution candidates; the primary extension ships `0`.
   */
  priority?: number;

  /** Data-driven + code-driven contributions (themes, analytics, renderer entry). */
  contributes?: ExtensionContributions;
}

/**
 * A single entry in an extension's version history.
 */
export interface VersionEntry {
  /** Semantic version string. */
  version: string;

  /** ISO 8601 date string (e.g. "2026-02-01"). */
  date: string;

  /** Human-readable changelog text. */
  changelog: string;
}

// ---------------------------------------------------------------------------
// IPC result types
// ---------------------------------------------------------------------------

/**
 * Structured result returned by the `extension:invoke` IPC handler.
 */
export interface ExtensionInvokeResult {
  /** `true` if the invocation completed without error. */
  success: boolean;

  /** Resolved source results (present when `success` is `true`). */
  result?: SourceResult[];

  /** Error message (present when `success` is `false`). */
  error?: string;

  /**
   * `true` if the response payload exceeded the 10 MB limit and was truncated.
   * @see Requirements 9.6
   */
  truncated?: boolean;
}

// ---------------------------------------------------------------------------
// Custom-source content contracts (`custom-source-v1`)
//
// A custom source is an isolated read/watch vertical. Its bundle implements the
// methods below; the app renders generic, anime-styled UI over the returned data.
// `customWatch` reuses `SourceResult` so the existing VideoPlayer consumes it
// unchanged; `customRead` reuses the manga-page shape so the existing reader does.
// Custom sources MUST NOT touch the anime/manga watchlist or readlist.
// ---------------------------------------------------------------------------

/** A single card in a home row or search grid. */
export interface CustomMediaCard {
  /** Stable id used to fetch info (`/x/<ns>/<sourceId>/info/<id>`). */
  id: string;

  /** Card title. */
  title: string;

  /** Cover image URL. */
  image?: string;

  /** Secondary line (e.g. "Ep 12", "Ongoing"). */
  subtitle?: string;

  /** Corner badge text (e.g. "HD", "NEW"). */
  badge?: string;
}

/** One titled row on a custom source's home page. */
export interface CustomHomeSection {
  title: string;
  items: CustomMediaCard[];
}

/** Result of `customHome(sourceId)`. */
export interface CustomHomeResult {
  sections: CustomHomeSection[];
}

/** Result of `customSearch(sourceId, query, page?)`. */
export interface CustomSearchResult {
  results: CustomMediaCard[];
  hasNextPage?: boolean;
}

/** A playable/readable entry (episode or chapter) listed on an info page. */
export interface CustomInfoEntry {
  /** Stable id used to fetch watch/read content. */
  id: string;

  /** Display label (e.g. "Episode 1", "Chapter 12"). */
  label: string;

  /** Numeric ordinal, if applicable. */
  number?: number;
}

/** Result of `customInfo(sourceId, id)`. */
export interface CustomInfoResult {
  id: string;
  title: string;
  image?: string;
  description?: string;
  /** Freeform key/value metadata shown in the header (e.g. { Status: "Ongoing" }). */
  meta?: Record<string, string>;
  /** Episodes (kind=watch) or chapters (kind=read). */
  entries: CustomInfoEntry[];
}

/** Result of `customWatch(sourceId, id, episodeId)` (kind=watch). */
export interface CustomWatchResult {
  sources: SourceResult[];
}

/** A single page image for a read entry. */
export interface CustomReadPageImage {
  pageNumber: number;
  imageUrl: string;
  headers?: Record<string, string>;
}

/** Result of `customRead(sourceId, id, chapterId)` (kind=read). */
export interface CustomReadResult {
  pages: CustomReadPageImage[];
}
