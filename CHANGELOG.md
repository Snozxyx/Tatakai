# Changelog

All notable changes to Tatakai are documented here.

---

## [5.0.1] - 2026-04-18

### Added
- **Producer Deep Links** — Anime producer chips now open `/search/producer/:producerName`, and producer pages use the dedicated producer API instead of generic text search
- **Tierlist Character Linking** — Tierlist character entries now prefer MAL numeric IDs so character pages open with stable `/char/{id}?name=...` links
- **Curated Home System** — Added manual anime/manga homepage curation tools, curated section rendering, and discovery lanes for genre/provider/feed shortcuts
- **API Admin Panel** — Added a dedicated admin surface for API health, canonical snapshot visibility, source validation, and webhook smoke tests
- **Manga Discovery Browse** — Added genre/provider/feed-oriented manga browse routes and quick filters for faster catalog exploration

### Changed
- **Search Behavior** — Search page now hydrates from producer routes, initializes anime mode for producer landing pages, and uses producer-aware pagination/loading state
- **Playback Resilience** — Strengthened stream failover handling, codec recovery, source blocking, and provider refresh behavior
- **Content/Proxy Freshness** — Tightened fresh-fetch behavior across provider, manga, and proxy paths to reduce stale fallback reuse
- **Admin/Analytics Visibility** — Expanded admin dashboards and operational metadata around source health and traffic patterns

### Fixed
- **Empty Producer Result Pages** — `/search/producer/Funimation` and similar producer pages now return populated anime results
- **Character Page Routing** — Character detail routes now handle encoded MAL IDs consistently from tierlists and search results
- **Devtools Guard Routing** — Devtools-blocked pages now bypass the standard shell and restore access only after the guard clears

---

## [5.0.0] - 2026-04-08

### Added
- **V5 Release UX** — Replaced legacy V4 announcement flow with a dedicated V5 banner/release surface
- **V4 Announcement Popup Migration** — Repurposed the legacy V4 popup into a V5 launch popup with direct deep-link to `Settings > Changelog`
- **Mobile Launch Guardrails** — While the launch popup is active on mobile, bottom navigation is hidden and reduce-motion prompt display is delayed by 1 minute
- **Manga V5 Surface** — Added Manga release banner, hero spotlight, trending grid, index showcase, continue-reading rail, and infinite discovery sections
- **Manga Reader Navigation Controls** — Added chapter search/grouping, volume-to-chapter quick filtering, and improved source/language controls
- **Route Architecture Split** — Migrated pages into structured route domains (`base`, `auth`, `watch`, `profile`, `forum`, `admin`, `legal`, `error`) with centralized route composition
- **Provider Aggregation Core** — Added unified multi-provider source pipeline for Animelok, AnimeKai, Animepahe, Animeya, WatchAW, DesiDub, Toonstream, ToonWorld, and Hindi APIs
- **Playback Telemetry Schema** — Added `playback_telemetry` table and indexes for source latency/failure instrumentation
- **Recommendation Feedback Schema** — Added `recommendation_feedback` table for like/dislike/already-seen explainability feedback
- **Watch2Together Controls** — Added reconnect recovery, host transfer, scheduled start countdown controls, and chat export
- **AniList-Assisted Search** — Added optional AniList mapping panel with richer filter metadata for mapping to Tatakai IDs
- **Hybrid Discovery Filters** — Added anime/character result mode, type filter, minimum rating, dub-only filter, and screenshot confidence control
- **Provider Test Coverage** — Added provider fix and source selection tests/fixtures

### Changed
- **ID-first Integrations** — MyAnimeList/AniList imports now use stable `mal_id`/`anilist_id` mapping first, with manual override kept available in import review
- **In-app Release Notes** — Expanded Settings changelog content to reflect the full V5 manga rollout and popup behavior updates
- **Watch Runtime Intelligence** — Improved source health scoring, preflight checks, referer fallback retry, and provider failover behavior
- **Search Mapping Quality** — Expanded AniList search payload fields (`format`, `status`, `genres`, `score`, `popularity`, `country`, `season`) to improve mapping decisions
- **Desktop/Web Source Stack** — Updated watch/provider services and proxy manager to support balanced proxy pool routing and better provider fallback behavior
- **Version Surfaces** — Updated settings/about/changelog surfaces to align with V5 release scope

### Fixed
- **Provider Resolution Regressions** — Improved search-first fallback paths for providers where direct slug mapping fails
- **Import UX Clarity** — Made manual remapping entry points in integration import flow explicit instead of icon-only
- **CORS/Proxy Flow** — Applied CORS and proxy fixes around rapid-service and provider routing paths
- **Mobile Popup Interference** — Prevented mobile nav overlap and motion prompt contention during V5 announcement display

