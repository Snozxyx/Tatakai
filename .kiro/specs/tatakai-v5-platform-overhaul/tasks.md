# Implementation Plan: TatakaiV5 Platform Overhaul

## Overview

Five interconnected areas are implemented in dependency order: main-process torrent engine first (no renderer dependencies), then renderer naming modules, then UI components that consume both, then extension IPC additions, and finally the unified download system that ties everything together.

All main-process code is CommonJS (`.cjs`). All renderer code is TypeScript/TSX using the existing React 18 + Vite + Zustand + TanStack Query + Tailwind CSS + Radix UI stack.

---

## Tasks

- [x] 1. Torrent Engine — Core Reliability Fixes
  - [x] 1.1 Patch `TorrentSessionManager._ensureClient()` in `desktop/runtime/torrent/session/session-manager.cjs`
    - Add `process.type === 'renderer'` guard that throws `TorrentSessionManager must run in the main process`
    - Wrap `global.setInterval` before `import('webtorrent')` to attach a no-op `.unref()` when the timer object lacks one
    - Configure `WebTorrent` constructor with DHT bootstrap nodes: `router.bittorrent.com:6881`, `dht.transmissionbt.com:6881`, `router.utorrent.com:6881`, `dht.aelitis.com:6881`
    - Set `maxConns: 55` and pass an empty `tracker.announce` array
    - _Requirements: 1.1, 1.4, 1.5_

  - [x] 1.2 Implement two-phase metadata resolution in `TorrentSessionManager.start()`
    - On 45-second timeout return `{ success: false, metadataResolved: false, retryable: true, error: 'metadata_timeout' }` and continue resolving in background
    - When background resolution completes emit `torrent:metadata-ready` to the renderer window via `getMainWindow().webContents.send`
    - _Requirements: 1.2, 1.3_

  - [x] 1.3 Write property test for torrent exe blocking (Property 4)
    - **Property 4: Torrent exe blocking is unconditional**
    - For any torrent whose file list contains at least one `.exe` file, `start()` must return `{ success: false, blocked: true }` and must not create a session entry in `this._sessions`
    - **Validates: Requirements 4.1, 4.2**

- [x] 2. Torrent Engine — Seeder/Leecher, Preview, .exe Blocking, .torrent Support
  - [x] 2.1 Implement `_getSeederLeecher(torrent)` helper in `session-manager.cjs`
    - Parse `torrent._trackers` scrape data for `complete` (seeders) and `incomplete` (leechers)
    - Fallback: when no scrape data and `numPeers > 0`, set `leechers = numPeers`, `seeders = 0`
    - When no scrape data and `numPeers === 0`, set both to `null`
    - Emit `seeders` and `leechers` as separate fields in every `torrent:progress` event tick
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 2.2 Add `torrent:peers` IPC handler in `desktop/ipc/ipc-torrent.cjs`
    - Return current `{ seeders, leechers }` for an active session without a full stats poll
    - _Requirements: 2.5_

  - [x] 2.3 Implement `.exe` file blocking in `TorrentSessionManager.start()`
    - After torrent metadata resolves, call `hasExeFiles(torrent)` before any file selection
    - If `.exe` found: call `this._client.remove(torrent, { destroyStore: true })`, do NOT create a session entry, return `{ success: false, blocked: true, error: 'BLOCKED_EXE: ...' }`
    - Detect `.exe` mid-session: stop session, delete partial files, emit `torrent:blocked` event
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 2.4 Implement `TorrentFacade.preview(magnet)` and `TorrentSessionManager.preview(magnet)`
    - Add `torrent:preview` IPC handler in `ipc-torrent.cjs` delegating to `facade.preview()`
    - Use `client.add(magnet, { store: false })` (metadata-only, no disk writes)
    - 20-second timeout returns `{ success: false, error: 'preview_timeout' }`
    - On success: classify each file (`isVideo`, `isExe`), call `this._client.remove(torrent, { destroyStore: true })`, return `TorrentPreviewResult`
    - Set `hasExeFiles: true` when any file has `.exe` extension
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [x] 2.5 Write property test for torrent preview state isolation (Property 6)
    - **Property 6: Torrent preview does not persist state**
    - For any magnet link passed to `torrent:preview`, the operation must not create a session entry in `TorrentSessionManager._sessions` and must remove the torrent from the WebTorrent client before returning
    - **Validates: Requirements 3.3**

  - [x] 2.6 Add `.torrent` buffer support to `TorrentSessionManager.start()` and `TorrentFacade`
    - Extend `TorrentStartOptions` interface with `torrentBuffer?: Buffer`
    - In `start()`: if `torrentBuffer` is present, use it instead of `infoHash`; convert `ArrayBuffer` → `Buffer` if needed; return `{ success: false, error: 'invalid_torrent_buffer' }` for invalid buffers
    - Add `TorrentFacade.startFromBuffer(buf, options)` method
    - Add `torrent:start-file` IPC handler in `ipc-torrent.cjs` delegating to `facade.startFromBuffer()`
    - _Requirements: 5.1, 5.2, 5.3_

  - [x] 2.7 Write property test for seeder/leecher non-negativity (Property 10)
    - **Property 10: Seeder/leecher counts are non-negative**
    - For any torrent session, `seeders` and `leechers` values emitted in `torrent:progress` events must be non-negative integers; negative values are never emitted
    - **Validates: Requirements 2.3, 2.4**

