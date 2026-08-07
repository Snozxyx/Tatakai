# Requirements Document

## Introduction

Toko is a single marketplace-ready `custom` extension for the Tatakai platform that unifies direct-stream anime sources, anime torrent sources, and manga chapter/page sources under one installable package. It reuses the existing Tatakai extension runtime, the in-repo A1 scraper service, and A2 raw provider scripts, while adding two new capabilities: random-timestamp hover/detail video previews for anime cards and detail pages (two-tier: desktop local runtime + API-backed web path), and website-first episode/chapter indexing that overrides AniList/Jikan metadata counts whenever Toko can resolve the series directly from source websites.

The implementation spans nine concern areas: runtime worker-helper injection, the Toko extension bundle and build flow, A1 server-side indexing/preview support, TatakaiAPI routing for previews and indexing, frontend data-flow wiring, preview UI restoration, manga provider-category UI, marketplace hub presentation, and test/verification coverage.

## Glossary

- **Toko**: The unified `custom` marketplace extension being built; id `tatakai.extension.toko`.
- **Extension_Runtime**: The Electron main-process runtime in `desktop/runtime/extension/` that loads, sandboxes, and invokes `.kai` extension bundles via Node.js `worker_threads`.
- **Worker_Helper**: One of the three SDK globals injected into every extension worker: `__tatakai_fetch__`, `__tatakai_anitomy__`, `__tatakai_parse_html__`.
- **Kai_Package**: A `.kai` ZIP artifact (manifest.json + bundle.js + optional README/icon) that the Extension_Runtime installs and runs.
- **A1_Service**: The in-repo Hono/Express server under `extension/A1/` that provides server-side scraping, proxy, and provider endpoints consumed by TatakaiAPI and the desktop runtime.
- **A2_Scripts**: The raw provider TypeScript files under `extension/A2/scripts/` that are ported into Toko provider adapters.
- **TatakaiAPI**: The central Hono API server under `TatakaiAPI/` that provides playback dispatch, extension registry, and will host new preview/index routes.
- **Preview_Source**: A direct-stream (HLS or MP4) URL from a Toko provider that is used to render a muted looping video preview at a random timestamp.
- **Website_Index**: The authoritative episode or chapter list obtained by scraping the upstream provider website, used in preference to AniList/Jikan counts.
- **Direct_Stream_Provider**: A provider that returns an HLS manifest or MP4 URL suitable for direct video playback (e.g. animepahe, senshi). Never a torrent provider.
- **Torrent_Provider**: A provider that returns a magnet URI or torrent file URL (e.g. nyaa, subplease).
- **Manga_Provider**: A provider that returns manga chapter lists and page image URLs (e.g. allmanga, mangafire, asura).
- **Scanlator**: The group that translated/scanlated a manga chapter, exposed as metadata per chapter source.
- **Source_Options**: The `SourceOptions` interface from `src/core/extensions/sdk/types.ts` passed to every provider method call.
- **Extension_Hub**: The Tatakai marketplace UI pages (`ExtensionHubPage`, `ExtensionDetailPage`) where users discover and install extensions.
- **Allowed_Domain**: A hostname listed in the manifest `permissions` array under the `network:domain:<hostname>` format, enforced by `__tatakai_fetch__`.
- **Preview_Cache**: The in-memory client-side cache keyed by anime ID that stores resolved Preview_Source URLs and timestamps to avoid repeated hover fetches.
- **Episode_Count_Override**: The episode count obtained from a Website_Index that replaces the AniList/Jikan-supplied count in UI and playback routing.

---

## Requirements

### Requirement 1: Worker Helper Injection

**User Story:** As an extension developer, I want the Tatakai runtime to inject working `fetch`, HTML-parser, and release-name-parser globals into my extension worker, so that my extension code can scrape provider websites and parse release filenames without importing external dependencies.

#### Acceptance Criteria

