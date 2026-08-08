# Implementation Plan: Electron Extension Platform

## Overview

This implementation plan covers the Electron Extension Platform feature set for Tatakai's desktop application. It includes: (1) critical runtime bug fixes, (2) complete setup/onboarding flow with real IPC implementations, (3) full extension system with curated hub, sideloading, sandboxed Web Worker execution, and SDK, (4) country policy display with blurred IP detection and non-blocking warnings, and (5) **Tatakai-owned torrent system** with candidate discovery, release quality scoring, session management, piece prioritization, streaming bridge, cache management, and Seanime-inspired naming system.

The implementation is structured to build incrementally, with each task referencing specific requirements and design properties.

---

## Tasks

- [x] 1. Fix critical runtime bugs
  - [x] 1.1 Fix Electron dev server port mismatch
    - Update `desktop/main.cjs` to load renderer from port `8090` instead of `8089`
    - Verify `vite.config.ts` dev server port matches
    - _Requirements: 1.1_
  
  - [x] 1.2 Fix WatchPage undefined episode crash
    - Add loading skeleton to `src/pages/watch/WatchPage.tsx` when episode data is undefined
    - Add null checks before accessing episode properties
    - _Requirements: 1.2_
  
  - [x] 1.3 Fix AnimePage duplicate React keys
    - Audit all list renders in `src/pages/base/AnimePage.tsx`
    - Ensure unique keys for episodes and related entries lists
    - _Requirements: 1.3_
    - **Property 1: React list keys are unique**
  
  - [x] 1.4 Fix desktop layout sidebar overlap
    - Update `src/components/layout/MainLayout.tsx` to apply sidebar offset on desktop
    - Use CSS variable `--sidebar-width` for responsive offset
    - _Requirements: 1.4, 12.1, 12.2, 12.3_
    - **Property 16: Layout offset matches sidebar state**

- [~] 2. Checkpoint - Verify bug fixes
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Implement Extension SDK and core types
  - [x] 3.1 Create Extension SDK directory structure
    - Create `src/core/extensions/sdk/` directory
    - Create `abstract-source.ts`, `types.ts`, `tatakai-sdk.d.ts`
    - _Requirements: 8.1, 8.2, 8.3, 8.5, 8.6_
  
  - [x] 3.2 Implement AbstractSource base class
    - Define abstract methods: `validate()`, `single()`, `batch()`, `movie()`
    - Export `SourceOptions`, `SourceResult`, `SubtitleTrack` interfaces
    - _Requirements: 8.1, 8.2, 8.3_
  
  - [x] 3.3 Create extension manifest types
    - Define `ExtensionManifest`, `VersionEntry`, `ExtensionInvokeResult` interfaces
    - Include signature, permissions, and sideload fields
    - _Requirements: 8.2_
  
  - [x] 3.4 Create TypeScript declaration file for injected globals
    - Define `__tatakai_fetch__`, `__tatakai_anitomy__`, `__tatakai_parse_html__` types
    - Define `ParsedReleaseMetadata` and `CheerioLikeAPI` interfaces
    - _Requirements: 8.4, 8.5_

- [x] 4. Build Extension Registry and Worker Pool (Main Process)
  - [x] 4.1 Create ExtensionRegistry class
    - Implement in-memory registry: `desktop/runtime/extension-registry.cjs`
    - Methods: `register()`, `unregister()`, `lookup()`, `isKillSwitched()`, `listLoaded()`
    - _Requirements: 10.1, 10.5_
    - **Property 15: Extension registry health report**
  
  - [x] 4.2 Create ExtensionWorkerPool class
    - Implement worker lifecycle: `desktop/runtime/extension-worker-pool.cjs`
    - Methods: `getOrSpawn()`, `invoke()`, `terminate()`, `terminateAll()`
    - _Requirements: 9.1, 9.3, 9.4_
  
  - [x] 4.3 Create ExtensionSandbox wrapper
    - Implement code wrapping: `desktop/runtime/extension-sandbox.cjs`
    - Inject globals, block `document`, `window`, `localStorage`, `indexedDB`, `XMLHttpRequest`
    - _Requirements: 9.1_
    - **Property 11: Web Worker sandbox isolation**
  
  - [x] 4.4 Implement domain allowlist enforcement
    - Create `createAllowlistedFetch()` function
    - Reject fetch calls to non-permitted domains with `PermissionDeniedError`
    - _Requirements: 9.2, 7.6_
    - **Property 12: Domain allowlist enforcement**
  
  - [x] 4.5 Implement timeout guards
    - Add 30-second per-call timeout
    - Add 2-minute cumulative timeout with suspension
    - _Requirements: 9.3, 9.4_
    - **Property 13: Extension timeout enforcement**
  
  - [x] 4.6 Implement payload size guard
    - Enforce 10 MB response limit
    - Set `truncated: true` flag when exceeded
    - _Requirements: 9.6_
    - **Property 14: Extension response payload size limit**

