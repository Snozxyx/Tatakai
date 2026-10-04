# Changelog

All notable changes to Tatakai are documented here.

---

## [6.0.5] - 2026-10-04

**Patch release.** Every platform finally ships a working build at the same time, and release notes become reachable from inside the app on desktop, mobile, and web.

### Added
- **Changelog in Settings** - Release notes are now reachable from **Settings -> About -> Changelog** on every platform, and from **Settings -> App Settings -> Changelog** on desktop. The mobile app settings gain a "What's new" shortcut in the App updates section, so an installed build can tell the user what changed without leaving the app.

### Changed
- **Unified Versioning** - `package.json`, `package-lock.json`, and the Android manifest (`versionCode` 605 / `versionName` 6.0.5) all advance together, so the shipped desktop app, the APK, and the Settings "Current version" badge all read 6.0.5.

### Fixed
- **Mobile Landing Menu** - The landing page hamburger menu opened onto a black screen. The overlay was a `position: fixed` child of a transformed ancestor (`main` carries `will-change: scroll-position`, which makes it the containing block for `fixed`), so `inset-0` stretched it to the full ~11.5kpx document height and `justify-center` pushed the nav links 5.7kpx below the fold. The overlay now renders through a portal to `document.body` and clips its own content.
- **Mobile Landing Orbs** - With the menu anchored at the body level, the hero's `position: fixed` gradient orbs painted over its first viewport; the overlay now clips them.
- **Inverted Mobile Nav Gates** - Home, custom-source home/info, manga home, novel coming-soon, and Wrapped rendered `<MobileNav />` behind `!isMobile`, which hid the bottom navigation bar from every phone. `MobileNav` already hides itself above `md` and on auth/error routes, so the guard is removed.
- **Android CI** - The `build-android` job compiles with a Java 21 toolchain and installs the `android-36` platform and build tools explicitly, so the APK builds on a clean runner.

---

## [6.0.4] - 2026-10-04

**Feature release.** Ships the mobile and iOS apps, makes the app tablet-aware with the web's floating sidebar, fixes the macOS "damaged" install error, and removes dead weight from the repository.

### Added
- **Mobile (Android) App** — Tatakai can now be downloaded for Android. The build publishes a **signed** APK alongside the desktop installers on GitHub Releases, so it installs straight from the release page, and the download page surfaces a dedicated Android button when the asset exists.
- **iOS App** — An iOS build is now produced by CI as well. It ships unsigned (developer build) and is uploaded as an artifact, because it carries no Apple signing identity.
- **Tablet Layout** — On tablet-sized screens (768px and up) the app now uses the same floating web sidebar instead of the bottom navigation bar, giving a consistent experience from tablet up. Phones keep the bottom nav.
- **Mobile Download Stats** — The admin analytics dashboard now splits download counts into mobile (Android + iOS) and desktop, and the landing page hero shows mobile downloads separately.
- **Repo Cleanup** — Removed the vendored `hentaidb/` fork and other unreferenced scaffolding from the main codebase, including dead scratch scripts, leftover build output directories, and a duplicate lockfile.

### Fixed
- **macOS "App is damaged"** — The macOS desktop build is now ad-hoc signed (`identity: "-"`) in CI, so Gatekeeper no longer reports the download as damaged or from an unverified developer. Verified with a `codesign --verify --deep --strict` CI gate.
- **Profile Banner API (403 / CORS)** — The landscape banner feed no longer calls `api.waifu.im` from the renderer, which the browser blocks with `403` and a CORS error. Those requests are routed through the backend's `/api/proxy/json` passthrough, and the dead call site that only produced console noise was removed.
- **GitHub Mobile Builds** — The release workflow now builds and uploads the Android APK and the iOS archive in addition to the desktop app.

---

## [6.0.3] - 2026-09-29

**Patch release.** Moves every authentication email to an in-app 6-digit code, adds a secure email-change flow, and clears false alarms on the status page.

