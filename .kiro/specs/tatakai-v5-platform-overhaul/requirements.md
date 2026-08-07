# Requirements Document

## Introduction

This document defines the formal requirements for the TatakaiV5 Platform Overhaul, covering five interconnected feature areas of the TatakaiV5 Electron + React desktop application:

1. **Torrent Engine Overhaul**  Fix reliability, metadata resolution, real-time peer counts, .torrent file support, .exe blocking, and pre-download preview.
2. **Watch Page Source UI Redesign**  Categorize sources by dub language, add hover metadata tooltips, visually differentiate source types, and fix the Continue Watch poster bug.
3. **Name Parser & Anime Catalog Mapping**  Improve title normalization, AniList catalog mapping, season-to-entry resolution, and edge-case handling.
4. **Extension Platform Full Fix**  Wire the complete submission  review  download workflow, add source code transparency, and connect the marketplace API client.
5. **Download System**  Unified HLS + torrent download queue with source selection, concurrency limits, auto-download subscriptions, and path security.

All five areas run on the shared Electron + React 18 + Vite + Zustand + TanStack Query + Tailwind CSS + Radix UI stack. The Electron main process (Node.js, CommonJS) hosts the torrent engine, extension sandbox, and download manager. The renderer (sandboxed Chromium) hosts all React UI. IPC via `tatakaiRuntime` / `window.electron` context bridges is the only communication channel between them.

---

## Glossary

- **TorrentEngine**  The main-process subsystem comprising `TorrentFacade`, `TorrentSessionManager`, `CandidateDiscovery`, `ReleaseParser`, `EpisodeMatcher`, and `StreamBridge`.
- **TorrentSessionManager**  The main-process class that manages active WebTorrent sessions.
- **TorrentFacade**  The public API class consumed by `ipc-torrent.cjs` IPC handlers.
- **WebTorrentClient**  The WebTorrent v2 client instance created inside `TorrentSessionManager`.
- **TorrentCandidate**  A search result from Nyaa.si RSS, enriched with parsed metadata and quality scores.
- **TorrentPreviewResult**  The file-list metadata returned by `torrent:preview` before a download starts.
- **TorrentProgressEvent**  The real-time progress event pushed from main process to renderer via `torrent:progress`.
- **SourcePanel**  The React component in `WatchPage.tsx` that renders the list of available playback sources.
- **CategorizedSource**  A typed source object with `type` (`hls` | `embed` | `torrent`), `dubLanguage`, `dubLanguageCode`, `quality`, `seeders`, `leechers`, and provider metadata.
- **DubLanguageGroup**  A grouping of `CategorizedSource` objects sharing the same `dubLanguageCode`.
- **SourceTypeBadge**  The visual badge rendered on each source card indicating its type (HLS / Embed / Torrent).
- **ContinueWatchingEntry**  A local-storage record tracking the last-watched episode and its poster URL.
- **ReleaseParser**  The main-process anitomy-style regex parser that extracts structured metadata from raw torrent filenames.
- **ParsedRelease**  The structured output of `ReleaseParser`, including title, episode, season, codec, and quality fields.
- **TitleNormalizer**  The module (`src/core/naming/title-normalizer.ts`) that strips special characters, articles, and year suffixes from anime titles for fuzzy search.
- **CatalogMapper**  The module (`src/core/naming/catalog-mapper.ts`) that maps a `ParsedRelease` to an AniList entry using title variants and synonym search.
- **AniList**  The external anime metadata API used for catalog mapping and season resolution.
- **TitleCache**  An in-memory LRU cache (max 500 entries) backed by IPC persistence, storing `CatalogMappingResult` objects keyed by normalized title.
- **ExtensionRegistry**  The main-process in-memory registry of loaded extensions.
- **KaiFormat**  The `.kai` bundle format: a ZIP file containing `manifest.json`, `bundle.js`, `README.md`, and optionally `icon.png`.
- **MarketplaceAPI**  The external Tatakai Marketplace REST API at `https://marketplace.tatakai.app/api/v1`.
- **ExtensionSubmission**  A record tracking the status of a `.kai` bundle submitted to the marketplace.
- **DownloadQueue**  The main-process queue managing active and pending download tasks.
- **AutoDownloader**  The main-process service that polls for new episodes and enqueues downloads for subscribed anime.
- **DownloadQueueEntry**  A record in the `DownloadQueue` with `sourceType` (`hls` | `torrent`), status, and source-specific fields.
- **IPC**  Inter-Process Communication between the Electron main process and the renderer, exposed via `ipcMain.handle` / `ipcRenderer.invoke`.
- **Renderer**  The sandboxed Chromium renderer process hosting the React UI.
- **MainProcess**  The Node.js Electron main process hosting the torrent engine, extension sandbox, and download manager.

