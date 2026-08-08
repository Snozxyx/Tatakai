@'
# SeaAnime and Tatakai Comparative Analysis and Phased Plan

## Fixed Product Decisions
- Keep the current Tatakai UI and design language unchanged.
- Preserve all existing Tatakai features; new work must be additive and feature-flagged.
- Use TypeScript and TSX as the primary implementation language for application features.
- Do not move admin surfaces or the main application database into a local app runtime.
- Reduce server dependence by moving scraper execution closer to the app where practical, but keep the server API as the fallback path.
- Build a Tatakai-owned player layer and a Tatakai-owned torrent layer instead of depending on an external player application.
- Keep comments, forum, moderation, marketplace, and admin flows working on top of the current Tatakai systems.
- Stop depending on scrapers for home, search, trending, favorites, and catalog browsing; those surfaces should come from Tatakai's own content graph and internal IDs.
- Use `dev/anime-mapper` as an ingestion/mapping pipeline, not as a user-facing runtime dependency.

## Executive Summary
SeaAnime is strong because it is local-first, modular, and feature-rich. It has a serious torrent stack, a typed extension system, a custom playback core, and a broad route surface for anime, manga, playback, torrent streaming, debrid, playlists, library, and extension management. Its architecture is centered around long-lived backend modules that own state and expose a unified local API.

Tatakai is already strong in different areas. It already has a React and TSX application, Electron desktop packaging, Capacitor mobile packaging, a real provider orchestration layer, source merging and fallback logic, an HLS-based player, Supabase-backed moderation and community systems, and moderated marketplace/custom-source flows. Tatakai does not need to become SeaAnime. It needs to adopt SeaAnime's good patterns while keeping its own strengths.

The best path is not a SeaAnime clone. The best path is a Tatakai-specific architecture with these foundations:
- Tatakai Content Graph: AniList-anchored internal catalog with Tatakai IDs for home/search/trending/favorites.
- Tatakai Mapper Pipeline: import and normalize `anime-mapper` outputs into Tatakai-owned mapping tables.
- Tatakai Provider Orchestrator: keep the existing provider stack and formalize it as a first-class service layer.
- Tatakai Local Runtime: desktop-local source resolution and torrent orchestration behind a safe bridge, with server fallback.
- Tatakai Player Core: a Tatakai-owned playback state machine and source adapter layer while keeping the current visual player UI.
- Tatakai Torrent Core: a Tatakai-owned torrent lifecycle, file selection, streaming, caching, and safety layer.
- Tatakai Extension Hub: moderated, signed, permission-scoped extensions instead of unrestricted client-side code execution.
- Tatakai Admin Ops: keep the current admin and community systems, and expand them for provider/torrent/extension management.

## 1. What SeaAnime Has

### Product Features
SeaAnime includes the following major capabilities:
- Anime playback from online stream providers.
- Torrent search and torrent-based playback flows.
- Torrent client integrations and torrentstream lifecycle management.
- Debrid-style source integration.
- Custom playback coordination through a `VideoCore` event model.
- Extension marketplace and typed extension categories.
- Manga support.
- Playlist and library-style flows.
- Local-first app behavior with persistent local state and repositories.
- Desktop-oriented runtime with strong backend ownership of playback and source workflows.

### Extension Types Observed in Code
SeaAnime explicitly models typed extensions such as:
- `anime-torrent-provider`
- `manga-provider`
- `onlinestream-provider`
- `custom-source`
- `plugin`

### Torrent and Playback Capabilities Observed in Code
SeaAnime's route and module layout shows support for:
- Torrent search.
- Torrent start, stop, drop, preview, and history flows.
- Stream serving for torrent playback.
- Torrent repository and torrentstream repository lifecycle management.
- Multiple playback types such as local file, torrent, debrid, and online stream.
- Player-level events for subtitle, fullscreen, PiP, and playback state coordination.