1. WHEN the Extension_Runtime spawns a worker for any extension, THE Extension_Runtime SHALL inject a `__tatakai_fetch__` function that forwards HTTP requests through the local proxy, enforces the domain allowlist defined in Criterion 4, and times out any individual request that does not complete within 30 seconds with a `FetchTimeoutError`.
2. WHEN the Extension_Runtime spawns a worker for any extension, THE Extension_Runtime SHALL inject a `__tatakai_parse_html__` function that accepts a non-empty HTML string and returns a `CheerioLikeAPI` object supporting `find`, `first`, `attr`, `text`, `html`, and `each` as declared in `tatakai-sdk.d.ts`; IF the input string is empty or not a string, THEN `__tatakai_parse_html__` SHALL throw an `InvalidInputError`.
3. WHEN the Extension_Runtime spawns a worker for any extension, THE Extension_Runtime SHALL inject a `__tatakai_anitomy__` function that accepts a non-empty release filename string and returns a `ParsedReleaseMetadata` object as declared in `tatakai-sdk.d.ts`; IF the input is empty or not a string, THEN `__tatakai_anitomy__` SHALL throw an `InvalidInputError`.
4. IF an extension worker calls `__tatakai_fetch__` with a URL whose hostname is not in the extension's `network:domain:*` permissions, THEN THE Extension_Runtime SHALL explicitly throw a `PermissionDeniedError` and SHALL NOT forward the request to the network; silent suppression is not permitted.
5. THE Extension_Runtime SHALL expose an `electron.listInstalledExtensions` bridge method that returns an array of objects each containing `id`, `name`, `version`, `type`, and `capabilities` fields, so that the manga extension bridge (`manga-extension-runtime.ts`) can discover Toko reliably.
6. WHEN an extension worker calls `__tatakai_fetch__` and the caller supplies `Referer` or `User-Agent` headers, THE Extension_Runtime SHALL forward those headers to the upstream request without modification; headers not supplied by the caller SHALL be omitted rather than substituted with defaults.
7. IF the local proxy is unreachable when `__tatakai_fetch__` attempts to forward a request, THEN THE Extension_Runtime SHALL throw a `ProxyUnavailableError` to the worker rather than hanging indefinitely.

---

### Requirement 2: Toko Extension Bundle and Build Flow

**User Story:** As a Tatakai user, I want to install a single Toko extension that gives me access to all supported anime stream, torrent, and manga sources, so that I do not need to manage multiple separate extensions.

#### Acceptance Criteria

1. THE Toko_Extension SHALL expose a JavaScript class with methods: `validate()`, `single(options)`, `batch(options)`, `movie(options)`, `getLanguages(options)`, `getMangaChapters(params)`, `getMangaPages(params)`, `getPreviewSource(params)`, and `getWebsiteEpisodeIndex(params)`.
2. WHEN `validate()` is called, THE Toko_Extension SHALL return `{ valid: true }` if the extension bundle loaded correctly and at least one provider adapter initialised without error; it SHALL return `{ valid: false, reason: string }` otherwise.
3. THE Toko_Extension manifest SHALL have `id: "tatakai.extension.toko"`, `type: "custom"`, `version: "1.0.0"`, and a `permissions` array containing one `network:domain:<hostname>` entry for every upstream domain accessed by any included provider.
4. WHEN `single(options)` is called with valid `Source_Options`, THE Toko_Extension SHALL query all enabled Direct_Stream_Providers in parallel and return an array of `SourceResult` objects, each with non-empty `url`, `quality`, `headers`, and `source` fields; IF all providers fail, THEN THE Toko_Extension SHALL return an empty array rather than throwing.
5. WHEN `batch(options)` is called with valid `Source_Options`, THE Toko_Extension SHALL return an array of `SourceResult` objects covering the requested episode from all available Direct_Stream_Providers and Torrent_Providers; IF all providers fail, THEN THE Toko_Extension SHALL return an empty array.
6. WHEN `movie(options)` is called with valid `Source_Options`, THE Toko_Extension SHALL query Direct_Stream_Providers with no episode number constraint and return an array of `SourceResult` objects; results SHALL include a `source` field identifying the originating provider.
7. WHEN `getMangaChapters(params)` is called, THE Toko_Extension SHALL query all enabled Manga_Providers in parallel and return a unified chapter list where each entry has `number`, `title`, `volume`, and a `sources` array containing `provider`, `chapterKey`, `providerChapterId`, `language`, `scanlator`, and `releaseDate`; IF all providers fail, THE Toko_Extension SHALL return an empty array.
8. WHEN `getMangaPages(params)` is called with a valid `chapterKey` and `provider`, THE Toko_Extension SHALL return an ordered array of page objects each containing `pageNumber` and `imageUrl`; IF `chapterKey` is not recognised by the named provider, THE Toko_Extension SHALL throw a `ChapterNotFoundError`.
9. THE Toko_Extension build script SHALL produce a valid `bundle.js` file and a `.kai` ZIP package containing `manifest.json`, `bundle.js`, `README.md`, and `icon.png`; the build SHALL fail with a non-zero exit code if any required file is missing from the ZIP.
10. WHEN `getLanguages(options)` is called, THE Toko_Extension SHALL return an array of `LanguageCapability` objects listing all audio and subtitle language options available across its Direct_Stream_Providers for the requested episode; an empty array is a valid return when no language data is available.
11. WHEN each provider is queried during `single()`, `batch()`, or `getMangaChapters()`, THE Toko_Extension SHALL apply a per-provider timeout of 15 seconds; IF a provider exceeds its timeout or throws, THEN that provider SHALL be omitted from results and the remaining providers SHALL continue to be queried.