- [x] 5. Implement Extension IPC Handlers
  - [x] 5.1 Add `extension:load` IPC handler
    - Read bundle from extensions directory
    - Verify signature if not sideloaded (Ed25519 signature verification implemented)
    - Register in ExtensionRegistry
    - _Requirements: 10.1_
    - **Property 9: Signature verification gates installation**
  
  - [x] 5.2 Add `extension:unload` IPC handler
    - Terminate worker if running
    - Remove from registry
    - _Requirements: 10.3_
  
  - [x] 5.3 Add `extension:invoke` IPC handler
    - Lookup extension in registry
    - Spawn/reuse worker
    - Apply timeout and payload guards
    - _Requirements: 10.2, 10.4_
  
  - [-] 5.4 Add `runtime:health` IPC handler
    - Return status, version, loaded extensions list ✅
    - Poll kill-switch list and unload flagged extensions ✅
    - Verify kill-switch polling is called on every health request ← needs validation
    - _Requirements: 10.5, 10.6_
  
  - [x] 5.5 Update `desktop/preload.cjs` with extension bridge methods
    - Expose `loadExtension()`, `unloadExtension()`, `invokeExtension()` via `tatakaiRuntime`
    - _Requirements: 10.1, 10.2, 10.3_

- [~] 6. Checkpoint - Verify extension infrastructure
  - Ensure all tests pass, ask the user if questions arise.

- [-] 7. Implement Setup Flow enhancements
  - [-] 7.1 Complete Step 1 - Storage
    - Call `window.electron.getDownloadsDir()` on mount
    - Add error boundary with OS Downloads fallback
    - Persist path to `localStorage` on step advance
    - ⚠️ IPC wiring needs verification — hook exists but round-trip not confirmed
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
    - **Property 2: Setup storage path round-trip**
  
  - [-] 7.2 Complete Step 3 - Country Policy
    - `src/core/country-policy/useCountryPolicy.ts` ✅ exists
    - `TORRENT_LEGALITY_TABLE` ✅ exists (196 countries)
    - ⚠️ SetupPage.tsx integration of the hook needs verification
    - ⚠️ Remove `disabled={!countryAck}` from Continue button if still present
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_
    - **Property 3: Country badge correctness**
    - **Property 4: Country policy is non-blocking**
  
  - [x] 7.3 Create torrent legality table
    - `src/core/country-policy/torrent-legality.ts` ✅ exists with 196 countries
    - `isTorrentingPermitted(countryCode)` ✅ exported
    - _Requirements: 3.2, 11.2, 11.3_
  
  - [-] 7.4 Complete Step 4 - WARP/DoH
    - Call `window.tatakaiRuntime.toggleWarp(enableWarp)` on step advance
    - ⚠️ Needs verification that IPC call is wired in SetupPage.tsx step 4
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_
    - **Property 5: WARP toggle persistence round-trip**
  
  - [-] 7.5 Complete Step 5 - Extensions
    - Call `setFlag(FeatureFlag.EXTENSION_SCRAPING, enableExtensions)` on complete
    - ⚠️ Needs verification that feature flag is set correctly
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_
    - **Property 6: Extensions toggle feature flag round-trip**

- [ ] 8. Implement Country Policy settings panel
- [x] 8. Implement Country Policy settings panel
  - [x] 8.1 Create CountryPolicy settings component
    - Create `src/components/settings/CountryPolicy.tsx`
    - Display detected country name and blurred IP
    - Show green "Permitted" or amber "Restricted" badge
    - Add "Show IP" toggle to remove blur
    - Add "Learn about VPNs" link to Cloudflare WARP page
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_
  
  - [x] 8.2 Integrate CountryPolicy panel into Settings page
    - Add route and navigation for Country Policy settings
    - Ensure non-blocking behavior (no disabled controls)
    - _Requirements: 11.6_