---

## Requirements

### Requirement 1: Torrent Metadata Resolution Reliability

**User Story:** As a user, I want torrent metadata to resolve reliably without timing out, so that I can start watching or downloading without repeated failures.

#### Acceptance Criteria

1. WHEN `TorrentSessionManager` initializes the `WebTorrentClient`, THE `TorrentEngine` SHALL configure DHT with at least four bootstrap nodes (`router.bittorrent.com:6881`, `dht.transmissionbt.com:6881`, `router.utorrent.com:6881`, `dht.aelitis.com:6881`).
2. WHEN a magnet link is added and metadata has not resolved within 45 seconds, THE `TorrentEngine` SHALL return a partial result with `metadataResolved: false` and continue resolving in the background.
3. WHEN background metadata resolution completes after the initial timeout, THE `TorrentEngine` SHALL emit a `torrent:metadata-ready` event to the renderer with the resolved metadata.
4. WHEN `TorrentSessionManager._ensureClient()` is called from the renderer process, THE `TorrentEngine` SHALL throw an error with the message `TorrentSessionManager must run in the main process` and abort initialization.
5. WHEN `global.setInterval` is called before WebTorrent loads and the returned timer object lacks an `unref` method, THE `TorrentEngine` SHALL attach a no-op `unref` function to the timer to prevent runtime errors.

---

### Requirement 2: Real-Time Seeder and Leecher Counts

**User Story:** As a user, I want to see accurate seeder and leecher counts for each torrent, so that I can choose the best source for fast downloads.

#### Acceptance Criteria

1. WHEN a torrent session is active and tracker scrape data is available, THE `TorrentEngine` SHALL emit `seeders` and `leechers` as separate fields in every `TorrentProgressEvent`.
2. WHEN tracker scrape data is unavailable for an active session and `torrent.numPeers` is greater than 0, THE `TorrentEngine` SHALL set `leechers` to `torrent.numPeers` and `seeders` to `0` in the `TorrentProgressEvent`.
3. WHEN tracker scrape data is unavailable and no peers are connected (`torrent.numPeers === 0`), THE `TorrentEngine` SHALL set both `seeders` and `leechers` to `null` in the `TorrentProgressEvent` to indicate that peer count data is unavailable.
3. THE `TorrentEngine` SHALL emit `seeders` and `leechers` values that are non-negative integers in every `TorrentProgressEvent`.
4. WHEN the renderer invokes `torrent:peers` for an active session, THE `TorrentEngine` SHALL return the current `seeders` and `leechers` counts without requiring a full stats poll.

---

### Requirement 3: Torrent File Preview Before Download

**User Story:** As a user, I want to preview the file list of a torrent before starting a download, so that I can verify the content and avoid unwanted files.

#### Acceptance Criteria