---

### Requirement 3: Provider Coverage — Direct Stream

**User Story:** As a Tatakai user, I want Toko to aggregate sources from all supported direct-stream anime websites, so that I get the broadest possible source availability for any anime I want to watch.

#### Acceptance Criteria

1. THE Toko_Extension SHALL include provider adapters for the following Direct_Stream_Providers sourced from A1: `animepahe`, `animeya`, `toonstream`, `animelok`, `watchanimeworld` (via `watchaw`/`toonworld`), `desidub`, `hindidubbed`, `aniworld`.
2. THE Toko_Extension SHALL include provider adapters for the following Direct_Stream_Providers sourced from A2: `senshi`, `reanime`, `4anime`.
3. THE Toko_Extension SHALL include net-new provider adapters for: `anikoto`, `mkissa`, `anizone`, `animesalt`.
4. WHEN a Direct_Stream_Provider is queried, THE Toko_Extension SHALL normalize its output to the internal `SourceResult` shape, mapping provider-specific quality labels to one of the standardized strings `"2160p"`, `"1080p"`, `"720p"`, `"480p"`, or `"360p"`; IF a quality label cannot be mapped to any of those strings, THE Toko_Extension SHALL set `quality: "unknown"` rather than dropping the result.
5. WHERE a Direct_Stream_Provider returns a URL ending in `.m3u8` or containing `/hls/`, THE Toko_Extension SHALL set `sourceType: "hls"` on the corresponding `SourceResult`.
6. WHERE a Direct_Stream_Provider returns a URL ending in `.mp4` or a direct video file extension, THE Toko_Extension SHALL set `sourceType: "mp4"` on the corresponding `SourceResult`.
7. IF a Direct_Stream_Provider returns a URL that matches neither the HLS nor MP4 criteria above, THE Toko_Extension SHALL set `sourceType: "unknown"` and SHALL still include the result rather than discarding it.

---

### Requirement 4: Provider Coverage — Torrent

**User Story:** As a Tatakai user, I want Toko to search torrent indexers for anime releases, so that I can access high-quality fansub and archival sources through the same extension.

#### Acceptance Criteria

