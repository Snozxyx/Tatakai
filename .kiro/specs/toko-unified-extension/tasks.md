# Implementation Plan: Toko Unified Extension

## Overview

Implement the Toko unified extension across nine dependency layers: SDK type extensions, worker helper injection, Toko bundle scaffold and build, provider adapters (stream/torrent/manga), TokoBundleClass, backend A1 and TatakaiAPI routes, desktop IPC methods, frontend hooks, frontend UI components, and automated tests.

## Tasks

- [x] 1. Extend ExtensionManifest SDK types
  - [x] 1.1 Add `categories`, `capabilities`, and `banner` optional fields to the `ExtensionManifest` interface in `src/core/extensions/sdk/types.ts`
    - Add `categories?: string[]` for multi-category hub display
    - Add `capabilities?: string[]` for IPC discovery (`"manga"`, `"preview"`, `"websiteIndex"`)
    - Add `banner?: string` for detail page banner image
    - _Requirements: 11.1, 11.3, 12.3_

- [ ] 2. Implement Worker Helper bodies in extension-worker-pool.cjs
  - [x] 2.1 Implement `__tatakai_fetch__` with domain enforcement, 30 s timeout, and header forwarding
    - Import `extractAllowedDomains` from `extension-sandbox.cjs`
    - Build allowed-domains set from `manifest.permissions` via `extractAllowedDomains`
    - Throw `PermissionDeniedError` for non-allowlisted hostnames before any network I/O
    - Use `AbortController` with 30 000 ms timeout; throw `FetchTimeoutError` on expiry
    - Forward `Referer` and `User-Agent` headers unchanged; omit headers not supplied by caller
    - Throw `ProxyUnavailableError` on `ECONNREFUSED`/`ENOTFOUND` to proxy
    - _Requirements: 1.1, 1.4, 1.6, 1.7_
  - [x] 2.2 Implement `__tatakai_parse_html__` cheerio adapter
    - Validate input is a non-empty string; throw `InvalidInputError` otherwise
    - Load cheerio and return a `CheerioLikeAPI` object with `find`, `first`, `attr`, `text`, `html`, `each`
    - _Requirements: 1.2_
  - [x] 2.3 Implement `__tatakai_anitomy__` using anitomyscript
    - Validate input is a non-empty string; throw `InvalidInputError` otherwise
    - Call `anitomyscript(filename)` and return `ParsedReleaseMetadata`
    - _Requirements: 1.3_
  - [x] 2.4 Serialise all three helper implementations into `workerData.helperCode` and eval inside `WORKER_BOOTSTRAP` before extension code runs
    - _Requirements: 1.1, 1.2, 1.3_

- [x] 3. Add `electron.listInstalledExtensions` IPC bridge
  - [x] 3.1 Add `ipcMain.handle('electron.listInstalledExtensions', ...)` in the electron context bridge IPC file
    - Return array of `{ id, name, version, type, capabilities }` for all registered extensions
    - Populate `capabilities` from `manifest.capabilities` field (new field from Task 1)
    - _Requirements: 1.5, 12.3_

- [x] 4. Create Toko extension directory scaffold
  - [x] 4.1 Create `extension/toko/manifest.json` with required fields
    - Set `id: "tatakai.extension.toko"`, `type: "custom"`, `version: "1.0.0"`
    - Include `categories: ["Anime Stream","Torrent","Manga","Preview","Website-first Indexing"]`
    - Include `capabilities: ["manga","preview","websiteIndex"]`
    - Include `permissions` array with one `network:domain:<hostname>` entry per upstream domain
    - _Requirements: 2.3, 11.1_
  - [x] 4.2 Create `extension/toko/src/types.ts` with all shared types
    - Define `MangaChapterEntry`, `MangaPageEntry`, `PreviewResult`, `WebsiteIndexResult`
    - Define `StreamProvider`, `TorrentProvider`, `MangaProvider` interfaces
    - _Requirements: 2.1, 5.3_
  - [x] 4.3 Create `extension/toko/src/utils/quality.ts`
    - Implement `normalizeQuality(raw: string): Quality` using the `QUALITY_MAP` lookup
    - Implement `detectSourceType(url: string): 'hls' | 'mp4' | 'unknown'`
    - _Requirements: 3.4, 3.5, 3.6, 3.7_
  - [x] 4.4 Create `extension/toko/src/utils/timeout.ts`
    - Implement `withProviderTimeout<T>(promise: Promise<T>, ms: number): Promise<T>`
    - Default timeout: 15 000 ms; reject with timeout error on expiry
    - _Requirements: 2.11_
  - [x] 4.5 Create `extension/toko/README.md` and `extension/toko/icon.png` placeholder
    - _Requirements: 2.9_

