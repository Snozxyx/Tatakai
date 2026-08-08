# Comprehensive Plan — Tatakai V6 Full Roadmap
## Seanime Comparison · Codebase Audit · Gap Analysis · Execution Plan

**Date:** 2026-05-08  
**Author:** Antigravity Analysis  
**Scope:** Electron Extension Platform + Torrent Core + All Missing Features from master-plan.md / feature.md

---

## Executive Summary

Tatakai V6 has made significant architectural progress. The extension SDK, extension runtime (IPC handlers, registry, worker pool, sandbox), content graph, country policy, and feature flag systems are **substantially complete**. However, the **torrent core is entirely stub code**, the **Extension Hub UI doesn't exist**, and a large set of features from the master-plan (AI, Watch2Together v2, Auto Downloader, local library, debrid, player core refactor) remain unstarted.

Seanime's strongest advantages over Tatakai: local media library scanning, real torrent streaming, Auto Downloader, debrid integration, and external player support. Tatakai's advantages: community features (comments, forum, marketplace), multi-platform (web+mobile+PWA), cloud auth, Discord Embedded App, and the social layer (Watch2Together, clips, profiles).

---

## Section 1: Seanime vs Tatakai Feature Matrix

### Seanime Features Tatakai Doesn't Have Yet

| Feature | Impact | Implementation Complexity |
|---------|--------|--------------------------|
| Real torrent streaming (no wait for download) | CRITICAL | HIGH — needs WebTorrent or similar |
| Local media library scanner | HIGH | HIGH — file system scan + matching |
| Auto Downloader (watch + auto-queue) | HIGH | MEDIUM |
| Real-Debrid / Torbox / debrid integration | HIGH | MEDIUM |
| External player support (MPV/VLC/MPC-HC) | HIGH | LOW |
| Transcoding & direct play | MEDIUM | HIGH |
| Mobile player intents (deep links) | MEDIUM | LOW |
| Full offline mode (library offline) | HIGH | MEDIUM |
| Anime4K / upscaling sharpening | LOW | MEDIUM (already have player) |
| SSA/ASS subtitle rendering | MEDIUM | MEDIUM |
| Playlist management | MEDIUM | LOW |
| Auto-translation of subtitles | MEDIUM | HIGH (AI) |
| Schedule (missed episodes tracker) | MEDIUM | LOW |

### Tatakai Unique Advantages (Don't Lose These)

- Cloud community (comments, forum, profiles, marketplace)
- Social layer (Watch2Together, clips, sharing)
- Full auth system with roles and moderation
- 25+ themes + Lite Mode
- Discord RPC + Embedded App SDK
- Multi-platform: Web + Desktop + Mobile + PWA
- AniList + Jikan dual source with Content Graph
- Admin system (20+ components)
- Analytics + Sentry + Datadog observability
- Custom sources with moderation

---

## Section 2: Current Codebase Status — What's Done

### ✅ Completed & Production-Ready

**Core Architecture:**
- Content Graph (`src/core/content/`) — AniList + Jikan orchestration
- Extension SDK (`src/core/extensions/sdk/`) — AbstractSource, types, declarations
- Country Policy (`src/core/country-policy/`) — 196-country table + useCountryPolicy hook
- Feature Flags (`src/core/feature-flags/`) — Full flag system
- Analytics (`src/core/analytics/`) — AnalyticsService
- Hooks: organized into `admin/`, `api/`, `auth/`, `community/`, `media/`, `ui/`, `user/`
- Virtualized Grid (`src/components/virtualized/VirtualAnimeGrid.tsx`)