1. THE Toko_Extension SHALL include torrent provider adapters for the following sources from A2: `nyaa`, `acg.rip`, `animetosho`, `subplease`, `seadex`, `nekobt`.
2. THE Toko_Extension SHALL include net-new torrent provider adapters for: `acgnx`, `aniliberty`.
3. WHEN a Torrent_Provider is queried, THE Toko_Extension SHALL return `SourceResult` objects with `sourceType: "torrent"`, a non-empty `url` field set to a magnet URI if available or a torrent file URL as fallback, `quality` set to the release quality string or `"unknown"` if not parseable, `headers: {}`, and `subtitles: []`.
4. WHEN `single(options)` or `movie(options)` is called, THE Toko_Extension SHALL NOT invoke any Torrent_Provider; torrent providers SHALL only be invoked during `batch(options)` calls.

---

### Requirement 5: Provider Coverage — Manga

**User Story:** As a Tatakai user, I want Toko to provide manga chapters and pages from multiple scanlation and aggregator sites, so that I can read manga with source choice and fallback.

#### Acceptance Criteria

1. THE Toko_Extension SHALL include manga provider adapters for the following sources from A1: `allmanga`, `atsu` (atsu.moe/Atsumaru), `mangafire`.
2. THE Toko_Extension SHALL include manga provider adapters for the following sources from A2: `animesama`, `asura`.
3. WHEN `getMangaChapters(params)` returns results, THE Toko_Extension SHALL include a `scanlator` field per source entry set to the scanlator string supplied by the upstream provider, or `null` if the upstream provider does not expose one.
4. FOR ALL valid `chapterKey` values present in the array returned by `getMangaChapters(params)`, calling `getMangaPages(params)` with that `chapterKey` and its corresponding `provider` SHALL return a non-empty page array (round-trip property: every key produced by chapter listing is valid for page fetching).
5. WHEN two or more Manga_Providers return entries for the same chapter number, THE Toko_Extension SHALL merge them into a single chapter object whose `sources` array contains one entry per provider rather than creating duplicate top-level chapter objects.

---

### Requirement 6: A1 Server-Side Indexing and Preview Support

**User Story:** As a Tatakai backend operator, I want A1 to expose Toko-specific server routes for website-first episode indexes and preview source resolution, so that the TatakaiAPI and web clients can access these capabilities without requiring the desktop app.

#### Acceptance Criteria

1. THE A1_Service SHALL expose a `GET /toko/index/episodes` endpoint that accepts `tatakaiId`, `anilistId`, and `titles[]` query parameters and returns a `{ provider, episodeCount, episodes: [{ number, title, aired }] }` JSON payload by scraping the best-matching Direct_Stream_Provider; the `episodes` array MAY be empty if the provider returns count metadata only.
2. THE A1_Service SHALL expose a `GET /toko/index/chapters` endpoint that accepts `anilistId`, `malId`, and `title` query parameters and returns a `{ provider, chapterCount, chapters: [{ number, title, scanlator, releaseDate }] }` JSON payload from Manga_Providers; the `chapters` array MAY be empty if the provider returns count metadata only.
3. THE A1_Service SHALL expose a `GET /toko/preview` endpoint that accepts `anilistId`, `titles[]`, and `episode` query parameters and returns a `{ provider, streamUrl, isHls, previewTimestampSec }` JSON payload by resolving a Direct_Stream_Provider source.
4. THE A1_Service SHALL calculate `previewTimestampSec` as a random integer in the range `[floor(duration * 0.60), floor(duration * 0.80)]` where `duration` defaults to `1440` seconds when the actual episode duration is unknown; this calculation SHALL be applied consistently regardless of whether the stream URL is successfully resolved.
5. IF no Direct_Stream_Provider can resolve a preview source for the requested anime, THEN THE A1_Service SHALL return `{ provider: null, streamUrl: null, isHls: false, previewTimestampSec: <calculated value> }` with HTTP 200 rather than a 4xx or 5xx error.
6. THE A1_Service SHOULD add new scraper implementations for Manga_Providers or Direct_Stream_Providers when existing A1 provider modules fail to resolve content for a specific title, provided each new scraper follows the existing A1 provider module interface conventions.

---

### Requirement 7: TatakaiAPI Preview and Index Routes

**User Story:** As a Tatakai web or API client, I want TatakaiAPI to expose preview and website-first index endpoints, so that non-desktop users and server-side consumers can access Toko data through the standard API.