### Why SeaAnime Feels Powerful
SeaAnime feels powerful because it has:
- A local runtime that owns state instead of only forwarding requests.
- Strong module boundaries for torrent, playback, extensions, and library concerns.
- Explicit route contracts for each media capability.
- A consistent internal data flow from source resolution to playback.

## 2. How SeaAnime Is Built

### Backend Architecture
SeaAnime is built around a Go backend that initializes long-lived modules and repositories. Important observed traits:
- Central app module initialization.
- Long-lived managers and repositories for torrent, torrentstream, playback, direct stream, and extensions.
- SQLite and GORM-backed persistence.
- A large local API surface under `/api/v1/*`.
- Backend-driven playback lifecycle management instead of renderer-only playback logic.

### Frontend and Desktop Architecture
SeaAnime also includes:
- A React frontend.
- Rsbuild and Rspack-based frontend tooling.
- TanStack Router-based app routing.
- Electron desktop packaging.
- A desktop-first product shape.

### Extension Runtime
SeaAnime uses a JS runtime hosted by the backend and can install, reload, update, and manage external extensions. This makes it flexible, but it also raises the bar for sandboxing, permissions, and trust.

### What Tatakai Should Learn From SeaAnime
Tatakai should borrow these ideas from SeaAnime:
- Strong module boundaries.
- Typed source and playback contracts.
- A first-party torrent lifecycle.
- A first-party playback core.
- Extension categories with explicit permissions.
- Clear local runtime ownership for desktop-only heavy features.

### What Tatakai Should Not Copy Directly
Tatakai should not directly copy these parts:
- Go-first implementation choices.
- Unrestricted extension execution on the client.
- Local database/admin duplication for core business and moderation data.
- Desktop-only assumptions that break web or mobile parity.

## 3. What Tatakai Already Has

### Current Strengths
Tatakai already has major building blocks in place:
- React and TSX application architecture.
- Electron desktop packaging.
- Capacitor mobile packaging.
- Central API integration for anime and provider flows.
- Existing provider fanout and fallback logic.
- Existing source merge logic.
- A custom HLS-based player path with subtitles, retries, failover, progress, PiP, screenshots, and offline handling.
- Existing admin, moderation, comments, and forum systems.
- Existing moderated marketplace and custom-source management.
- Existing usage of anime-mapper-style mapping in the provider layer.

### Current Tatakai Features That Must Not Regress
The following current features should be preserved as-is from a user experience perspective:
- Existing watch and source selection flows.
- Existing comments and forum features.
- Existing admin and moderation flows.
- Existing provider breadth and fallback behavior.
- Existing manga/community/profile flows.
- Existing desktop packaging and mobile packaging.
- Existing visual design and navigation patterns.

### Current Gaps Relative to the New Vision
Tatakai still needs these pieces to reach the target architecture:
- Tatakai-owned internal content graph and Tatakai internal IDs.
- Full removal of scraper dependence for browsing surfaces.
- A first-class local runtime contract for desktop.
- A first-party torrent engine layer.
- A first-party player core abstraction instead of a large renderer component owning everything.
- Internalized mapper data instead of external-runtime mapper dependence.
- A security-hardening pass for Electron and app runtime boundaries.
- A formal moderated extension platform instead of ad hoc source injection only.

### Security Concerns Already Visible in the Current Desktop Runtime
The current desktop runtime needs urgent hardening before adding more local power. Important examples include permissive Electron settings such as:
- disabled web security
- disabled sandbox
- insecure content allowances
- enabled `webviewTag`

These settings are incompatible with a "no vulnerabilities" goal if Tatakai also adds local runtimes, torrent flows, or extension execution.

## 4. How `anime-mapper` Should Be Used

### What `dev/anime-mapper` Actually Is
`dev/anime-mapper` is a generator and indexing pipeline, not a frontend runtime package. Its code shows that it:
- pulls data from Anime-Lists and Anime Offline Database sources
- normalizes external IDs into a shared item model
- merges multiple ID sources around a common item
- generates index shards by source ID
- enriches missing metadata IDs