- [x] 3. Checkpoint — Torrent engine
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Name Parser — Release Parser Robustness
  - [x] 4.1 Harden `parseReleaseName()` in `desktop/runtime/torrent/naming/release-parser.cjs`
    - Wrap entire parse logic in try/catch; on any exception return a safe default `ParsedRelease` with `confidence: 0`
    - Ensure `confidence` is always clamped to `[0, 100]`
    - Handle decimal episode numbers (e.g. `18.5`) → set `isSpecial: true`
    - Handle batch episode ranges (e.g. `01-12`) → set `isBatch: true`, populate `episodeNumber` and `episodeEnd`
    - Handle `S00E03` → set `specialEpisode: 3`, `isSpecial: true`
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

  - [x] 4.2 Write property test for parser robustness (Property 1)
    - **Property 1: Parser never crashes on arbitrary input**
    - For any string passed to `parseReleaseName()`, the function must return a valid `ParsedRelease` object with `confidence` in `[0, 100]` and must never throw
    - **Validates: Requirements 13.1, 13.2**

- [x] 5. Name Parser — Title Normalizer and Catalog Mapper
  - [x] 5.1 Create `src/core/naming/title-normalizer.ts`
    - Implement `normalizeTitle(title, opts: NormalizationOptions)` with options: `stripArticles`, `normalizeSpecialChars` (removes `:`, `!`, `?`, `~`, applies NFKC), `removeYearSuffix`
    - Implement `buildSearchVariants(title)` returning an array that always includes the original title, plus stripped-article, special-char-normalized, year-stripped, season-suffix-stripped, and ordinal-season-stripped variants
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7_

  - [x] 5.2 Write property test for title normalizer idempotency (Property 2)
    - **Property 2: Title normalizer idempotency**
    - For any title string `t` and any `NormalizationOptions` object `opts`, `normalizeTitle(normalizeTitle(t, opts), opts)` must equal `normalizeTitle(t, opts)`
    - **Validates: Requirements 10.4**

  - [x] 5.3 Create `src/core/naming/catalog-mapper.ts`
    - Implement `mapParsedReleaseToAnime(parsed, hints?)` following the four-step lookup: (1) exact hint, (2) title cache, (3) AniList variant search, (4) AniList synonym search
    - Implement `resolveSeasonEntry(baseAnilistId, targetSeason)` using AniList SEQUEL relations sorted by start year
    - Wire in-memory LRU title cache (max 500 entries) backed by `cache:write` / `cache:read` IPC for persistence
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 12.1, 12.2, 12.3, 12.4_

  - [x] 5.4 Write property test for catalog mapping confidence monotonicity (Property 11)
    - **Property 11: Catalog mapping confidence monotonicity**
    - For any `ParsedRelease` with a non-null `title`, the `confidence` returned by `mapParsedReleaseToAnime()` when using an exact AniList ID hint must be ≥ the confidence returned without a hint
    - **Validates: Requirements 11.6**