### Added
- **6-Digit Email Codes** — Signup verification, password reset, and email changes now use a 6-digit code typed directly in the app instead of an email link. Codes never redirect, so they can't be pre-fetched by mail scanners, arrive already "used", or break with the `otp_expired` / "Email link is invalid or has expired" errors that plagued self-hosted deployments.
- **Secure Email Change** — Updating your account email now runs a two-step verification: confirm a code sent to your **current** inbox, then a code sent to the **new** one, before the address switches. The stored email is masked until you choose to reveal and edit it.
- **Branded Auth Emails** — New dark, Tatakai-branded email templates for signup confirmation, password recovery, and email change, each showing the 6-digit code prominently.
- **Cloudflare Streaming Proxy** — Added an edge streaming-proxy worker (`cloudflare-worker/`) exposing `/api/v1/streamingProxy` and `/health` as an additional proxy node.

### Changed
- **Password Reset** — Rebuilt into a single guided flow: enter email → type the 6-digit code → set a new password, all on one page. No more expiring reset links.
- **Desktop System Info** — Settings now surfaces the running app version and Electron version.

### Fixed
- **Status Page — Proxy Node** — The Cloudflare proxy node (`proxy-1 (cf)`) no longer shows falsely offline. Node health is now derived from success/failure counters when the backend omits an explicit status, loopback/localhost nodes are filtered out, and configured edge proxies are probed directly as a fallback.
- **Status Page — Image Delivery** — Hardened the image-delivery health check with a stable probe target and a longer timeout to eliminate transient false-negatives.

---

## [6.0.2] - 2026-09-28

**Patch release.** Fixes a black screen in packaged desktop builds and cleans up the download page.

### Fixed
- **Packaged Desktop Black Screen** — The release build now writes its `.env` from the `DESKTOP_DOTENV` CI secret before the Vite build, so packaged binaries embed the client `VITE_*` values. An empty Supabase anon key was black-screening the shipped app at boot.
- **Visible Config Error Instead of Black Screen** — A missing `VITE_SUPABASE_ANON_KEY` now paints a readable configuration-error screen instead of throwing during boot and leaving a silent black window.

### Changed
- **Download Page** — Prefers the Windows installer over the portable build for the primary download, and removes hardcoded version numbers — all versions now come from GitHub Releases.

---

## [6.0.1] - 2026-09-28

**Patch release.** Restores site-wide authentication and refreshes app branding.

### Fixed
- **Site-Wide Authentication (401)** — Realigned the Supabase `anon` / `service_role` keys with the backend `JWT_SECRET` so REST, RPC, and realtime requests authenticate again. The community feed, profiles, tier lists, playlists, and watch rooms now load for both guests and signed-in users instead of failing with `401 Unauthorized`.

### Changed
- **Favicon** — App favicon now uses the rounded Tatakai logo mark.

---

## [6.0.0] - 2026-09-27

**Tatakai V6 — Major Platform Overhaul & Architecture Redesign.** This is the
largest release since launch. It reworks the extension system, the manga stack,
offline/desktop resilience, community, watch-together, recommendations, and the
admin/moderation surface. Highlights below; see the in-app changelog
(Settings → Changelog) for the user-facing summary.

### Added
- **Extension Ecosystem** — Most advanced features are now delivered as modular extensions. A single extension can contribute:
  - Anime **streaming sources** and **manga** chapter/page sources (Node data plane)
  - **Custom sources** — fully isolated read/watch verticals mounted at `/x/:ns/:sourceId` (`custom-source-v1`)
  - **Themes**, **analytics** sinks, background **services**, and platform **modules**
  - **React pages and UI slots** (renderer code plane, trust-gated)
  - Multiple extensions run simultaneously, resolved by `priority`; ships with the `aurora` reference extension and `.kai` packaging
- **Manga Reader Rebuild** — comick-style reader with per-device display settings and keybinds, progress persistence, and dual comment systems (global + per-chapter)
- **Manga Offline Downloads** — download-all-chapters and offline reading via a single Offline Library page; main-process downloader (preserves source request headers that are dropped across IPC), Dexie v5 `offlineChapters` store, `tatakai-media://` serving, and Dynamic Island manga rows + activity pills
- **In-App Extension-API Manga Host** — reading is HTTP-primary through an in-app extension-API host (`/api/v3/<ns>/manga/{chapters,pages}`), generic across any manga-capable extension, with an IPC fallback; pages routed via `subProviderToNamespace`
- **Continue Watching / Netflix-style Sync** — cross-device resume, downloads, auto-download, list import, richer AnimeInfo, and a release calendar
- **Watch2Together Rebuild** — host-hosted streaming over a Cloudflare tunnel, hashed-password room RPCs, and a redesigned ambient watch room
- **Community Feed Platform** — `/community` rebuilt feed-first with posts, polls, and rich embeds
- **Recommendations Engine** — in-house hybrid recommender plus a SQL collaborative-filtering model, replacing the previous non-reproducible pipeline
- **Ranks & Badges** — unified **Mitsu** rank (weighted score across anime + manga, per-rank `rn-1..16` animated name effects) and collectible **Chikra** badges with rarity tiers; reading contribution uses a chapter-sum proxy
- **Extension Result Cache** — persistent, union-merge SWR cache so revisited anime servers and manga chapters render instantly; fresh-authoritative per provider, no-drop, with a `VITE_ENABLE_EXT_RESULT_CACHE` kill-switch
- **Admin / Moderation / News Overhaul** — rebuilt admin and moderation tooling with automod, Turnstile challenges, a news surface, and broad analytics instrumentation
- **AvatarPickerSheet** — right-side avatar picker