### Why It Matters for Tatakai
This project is useful because Tatakai needs a durable mapping backbone. It should be treated as an upstream data source for Tatakai's catalog and provider mapping system.

### Correct Tatakai Role for `anime-mapper`
Tatakai should use it like this:
- run it in an ingestion pipeline or scheduled job
- import its generated mappings into Tatakai-owned tables
- expose those mappings through Tatakai APIs
- stop relying on a third-party external mapper endpoint in hot user flows

### Wrong Way to Use It
Tatakai should not:
- call a public mapper host as a critical runtime dependency for normal playback
- make the renderer depend directly on the mapper project's internals
- treat its Java codebase as an in-app runtime

## 5. Recommended Target Architecture

### Core Principles
- Preserve current UI and user flows.
- Keep current features running while new capabilities are added behind flags.
- Centralize catalog and admin truth on Tatakai infrastructure.
- Push optional heavy runtime work into desktop-local services only where justified.
- Share contracts across web, desktop, and mobile even when implementations differ.
- Keep source resolution modular so torrents, direct streams, local caches, and future sources all fit the same interfaces.

### High-Level Target Diagram
```text
                         +-------------------------+
                         |  Tatakai Content Graph  |
                         |  AniList-anchored DB    |
                         |  Tatakai internal IDs   |
                         +-----------+-------------+
                                     |
                    +----------------+----------------+
                    |                                 |
         +----------v----------+           +----------v-----------+
         | Central Tatakai API |           | Admin + Moderation   |
         | content/providers   |           | comments/extensions  |
         | fallback authority  |           | provider ops         |
         +----------+----------+           +----------+-----------+
                    |                                 |
    +---------------+----------------+                |
    |                                |                |
+---v----------------+   +-----------v------------+   |
| Web Renderer       |   | Desktop Renderer       |   |
| server-first       |   | same UI as web         |   |
+--------------------+   +-----------+------------+   |
                                          |
                                +---------v---------+
                                | Local Runtime     |
                                | TS workers + IPC  |
                                | scraper fallback  |
                                | torrent core      |
                                +---------+---------+
                                          |
                                +---------v---------+
                                | Tatakai Player    |
                                | same UI, new core |
                                +-------------------+

+--------------------+
| Mobile Renderer    |
| same UI contracts  |
| server-first early |
| native bridge late |
+--------------------+
```

### Platform Positioning
- Web: always server-first; no heavy local runtime.
- Desktop: best place for local scraper fallback, local caching, player-core ownership, and torrent-core ownership.
- Mobile: keep the same UI contract, but phase capability carefully; start server-first and add selective native/runtime bridges later only when safe.

## 6. Core Modules and Key Functions

### 6.1 Tatakai Content Graph
Purpose:
- power home, search, trending, favorites, recommendations, and metadata using Tatakai-owned data instead of scraper-first browsing.

Primary responsibilities:
- ingest AniList and other approved metadata feeds
- assign Tatakai internal IDs
- store title variants, artwork, seasons, relations, episode metadata, and platform mappings
- provide stable lookup APIs for frontend and provider systems

Key functions:
- `ingestAniListCatalog()`
- `upsertContentNode()`
- `assignTatakaiId()`
- `resolveTatakaiIdByAniList()`
- `resolveEpisodeInternalId()`
- `buildTrendingFeed()`
- `buildHomeFeed()`
- `syncFavoritesMetadata()`

Key data entities:
- `content_items`
- `content_titles`
- `content_images`
- `content_relations`
- `episode_items`
- `content_scores`
- `content_availability`

### 6.2 Tatakai Mapper Ingestor
Purpose:
- internalize external-ID mapping and remove public-runtime dependence.

Primary responsibilities:
- import generated `anime-mapper` outputs
- normalize mappings to provider/platform IDs
- attach confidence and provenance
- power provider lookup and search disambiguation