- [x] 6. Checkpoint — Name parser and catalog mapper
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Watch Page — Source UI Redesign
  - [x] 7.1 Create `src/components/video/SourcePanel.tsx`
    - Define `CategorizedSource`, `DubLanguageGroup`, `SourceType`, `SourceTooltipData`, and `SourcePanelProps` TypeScript interfaces
    - Implement `groupSourcesByDubLanguage(sources)`: group by `dubLanguageCode`, sort Japanese first (`ja: 0`), English second (`en: 1`), others alphabetically, unknown last
    - Render `DubLanguageGroup` sections with a section header per language
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

  - [x] 7.2 Write property test for source grouping completeness (Property 3)
    - **Property 3: Source grouping completeness**
    - For any array of `CategorizedSource` objects, `groupSourcesByDubLanguage()` must return groups whose total source count equals the input array length — no sources are lost or duplicated
    - **Validates: Requirements 6.4**

  - [x] 7.3 Implement `SourceTypeBadge` component and per-card visual styles in `SourcePanel.tsx`
    - Apply `SOURCE_TYPE_STYLES` map: HLS → `bg-muted/60 text-muted-foreground` badge "HLS"; Embed → `bg-primary/20 text-primary` badge "Embed"; Torrent → `bg-green-500/20 text-green-400` badge "Torrent"
    - Render `SourceTypeBadge` on every source card regardless of selection state
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [-] 7.4 Implement `SourceHoverTooltip` using Radix UI Tooltip in `SourcePanel.tsx`
    - 200ms open delay via `delayDuration={200}` on `<Tooltip.Provider>`
    - Tooltip content: `dubLanguage`, `sourceType`, `quality`, `providerName`, `groupName` (if present)
    - For torrent sources: additionally show `seeders` and `leechers`; if not yet available, invoke `window.tatakaiRuntime.invoke('torrent:peers', sessionId)` lazily on hover and display once received
    - Dismiss immediately on mouse-leave
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ] 7.5 Integrate `SourcePanel` into `src/pages/watch/WatchPage.tsx`
    - Replace the existing flat server button list with `<SourcePanel>`, passing `CategorizedSource[]` derived from the resolved sources
    - Map existing source objects to `CategorizedSource` shape; detect `sourceType` from `isM3U8`, embed URL patterns, or explicit torrent flag
    - _Requirements: 6.1, 7.1, 8.1_

- [ ] 8. Watch Page — Continue Watch Poster Fix
  - [x] 8.1 Fix `updateLocalContinueWatching()` in `src/lib/localStorage.ts`
    - When merging an existing entry, set `animePoster: entry.animePoster || existing[idx].animePoster || ''` — never overwrite a valid poster with an empty string
    - _Requirements: 9.1, 9.2_

  - [x] 8.2 Update `WatchPage.tsx` to always pass `animePoster`
    - Pass `animeData?.info.poster` as fallback when calling `updateLocalContinueWatching()` so `animePoster` is never empty
    - _Requirements: 9.3, 9.4_

  - [x] 8.3 Write property test for Continue Watch poster preservation (Property 7)
    - **Property 7: Continue Watch poster preservation**
    - For any call to `updateLocalContinueWatching()` where the existing entry has a non-empty `animePoster`, the resulting stored entry must have a non-empty `animePoster` — a valid poster must never be overwritten with an empty string or placeholder
    - **Validates: Requirements 9.1, 9.2**