1. WHEN the renderer invokes `torrent:preview` with a magnet link, THE `TorrentEngine` SHALL resolve the torrent metadata in metadata-only mode (no data stored to disk) and return a `TorrentPreviewResult` containing the file list.
2. WHEN `torrent:preview` resolves successfully, THE `TorrentEngine` SHALL classify each file with `isVideo: true` if its extension matches `.mkv`, `.mp4`, `.avi`, `.m4v`, `.ts`, or `.mov`, and `isExe: true` if its extension matches `.exe`.
3. WHEN `torrent:preview` resolves successfully, THE `TorrentEngine` SHALL remove the torrent from the `WebTorrentClient` before returning the result, leaving no session entry in `TorrentSessionManager._sessions`. THE `TorrentEngine` SHALL only report `success: true` when both the torrent removal and the result delivery complete successfully.
4. WHEN `torrent:preview` does not resolve within 20 seconds, THE `TorrentEngine` SHALL return `{ success: false, error: 'preview_timeout' }`.
5. WHEN `torrent:preview` detects at least one `.exe` file in the torrent, THE `TorrentEngine` SHALL set `hasExeFiles: true` in the returned `TorrentPreviewResult`.

---

### Requirement 4: Torrent .exe File Blocking

**User Story:** As a user, I want the application to block torrents containing executable files, so that I am protected from malicious downloads.

#### Acceptance Criteria

1. WHEN `TorrentSessionManager.start()` is called and the resolved torrent contains at least one file with a `.exe` extension, THE `TorrentEngine` SHALL immediately remove the torrent from the `WebTorrentClient` with `destroyStore: true` and return `{ success: false, blocked: true, error: 'BLOCKED_EXE: ...' }`.
2. WHEN a torrent is blocked due to `.exe` files, THE `TorrentEngine` SHALL NOT create a session entry in `TorrentSessionManager._sessions`.
3. WHEN a torrent download session is active and a `.exe` file is detected mid-session, THE `TorrentEngine` SHALL stop the session, delete all partial files, and emit a `torrent:blocked` event to the renderer.
4. WHEN `torrent:preview` returns `hasExeFiles: true`, THE `TorrentEngine` SHALL NOT automatically start a download session for that torrent.

---

### Requirement 5: .torrent File Support

**User Story:** As a user, I want to start downloads from `.torrent` files in addition to magnet links, so that I can use sources that provide `.torrent` files instead of magnets.

#### Acceptance Criteria

1. WHEN the renderer invokes `torrent:start` with a `torrentBuffer` field containing a valid `.torrent` file as a `Buffer`, THE `TorrentEngine` SHALL start a download session using that buffer instead of a magnet link.
2. WHEN the renderer invokes `torrent:start-file` with a `torrentBuffer` and `options`, THE `TorrentEngine` SHALL convert the buffer to a `Buffer` if it is not already one and delegate to `TorrentFacade.startFromBuffer()`.
3. IF the `torrentBuffer` field is not a valid `.torrent` file, THEN THE `TorrentEngine` SHALL return `{ success: false, error: 'invalid_torrent_buffer' }` without starting any download session.

---

### Requirement 6: Watch Page Source Categorization by Dub Language

**User Story:** As a user, I want playback sources grouped by dub language, so that I can quickly find the language I prefer without scanning a flat list.

#### Acceptance Criteria

1. WHEN `SourcePanel` renders a list of `CategorizedSource` objects, THE `SourcePanel` SHALL group sources into `DubLanguageGroup` sections by `dubLanguageCode`.
2. WHEN multiple `DubLanguageGroup` sections are rendered, THE `SourcePanel` SHALL display the Japanese group first, the English group second, and all other languages in alphabetical order by language name.
3. WHEN a source has no detectable `dubLanguageCode`, THE `SourcePanel` SHALL place it in an "Unknown" group rendered after all identified language groups.
4. WHEN `groupSourcesByDubLanguage()` processes any array of `CategorizedSource` objects, THE `SourcePanel` SHALL produce groups whose total source count equals the input array length, with no sources lost or duplicated.

---

### Requirement 7: Watch Page Source Type Visual Differentiation

**User Story:** As a user, I want each source card to visually indicate whether it is an HLS stream, an embed, or a torrent, so that I can make an informed choice at a glance.

#### Acceptance Criteria

1. WHEN a source card is rendered for an HLS source, THE `SourcePanel` SHALL apply the `bg-muted/60` background and `text-muted-foreground` text color and display a badge labelled "HLS".
2. WHEN a source card is rendered for an embed source, THE `SourcePanel` SHALL apply the `bg-primary/20` background and `text-primary` text color and display a badge labelled "Embed".
3. WHEN a source card is rendered for a torrent source, THE `SourcePanel` SHALL apply the `bg-green-500/20` background and `text-green-400` text color and display a badge labelled "Torrent".
4. THE `SourcePanel` SHALL render a `SourceTypeBadge` on every source card regardless of whether the source is selected or unselected.