Key functions:
- `importMapperShard()`
- `normalizePlatformIds()`
- `upsertSourceMapping()`
- `resolveProviderMap()`
- `resolveProviderEpisodeMap()`
- `reconcileMappingConflicts()`
- `markMappingConfidence()`

Key data entities:
- `source_mappings`
- `episode_mappings`
- `mapping_conflicts`
- `mapping_import_runs`

### 6.3 Tatakai Provider Orchestrator
Purpose:
- keep the current multi-provider strength, but formalize it as a reusable contract layer.

Primary responsibilities:
- query providers
- score and dedupe results
- enforce cooldowns, retries, and cache usage
- merge direct streams, subtitles, torrent candidates, and custom sources
- use central API first and local runtime second when allowed

Key functions:
- `fetchProviderSources()`
- `mergeStreamingSources()`
- `mergeSubtitleTracks()`
- `scoreSourceCandidate()`
- `resolveProviderContext()`
- `fallbackToLocalRuntime()`
- `fallbackToServerApi()`
- `recordProviderHealth()`

Key design note:
- existing `provider.service.ts` and `streaming.service.ts` already provide a strong base and should be refactored into this module, not replaced.

### 6.4 Tatakai Local Runtime Bridge
Purpose:
- give desktop the benefits of a local runtime without exposing an unsafe open local server by default.

Primary responsibilities:
- run heavy work in Electron main process or worker threads
- expose a narrow preload and IPC bridge to the renderer
- coordinate local scraper fallback, torrent sessions, and cache operations
- keep renderer code simple and UI-stable

Key functions:
- `isLocalRuntimeAvailable()`
- `requestLocalSearch()`
- `requestLocalEpisodeSources()`
- `requestTorrentSessionStart()`
- `requestTorrentSessionStop()`
- `readLocalCacheState()`
- `reportLocalRuntimeHealth()`

Preferred implementation approach:
- Electron preload plus IPC plus worker threads.
- Avoid opening a broad localhost HTTP API unless a very specific subsystem truly requires it.

### 6.5 Tatakai Torrent Core
Purpose:
- own the torrent lifecycle, source ranking, file selection, prebuffering, streaming bridge, and cleanup.

Primary responsibilities:
- search torrent sources
- Also read
- rank and dedupe torrent candidates
- resolve metadata and episode-file matches
- prioritize pieces for playback
- expose stream URLs or byte-range readers to the player layer
- enforce safety controls and cleanup

Key functions:
- `searchTorrentCandidates()`
- `scoreTorrentCandidate()`
- `resolveTorrentEpisodeFiles()`
- `startTorrentSession()`
- `selectPlayableFile()`
- `prioritizePlaybackPieces()`
- `createPlaybackManifest()`
- `stopTorrentSession()`
- `evictTorrentCache()`

Important design rule:
- Tatakai should own the torrent domain model and lifecycle even if low-level BitTorrent primitives are adopted under the hood during early phases.

### 6.5A Release Quality, Naming, and Muxing Standards
Purpose:
- make torrent selection smarter and more consistent by treating release quality as a first-class concern.

Reference mindset:
- use `thewiki.moe` as an external quality reference for release comparison, player expectations, and release-making discipline.
- translate those ideas into Tatakai-owned scoring and metadata rules rather than linking runtime behavior to an external site.

Primary responsibilities:
- parse release names into structured metadata
- detect source quality signals such as resolution, codec, audio, subtitle style, release group, remux or mux hints, and batch markers
- rank releases by user preference and confidence instead of only by seed count
- preserve clean display names while retaining raw release metadata for diagnostics

Key functions:
- `parseReleaseName()`
- `normalizeReleaseMetadata()`
- `scoreReleaseQuality()`
- `scoreMuxQuality()`
- `selectPreferredReleaseVariant()`
- `buildDisplayTitleFromRelease()`
- `detectBatchTorrentLayout()`
- `matchTorrentFileToEpisode()`