- [x] 5. Create Toko build script
  - [x] 5.1 Create `extension/toko/build.ts` using esbuild and jszip
    - Bundle `src/index.ts` → `dist/bundle.js` (CJS, no external deps except Node built-ins)
    - ZIP `manifest.json`, `bundle.js`, `README.md`, `icon.png` → `toko.kai`
    - Exit with code 1 if any required file is missing from the ZIP
    - _Requirements: 2.9_

- [x] 6. Implement Direct-Stream provider adapters
  - [x] 6.1 Implement A1-port stream adapters: `animepahe`, `animeya`, `toonstream`, `animelok`, `watchanimeworld`, `desidub`, `hindidubbed`, `aniworld`
    - Each adapter calls A1's internal provider modules via `__tatakai_fetch__` to `TATAKAI_A1_BASE_URL`
    - Each file in `extension/toko/src/providers/stream/<name>.ts` exports a `StreamProvider`
    - Apply `normalizeQuality` and `detectSourceType` to all results
    - _Requirements: 3.1, 3.4, 3.5, 3.6, 3.7_
  - [x] 6.2 Implement A2-port stream adapters: `senshi`, `reanime`, `4anime`
    - Replicate scraping logic from A2 TypeScript scripts using `__tatakai_fetch__` and `__tatakai_parse_html__`
    - Apply `normalizeQuality` and `detectSourceType` to all results
    - _Requirements: 3.2, 3.4, 3.5, 3.6, 3.7_
  - [x] 6.3 Implement net-new stream adapters: `anikoto`, `mkissa`, `anizone`, `animesalt`
    - Implement scraping logic from scratch using `__tatakai_fetch__` and `__tatakai_parse_html__`
    - Apply `normalizeQuality` and `detectSourceType` to all results
    - _Requirements: 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 7. Implement Torrent provider adapters
  - [x] 7.1 Implement A2-port torrent adapters: `nyaa`, `acgrip`, `animetosho`, `subplease`, `seadex`, `nekobt`
    - Each file in `extension/toko/src/providers/torrent/<name>.ts` exports a `TorrentProvider`
    - All results must have `sourceType: "torrent"`, non-empty `url` (magnet URI or torrent file URL), `headers: {}`, `subtitles: []`
    - _Requirements: 4.1, 4.3_
  - [x] 7.2 Implement net-new torrent adapters: `acgnx`, `aniliberty`
    - _Requirements: 4.2, 4.3_

- [x] 8. Implement Manga provider adapters
  - [x] 8.1 Implement A1-port manga adapters: `allmanga`, `atsu`, `mangafire`
    - Each file in `extension/toko/src/providers/manga/<name>.ts` exports a `MangaProvider`
    - Implement `getChapters(params)` and `getPages(chapterKey)` methods
    - Include `scanlator` field per source entry (null if provider does not expose one)
    - Use `chapterKey` format: `"<provider>:<providerChapterId>"`
    - _Requirements: 5.1, 5.3, 5.4_
  - [x] 8.2 Implement A2-port manga adapters: `animesama`, `asura`
    - Replicate scraping logic from A2 TypeScript scripts
    - Include `scanlator` field per source entry
    - Use `chapterKey` format: `"<provider>:<providerChapterId>"`
    - _Requirements: 5.2, 5.3, 5.4_