- [x] 9. Checkpoint — Watch Page UI
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Extension Platform — New IPC Handlers + TatakaiAPI Routes
  - [x] 10.1 Add public submission and status routes to `TatakaiAPI/src/routes/extensions.ts`
    - `POST /api/v3/extensions/submit` — accepts JSON manifest body, calls `insertManifestDraft()` with `submission_status: 'pending'`, calls `auditLog()`, returns `{ data: { extension_id, submission_status } }`; no admin secret required
    - `GET /api/v3/extensions/:id/status` — calls `getManifestById(id)`, returns `{ data: { submission_status, main_url, notes, updated_at } }`; returns 404 if not found
    - _Requirements: 14.3, 15.1_

  - [x] 10.2 Add `extension:submit` handler in `desktop/ipc/ipc-runtime.cjs`
    - Parse and validate `.kai` manifest (required fields: `id`, `name`, `version`, `type`) before any network call; return `{ success: false, error: '...' }` if invalid or bundle > 10 MB
    - POST JSON manifest to `${TATAKAI_API_BASE}/extensions/submit` where `TATAKAI_API_BASE` = `process.env.VITE_BACKEND_ORIGIN + '/api/v3'` (resolves to `http://localhost:4001/api/v3` in dev, `https://api.tatakai.me/api/v3` in prod)
    - On success return `{ success: true, submissionId: manifest.id, status: 'pending' }`; append audit log entry
    - On `ECONNREFUSED` or 503 return `{ success: false, error: 'marketplace_unavailable' }`
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.6_

  - [x] 10.3 Add `extension:review-status` handler in `desktop/ipc/ipc-runtime.cjs`
    - GET `${TATAKAI_API_BASE}/extensions/:submissionId/status` with 10-second timeout
    - Map `submission_status` → `status`; set `downloadUrl` to `main_url` only when `submission_status === 'approved'`
    - On failure return `{ success: false, error: '...' }`
    - _Requirements: 15.1, 15.2, 15.3, 15.4_

  - [x] 10.4 Add `extension:get-source-code` handler in `desktop/ipc/ipc-runtime.cjs`
    - Look up `extensionId` in `registry`; return `{ success: false, error: 'Extension not loaded' }` if not found
    - Read only from `path.join(app.getPath('userData'), 'extensions', extensionId, 'bundle.js')`; no writes, no code execution, no paths outside extensions directory
    - Return first 50 KB with `truncated: true` and `totalBytes` if file exceeds 50 KB; otherwise full content with `truncated: false`
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5_

  - [x] 10.5 Write property test for extension source code read-only constraint (Property 8)
    - **Property 8: Extension source code read-only**
    - For any call to `extension:get-source-code`, the handler must only read from `<userData>/extensions/<extensionId>/bundle.js` and must never write to disk, execute code, or access paths outside the extensions directory
    - **Validates: Requirements 17.5**