#### Acceptance Criteria

1. THE TatakaiAPI SHALL expose a `GET /api/v3/toko/preview` route that forwards all query parameters to the A1_Service `GET /toko/preview` endpoint and returns the A1_Service response body unchanged to the caller with the same HTTP status code; an empty or null `streamUrl` in the A1 response SHALL be passed through as-is rather than converted to an error.
2. THE TatakaiAPI SHALL expose a `GET /api/v3/toko/index/episodes` route that forwards all query parameters to the A1_Service episode-index endpoint and returns the episode list to the caller; an empty `episodes` array is a valid response.
3. THE TatakaiAPI SHALL expose a `GET /api/v3/toko/index/chapters` route that forwards all query parameters to the A1_Service chapter-index endpoint and returns the chapter list to the caller; an empty `chapters` array is a valid response.
4. WHEN either the `POST /api/v3/dispatch` or `GET /api/v3/dispatch/:tatakaiId/:episodeNumber` endpoint builds the `extensionsToTry` array and the Toko extension (`id: "tatakai.extension.toko"`) is present in the approved manifest list, THE TatakaiAPI SHALL place the Toko entry at index 0 of `extensionsToTry`; the relative order of all other entries SHALL be preserved.
5. THE TatakaiAPI SHALL expose a `GET /api/v3/extensions/:id` route that returns the marketplace manifest for the requested extension including at minimum: `id`, `name`, `type`, `version`, `categories`, `description`, `permissions`, `icon`, `banner`, `screenshots`, and `versionHistory`; fields that have no stored value SHALL be returned as `null` or `[]` rather than omitted.
6. IF the A1_Service does not respond within 10 seconds when TatakaiAPI proxies a Toko route, THEN THE TatakaiAPI SHALL return `{ success: false, error: "upstream_unavailable" }` with HTTP 503 and SHALL NOT surface raw connection error details to the client.
7. IF the A1_Service returns a non-2xx status code for a proxied Toko route, THEN THE TatakaiAPI SHALL return `{ success: false, error: "upstream_error", status: <A1 status code> }` with HTTP 502 rather than forwarding the raw A1 error body.
8. IF `GET /api/v3/extensions/:id` is requested for an extension ID that does not exist in the registry, THEN THE TatakaiAPI SHALL return HTTP 404 with `{ success: false, error: "extension_not_found" }`.

---

### Requirement 8: Website-First Episode and Chapter Indexing

**User Story:** As a Tatakai user, I want anime episode counts and manga chapter counts to reflect the actual numbers available on source websites, so that I can access episodes and chapters that AniList or Jikan have not yet indexed.

#### Acceptance Criteria

1. WHEN the anime watch page resolves episode metadata and Toko is installed and enabled on desktop, THE Frontend SHALL request a Website_Index from the local Extension_Runtime via `extension:invoke` with method `getWebsiteEpisodeIndex` within a 10-second timeout; WHEN Toko is not available locally on web, THE Frontend SHALL request the Website_Index from `GET /api/v3/toko/index/episodes`; IF the returned `episodeCount` is greater than the AniList/Jikan count, THE Frontend SHALL use the returned `episodeCount` as the Episode_Count_Override.
2. WHEN an Episode_Count_Override is applied, THE Frontend SHALL display the override count in the episode selector UI and SHALL generate selectable episode entries for all episode numbers from 1 through the override count, replacing the AniList/Jikan-derived entries.
3. IF a Website_Index request fails, times out, or returns `episodeCount` of 0 or null, THEN THE Frontend SHALL silently fall back to the AniList/Jikan episode count without showing any error indicator to the user.
4. IF Toko is installed on desktop or the `GET /api/v3/toko/index/chapters` endpoint returns HTTP 200, THEN THE Frontend SHALL merge Toko chapter data into the manga chapter list before rendering; merged entries SHALL use the Toko-supplied `number` and `title` as authoritative values.
5. WHEN Website_Index data is merged with AniList/Jikan data, THE Frontend SHALL deduplicate entries by episode or chapter number; WHERE a conflict exists the Website_Index entry SHALL be kept; WHERE the Website_Index contains a number that has no AniList/Jikan counterpart, THE Frontend SHALL append it to the list.
6. THE Frontend SHALL cache Website_Index results in a page-scoped in-memory map keyed by anime or manga ID; the cache SHALL be cleared when the page-level component unmounts and SHALL NOT persist across page navigations.