- [x] 9. Build Extension Hub UI
  - [x] 9.1 Create Extension Hub page structure
    - Create `src/pages/extensions/ExtensionHub.tsx`
    - Create `ExtensionGrid`, `ExtensionCard`, `ExtensionDetailPage` components
    - _Requirements: 6.1, 6.2_
  
  - [x] 9.2 Implement ExtensionCard component
    - Display name, icon, type badge, version, short description
    - Show install/update/uninstall button based on state
    - _Requirements: 6.1, 6.5_
    - **Property 7: Extension card renders all required fields**
  
  - [~] 9.3 Implement ExtensionDetailPage component
    - Display full description, version history, permissions list
    - Add screenshots carousel
    - Add install/uninstall actions
    - _Requirements: 6.2, 6.3, 6.4_
  
  - [~] 9.4 Create ExtensionFilterBar component
    - Add filter by type (torrent, onlinestream, custom)
    - Add sort by name, popularity, recently updated
    - _Requirements: 6.6_
    - **Property 8: Extension filter and sort correctness**
  
  - [~] 9.5 Create Zustand extension store
    - Define `useExtensionStore` with `installed`, `available`, `filter`, `sort` state
    - Implement `install()`, `uninstall()`, `sideload()`, `setFilter()`, `setSort()` actions
    - _Requirements: 6.3, 6.7_
  
  - [~] 9.6 Implement signature verification in install flow
    - Verify `signature` field against Tatakai public key before installation
    - Show error dialog if verification fails
    - _Requirements: 6.3, 6.4_
    - **Property 9: Signature verification gates installation**

- [ ] 10. Implement Extension Sideloading
  - [~] 10.1 Create SideloadPanel component
    - Add file picker and URL input field
    - Display warning dialog about unsigned extensions
    - _Requirements: 7.1, 7.2_
  
  - [~] 10.2 Implement sideload validation
    - Parse manifest and validate required fields (`id`, `name`, `version`, `type`, `permissions`)
    - Show validation error listing missing fields if incomplete
    - _Requirements: 7.3, 7.4_
    - **Property 10: Sideload manifest validation**
  
  - [~] 10.3 Add sideloaded badge to extension cards
    - Render "Sideloaded — Unverified" badge for sideloaded extensions
    - _Requirements: 7.5_
  
  - [~] 10.4 Enforce sandbox restrictions for sideloaded extensions
    - Apply same Web Worker sandbox and domain allowlist as curated extensions
    - _Requirements: 7.6_

- [~] 11. Checkpoint - Verify extension hub and sideloading
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Implement virtualized grids and BlurHash
  - [~] 12.1 Create VirtualizedAnimeGrid component
    - Use `@tanstack/react-virtual` for lists > 50 items
    - Render only visible items + overscan buffer
    - _Requirements: 13.1_
    - **Property 17: Virtualized grid renders only visible items**
  
  - [~] 12.2 Add BlurHash placeholder to AnimeCard
    - Display BlurHash canvas before image loads
    - Transition to loaded image with 300ms opacity fade
    - _Requirements: 13.2, 13.3_
    - **Property 18: BlurHash placeholder precedes image load**
  
  - [~] 12.3 Add feature flag fallback for virtualized grid
    - Check `VIRTUAL_GRID` feature flag
    - Fall back to standard grid if disabled
    - _Requirements: 13.5_
  
  - [~] 12.4 Maintain scroll position on navigation
    - Preserve scroll position when returning to browse page
    - _Requirements: 13.4_