Ranking signals to include:
- source quality and completeness
- codec and container compatibility with the player core
- subtitle and audio track availability
- mux or remux quality hints
- release-group trust score
- seed health and swarm stability
- episode naming confidence against Tatakai internal episode metadata

Important design rule:
- torrent selection should prefer the best playable release, not just the first or most-seeded result.

### 6.6 Tatakai Player Core
Purpose:
- separate playback state, source adapters, track handling, and lifecycle events from the current large player component while keeping the exact same visual design.

Primary responsibilities:
- unify direct streams, HLS, offline files, and torrent streams under a shared playback contract
- own subtitle, audio, skip segment, progress, PiP, fullscreen, and recovery behavior
- expose typed events and player state to the UI layer

Key functions:
- `attachPlaybackSource()`
- `switchPlaybackSource()`
- `attachSubtitleTrack()`
- `setPlaybackMode()`
- `setSkipWindows()`
- `syncPlaybackProgress()`
- `capturePlaybackError()`
- `recoverFromPlaybackError()`
- `emitPlaybackEvent()`

Key design rule:
- keep the current player UI shell, but move the state machine into a reusable core.

### 6.7 Tatakai Extension Hub
Purpose:
- support extensibility without the security risks of unrestricted client-side plugins.

Primary responsibilities:
- support moderated source/provider extensions
- version and sign extension manifests
- define permission scopes
- allow admin review, approval, disable, and rollback
- use kill switches for bad extensions

Key functions:
- `validateExtensionManifest()`
- `reviewExtensionSubmission()`
- `approveExtensionVersion()`
- `disableExtension()`
- `resolveExtensionPermissions()`
- `executeExtensionInSandbox()`
- `recordExtensionAuditEvent()`

Important rule:
- do not copy SeaAnime's unrestricted extension execution model into Tatakai.
- Tatakai should prefer sandboxed workers and signed manifests, with moderation and revocation built in.

### 6.8 Tatakai Admin Ops
Purpose:
- keep current admin systems and extend them to manage content, providers, torrents, mappings, and extensions.

Primary responsibilities:
- manage provider health and incidents
- review extension submissions
- review custom-source submissions
- inspect mapper conflicts
- inspect torrent-provider health
- keep comments and forum moderation working

Key functions:
- `reviewProviderIncident()`
- `reviewMappingConflict()`
- `approveMarketplaceItem()`
- `approveCustomSource()`
- `moderateComment()`
- `moderateForumPost()`
- `disableProviderRoute()`
- `publishContentOverride()`

## 7. What Should Be Adopted from SeaAnime vs What Should Stay Tatakai-Native

### Adopt from SeaAnime Conceptually
- module-per-domain architecture
- typed source categories
- explicit torrent lifecycle management
- explicit playback event model
- extension type boundaries
- local-first desktop capability where it makes sense

### Keep Tatakai-Native
- React and TSX UI implementation
- current user-facing design
- current comments, forum, moderation, and marketplace systems
- current Electron plus Capacitor app strategy
- current provider breadth and custom source logic
- current central admin and DB responsibilities

### Do Not Import As-Is
- SeaAnime's Go module stack
- SeaAnime's unrestricted extension execution model
- SeaAnime's desktop-only product assumptions
- SeaAnime's local database ownership for Tatakai's admin/business truth

## 8. No-Regression Guardrails
- Do not replace existing routes before parity is proven.
- Add new behavior behind feature flags.
- Keep existing source and player props stable while new core layers are introduced underneath.
- Make the central API the default authority until local runtime parity is verified.
- Keep comments, forum, and admin features on their current services while content/torrent layers evolve.
- Maintain backward-compatible response shapes during migration.
- Run canary rollouts on desktop before enabling local runtime or torrent features broadly.

## 9. Detailed Phased Plan

### Phase 0: Security, Baseline, and Contract Freeze
Goals:
- make the current app safe enough to evolve
- freeze contracts so new modules can be introduced without UI churn