---

### Requirement 9: Anime Hover and Detail Preview

**User Story:** As a Tatakai user, I want to see a short muted video preview of an anime when I hover over its card or open its detail page, so that I can quickly evaluate whether I want to watch it.

#### Acceptance Criteria

1. WHEN a user hovers over an anime card in `AnimeCardWithPreview`, `TrendingGrid`, or `LatestEpisodes` for more than 200 ms, THE Frontend SHALL attempt to load a Preview_Source using a two-tier strategy: first via `extension:invoke` with method `getPreviewSource` (desktop, 5 000 ms timeout); if the desktop call returns null, throws, or times out, THEN THE Frontend SHALL fall back to `GET /api/v3/toko/preview` (web, 5 000 ms timeout).
2. WHEN a Preview_Source is successfully resolved, THE Frontend SHALL set the video element `src` (for MP4) or attach an HLS.js instance (for M3U8) and begin muted autoplay; IF seeking to `previewTimestampSec` is not yet possible, THE Frontend SHALL begin playback from the beginning and seek once the media is seekable.
3. WHEN a user stops hovering before a Preview_Source is resolved, THE Frontend SHALL clear the 200 ms hover timer and use an `AbortController` to cancel any in-flight network request; the video element SHALL NOT be populated or played.
4. WHEN a Preview_Source is resolved for an anime ID, THE Frontend SHALL store the result object in the Preview_Cache so that subsequent hovers on the same card within the same page session use the cached value without making a new network request.
5. IF a Preview_Source cannot be resolved after both tiers return null or error, THEN THE Frontend SHALL display the static poster image with either a muted/dimmed overlay or a small icon indicating video preview is unavailable; no error message text SHALL be shown to the user.
6. WHEN the `VideoBackground` component on the anime detail page renders, THE Frontend SHALL load a Preview_Source using the same two-tier strategy as Criterion 1 and display the resulting video as the page background with the existing gradient and vignette overlays applied.
7. WHEN an HLS Preview_Source is loaded in any preview context, THE Frontend SHALL initialise `hls.js` with `maxBufferLength: 8` and `lowLatencyMode: false`; these values SHALL NOT be overridden by component-level props.
8. THE Frontend SHALL only request Preview_Sources from Direct_Stream_Provider results; Torrent_Provider `SourceResult` objects SHALL never be supplied to any preview loading code path.

---

### Requirement 10: Manga Provider and Scanlator Categorization UI

**User Story:** As a Tatakai manga reader, I want to see which provider and scanlator group supplied each chapter, so that I can choose my preferred source quality and translation.

#### Acceptance Criteria

1. WHEN the manga chapter list is displayed, THE MangaPage SHALL render one selectable provider chip or tab per unique provider name present in the `sources` arrays of the chapter list; the chip for the first provider in the list SHALL be selected by default.
2. WHEN a chapter has one or more sources from different providers, THE MangaPage SHALL display the `scanlator` field value alongside each source entry where the value is a non-null, non-empty string.
3. WHEN a user selects a provider chip or tab, THE MangaPage SHALL filter the visible chapter source entries to show only entries whose `provider` field matches the selected chip; the chapter `number` and `title` displayed for each row SHALL remain unchanged and SHALL always reflect the Website_Index-authoritative values.
4. IF publisher metadata (author, serialization, status) is available from the content detail response, THEN THE MangaPage SHALL display it in a dedicated section above or alongside the chapter list; IF it is not available, the section SHALL be hidden rather than shown as empty.
5. IF a source entry has a null or empty `scanlator` field, THEN THE MangaPage SHALL display the `provider` name as the source label for that entry.
6. WHEN a user selects a provider chip that has no chapter sources matching the filter, THE MangaPage SHALL display an empty-state message indicating no chapters are available from that provider rather than showing a blank list.