- [ ] 9. Implement TokoBundleClass in `extension/toko/src/index.ts`
  - [x] 9.1 Implement `validate()`, `single()`, `batch()`, `movie()`, `getLanguages()`
    - `validate()`: return `{ valid: true }` if at least one provider initialised; `{ valid: false, reason }` otherwise
    - `single()` and `movie()`: query Direct_Stream_Providers only via `runProviders`; return empty array on all-failure
    - `batch()`: query both Direct_Stream_Providers and Torrent_Providers; return empty array on all-failure
    - `getLanguages()`: aggregate `LanguageCapability[]` from all direct-stream providers
    - Implement `runProviders<T>` helper using `Promise.allSettled` + `withProviderTimeout`
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 2.6, 2.10, 2.11, 4.4_
  - [x] 9.2 Implement `getMangaChapters()` with merge and deduplication
    - Run all manga providers via `runProviders`
    - Key results by `chapter.number`; push additional sources into existing entry's `sources` array
    - Return sorted ascending by chapter number
    - _Requirements: 2.7, 5.5_
  - [x] 9.3 Implement `getMangaPages()` with `ChapterNotFoundError` handling
    - Parse `chapterKey` as `"<provider>:<providerChapterId>"`
    - Throw `ChapterNotFoundError` if key is not recognised by the named provider
    - _Requirements: 2.8, 5.4_
  - [x] 9.4 Implement `getPreviewSource()` — returns null-source object on failure, never throws
    - Return `{ provider, streamUrl, isHls, previewTimestampSec }` on success
    - Return `{ provider: null, streamUrl: null, isHls: false, previewTimestampSec: 0 }` when no provider resolves
    - Only use Direct_Stream_Provider results; never use torrent results
    - _Requirements: 2.1, 9.8, 12.6_
  - [x] 9.5 Implement `getWebsiteEpisodeIndex()` — returns count + episode list
    - Return `{ provider, episodeCount, episodes: [{ number, title?, aired? }] }`
    - Return `{ provider: null, episodeCount: 0, episodes: [] }` on all-provider failure
    - _Requirements: 2.1, 8.1_

- [x] 10. Add A1 toko routes
  - [x] 10.1 Create `extension/A1/src/routes/toko.ts` with `GET /toko/index/episodes`, `GET /toko/index/chapters`, and `GET /toko/preview`
    - `GET /toko/index/episodes`: query params `tatakaiId`, `anilistId`, `titles[]`; return `{ provider, episodeCount, episodes }`
    - `GET /toko/index/chapters`: query params `anilistId`, `malId`, `title`; return `{ provider, chapterCount, chapters }`
    - `GET /toko/preview`: calculate `previewTimestampSec` in range `[floor(duration * 0.60), floor(duration * 0.80)]`; default `duration` = 1440 s
    - Return `{ provider: null, streamUrl: null, isHls: false, previewTimestampSec }` with HTTP 200 when no provider resolves
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_
  - [x] 10.2 Register toko router in `extension/A1/src/server.ts` as `app.route('/toko', tokoRouter)`
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 11. Add TatakaiAPI toko proxy routes
  - [x] 11.1 Create `TatakaiAPI/src/routes/toko.ts` with `proxyToA1` helper and three proxy routes
    - Implement `proxyToA1(path, query, c)` with `AbortSignal.timeout(10_000)`
    - On fetch error: return `{ success: false, error: "upstream_unavailable" }` with HTTP 503
    - On non-2xx A1 response: return `{ success: false, error: "upstream_error", status }` with HTTP 502
    - Expose `GET /toko/preview`, `GET /toko/index/episodes`, `GET /toko/index/chapters`
    - _Requirements: 7.1, 7.2, 7.3, 7.6, 7.7_
  - [x] 11.2 Register toko router in `TatakaiAPI/src/server.ts` under `v3.route('/toko', tokoRouter)`
    - _Requirements: 7.1, 7.2, 7.3_