- [ ] 11. Extension Platform — Preload Bridge and Renderer Wiring
  - [x] 11.1 Add new IPC bridge methods to `desktop/preload.cjs` under `tatakaiRuntime`
    - `submitExtension: (kaiBuffer, metadata) => ipcRenderer.invoke('extension:submit', { kaiBuffer, metadata })`
    - `getReviewStatus: (submissionId) => ipcRenderer.invoke('extension:review-status', { submissionId })`
    - `getExtensionSourceCode: (extensionId) => ipcRenderer.invoke('extension:get-source-code', extensionId)`
    - _Requirements: 14.1, 15.1, 17.1_

  - [x] 11.2 Create `src/core/extensions/marketplace-client.ts`
    - Base URL: `${import.meta.env.VITE_BACKEND_ORIGIN}/api/v3` (resolves to `https://api.tatakai.me/api/v3` in prod, `http://localhost:4001/api/v3` in dev)
    - Export `MarketplaceExtension` interface matching the `ExtensionManifestRow` shape from TatakaiAPI (`id`, `name`, `version`, `type`, `description`, `permissions`, `mainUrl`, `updateUrl`, `signature`, `signedBy`, `speed`, `accuracy`, `regions`, `nsfw`)
    - Implement `fetchMarketplaceExtensions(filter?)` calling `GET /api/v3/extensions/manifests`, mapping response fields to `MarketplaceExtension`
    - Implement `downloadExtensionKai(mainUrl)` fetching the bundle from `main_url` as `ArrayBuffer`
    - _Requirements: 16.1, 16.2, 16.3_

  - [x] 11.3 Wire `PublishExtensionModal.tsx` to real IPC
    - Replace stub calls with `window.tatakaiRuntime.submitExtension(kaiBuffer, metadata)`
    - Show submission ID and start polling `window.tatakaiRuntime.getReviewStatus(submissionId)` every 30 seconds
    - Display `status` (`pending` | `in_review` | `approved` | `rejected`) and `notes` in the modal UI
    - _Requirements: 14.1, 14.3, 15.1, 15.2_

  - [x] 11.4 Wire `src/components/ui/MarketplaceModal.tsx` to `marketplace-client.ts`
    - Replace stub data with `fetchMarketplaceExtensions(filter)` via TanStack Query
    - On install: call `downloadExtensionKai(downloadUrl)` then `window.tatakaiRuntime.loadKaiExtension(buffer, false)`
    - _Requirements: 16.1, 16.2, 16.3, 16.4, 16.5_

  - [-] 11.5 Add `SourceCodeTab` to `src/pages/base/ExtensionDetailPage.tsx`
    - Implement `SourceCodeTab({ extensionId })` using TanStack Query with `queryFn: () => window.tatakaiRuntime.getExtensionSourceCode(extensionId)` and `staleTime: Infinity`
    - Show truncation warning banner when `data.truncated === true` with `totalBytes` display
    - Render source in `<pre>` with `bg-muted/30 rounded-lg p-4 text-xs font-mono overflow-auto max-h-[500px] whitespace-pre-wrap`
    - _Requirements: 17.1, 17.2, 17.3_

  - [x] 11.6 Write property test for extension submission validation gates upload (Property 12)
    - **Property 12: Extension submission validation gates upload**
    - For any `.kai` buffer passed to `extension:submit`, the handler must parse and validate the manifest before making any network request; if the manifest is missing required fields, the handler must return `{ success: false }` without contacting the marketplace API
    - **Validates: Requirements 14.1, 14.2**

- [x] 12. Checkpoint — Extension platform
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Download System — Unified Queue with Torrent Support
  - [x] 13.1 Extend `DownloadQueueEntry` interface and `runEpisodeDownload()` in `desktop/ipc/ipc-download-manager.cjs`
    - Add `sourceType: 'hls' | 'torrent'` field to the entry shape
    - Add `magnet?: string` and `torrentBuffer?: ArrayBuffer` fields
    - Reject entries where `downloadPath` contains `../` with `{ success: false, error: 'invalid_download_path' }`
    - Resolve `downloadPath` in priority order: (1) explicit field, (2) `tatakai_download_path` from renderer localStorage (passed in payload), (3) `DownloadStorageManager.defaultLibraryRoot()` → `app.getPath('videos')/Tatakai`
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 19.2, 19.3_

  - [x] 13.2 Implement torrent branch in `runEpisodeDownload()` in `ipc-download-manager.cjs`
    - When `sourceType === 'torrent'`: call `TorrentFacade.start(magnet, { downloadPath, episode, fileIndex })` or `startFromBuffer(torrentBuffer, options)` instead of ffmpeg
    - Forward `torrent:progress` events as `download-progress` events to the renderer window
    - On torrent completion emit `download-completed`; on error emit `download-error`
    - Respect the same 3-concurrent-download limit as HLS downloads
    - _Requirements: 18.2, 18.4, 18.5_

  - [x] 13.3 Write property test for download queue ordering (Property 5)
    - **Property 5: Download queue ordering**
    - For any sequence of `download:enqueue` calls, if `activeDownloads.size < 3` at enqueue time the download must start immediately; if `activeDownloads.size >= 3` the download must be added to `downloadQueue` and start only after an active download completes — the queue must never exceed 3 concurrent active downloads
    - **Validates: Requirements 18.1, 18.2, 18.3, 18.4, 18.5**