---

### Requirement 11: Extension Hub Marketplace Presentation

**User Story:** As a Tatakai user browsing the Extension Hub, I want to see Toko presented clearly as a unified multi-category extension, so that I understand its capabilities before installing it.

#### Acceptance Criteria

1. WHEN Toko appears in the Extension Hub grid, THE Extension_Hub SHALL display category chips for at minimum: `Anime Stream`, `Torrent`, `Manga`, `Preview`, `Website-first Indexing`.
2. WHEN the Toko detail page is opened, THE Extension_Hub SHALL render every section for which data is available; for sections where data is unavailable, THE Extension_Hub SHALL display a placeholder text string (e.g. `"No description available"`) rather than hiding the section container or blocking render.
3. WHEN a `custom` extension type is rendered in the hub or detail view, THE Extension_Hub SHALL display the categories listed in the manifest `categories` array as the type label; IF `categories` is empty or absent, THE Extension_Hub SHALL display `"Unified Extension"` as the fallback label rather than `"torrent"` or `"onlinestream"`.
4. WHEN a user initiates installation of Toko, THE Extension_Hub SHALL verify the `.kai` package signature before completing installation; IF signature verification fails, THE Extension_Hub SHALL abort the installation and display an error message to the user rather than installing the unsigned package.
5. IF the runtime health check response does not include Toko's ID in `loadedExtensions` within 5 seconds of installation completing, THEN THE Extension_Hub SHALL display a warning state indicating that the extension installed but failed to load, rather than showing it as fully `Installed`.
6. WHEN Toko is installed and the runtime health check returns its ID in `loadedExtensions`, THE Extension_Hub SHALL display Toko as `Installed` with the installed version number.

---

### Requirement 12: Runtime Preview and Index IPC Methods

**User Story:** As the Tatakai desktop runtime host, I want dedicated IPC methods for preview source resolution and website-first indexing, so that the frontend can invoke these Toko capabilities without routing through the generic `runtime:resolve-sources` path.

#### Acceptance Criteria

1. WHEN `extension:invoke` is called with method `getPreviewSource` and payload `{ anilistId, titles, episode }`, THE Extension_Runtime SHALL invoke the Toko extension's `getPreviewSource` method and return `{ success: true, data: { provider, streamUrl, isHls, previewTimestampSec } }` on success.
2. WHEN `extension:invoke` is called with method `getWebsiteEpisodeIndex` and payload `{ anilistId, tatakaiId, titles }`, THE Extension_Runtime SHALL invoke the Toko extension's `getWebsiteEpisodeIndex` method and return `{ success: true, data: { provider, episodeCount, episodes } }` on success.
3. WHEN `extension:invoke` is called with method `getMangaChapters` and payload `{ anilistId, malId, title }`, THE Extension_Runtime SHALL invoke the Toko extension's `getMangaChapters` method and return `{ success: true, data: { provider, chapterCount, chapters } }` on success; this method SHALL be listed in the `capabilities` field of the Toko entry returned by `listInstalledExtensions`.
4. WHEN `extension:invoke` is called with method `getPreviewSource` and the Toko extension (`id: "tatakai.extension.toko"`) is not in the loaded extension registry, THE Extension_Runtime SHALL return `{ success: false, error: "toko_not_loaded" }` rather than a generic extension-not-found error.
5. WHEN `extension:invoke` is called with method `getWebsiteEpisodeIndex` and the Toko extension is not in the loaded extension registry, THE Extension_Runtime SHALL return `{ success: false, error: "toko_not_loaded" }`.
6. WHEN `extension:invoke` is called and Toko is loaded but the requested episode has no available Direct_Stream_Provider source, THE Toko_Extension's `getPreviewSource` method SHALL return `{ provider: null, streamUrl: null, isHls: false, previewTimestampSec: 0 }` rather than throwing; this null-source response applies only to `getPreviewSource` and not to other methods.