**Desktop Runtime (Fully Implemented):**
- Extension Registry — in-memory registry with kill-switch
- Extension Worker Pool — worker lifecycle, spawn/reuse/terminate
- Extension Sandbox — code wrapper, global injection, blocked globals
- Permission Guard — domain allowlist enforcement
- Payload Guard — 10MB response cap
- Timeout Guard — 30s/2min limits
- WARP Tunnel — Cloudflare DoH + proxy toggle
- Local Proxy Server — proxies HLS streams with headers
- IPC Runtime — ALL extension IPC handlers fully implemented
  - `extension:load` (with Ed25519 signature verification)
  - `extension:unload`
  - `extension:invoke` (timeout + payload guarded)
  - `extension:set-kill-switch`
  - `extension:sideload-manifest`
  - `runtime:health`
  - `cache:read`, `cache:write`
  - `network:toggle-warp`, `network:get-warp-status`

**Bug Fixes (Kiro Tasks 1.1–1.4):** All done.

---

## Section 3: What's NOT Done — Prioritized Gap List

### 🔴 CRITICAL — Blocking Core Features

#### 1. Real Torrent Engine (Tasks 13–17)
All torrent files are stubs (< 2KB each). No actual BitTorrent downloading works.

**Files needing real implementation:**
```
desktop/runtime/torrent/
  core/candidate-discovery.cjs     → Real Nyaa/torrent search (currently empty stub)
  session/session-manager.cjs      → WebTorrent integration (stub, 6KB of placeholder)
  session/piece-prioritizer.cjs    → Sequential piece priority (stub, 0.3KB)
  streaming/stream-bridge.cjs      → HTTP byte-range server (stub, 0.5KB)
  naming/release-parser.cjs        → anitomyscript binding (stub, 1KB)
  naming/quality-scorer.cjs        → Release quality algorithm (stub, 0.8KB)
  naming/batch-detector.cjs        → Batch detection logic (stub, 0.3KB)
  naming/episode-matcher.cjs       → Episode file matching (stub, 0.5KB)
```

**Recommended approach:**
1. Install `webtorrent` in desktop/
2. Rewrite `session-manager.cjs` using WebTorrent API
3. Use WebTorrent's built-in server for byte-range streaming
4. Integrate anitomyscript WASM for filename parsing
5. Implement quality scoring algorithm based on resolution/codec/audio signals
6. Wire `torrent:progress` IPC event channel (missing entirely)

#### 2. Extension Hub UI (Tasks 9–10)
The page `src/pages/base/ExtensionHubPage.tsx` exists but the full UI is not built.

**Missing components:**
- `ExtensionGrid.tsx` — virtualized grid of extension cards
- `ExtensionCard.tsx` — shows name, icon, type badge, version, description, install/uninstall
- `ExtensionDetailPage.tsx` — full detail with screenshots carousel, permissions, version history
- `SideloadPanel.tsx` — file picker + URL input + warning dialog
- `ExtensionFilterBar.tsx` — filter by type, sort by name/popularity/updated
- `useExtensionStore.ts` — Zustand store for extension state management

#### 3. Setup Flow Completion (Task 7)
All 5 steps have UI but IPC wiring is incomplete/partial:
- Step 1: `electron.getDownloadsDir()` may not be fully wired
- Step 3: Country Policy hook integrated but Continue button gating needs removal
- Step 4: WARP toggle IPC call needs error boundary
- Step 5: Feature flag `EXTENSION_SCRAPING` wiring uncertain

---

### 🟠 HIGH PRIORITY — Major Feature Gaps

#### 4. Country Policy Settings Panel (Task 8)
- No standalone `CountryPolicy.tsx` settings component exists
- Only integrated into `DesktopSettings.tsx` in a limited way
- Need: dedicated panel with IP reveal toggle, amber/green badge, VPN suggestion link

#### 5. BlurHash on All AnimeCards (Task 12.2)
- `VirtualAnimeGrid` exists but AnimeCards don't use BlurHash placeholders
- Causes jarring image pop-in on all browse pages

#### 6. Scroll Position Persistence (Task 12.4)
- Navigate away from a browse page → back → scroll resets to top
- Need `sessionStorage`-based scroll position preservation