Work items:
- harden Electron defaults
- remove or justify unsafe `webPreferences`
- review preload boundaries and IPC exposure
- create shared source, torrent, player, mapping, and extension TypeScript contracts
- add baseline telemetry for provider failures, playback failures, and desktop runtime health
- document existing route and component contracts

Key deliverables:
- `TatakaiDomainContracts`
- `TatakaiSecurityBaseline`
- feature-flag framework for local runtime and torrent modules

Must-fix security items before later phases:
- enable `sandbox`
- restore `webSecurity`
- remove `allowRunningInsecureContent`
- remove `webviewTag` unless there is a clearly isolated and audited requirement
- tighten navigation and request allowlists

Exit criteria:
- desktop app passes security review for preload, navigation, and remote content boundaries
- no current features break

### Phase 1: Build the Tatakai Content Graph
Goals:
- stop scraper dependence for home, search, trending, and favorites
- establish Tatakai internal IDs as the system anchor

Work items:
- ingest AniList catalog and metadata into Tatakai-owned tables
- define Tatakai internal IDs and episode internal IDs
- create content APIs for home, search, trending, favorites, seasonal, and detail pages
- attach comments, watch history, favorites, and recommendation features to Tatakai IDs
- add admin override tables for title/poster/availability corrections

Key deliverables:
- `ContentGraphService`
- `ContentFeedService`
- new content endpoints under a stable Tatakai API namespace

Exit criteria:
- home, search, trending, and favorites no longer require scraper lookup
- existing UI consumes new internal content endpoints without design changes

### Phase 2: Internalize Mapper Data and Formalize Provider Contracts
Goals:
- remove hot-path dependence on public mapper endpoints
- make provider resolution deterministic and auditable

Work items:
- add mapper ingestion jobs based on `anime-mapper` outputs
- store provider and episode mappings in Tatakai-owned tables
- refactor current provider resolution to consult internal mappings first
- keep search fallback behavior for unmapped edge cases
- add mapping-confidence scoring and admin conflict resolution

Key deliverables:
- `MapperImportJob`
- `MappingResolverService`
- `ProviderContextResolver`

Exit criteria:
- provider resolution works from Tatakai-owned mapping data for the majority of supported titles
- external mapper outages do not block normal playback flows

### Phase 3: Refactor the Existing Player into Tatakai Player Core
Goals:
- keep the same UI while creating a durable internal playback architecture

Work items:
- split `VideoPlayer.tsx` into a visual shell plus player-core services
- create source adapters for HLS, direct stream, offline file, and future torrent stream
- formalize playback events, playback state, and error recovery flows
- isolate subtitle management, skip windows, progress sync, and proxy failover into reusable modules
- preserve current keyboard controls and user settings behavior

Key deliverables:
- `TatakaiPlayerCore`
- `PlaybackEventBus`
- `SourceAdapterRegistry`

Exit criteria:
- existing watch UI looks the same
- player behavior improves without breaking direct-stream playback
- torrent playback can later plug in as another adapter instead of a separate player UI

### Phase 4: Desktop Local Runtime for Scraper Fallback
Goals:
- reduce dependence on the central server on desktop
- keep server API as fallback authority when local resolution fails

Work items:
- create an Electron-local runtime service using TypeScript worker threads
- expose it through preload plus IPC, not a wide open localhost server by default
- move approved scraper adapters into the local runtime on desktop
- add cache layers for source resolution and mapping lookups
- update renderer hooks to call central API first or local runtime first depending on feature policy and health
- build circuit-breakers so failed local lookups immediately fall back to the server API

Key deliverables:
- `TatakaiLocalRuntime`
- `LocalSourceResolver`
- `LocalRuntimeBridge`

Recommended request strategy:
- content pages: central API only
- episode source resolution on desktop: local runtime first when healthy, then central API fallback, or central-first during the early rollout window
- web and mobile: central API first during this phase

Exit criteria:
- desktop source fallback works without changing the visible UI
- server outages have lower user impact on desktop
- no current provider paths are removed