---

### Requirement 8: Watch Page Source Hover Metadata Tooltip

**User Story:** As a user, I want to hover over a source card and see detailed metadata, so that I can compare sources before selecting one.

#### Acceptance Criteria

1. WHEN a user hovers over a source card for at least 200 milliseconds, THE `SourcePanel` SHALL display a tooltip containing the source's `dubLanguage`, `sourceType`, `quality`, `providerName`, and `groupName` (if present).
2. WHEN a user hovers over a torrent source card, THE `SourcePanel` SHALL additionally display `seeders` and `leechers` counts in the tooltip.
3. WHEN seeder/leecher data for a torrent source is not yet available on hover, THE `SourcePanel` SHALL fetch it via the `torrent:peers` IPC channel and display it once received.
4. WHEN a user moves the cursor away from a source card, THE `SourcePanel` SHALL dismiss the tooltip immediately.
5. THE `SourcePanel` SHALL use a Radix UI Tooltip component with a 200-millisecond open delay for all source hover tooltips.

---

### Requirement 9: Continue Watch Poster Preservation

**User Story:** As a user, I want the Continue Watching section to always show the correct anime poster, so that I can identify what I was watching without seeing a placeholder image.

#### Acceptance Criteria

1. WHEN `updateLocalContinueWatching()` is called with a `ContinueWatchingEntry` that has a non-empty `animePoster`, THE `SourcePanel` SHALL store that poster URL in the updated entry.
2. WHEN `updateLocalContinueWatching()` is called with a `ContinueWatchingEntry` that has an empty `animePoster` and the existing stored entry has a non-empty `animePoster`, THE `SourcePanel` SHALL preserve the existing non-empty `animePoster` and not overwrite it.
3. WHEN `WatchPage.tsx` calls `updateLocalContinueWatching()`, THE `SourcePanel` SHALL pass the `animePoster` from `animeData?.info.poster` as a fallback if the primary poster value is empty.
4. IF no poster URL is available from any source, THEN THE `SourcePanel` SHALL store an empty string rather than a placeholder image URL.

---

### Requirement 10: Anime Title Normalization

**User Story:** As a user, I want torrent search to find the correct anime even when titles contain special characters or alternate names, so that I get accurate search results.

#### Acceptance Criteria

1. WHEN `normalizeTitle()` is called with `normalizeSpecialChars: true`, THE `TitleNormalizer` SHALL remove colons, exclamation marks, question marks, and tilde characters from the title and apply NFKC Unicode normalization.
2. WHEN `normalizeTitle()` is called with `stripArticles: true`, THE `TitleNormalizer` SHALL remove leading "The", "A", or "An" (case-insensitive) from the title.
3. WHEN `normalizeTitle()` is called with `removeYearSuffix: true`, THE `TitleNormalizer` SHALL remove a trailing four-digit year in parentheses (e.g., "(2023)") from the title.
4. WHEN `normalizeTitle()` is applied twice to the same title with the same options, THE `TitleNormalizer` SHALL produce the same result as applying it once (idempotency).
5. WHEN `buildSearchVariants()` is called with any title string, THE `TitleNormalizer` SHALL return an array that always includes the original unmodified title as one of its elements.
6. WHEN `buildSearchVariants()` is called with a title ending in "Season N", "Part N", or "Cour N", THE `TitleNormalizer` SHALL include a variant with that suffix removed.
7. WHEN `buildSearchVariants()` is called with a title ending in an ordinal season suffix (e.g., "2nd Season"), THE `TitleNormalizer` SHALL include a variant with that suffix removed.

---

### Requirement 11: Anime Catalog Mapping to AniList

**User Story:** As a user, I want the application to automatically identify the correct AniList entry for a torrent, so that episode tracking and metadata display are accurate.