- [x] 12. Add TatakaiAPI `GET /api/v3/extensions/:id` route and Toko-first dispatch ordering
  - [x] 12.1 Add `GET /:id` handler in `TatakaiAPI/src/routes/extensions.ts`
    - Return `{ id, name, type, version, categories, description, permissions, icon, banner, screenshots, versionHistory }`
    - Missing fields return as `null` or `[]`, never omitted
    - Return HTTP 404 with `{ success: false, error: "extension_not_found" }` when ID not found or kill-switched
    - _Requirements: 7.5, 7.8_
  - [x] 12.2 Apply Toko-first dispatch ordering in `TatakaiAPI/src/routes/playback.ts` (or dispatch route handler)
    - After building `extensionsToTry`, splice Toko to index 0 if present; preserve relative order of others
    - Apply to both `POST /api/v3/dispatch` and `GET /api/v3/dispatch/:tatakaiId/:episodeNumber`
    - _Requirements: 7.4, 13.2_

- [ ] 13. Add `extension:invoke` cases for Toko IPC methods and Toko-first ordering in `runtime:resolve-sources`
  - [x] 13.1 Add `getPreviewSource`, `getWebsiteEpisodeIndex`, and `getMangaChapters` cases in the `ipcMain.handle('extension:invoke', ...)` handler
    - Route each method to `toko.getPreviewSource(payload)`, `toko.getWebsiteEpisodeIndex(payload)`, `toko.getMangaChapters(payload)` respectively
    - When Toko is not in registry for `getPreviewSource` or `getWebsiteEpisodeIndex`: return `{ success: false, error: "toko_not_loaded" }`
    - Return `{ success: true, data: <result> }` on success
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_
  - [x] 13.2 Apply Toko-first ordering in `ipcMain.handle('runtime:resolve-sources', ...)` handler
    - Splice Toko ID to index 0 of `targetExtensionIds` when present
    - Apply to both `extensionIds` payload path and the full-loaded-list fallback path
    - _Requirements: 13.1_
  - [x] 13.3 Update `useCombinedSources` to use `result.source` for `providerName`/`displayName` when originating extension is Toko; fall back to `"Toko"` rather than `"Local runtime"`
    - _Requirements: 13.3_

- [x] 14. Checkpoint — Core infrastructure complete
  - Ensure Tasks 1–13 compile without errors, all existing tests pass, and the worker-pool helper implementations are wired into `workerData`.
  - Ask the user if questions arise before proceeding to frontend work.

- [ ] 15. Implement `usePreviewSource` hook
  - [x] 15.1 Create `src/hooks/usePreviewSource.ts` with two-tier resolution logic
    - Tier 1: call `window.electron?.invokeExtension('getPreviewSource', ...)` with 5 000 ms `AbortController` timeout
    - On null/throw/timeout fall through to Tier 2: `GET /api/v3/toko/preview` with 5 000 ms timeout
    - Cache result in `useRef`-based `Map<anilistId, PreviewSource>` cleared on unmount
    - Return `{ source: PreviewSource | null, loading: boolean }`
    - Return `null` when both tiers fail; never throw to the caller
    - _Requirements: 9.1, 9.3, 9.4, 9.5, 9.8_
  - [x] 15.2 Add 200 ms hover guard using `useRef<ReturnType<typeof setTimeout>>` with `onMouseLeave` cancel + `AbortController.abort()`
    - _Requirements: 9.3_

- [x] 16. Implement `useWebsiteIndex` hook
  - [x] 16.1 Create `src/hooks/useWebsiteIndex.ts`
    - Desktop path: `extension:invoke getWebsiteEpisodeIndex` with 10 000 ms timeout
    - Web path: `GET /api/v3/toko/index/episodes`
    - Page-scoped `useRef` `Map<number, WebsiteIndexResult>` cache, cleared on unmount
    - On failure/timeout/zero count: return `null` silently with no error state
    - _Requirements: 8.1, 8.3, 8.6_

- [x] 17. Wire preview into anime card and video background components
  - [x] 17.1 Integrate `usePreviewSource` into `AnimeCardWithPreview`, `TrendingGrid`, and `LatestEpisodes`
    - Add 200 ms hover guard per component
    - Attach `hls.js` with `{ maxBufferLength: 8, lowLatencyMode: false }` for HLS sources
    - Seek to `previewTimestampSec` in `canplay`/`seeked`; fall back to seeking on `loadedmetadata`
    - When both tiers return null: show `<img>` poster with `data-preview-unavailable` attribute; no `<video>`; no error text
    - _Requirements: 9.1, 9.2, 9.3, 9.5, 9.7_
  - [x] 17.2 Integrate `usePreviewSource` into `VideoBackground`
    - Set `<video>` src (MP4) or attach hls.js (M3U8) using the resolved stream
    - Keep existing gradient and vignette overlay CSS classes unchanged
    - _Requirements: 9.6, 9.7_