### Security
- **Auth/Headers Hardening** — Tightened security headers and external auth handling while keeping JWT verification behavior compatible with current deployment
- **CI Quality Gate** — Added stronger quality gate checks (lint/type/test) in build workflow

### Notes (V4 → V5)
- **Latest tagged V4 baseline**: `v4.1.20`
- **Post-v4 commits currently on `main` include**:
	- `b17b629` — fix CORS headers and remove dev proxy
	- `800a685` — changed core anime provider stack
	- `3299102` — fixed `vite.config.ts`
- **V5 workspace changes extend beyond those commits** and are now captured in this 5.0.0 entry.

---

## [4.1.20] - 2026-03-03

### Changed
- **Release Sync** — Synchronized release metadata across package versioning, changelog, and desktop splash screen
- **Publish Consistency** — Finalized `v4.1.20` release alignment for repository push and tagging

---

## [4.1.19] - 2026-03-03

### Added
- **API Request Security (Production)** — Added production-only request signature verification path for protected API routes, with replay-window checks and shared-secret key derivation
- **Discord Review Notifications** — Review popup submissions now send webhook notifications through TatakaiAPI proxy (server-side env webhooks only)
- **Webhook Channel Expansion** — Added dedicated `review_popup` webhook channel support on API proxy

### Changed
- **Version Alignment** — App release version updated to `4.1.19` and synced in desktop splash screen
- **Desktop Settings Version Display** — Replaced hardcoded desktop settings version values with runtime app version constant

### Security
- **No Public Webhook URLs** — Review popup webhook uses backend env var mapping only; no Discord webhook URL is exposed in frontend code

---

## [4.1.18] - 2026-02-28

### Added
- **High Quality Covers** — Anime info page fetches full-size cover art via Jikan (MAL) API (`large_image_url`, WebP preferred)
- **Achievement System** — 12 rank-tier achievements: Filler Watcher → Genin → Chunin → Week Warrior → Plus Ultra → Pro Hero → Soul Reaper → Bankai → Survey Corps → Month Legend → Demon Slayer → Hashira
- **Admin Achievement Manager** — Grant and revoke achievements manually per-user with optional notes; shows `auto` vs `admin` badge
- **`fetchJikanCover` utility** — Async helper that queries Jikan API and proxies the highest quality cover

### Fixed
- **Profile Rank** — Manual achievement grants now correctly reflect in rank badge and animated name color
- **Comment Textarea Border** — Fixed purple focus ring (changed from `ring-ring` to `ring-primary/50`)
- **Comments Rank Effects** — Animated rank name styles now render correctly for commenters

### Changed
- **Anime Page Comments** — Now uses the unified `EpisodeComments` component with anime title + episode context pill
- **Card Images** — All anime grid cards upgraded from `cover/medium/` to `cover/large/` on AniList CDN

---

## [4.1.17] - 2026-02-20

### Added
- Stability overhaul and developer ultra mode

---

## [4.1.16] - 2026-02-18

### Fixed
- Stability overhaul and developer ultra mode improvements

---

## [4.1.15] - 2026-02-15

### Fixed
- Electron black screen on launch
- Mobile performance optimizations

---

## [4.1.14] - 2026-02-10

### Fixed
- Main process errors
- Version bump

---

## [4.1.13] - 2026-02-05

### Changed
- Version bump and minor fixes

---

## [4.1.12] - 2026-02-01

### Added
- Download system migrated to database-driven approach
- Admin release manager
- Direct Windows/macOS/Linux artifact links
- Discord banner integration

---

## [4.0.0] - 2026-01-26

### Added
- Social Marketplace: contributor profiles and clickable usernames
- Custom Playback Speed: 0.1x to 10.0x
- Transparency: view pending marketplace items immediately

### Fixed
- Global Scraper Overhaul: fixed 404/500 errors on Desidubanime and Aniworld
- Primary Server Fix: restored HD-1 and HD-2 via optimized direct API access
- Stability: increased fetch timeouts and improved HLS referer handling

---

## [2.0.0] - 2026-01-08

### Added
- Upcoming anime section from Jikan API
- Changelog section in settings
- Fixed Vercel routing for direct URL access
- Enhanced privacy settings for watchlist and history

---

## [1.9.0] - 2026-01-03

### Added
- Playlists feature
- Tier lists with sharing
- Social links to profiles
- Public profile support with privacy controls

---

## [1.8.0] - 2026-01-02

### Added
- Admin dashboard
- Enhanced video player settings
- MyAnimeList and AniList integrations

---

## [1.7.0] - 2025-12-31

### Added
- Initial release with core features
- Multi-theme support
- Watch history tracking
- Watchlist management