### Phase 5: Build Tatakai Torrent Core for Desktop Alpha
Goals:
- add first-party torrent search and playback without breaking the current direct-stream experience

Work items:
- implement torrent candidate discovery and ranking
- map torrent candidates to Tatakai content and episode IDs
- build torrent sessions, file selection, prebuffering, and cleanup
- expose torrent playback through the new player core adapter system
- add subtitles and metadata matching for common torrent naming patterns
- add per-session bandwidth, cache, and safety controls
- add desktop-only feature flags and progressive rollout

Key deliverables:
- `TatakaiTorrentCore`
- `TorrentSessionManager`
- `TorrentPlaybackAdapter`
- `TorrentMetadataMatcher`

Important rule:
- direct-stream playback remains the default path until torrent quality and stability are proven.

Exit criteria:
- users can search/select/start/stop torrent playback on desktop
- player UI remains visually unchanged
- direct-stream flows still work exactly as before

### Phase 6: Mobile Convergence Strategy
Goals:
- share the same user-facing product direction on mobile without forcing an unsafe or unstable desktop architecture onto mobile too early

Work items:
- keep mobile on the same content graph and player-core contracts
- keep mobile on central APIs for initial source and torrent metadata resolution
- add stronger local caches for content and playback state
- evaluate a later native bridge for mobile torrent capabilities only after desktop stabilization
- keep the same design, route structure, and player UI behavior where feasible

Recommended mobile policy for now:
- Phase 6A: mobile remains server-first for source playback
- Phase 6B: mobile may consume torrent metadata and hand off to future controlled native modules only if security, battery, and store-policy requirements are satisfied
- Phase 6C: do not ship unstable or battery-heavy torrent background behavior just to claim parity

Exit criteria:
- mobile benefits from the new content graph and player core
- no mobile regression from desktop-focused work

### Phase 7: Moderated Extension Platform and Admin Expansion
Goals:
- evolve existing marketplace and custom-source systems into a formal moderated extension platform

Work items:
- define extension manifest schema and versioning
- define permission scopes for network, parsing, metadata, and playback integration
- build admin review, approval, rollback, and audit tooling on top of existing admin systems
- add extension health and crash reporting
- add provider deactivation and emergency kill-switch controls
- keep comments and forum systems unchanged except for admin workflow improvements where needed

Key deliverables:
- `ExtensionManifestSchema`
- `ExtensionReviewWorkflow`
- `ExtensionAuditLog`
- `ProviderOpsDashboard`

Exit criteria:
- extensions are reviewed, signed, and revocable
- Tatakai can expand source coverage without allowing uncontrolled code execution

### Phase 8: Optimization, Hardening, and Production Rollout
Goals:
- reach a secure, fast, resilient production state

Work items:
- optimize source caching, dedupe, and retry strategies
- move heavy provider and torrent work fully off the renderer thread
- add dependency audit and supply-chain monitoring
- add integration tests for content graph, provider resolution, player adapters, torrent sessions, and admin moderation
- add security testing for Electron, preload IPC, extension sandboxing, and torrent metadata parsing
- run desktop canaries, then staged rollout, then broad release

Key deliverables:
- performance budgets
- security checklist
- rollout and rollback playbooks
- regression test suites

Exit criteria:
- no critical Electron security findings
- no major regressions in current playback or community features
- torrent desktop alpha is stable enough for controlled public use

## 10. Recommended API and Contract Shape

### Central API Domains
Recommended long-term API groups:
- `/api/v3/content/*`
- `/api/v3/mappings/*`
- `/api/v3/providers/*`
- `/api/v3/playback/*`
- `/api/v3/extensions/*`
- `/api/v3/admin/*`

### Desktop Local Runtime Contracts
Expose local runtime capabilities through preload plus IPC contracts such as:
- `runtime.health()`
- `runtime.resolveEpisodeSources()`
- `runtime.searchTorrentCandidates()`
- `runtime.startTorrentSession()`
- `runtime.stopTorrentSession()`
- `runtime.readSessionStats()`