- [x] 18. Implement manga provider chips and scanlator UI in `MangaPage`
  - [x] 18.1 Add `selectedProvider` state and provider chip/tab rendering
    - Derive unique providers from `chapters.flatMap(ch => ch.sources.map(s => s.provider))`
    - First provider selected by default
    - _Requirements: 10.1_
  - [x] 18.2 Implement filtered chapter rows, scanlator display, and empty-state
    - Filter `visibleChapters` to sources matching `selectedProvider`
    - Display `source.scanlator` where non-null/non-empty; otherwise display `source.provider`
    - Chapter `number` and `title` always from top-level chapter object
    - Render empty-state message when `visibleChapters` is empty
    - _Requirements: 10.2, 10.3, 10.5, 10.6_
  - [x] 18.3 Add publisher metadata section (author, serialization, status)
    - Hide the entire section when all three fields are absent; never render an empty container
    - _Requirements: 10.4_
  - [x] 18.4 Wire `useWebsiteIndex` to merge Toko chapter data before render
    - Use `mergeChaptersWithExtensions` in `manga-extension-runtime.ts`; Toko chapters are treated as another extension source
    - _Requirements: 8.4, 8.5_

- [x] 19. Update `ExtensionHubPage` and `ExtensionDetailPage`
  - [x] 19.1 Add category chip rendering for `custom` type extensions
    - When `manifest.type === 'custom'`, display chips from `manifest.categories`
    - Fall back to `"Unified Extension"` when `categories` is empty or absent
    - _Requirements: 11.1, 11.3_
  - [x] 19.2 Add placeholder resilience to `ExtensionDetailPage`
    - Each section (description, screenshots, changelog, permissions, banner) checks its data before rendering
    - Missing sections render placeholder text (e.g. `"No description available"`), never `undefined`/blank
    - _Requirements: 11.2_
  - [x] 19.3 Implement install health-check polling
    - After install: poll `runtime:health` every 500 ms for up to 5 s
    - If `loadedExtensions` includes Toko ID: show `"Installed vX.X.X"`
    - If 5 s elapses without confirmation: show `"Installed (not loaded)"` warning state
    - _Requirements: 11.4, 11.5, 11.6_
  - [x] 19.4 Update `src/core/content/manga-extension-runtime.ts` `listInstalledExtensions` filter to recognise Toko via `capabilities` field
    - _Requirements: 1.5, 12.3_

- [x] 20. Checkpoint — All features wired end-to-end
  - Ensure all tests pass and the Toko bundle builds successfully via `build.ts`.
  - Ask the user if questions arise before proceeding to the test suite.

- [ ] 21. Write worker helper tests
  - [ ] 21.1 Write `tests/toko/worker-helpers.test.ts` — `__tatakai_fetch__` permission and forwarding tests
    - Assert `PermissionDeniedError` is thrown for non-allowlisted hostname with a mock HTTP client
    - Assert allowlisted domain request is forwarded with correct `Referer`/`User-Agent` headers
    - Assert `FetchTimeoutError` is thrown when mock stalls past 30 s
    - Assert `ProxyUnavailableError` is thrown on `ECONNREFUSED`
    - _Requirements: 14.1_
  - [ ] 21.2 Write `tests/toko/parse-html.test.ts` — `__tatakai_parse_html__` cheerio adapter tests
    - Assert `find('h1').text()` returns expected text from HTML fixture
    - Assert `find('a').attr('href')` returns expected attribute
    - Assert `find('li').each()` iterates expected element count
    - Assert empty string input throws `InvalidInputError`
    - _Requirements: 14.2_
  - [ ] 21.3 Write `tests/toko/anitomy.test.ts` — `__tatakai_anitomy__` input validation tests
    - Assert valid filename returns a `ParsedReleaseMetadata` with expected fields
    - Assert empty string input throws `InvalidInputError`
    - _Requirements: 1.3_