- [ ] 13. Build TatakaiTorrentCore - Core Infrastructure (⚠️ ALL STUBS - Need Real Implementation)
  - [x] 13.1 Create TorrentCore directory structure
    - `desktop/runtime/torrent/` ✅ exists with all subdirectories
    - `core/`, `naming/`, `session/`, `cache/`, `streaming/` ✅ all exist
    - _User requirement: Tatakai-owned torrent system_
  
  - [ ] 13.2 Implement torrent candidate discovery — ⚠️ STUB ONLY (2.3KB, no real logic)
    - `desktop/runtime/torrent/core/candidate-discovery.cjs` exists as stub
    - **TODO**: Integrate real Nyaa.si scraping via extension system or direct HTTP
    - **TODO**: Return real torrent metadata with infoHash, seeders, leechers, size
    - _User requirement: Torrent candidate discovery_
  
  - [ ] 13.3 Implement anitomyscript-based release parsing — ⚠️ STUB ONLY (1KB)
    - `desktop/runtime/torrent/naming/release-parser.cjs` exists as stub
    - **TODO**: Integrate real anitomyscript WASM binding or native binary
    - **TODO**: Parse release group, episode number, resolution, audio, codec signals
    - _User requirement: Anitomyscript-based release quality scoring_
    - _Seanime inspiration: Release name parsing_
  
  - [ ] 13.4 Implement release quality scoring — ⚠️ STUB ONLY (0.8KB)
    - `desktop/runtime/torrent/naming/quality-scorer.cjs` exists as stub
    - **TODO**: Real scoring: resolution > codec > audio > subtitles > release group > seed health
    - **TODO**: Prefer best playable release, not highest seed count
    - _User requirement: Release quality scoring_
  
  - [ ] 13.5 Implement batch torrent detection — ⚠️ STUB ONLY (0.3KB)
    - `desktop/runtime/torrent/naming/batch-detector.cjs` exists as stub
    - **TODO**: Real batch detection from release name patterns and file listing
    - _User requirement: Batch layout detection_
  
  - [ ] 13.6 Implement torrent-to-episode matching — ⚠️ STUB ONLY (0.5KB)
    - `desktop/runtime/torrent/naming/episode-matcher.cjs` exists as stub
    - **TODO**: Real episode file matching using parsed metadata + Tatakai episode IDs
    - _User requirement: Match torrent files to episodes_
  
  - [ ] 13.7 Implement display title builder — ⚠️ STUB ONLY (0.6KB)
    - `desktop/runtime/torrent/naming/display-title-builder.cjs` exists as stub
    - **TODO**: Real clean display title construction from parsed metadata
    - _User requirement: Build display titles_

- [ ] 14. Build TatakaiTorrentCore - Session Management (⚠️ STUB - Need WebTorrent Integration)
  - [ ] 14.1 Create TorrentSessionManager class — ⚠️ STUB (6KB placeholder, no real BitTorrent)
    - `desktop/runtime/torrent/session/session-manager.cjs` exists as large stub
    - **TODO**: Install `webtorrent` package in desktop/
    - **TODO**: Rewrite using WebTorrent client API: add(), select(), destroy()
    - **TODO**: Real session state machine: queued → downloading → seeding → stopped → error
    - _User requirement: Session manager_
  
  - [ ] 14.2 Implement session start with file selection — ⚠️ STUB
    - **TODO**: Real `startTorrentSession(infoHash, options)` using WebTorrent
    - **TODO**: File selection based on episode-matcher results
    - **TODO**: Initialize piece prioritization on selected file index
    - _User requirement: Session manager_
  
  - [ ] 14.3 Implement piece prioritization — ⚠️ STUB (0.3KB)
    - `desktop/runtime/torrent/session/piece-prioritizer.cjs` is empty stub
    - **TODO**: Real sequential piece priority via WebTorrent's `file.select()`
    - **TODO**: Critical-path piece prioritization for first N seconds of playback
    - _User requirement: Piece prioritization_
  
  - [ ] 14.4 Implement session stop and cleanup — ⚠️ STUB
    - **TODO**: Real `stopTorrentSession(sessionId)` with WebTorrent `torrent.destroy()`
    - **TODO**: Configurable: preserve completed files vs cleanup all
    - _User requirement: Session manager_
  
  - [ ] 14.5 Add session stats and progress tracking — ⚠️ STUB
    - **TODO**: Real stats from WebTorrent: downloadSpeed, uploadSpeed, progress, eta, numPeers
    - **TODO**: Emit progress via IPC event channel to renderer
    - _User requirement: Session manager_