---

### Requirement 13: Toko-First Source Ordering

**User Story:** As a Tatakai user on desktop, I want Toko sources to be tried before other marketplace extensions during playback, so that the widest available source selection is presented first.

#### Acceptance Criteria

1. WHEN `runtime:resolve-sources` is invoked, THE Extension_Runtime SHALL ensure the Toko extension ID (`"tatakai.extension.toko"`) appears at index 0 of the `targetExtensionIds` list used for provider invocation; this ordering SHALL apply to both the explicit `extensionIds` payload path and the full-loaded-list fallback path.
2. WHEN either the `POST /api/v3/dispatch` or `GET /api/v3/dispatch/:tatakaiId/:episodeNumber` endpoint builds the `extensionsToTry` array and the Toko extension is present in the approved manifest list, THE TatakaiAPI SHALL place the Toko entry at index 0; the relative order of all other entries SHALL be preserved.
3. WHEN `useCombinedSources` processes a `SourceResult` originating from the Toko extension worker, THE Frontend SHALL set both the `providerName` and `displayName` fields of the displayed source to the value of the `source` field on the `SourceResult` (e.g. `"animepahe"`, `"senshi"`); IF the `source` field is absent or empty, THEN THE Frontend SHALL fall back to `"Toko"` rather than `"Local runtime"`.

---

### Requirement 14: Tests and Verification

**User Story:** As a Tatakai engineer, I want automated tests covering the runtime worker-helper injection, Toko provider adapters, preview resolution, and manga UI, so that regressions are caught before release.

#### Acceptance Criteria

1. THE Test_Suite SHALL include tests that verify `__tatakai_fetch__` throws a `PermissionDeniedError` for non-allowlisted domains using a mock HTTP client, and that requests to allowlisted domains are forwarded to the mock without modification.
2. THE Test_Suite SHALL include tests that verify `__tatakai_parse_html__` returns a `CheerioLikeAPI` object where: `find("h1").text()` returns the expected text from a known HTML fixture, `find("a").attr("href")` returns the expected attribute value, and `find("li").each()` iterates the expected number of elements.
3. THE Test_Suite SHALL include tests that verify each Toko Direct_Stream_Provider adapter, when called with a fixture response, returns a `SourceResult` where: `url` is a non-empty string, `quality` is one of `"2160p"`, `"1080p"`, `"720p"`, `"480p"`, `"360p"`, or `"unknown"`, and `sourceType` is `"hls"`, `"mp4"`, or `"unknown"`.
4. THE Test_Suite SHALL include tests that verify each Toko Torrent_Provider adapter returns `sourceType: "torrent"` with a non-empty `url`, and that calling `single()` with a mock that includes a torrent provider returns zero `sourceType: "torrent"` entries.
5. THE Test_Suite SHALL include tests that verify `getMangaChapters()` with a two-provider fixture where both providers return chapter 42 produces exactly one chapter object with chapter number 42 and two entries in its `sources` array.
6. THE Test_Suite SHALL include property-based tests that verify for any integer `duration` in the range `[600, 3600]`, the computed `previewTimestampSec` falls within `[floor(duration * 0.60), floor(duration * 0.80)]` inclusive.
7. THE Test_Suite SHALL include tests that verify: GIVEN Toko returns `episodeCount: 26` and AniList returns `episodeCount: 24`, the episode selector displays 26 episodes; and GIVEN Toko returns `episodeCount: 0` or errors, the episode selector displays the AniList count of 24.
8. THE Test_Suite SHALL include a test that renders `AnimeCardWithPreview` with a mock preview resolver that always rejects, and asserts that the component renders a `<img>` poster element and does not render a `<video>` element or any element with an error-state class.
9. THE Test_Suite SHALL include a test that, for each `chapterKey` returned by a representative `getMangaChapters()` fixture call with mocked provider responses, calling `getMangaPages()` with that key and its corresponding provider returns an array with at least one element containing non-empty `pageNumber` and `imageUrl` fields.