- [ ] 22. Write provider adapter tests
  - [ ] 22.1 Write `tests/toko/providers/stream-adapter.test.ts` — fixture tests for each direct-stream adapter
    - For each adapter: assert `url` is a non-empty string, `quality` is one of the five normalised values or `"unknown"`, and `sourceType` is `"hls"`, `"mp4"`, or `"unknown"`
    - _Requirements: 14.3_
  - [ ] 22.2 Write `tests/toko/providers/torrent-adapter.test.ts` — torrent adapter and `single()` exclusion tests
    - Assert each torrent adapter returns `sourceType: "torrent"` with non-empty `url`
    - Assert calling `single()` with a mock that includes a torrent provider returns zero `sourceType: "torrent"` entries
    - _Requirements: 14.4_
  - [x] 22.3 Write `tests/toko/providers/manga-merge.test.ts` — two-provider chapter merge test
    - Two providers both return chapter 42; assert exactly one top-level chapter object with `number: 42` and two entries in `sources`
    - _Requirements: 14.5_

- [ ] 23. Write property-based and UI tests
  - [ ] 23.1 Write `tests/toko/preview-timestamp.test.ts` — property-based timestamp range test (PBT)
    - Use `fast-check` `fc.integer({ min: 600, max: 3600 })` to verify `previewTimestampSec` always falls within `[floor(duration * 0.60), floor(duration * 0.80)]`
    - _Requirements: 14.6_
  - [ ] 23.2 Write `tests/toko/episode-override.test.ts` — episode count override display tests
    - Assert episode selector shows 26 when Toko returns `episodeCount: 26` and AniList returns 24
    - Assert episode selector shows 24 when Toko returns `episodeCount: 0` or errors
    - _Requirements: 14.7_
  - [ ] 23.3 Write `tests/toko/preview-card.test.ts` — `AnimeCardWithPreview` unavailable state test
    - Render with mock resolver that always rejects; assert `<img>` present, no `<video>`, no error-state class element
    - _Requirements: 14.8_
  - [ ] 23.4 Write `tests/toko/manga-pages-roundtrip.test.ts` — `getMangaPages` roundtrip test
    - For each `chapterKey` returned by a fixture `getMangaChapters()` call, assert `getMangaPages(key, provider)` returns at least one element with non-empty `pageNumber` and `imageUrl`
    - _Requirements: 14.9, 5.4_

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP; all non-starred tasks are mandatory.
- Each task references specific requirement IDs from `requirements.md` for traceability.
- Checkpoints (Tasks 14 and 20) are integration gates; do not skip them.
- Property test Task 23.1 validates Requirement 14.6 using `fast-check`.
- Worker helper bodies (Task 2) are injected via `workerData.helperCode` and `eval`'d before extension code runs so they share the worker's Node.js `require` context.
- Tasks 10, 11, and 12 (backend routes) depend only on Task 1 and can be developed in parallel with Tasks 6–9.
- The Toko bundle build (Task 5) must succeed before Tasks 9–23 can be fully integration-tested.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "2.2", "2.3", "3.1"] },
    { "id": 1, "tasks": ["2.4", "4.1", "4.2", "4.3", "4.4", "4.5", "12.1", "12.2"] },
    { "id": 2, "tasks": ["5.1", "6.1", "6.2", "6.3", "7.1", "7.2", "8.1", "8.2", "10.1", "11.1"] },
    { "id": 3, "tasks": ["9.1", "9.2", "9.3", "9.4", "9.5", "10.2", "11.2", "13.1", "13.2", "13.3"] },
    { "id": 4, "tasks": ["15.1", "15.2", "16.1"] },
    { "id": 5, "tasks": ["17.1", "17.2", "18.1", "18.2", "18.3", "18.4", "19.1", "19.2", "19.3", "19.4"] },
    { "id": 6, "tasks": ["21.1", "21.2", "21.3", "22.1", "22.2", "22.3"] },
    { "id": 7, "tasks": ["23.1", "23.2", "23.3", "23.4"] }
  ]
}
```