- [ ] 14. Download System — Source Selection Modal and Auto-Download
  - [-] 14.1 Create `src/components/video/DownloadSourceModal.tsx`
    - Modal that accepts `sources: CategorizedSource[]` and lets the user pick one HLS or torrent source before enqueuing
    - On confirm: call `window.electron.startDownload({ ...entry, sourceType, url/magnet })` with the selected source
    - Show `SourceTypeBadge` and quality info for each option
    - _Requirements: 18.1, 18.2_

  - [ ] 14.2 Update `AutoDownloader` in `desktop/services/auto-downloader.cjs`
    - Ensure `subscribe(animeId, title, nextEpisode)` creates a subscription record with `nextEpisode` set to the specified episode number
    - Poll every 30 minutes; when episode N is available enqueue via `download:enqueue` with `sourceType: 'hls'`; fall back to `sourceType: 'torrent'` if HLS is unavailable
    - After successful download of episode N, update `nextEpisode` to N+1 before the next poll cycle
    - Never enqueue the same episode number twice for the same subscription
    - If both sources unavailable: skip episode, retry on next poll cycle
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5, 20.6, 20.7, 20.8, 20.9_

  - [x] 14.3 Write property test for auto-download episode advancement (Property 9)
    - **Property 9: Auto-download episode advancement**
    - For any successful auto-download of episode N for a subscribed anime, the subscription's `nextEpisode` field must be updated to N+1 before the next poll cycle — the same episode must never be downloaded twice for the same subscription
    - **Validates: Requirements 20.6, 20.7**

- [ ] 15. Torrent IPC — Preload Bridge Additions for New Channels
  - [ ] 15.1 Add new torrent IPC bridge methods to `desktop/preload.cjs` under `tatakaiRuntime`
    - `previewTorrent: (magnet) => ipcRenderer.invoke('torrent:preview', magnet)`
    - `getTorrentPeers: (sessionId) => ipcRenderer.invoke('torrent:peers', sessionId)`
    - `startTorrentFromFile: (torrentBuffer, options) => ipcRenderer.invoke('torrent:start-file', { torrentBuffer, options })`
    - Add `onTorrentMetadataReady` event listener following the same pattern as `onTorrentProgress`
    - Add `onTorrentBlocked` event listener for `torrent:blocked` events
    - _Requirements: 1.3, 2.5, 3.1, 4.3, 5.2_

- [x] 16. Final Checkpoint — Full integration
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation at each major boundary
- Property tests validate universal correctness properties; unit tests validate specific examples and edge cases
- All main-process files use CommonJS (`.cjs`); all renderer files use TypeScript/TSX
- **All marketplace API calls go through the unified TatakaiAPI** (`TatakaiAPI/` folder): `http://localhost:4001/api/v3` in dev, `https://api.tatakai.me/api/v3` in prod — no separate marketplace service needed
- Task 10.1 (TatakaiAPI routes) must be completed before tasks 10.2 and 10.3 (IPC handlers) can be tested end-to-end
- `torrent:peers` (task 2.2) must exist before `SourceHoverTooltip` (task 7.4) can fetch live seeder/leecher data

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "4.1", "10.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "4.2", "5.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "1.3", "5.2", "5.3"] },
    { "id": 3, "tasks": ["2.5", "2.6", "5.4", "8.1", "10.2", "10.3", "10.4"] },
    { "id": 4, "tasks": ["2.7", "7.1", "8.2", "10.5", "11.1", "11.2", "13.1"] },
    { "id": 5, "tasks": ["7.2", "7.3", "8.3", "11.3", "11.4", "13.2"] },
    { "id": 6, "tasks": ["7.4", "11.5", "11.6", "13.3", "14.1", "14.2"] },
    { "id": 7, "tasks": ["7.5", "14.3", "15.1"] }
  ]
}
```