### Shared Renderer Contracts
The renderer should depend on shared TypeScript interfaces, not platform-specific branching everywhere. Suggested shared contracts:
- `ContentItem`
- `EpisodeItem`
- `ProviderMapping`
- `StreamingCandidate`
- `TorrentCandidate`
- `PlaybackSource`
- `PlaybackSessionState`
- `ExtensionManifest`
- `ProviderHealthState`

## 11. Security and Vulnerability Strategy

### Security Principles
- renderer should never directly own sensitive local capabilities
- preload bridge should be narrow, typed, and audited
- local runtime should not expose unnecessary network surfaces
- extension execution must be signed, sandboxed, and revocable
- torrent metadata must be treated as untrusted input
- no direct execution of downloaded files

### Specific Hardening Actions
- tighten Electron settings and navigation rules
- enforce strict origin allowlists for requests and media
- isolate heavy logic in worker threads or controlled processes
- sanitize all external metadata shown in UI
- enforce structured validation on mappings, extension manifests, and torrent metadata
- add audit logs for admin moderation and extension lifecycle changes
- add dependency scanning and regular patch policy

### Torrent-Specific Safety Rules
- never auto-open arbitrary files from a torrent
- explicitly select playable media files only
- block dangerous file extensions from any local handoff path
- cap cache size and session lifetime
- do not seed by default unless there is a deliberate product decision and legal review
- log and monitor torrent-session failures and abuse indicators

## 12. Performance and Optimization Strategy
- move provider orchestration, torrent parsing, and heavy source ranking off the renderer thread
- cache mapping results and provider context aggressively with TTLs
- keep last-known-good source sets for short windows to improve resilience
- prefetch only low-risk metadata, not heavy playback payloads
- use health-based routing to skip broken providers quickly
- measure startup cost before enabling desktop-local runtimes by default

## 13. Primary Code Areas to Extend
Existing code areas that are the correct starting points:
- `src/services/provider.service.ts`
- `src/services/streaming.service.ts`
- `src/components/video/VideoPlayer.tsx`
- `src/lib/api/api-client.ts`
- `desktop/main.cjs`
- existing preload bridge files in desktop
- `src/components/admin/MarketplaceManager.tsx`
- `src/components/admin/CustomSourceManager.tsx`
- `src/hooks/useComments.ts`
- `src/hooks/useForum.ts`
- Tatakai API content/provider routes

New code areas likely needed:
- `src/core/player/*`
- `src/core/providers/*`
- `src/core/torrent/*`
- `src/core/extensions/*`
- `src/core/content/*`
- `desktop/runtime/*`
- `TatakaiAPI/src/content/*`
- `TatakaiAPI/src/mappings/*`
- `TatakaiAPI/src/provider-ops/*`

## 14. Final Recommendation
The right move is to let SeaAnime influence Tatakai's architecture, not Tatakai's identity. SeaAnime proves that a media app becomes powerful when torrent, playback, extensions, and local runtime concerns are treated as first-class modules. Tatakai already has a better base than it might seem: a TSX app, a working provider orchestration layer, a real player, a real desktop and mobile packaging story, and existing admin/community systems.

So the target should be:
- Tatakai UI stays the same.
- Tatakai internal catalog becomes first-class.
- Tatakai mappings become internal and durable.
- Tatakai player becomes modular and first-party.
- Tatakai torrent support becomes desktop-first and Tatakai-owned.
- Tatakai mobile stays stable and converges carefully.
- Tatakai extensions stay moderated and secure.
- Tatakai admin and community features stay intact and become stronger.

That path gives Tatakai SeaAnime-level power without giving up Tatakai's current strengths or introducing unnecessary architectural risk.
'@ | Set-Content -Path 'e:\Code\TatakaiV5\docs\seanime-tatakai-anayls=is.md'