- [ ] 15. Build TatakaiTorrentCore - Streaming Bridge (⚠️ STUB - Critical for Playback)
  - [ ] 15.1 Create streaming bridge — ⚠️ STUB ONLY (0.5KB, no HTTP server)
    - `desktop/runtime/torrent/streaming/stream-bridge.cjs` is empty stub
    - **TODO**: Create HTTP server on random local port using Node.js `http.createServer()`
    - **TODO**: Serve torrent file bytes from WebTorrent's file stream API
    - **TODO**: Return `http://localhost:{port}/stream/{sessionId}/{fileIndex}` as playback URL
    - _User requirement: Streaming bridge_
  
  - [ ] 15.2 Implement prebuffering logic — ⚠️ NOT IMPLEMENTED
    - **TODO**: Buffer first 5MB of file before signaling ready to player
    - **TODO**: Wait for first N pieces before returning stream URL
    - **TODO**: Show buffering progress indicator in UI
    - _User requirement: Streaming bridge_
  
  - [ ] 15.3 Add byte-range request handling — ⚠️ NOT IMPLEMENTED
    - **TODO**: Parse `Range: bytes=N-M` HTTP headers
    - **TODO**: Seek to byte offset → recalculate piece priority for that position
    - **TODO**: Support HLS + direct video seeking without re-download
    - _User requirement: Streaming bridge_

- [ ] 16. Build TatakaiTorrentCore - Cache Management
  - [~] 16.1 Create cache manager
    - Create `desktop/runtime/torrent/cache/cache-manager.cjs`
    - Track cached torrent files and metadata
    - Implement LRU eviction policy
    - _User requirement: Cache management_
  
  - [~] 16.2 Implement cache size limits
    - Enforce user-configurable cache size limit
    - Evict oldest/least-used torrents when limit exceeded
    - _User requirement: Cache management_
  
  - [~] 16.3 Add cache cleanup on app quit
    - Clean up incomplete downloads on app quit
    - Preserve completed files based on user settings
    - _User requirement: Cache management_

- [ ] 17. Integrate TorrentCore with IPC Bridge
  - [~] 17.1 Add `torrent:search` IPC handler
    - Call `searchTorrentCandidates(options)` from TorrentCore
    - Return ranked torrent candidates to renderer
    - _User requirement: Integration with extension system_
  
  - [~] 17.2 Add `torrent:start` IPC handler
    - Call `startTorrentSession(infoHash, options)` from TorrentCore
    - Return session ID to renderer
    - _User requirement: Integration with extension system_
  
  - [~] 17.3 Add `torrent:stop` IPC handler
    - Call `stopTorrentSession(sessionId)` from TorrentCore
    - Return success status to renderer
    - _User requirement: Integration with extension system_
  
  - [~] 17.4 Add `torrent:stats` IPC handler
    - Call `getTorrentStats(sessionId)` from TorrentCore
    - Return session stats to renderer
    - _User requirement: Integration with extension system_
  
  - [ ] 17.5 Add `torrent:progress` IPC event channel — ⚠️ NOT IMPLEMENTED
    - **TODO**: Emit `win.webContents.send('torrent:progress', stats)` from session manager
    - **TODO**: Renderer subscribes via `tatakaiRuntime.onTorrentProgress(callback)`
    - **TODO**: Update download progress bar, speed, ETA in real-time
    - _User requirement: Integration with extension system_
  
  - [~] 17.6 Update `desktop/preload.cjs` with torrent bridge methods
    - Expose `searchTorrentCandidates()`, `startTorrentSession()`, `stopTorrentSession()`, `getTorrentStats()` via `tatakaiRuntime`
    - Add `onTorrentProgress()` event listener
    - _User requirement: Integration with extension system_

- [ ] 18. Implement Country Policy Gating for Torrent Features
  - [~] 18.1 Add country check before torrent search
    - Check `isTorrentingPermitted(countryCode)` before allowing torrent search
    - Show non-blocking warning if restricted
    - Allow user to proceed with acknowledgment
    - _User requirement: Country policy gating_
  
  - [~] 18.2 Add country policy banner to torrent UI
    - Display amber warning banner in torrent search/playback UI if country is restricted
    - Include VPN suggestion link
    - Do not disable torrent features (non-blocking)
    - _User requirement: Country policy gating_