#### Acceptance Criteria

1. WHEN `mapParsedReleaseToAnime()` is called with a `hints.anilistId`, THE `CatalogMapper` SHALL return a `CatalogMappingResult` with `confidence: 100` and `method: 'exact'` without querying AniList.
2. WHEN `mapParsedReleaseToAnime()` is called without hints and the title is found in the `TitleCache`, THE `CatalogMapper` SHALL return the cached result with `method: 'cache'` without querying AniList.
3. WHEN `mapParsedReleaseToAnime()` queries AniList and a result with `confidence >= 80` is found, THE `CatalogMapper` SHALL store the result in the `TitleCache` and return it.
4. WHEN all title variants fail to match with `confidence >= 80`, THE `CatalogMapper` SHALL attempt a synonym search via AniList and return the result with `method: 'alternate'` if found.
5. WHEN no match is found by any method, THE `CatalogMapper` SHALL return `{ confidence: 0, anilistId: null, malId: null }` and use the raw parsed title for display.
6. WHEN `mapParsedReleaseToAnime()` is called with an AniList ID hint, THE `CatalogMapper` SHALL return a `confidence` value greater than or equal to the `confidence` returned for the same release without a hint.

---

### Requirement 12: Season Number to AniList Entry Resolution

**User Story:** As a user, I want the application to correctly identify the AniList entry for Season 2 or later of a multi-season anime, so that episode numbers and metadata are correct.

#### Acceptance Criteria

1. WHEN `resolveSeasonEntry()` is called with `targetSeason <= 1`, THE `CatalogMapper` SHALL return the `baseAnilistId` unchanged.
2. WHEN `resolveSeasonEntry()` is called with `targetSeason = 2`, THE `CatalogMapper` SHALL return the AniList ID of the first SEQUEL relation of the base entry, sorted by start year ascending.
3. WHEN `resolveSeasonEntry()` is called with `targetSeason = N` where N > 2, THE `CatalogMapper` SHALL return the AniList ID of the (N-1)th SEQUEL relation (zero-indexed) sorted by start year ascending.
4. IF no SEQUEL relation exists for the requested season index, THEN THE `CatalogMapper` SHALL return `null`.

---

### Requirement 13: Release Parser Robustness

**User Story:** As a developer, I want the release parser to handle any input without crashing, so that unexpected filenames do not break the torrent search flow.

#### Acceptance Criteria

1. WHEN `parseReleaseName()` is called with any string input, THE `ReleaseParser` SHALL return a valid `ParsedRelease` object and SHALL NOT throw an exception.
2. WHEN `parseReleaseName()` returns a `ParsedRelease`, THE `ReleaseParser` SHALL set `confidence` to a value in the range [0, 100] inclusive.
3. WHEN `parseReleaseName()` processes a filename containing a decimal episode number (e.g., "18.5"), THE `ReleaseParser` SHALL set `isSpecial: true` on the returned `ParsedRelease`.
4. WHEN `parseReleaseName()` processes a batch filename with an episode range (e.g., "01-12"), THE `ReleaseParser` SHALL set `isBatch: true` and populate both `episodeNumber` and `episodeEnd` on the returned `ParsedRelease`.
5. WHEN `parseReleaseName()` processes a filename with season zero and episode number (e.g., "S00E03"), THE `ReleaseParser` SHALL set `specialEpisode` to the episode number and `isSpecial: true`.

---

### Requirement 14: Extension Submission Workflow

**User Story:** As an extension developer, I want to submit my `.kai` extension bundle to the marketplace from within the application, so that I can publish my extension without leaving the app.

#### Acceptance Criteria