### Changed
- **Desktop Offline Resilience** — additive, graceful offline degradation: `BackendStatusContext` tri-state, `ProtectedRoute` offline whitelist, and an `OfflineBanner`
- **Desktop Memory Footprint** — main-process disk-cache cap and deferred runtime services reduce RAM use
- **Playlists** — visual upgrade; four separate comment systems unified into one polymorphic comments table, with per-item `media_format`
- **Integrations** — AniList/MAL account linking moved to secure server-side OAuth exchange; desktop uses `tatakai://` deep-link OAuth
- **Positioning / Copy** — Tatakai is presented as an extension-based otaku community and companion app (no "watch free / stream online" framing)
- **Code Structure** — largest pages split into presentational + logic modules (AdminPage → `UserManagementTab` + `StatTile`, with more to follow)

### Fixed
- **Manga Source Routing** — page/chapter requests route correctly across extension namespaces; header loss across IPC no longer breaks protected image fetches
- **Streaming Source Mapping** — Toko-family providers mapped to Watch-page servers; Animepahe/Anikoto m3u8 and play-page resolution fixes; multilingual dub providers and FlixCloud resolution

### Security
- **Extension Trust Model** — renderer (code-plane) contributions run with app privileges behind an explicit trust/sideloading gate; data-plane contributions are sandboxed to the Node host
- **Moderation** — Turnstile challenges and automod added to abuse-prone surfaces

### Notes (V5 → V6)
- **V6 landing commit**: `1b9ec88` — *feat: Tatakai V6 — Major Platform Overhaul and Architecture Redesign*
- Extension system documentation lives in [`docs/extension/`](docs/extension/README.md); broader architecture and feature docs are in [`docs/`](docs/README.md)

---

## [5.2.0] - 2026-04-20

### Added
- **Draft Recovery** — Added draft autosave/restore flows for tierlist and playlist editors, including stale-draft cleanup and safer debounce behavior
- **Source Host Priority (Goku/Koro)** — Added stream host ranking to prefer `vod.netmagcdn.com:2228` before `watching.onl` variants for JustAnime/Goku paths
- **Extended Changelog Coverage** — Expanded in-app release coverage for the new startup, proxy, and playback reliability work

### Changed
- **Homepage Startup Orchestration** — Deferred non-critical homepage sections and startup listeners to improve first meaningful paint
- **Auth/Session Bootstrap** — Added fail-fast timeouts and deferred heartbeat/page-tracking startup to reduce initial request bursts
- **Search Throughput** — Delayed secondary result streams (manga/character) when needed and tightened query enablement logic
- **Proxy Balancer Reliability** — Added retry/backoff tuning, no-repeat proxy attempts per cycle, and in-flight deduplication for API proxy requests
- **Subtitle Loading** — Normalized subtitle payloads to VTT and improved fallback candidate fetching in both desktop and mobile players
- **Preview Video Stability** — Hardened anime card and trending hover previews with better ID fallback, source selection, and retry behavior

### Fixed
- **Anime Card Preview Playback** — Fixed non-HLS preview sources not attaching to the video element
- **Trending Preview Failures** — Removed strict fast-mode fallback failures that blocked preview loading
- **Watch Source Ordering** — Prioritized NetMag CDN host selection for JustAnime/Goku in watch-time source resolution
- **Moko Proxy Residual Paths** — Removed legacy Moko references from active proxy candidate paths and status assumptions

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