#### 7. Auto Downloader (from feature.md 2.3)
```
src/core/offline/download-manager.ts → Full implementation needed
```
- Smart download queue with priority, concurrent limit, WiFi-only toggle
- Auto-download next episode setting
- Storage management with cleanup suggestions

#### 8. External Player Support
```
desktop/services/external-player.cjs → Create from scratch
desktop/ipc-library.cjs → Extend with player launch handlers
```
- MPV, VLC, MPC-HC launch with stream URL
- Remember last used player preference

---

### 🟡 MEDIUM PRIORITY — From master-plan.md

#### 9. Player Core Refactor (Phase 3 from plan.md)
```
src/core/player/player-core.ts → Currently 1.7KB stub
```
- Need: `PlaybackEventBus`, `SourceAdapterRegistry`
- Split `VideoPlayer.tsx` into visual shell + player-core services
- Source adapters: HLS, direct stream, offline file, torrent stream

#### 10. Dub-First Tracking (Shiru-inspired)
```
src/core/content/dub-tracker.ts → Create from scratch
```
- Per-series sub/dub episode schedules
- Audio labels on cards ("Dub 12 / Sub 24")
- "Prefer Dubs" setting

#### 11. Per-Series Subtitle Memory (Shiru-inspired)
```
src/core/player/subtitle-memory.ts → Create from scratch
```
- Save preferred subtitle track per source/series
- Auto-select on next episode

#### 12. Chapter-Aware Seekbar (Shiru-inspired)
- OP/ED/recap detection with skip prompts
- Similar to YouTube's chapter markers

#### 13. Watch2Together v2 (WebRTC)
- Upgrade from current polling-based sync to WebRTC data channels
- Sub-second sync latency
- "Ready to watch" lobby with presence
- Auto-pause when someone buffers

#### 14. Real-Debrid / Torbox Integration
```
src/core/providers/realdebrid-client.ts → Create
src/core/providers/torbox-client.ts → Create
src/core/providers/debrid-orchestrator.ts → Create
```

#### 15. Local Media Library Scanner
```
desktop/runtime/library/ → Create entire module
  file-scanner.cjs        → Recursive folder scan, media file detection
  media-identifier.cjs    → Match files to Tatakai IDs via anitomyscript
  library-repository.cjs  → SQLite-backed local library
```

---

### 🟢 LOWER PRIORITY — Future Phases

#### 16. Tatakai Neural (On-Device AI)
- TensorFlow.js / ONNX Runtime Web
- Quantized recommendation model (~2MB)
- Content classification

#### 17. AI Subtitle Translation
- ONNX Runtime Web with opus-mt models (~5MB per language)
- 13 language targets matching dub support

#### 18. Anime Calendar & Airing Schedule
- Full visual calendar (weekly/daily views)
- Notifications via Capacitor Local Notifications

#### 19. Tatakai Wrapped (Spotify-style Stats)
- Period viewing statistics
- Shareable image generation
- Milestone badges

#### 20. Clip & Share System
- In-player clip creation (drag timeline)
- Auto-caption generation
- Share to Discord/Twitter/Reddit

#### 21. Voice Search
- Web Speech API integration
- Animated search UI

#### 22. Technology Upgrades
- React 19 + React Compiler (automatic memoization)
- Tailwind CSS v4 (CSS-based config, 10x faster builds)
- @tanstack/react-router (type-safe routing with loaders)
- Full i18n with react-i18next (13+ languages)
- E2E testing with Playwright
- Web Workers for heavy operations
- IndexedDB abstraction layer
- Bundle analyzer integration

---

## Section 4: Updated Tasks.md — Recommended Task Status

Based on codebase audit, update tasks.md markers as follows:

```
Tasks 1.1–1.4:  [x] DONE
Task 2:         [x] DONE  
Tasks 3.1–3.4:  [x] DONE
Tasks 4.1–4.6:  [x] DONE
Tasks 5.1–5.3:  [x] DONE (extension:load, unload, invoke fully implemented)
Task 5.4:       [-] PARTIAL (runtime:health exists but kill-switch polling on every call needs verification)
Task 5.5:       [x] DONE (preload.cjs updated)
Task 6:         [-] PARTIAL
Tasks 7.1–7.5:  [-] PARTIAL (UI exists, IPC wiring incomplete)
Tasks 8.1–8.2:  [ ] NOT DONE
Tasks 9.1–9.6:  [ ] NOT DONE (ExtensionHub page stub exists but no real components)
Tasks 10.1–10.4:[ ] NOT DONE
Task 11:        [ ] NOT DONE
Task 12.1:      [x] DONE (VirtualAnimeGrid built)
Task 12.2:      [ ] NOT DONE (no BlurHash on AnimeCard)
Task 12.3:      [-] PARTIAL
Task 12.4:      [ ] NOT DONE
Tasks 13.1–13.7:[-] STUB ONLY (directory structure + stub files created, no logic)
Tasks 14.1–14.5:[-] STUB ONLY
Tasks 15.1–15.3:[-] STUB ONLY
Tasks 16.1–16.3:[-] PARTIAL
Tasks 17.1–17.4:[-] WIRED BUT STUBS (IPC registered, delegates to TorrentFacade stubs)
Task 17.5:      [ ] NOT DONE (torrent:progress event channel missing)
Task 17.6:      [-] PARTIAL
Tasks 18.1–18.2:[ ] NOT DONE
Tasks 19.1–19.2:[-] PARTIAL
Tasks 20.1–20.2:[ ] NOT DONE
Task 21:        [ ] NOT DONE
Tasks 22.1–22.5:[ ] NOT DONE
Task 23:        [ ] NOT DONE
```

---

## Section 5: Execution Phases

### Phase A — Finish Kiro Tasks (2-3 weeks)
1. Complete Extension Hub UI (Task 9, 10)
2. Complete Setup Flow IPC wiring (Task 7)
3. Build CountryPolicy settings panel (Task 8)
4. Add BlurHash to AnimeCard (Task 12.2)
5. Implement scroll position persistence (Task 12.4)
6. Verify runtime:health kill-switch polling (Task 5.4)
7. Add torrent:progress event channel (Task 17.5)
8. Wire country policy gating UI (Task 18)
9. Final polish + telemetry (Task 22)

### Phase B — Real Torrent Engine (3-4 weeks)
1. Integrate WebTorrent in Electron main process
2. Rewrite session-manager.cjs with real WebTorrent API
3. Build real stream-bridge.cjs (HTTP byte-range server)
4. Integrate anitomyscript for real filename parsing
5. Build real quality-scorer.cjs algorithm
6. Real candidate discovery (via extension system → Nyaa extension)
7. Real piece prioritization
8. Real cache management with LRU eviction

### Phase C — Seanime Parity Features (4-5 weeks)
1. External player support (MPV/VLC/MPC-HC)
2. Auto Downloader
3. Local Media Library scanner
4. Real-Debrid + Torbox integration
5. Offline mode maturity
6. Mobile player intents / deep links

### Phase D — Player Core + Social (3-4 weeks)
1. Player Core refactor (PlaybackEventBus, SourceAdapters)
2. Chapter-aware seekbar (OP/ED skip)
3. Per-series subtitle memory
4. Dub-first tracking
5. Watch2Together v2 (WebRTC)
6. Miniplayer (drag, resize, auto-hide)
7. Volume boost beyond 100%

### Phase E — AI + Extended Features (4-6 weeks)
1. Anime Calendar with notifications
2. Tatakai Wrapped (stats)
3. Clip & Share system
4. Tatakai Neural (on-device recommendations)
5. AI subtitle translation
6. Cross-device sync handoff
7. Voice search

### Phase F — Tech Modernization (2-3 weeks)
1. React 19 + React Compiler
2. Tailwind CSS v4
3. @tanstack/react-router
4. Full i18n (react-i18next)
5. E2E tests (Playwright)
6. Bundle analyzer + optimization