1. WHEN the renderer invokes `extension:submit` with a valid `.kai` buffer and metadata, THE `ExtensionRegistry` SHALL parse and validate the `.kai` manifest before making any network request to the `MarketplaceAPI`.
2. WHEN the `.kai` manifest is missing required fields (`id`, `name`, `version`, `type`), THE `ExtensionRegistry` SHALL return `{ success: false, error: '...' }` without contacting the `MarketplaceAPI`.
3. WHEN the `.kai` manifest is valid and the `MarketplaceAPI` accepts the submission, THE `ExtensionRegistry` SHALL return `{ success: true, submissionId: '...', status: 'pending' }`.
4. WHEN `extension:submit` completes successfully, THE `ExtensionRegistry` SHALL append an audit log entry with the `extensionId` and `submissionId`.
5. IF the `MarketplaceAPI` is unreachable during submission, THEN THE `ExtensionRegistry` SHALL return `{ success: false, error: 'marketplace_unavailable' }`.
6. WHEN a `.kai` buffer exceeds 10 MB, THE `ExtensionRegistry` SHALL return `{ success: false, error: 'bundle_too_large' }` without contacting the `MarketplaceAPI`.

---

### Requirement 15: Extension Review Status Polling

**User Story:** As an extension developer, I want to poll the review status of my submitted extension, so that I know when it has been approved or rejected.

#### Acceptance Criteria

1. WHEN the renderer invokes `extension:review-status` with a `submissionId`, THE `ExtensionRegistry` SHALL query the `MarketplaceAPI` at `GET /marketplace/status/:submissionId` and return the current status.
2. WHEN the `MarketplaceAPI` returns a status, THE `ExtensionRegistry` SHALL include `status` (`pending` | `in_review` | `approved` | `rejected`), `notes`, `approvedAt`, and `downloadUrl` in the response.
3. WHEN the status is `approved`, THE `ExtensionRegistry` SHALL include a non-null `downloadUrl` in the response.
4. IF the `MarketplaceAPI` is unreachable during a status poll, THEN THE `ExtensionRegistry` SHALL return `{ success: false, error: '...' }`.

---

### Requirement 16: Extension Marketplace Browsing and Download

**User Story:** As a user, I want to browse and install extensions from the marketplace, so that I can add new sources and features to the application.

#### Acceptance Criteria

1. WHEN the renderer calls `fetchMarketplaceExtensions()`, THE `MarketplaceAPI` SHALL return a list of `MarketplaceExtension` objects including `id`, `name`, `version`, `type`, `description`, `author`, `permissions`, `downloads`, `rating`, `updatedAt`, and `downloadUrl`.
2. WHEN the renderer calls `fetchMarketplaceExtensions()` with a `type` filter, THE `MarketplaceAPI` SHALL return only extensions matching that type.
3. WHEN the renderer calls `downloadExtensionKai()` with a `downloadUrl`, THE `MarketplaceAPI` SHALL return the `.kai` bundle as an `ArrayBuffer`.
4. WHEN a downloaded `.kai` bundle is passed to `extension:load-kai`, THE `ExtensionRegistry` SHALL parse the bundle, verify its signature, install it, and return `{ success: true, extensionId: '...' }`.
5. IF the downloaded `.kai` bundle fails signature verification, THEN THE `ExtensionRegistry` SHALL return `{ success: false, error: 'invalid_signature' }` and SHALL NOT install the extension.

---

### Requirement 17: Extension Source Code Transparency

**User Story:** As a user, I want to view the source code of any installed extension, so that I can verify what the extension does before trusting it.

#### Acceptance Criteria

1. WHEN the renderer invokes `extension:get-source-code` with a loaded `extensionId`, THE `ExtensionRegistry` SHALL read the bundle file from the registered `bundlePath` and return its contents as a UTF-8 string.
2. WHEN the bundle file is larger than 50 KB, THE `ExtensionRegistry` SHALL return the first 50 KB of the file, set `truncated: true`, and include `totalBytes` in the response.
3. WHEN the bundle file is 50 KB or smaller, THE `ExtensionRegistry` SHALL return the complete file contents and set `truncated: false`.
4. WHEN `extension:get-source-code` is called for an `extensionId` that is not in the registry, THE `ExtensionRegistry` SHALL return `{ success: false, error: 'Extension not loaded' }`.
5. THE `ExtensionRegistry` SHALL only read from the path `<userData>/extensions/<extensionId>/bundle.js` and SHALL NOT write to disk, execute code, or access paths outside the extensions directory.