- [ ] 19. Implement Desktop-Only Feature Flag Gating
  - [~] 19.1 Add `TORRENT_ENGINE` feature flag check
    - Check `isEnabled(FeatureFlag.TORRENT_ENGINE)` before showing torrent UI
    - Hide torrent options on web and mobile
    - _User requirement: Desktop-only feature flag gating_
  
  - [~] 19.2 Add platform check for torrent features
    - Check `window.electron` exists before enabling torrent features
    - Show "Desktop only" message on web/mobile if user tries to access
    - _User requirement: Desktop-only feature flag gating_

- [ ] 20. Create Torrent Extension Type
  - [~] 20.1 Add torrent extension type to AbstractSource
    - Update `AbstractSource` to support `type: 'torrent'`
    - Define torrent-specific methods in SDK
    - _User requirement: Torrent extensions use AbstractSource_
  
  - [~] 20.2 Create example torrent extension
    - Create reference implementation: `NyaaSearchExtension`
    - Implement `searchTorrentCandidates()` using AbstractSource contract
    - Use injected `__tatakai_fetch__` and `__tatakai_parse_html__`
    - _User requirement: Torrent extensions use AbstractSource_

- [~] 21. Checkpoint - Verify torrent system integration
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 22. Final integration and polish
  - [~] 22.1 Add sidebar navigation for Extension Hub
    - Add "Extensions" link to desktop sidebar
    - Show badge for available updates
    - _Requirements: 6.1_
  
  - [~] 22.2 Add error boundaries for all new pages
    - Wrap ExtensionHub, CountryPolicy, and torrent UI in error boundaries
    - Show user-friendly error messages
    - _Requirements: General error handling_
  
  - [~] 22.3 Add loading states for all async operations
    - Show spinners/skeletons during extension load, torrent search, session start
    - _Requirements: General UX_
  
  - [~] 22.4 Add telemetry for extension and torrent events
    - Log extension install/uninstall/invoke events
    - Log torrent search/start/stop events
    - Log country policy checks
    - _Requirements: General observability_
  
  - [~] 22.5 Update feature flag defaults
    - Set `EXTENSION_SCRAPING` to `false` by default (opt-in)
    - Set `TORRENT_ENGINE` to `false` by default (opt-in)
    - _Requirements: 5.3, 5.4_

- [~] 23. Final checkpoint - End-to-end verification
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- **TatakaiTorrentCore** is a full-featured, Tatakai-owned torrent system inspired by Seanime's architecture
- **Torrent naming system** uses anitomyscript for parsing and quality-based ranking
- **Country policy gating** is non-blocking but informative
- **Desktop-only feature flags** ensure torrent features don't leak to web/mobile
- **Extension integration** allows torrent extensions to use the AbstractSource contract

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4"] },
    { "id": 1, "tasks": ["3.1", "3.2", "3.3", "3.4"] },
    { "id": 2, "tasks": ["4.1", "4.2", "4.3", "4.4", "4.5", "4.6"] },
    { "id": 3, "tasks": ["5.1", "5.2", "5.3", "5.4", "5.5"] },
    { "id": 4, "tasks": ["7.1", "7.3"] },
    { "id": 5, "tasks": ["7.2", "7.4", "7.5", "8.1"] },
    { "id": 6, "tasks": ["8.2", "9.1"] },
    { "id": 7, "tasks": ["9.2", "9.3", "9.4", "9.5"] },
    { "id": 8, "tasks": ["9.6", "10.1", "10.2", "10.3", "10.4"] },
    { "id": 9, "tasks": ["12.1", "12.2", "12.3", "12.4"] },
    { "id": 10, "tasks": ["13.1", "13.2", "13.3"] },
    { "id": 11, "tasks": ["13.4", "13.5", "13.6", "13.7"] },
    { "id": 12, "tasks": ["14.1", "14.2", "14.3"] },
    { "id": 13, "tasks": ["14.4", "14.5", "15.1"] },
    { "id": 14, "tasks": ["15.2", "15.3", "16.1"] },
    { "id": 15, "tasks": ["16.2", "16.3", "17.1", "17.2", "17.3", "17.4"] },
    { "id": 16, "tasks": ["17.5", "17.6", "18.1", "18.2"] },
    { "id": 17, "tasks": ["19.1", "19.2", "20.1"] },
    { "id": 18, "tasks": ["20.2", "22.1", "22.2", "22.3", "22.4"] },
    { "id": 19, "tasks": ["22.5"] }
  ]
}
```