---

### Requirement 18: Unified Download Queue

**User Story:** As a user, I want to download episodes from either HLS or torrent sources through a single download queue, so that I can manage all my downloads in one place.

#### Acceptance Criteria

1. WHEN the renderer invokes `download:enqueue` with a `DownloadQueueEntry` of `sourceType: 'hls'`, THE `DownloadQueue` SHALL start an ffmpeg-based HLS download if fewer than 3 downloads are currently active.
2. WHEN the renderer invokes `download:enqueue` with a `DownloadQueueEntry` of `sourceType: 'torrent'`, THE `DownloadQueue` SHALL start a torrent session download if fewer than 3 downloads are currently active.
3. WHEN `download:enqueue` is called and 3 downloads are already active, THE `DownloadQueue` SHALL add the new entry to the pending queue with `status: 'queued'` and SHALL NOT start it immediately.
4. WHEN an active download completes or is cancelled and the pending queue is non-empty, THE `DownloadQueue` SHALL start the next queued download immediately.
5. THE `DownloadQueue` SHALL never have more than 3 concurrent active downloads at any time.
6. WHEN the renderer invokes `download:cancel` with a download ID, THE `DownloadQueue` SHALL stop the active download, remove it from the active set, and update its status to `'failed'`.
7. WHEN the renderer invokes `download:list`, THE `DownloadQueue` SHALL return all active and queued `DownloadQueueEntry` objects with their current statuses.

---

### Requirement 19: HLS Download Security

**User Story:** As a developer, I want HLS downloads to use a restricted protocol whitelist, so that arbitrary protocol execution via ffmpeg is prevented.

#### Acceptance Criteria

1. WHEN the `DownloadQueue` starts an HLS download, THE `DownloadQueue` SHALL pass the `protocol_whitelist` option to ffmpeg restricting protocols to `file`, `http`, `https`, `tcp`, `tls`, and `crypto`.
2. WHEN a `downloadPath` contains path traversal sequences (`../`), THE `DownloadQueue` SHALL reject the entry and return `{ success: false, error: 'invalid_download_path' }` without starting any download.
3. THE `DownloadQueue` SHALL resolve the download path using the following priority order: (1) the explicit `downloadPath` field in the `DownloadQueueEntry`, (2) the `tatakai_download_path` value stored in the renderer's `localStorage` (set during the app's initial setup flow), (3) `DownloadStorageManager.defaultLibraryRoot()` which resolves to `app.getPath('videos')/Tatakai`. The resolved path SHALL be used for all file write operations.

---

### Requirement 20: Auto-Download Subscriptions

**User Story:** As a user, I want to subscribe to auto-download for an anime series, so that new episodes are automatically downloaded when they become available.

#### Acceptance Criteria

1. WHEN the renderer invokes `auto-download:subscribe` with an `animeId` and `episodeNumber`, THE `AutoDownloader` SHALL create a subscription record with `nextEpisode` set to the specified episode number.
2. WHEN the renderer invokes `auto-download:unsubscribe` with an `animeId`, THE `AutoDownloader` SHALL remove the subscription record for that anime.
3. WHEN the renderer invokes `auto-download:list`, THE `AutoDownloader` SHALL return all active subscription records.
4. WHILE an auto-download subscription is active, THE `AutoDownloader` SHALL poll for new episodes every 30 minutes.
5. WHEN the `AutoDownloader` detects that episode N is available for a subscribed anime, THE `AutoDownloader` SHALL enqueue a download for episode N via `download:enqueue`.
6. WHEN a download for episode N completes successfully, THE `AutoDownloader` SHALL update the subscription's `nextEpisode` to N+1 before the next poll cycle.
7. THE `AutoDownloader` SHALL never enqueue the same episode number twice for the same subscription.
8. WHEN the HLS source for a subscribed episode is unavailable, THE `AutoDownloader` SHALL fall back to the torrent source for that episode.
9. IF both HLS and torrent sources are unavailable for a subscribed episode, THEN THE `AutoDownloader` SHALL skip that episode and retry on the next poll cycle.
