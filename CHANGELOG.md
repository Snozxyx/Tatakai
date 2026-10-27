# Changelog

All notable changes to Tatakai are documented here.

---

## [6.4.2] - 2026-10-27

- Remove duplicate mobile status-bar and header safe-area spacing.
- Recover failed video manifests by reloading the transport, bound loading timeouts, and keep retry and server switching usable after playback errors.
- Offer the Hoko cloud video proxy after eight seconds of stalled loading, with explicit consent before routing a video through the cloud.
- Add a Use cloud proxy by default option in Mobile App Settings. It is off until enabled and can be turned off at any time.
- Keep local files, torrents, debrid streams and watch-party shares on their existing playback paths.

## [6.4.1] - 2026-10-27

- Improve mobile video controls with accessible seeking, clearer buffering feedback, rewind/forward controls and keyboard focus handling.
- Add optional JW Player playback and its settings while retaining the built-in player.
- Improve manga source selection, reader navigation and reader controls.
- Refresh extension browsing, compatibility listings and connected-server status.
- Reduce repeated mobile viewport and motion-preference updates, and improve mobile overlays, back navigation and pull-to-refresh behavior.
- Load interface translations before rendering and improve shared request identifiers across supported runtimes.
- Improve image handling, home shelves, search suggestions and update notifications.
- Retain the 6.4 native packaging fixes, release upload retries and Windows installer improvements.

## [6.4.0] - 2026-10-26

### Profiles and community

- Add customizable profile themes and widget layouts, including SekaiPop, Uchiha, Gothic Empress, Midnight Lofi and Komorebi styles, responsive presentations and server-enforced cosmetic access.
- Add the profile collection registry, public cosmetics and configured theme launch claims.
- Add comment activity to supported community feeds with stable pagination, and improve rich-link embeds.
- Refresh Android TV playback controls, navigation, loading screens, themes and appearance settings.
- Add peer watch-room media sharing, synchronized playback, connection controls and bounded media/upload handling.

### Reading and playback

- Add touch pinch-to-zoom, improve continuous manga reading, preserve selected chapter providers and unify manga/novel reading history.
- Display manga and novel sources progressively, keep later results, coalesce duplicate discovery and cache large hosted chapter lists within a memory budget.
- Load novel home shelves through one cached API response and keep stored catalog fallbacks available during upstream outages. Refresh real trending separately.
- Fix community-server Connect actions on the website, preserve signed streaming URLs and keep mobile-web settings menus within fullscreen playback.
- Improve native extension networking on iOS, Turnstile verification and compatibility-provider request handling.

### Performance and presentation

- Defer settings and optional diagnostics until needed; package the standard profile videos instead of the website-only 4K variant.
- Reduce repeated media requests, improve profile-image caching and packaged-asset handling, and refine responsive media/background behavior.
- Refresh landing-page media, including the novel-reader showcase, and improve navigation and profile settings presentation.

### Security and maintenance

- Merge Tatakai PRs #23–#26 and integrate the compatible API PRs #14–#15, preserving Supabase catalog administration, filtering and ingestion.
- Harden desktop IPC, extension workers, local-service Host/Origin validation, external media/file handling, Android backup exclusions and AniList OAuth state checks.
- Add reviewed database migrations for peer rooms, profile themes/widgets and internal-table RLS hardening. Applying SQL remains a separate deployment step.
- Bound API upstream admission and share request limits through durable control state.
- Update Rust translation dependencies and frontend dependencies; align the Vite plugin and pin offline speech runtimes to their supported versions.
- Add automated changelog generation for configured release integrations.

## [6.3.0] - 2026-10-23

Extension compatibility, translation tools, community features, and playback improvements. Native runtime additions require updated app packages; extension compatibility depends on the platform and source.

### Extensions and community servers

- Correct native stack downloads to retrieve the .kai archive rather than its JSON manifest, and use the app-themed stack confirmation dialog.

- Add compatibility runtimes and repository management for CloudStream, Mihon, Aniyomi, Sora, and Mangayomi sources on supported installed apps. Show runtime preparation, package updates, language tags, source preferences, and authentication where supported. Mangayomi support currently targets JavaScript anime/manga sources; Dart and advanced host APIs remain pending.
- Add provider browsing, search, title details, episodes, chapters, playback, and reading for compatibility sources. Preserve the selected source and its original identifiers when switching between catalog and provider views.
- Add a local extension library with saved titles, per-profile watch/read progress, and continue-watching/reading controls. Support eligible compatibility manga downloads and their offline-library entries.
- Publish moderated community-server listings in the extension portal, with public HTTPS addresses, owner artwork, and a Connect in Tatakai action. Server credentials and pairing codes stay outside published listings.
- Connect community-hosted extension servers through URL/password or pairing links, including remote anime, manga, and novel sources. Show each connected server's name, logo, current health, and running time when supplied by the host.
- Integrate the desktop home server with extension hosting and its setup dashboard while retaining household library sharing.
- Add community extension stacks and language-based catalog filtering. The separate extension portal's stack picker includes supported and limited-compatible entries across ecosystems, paginates the eligible catalog, and preserves selections across searches, with a maximum of 20 extensions per stack.
- Apply the global adult-content preference to extension descriptors, browsing, and stack installation without treating unclassified content as verified safe.
- Repair native Install from File using the desktop file picker and bounded package reads. Improve extension artwork handling, install feedback, failure deadlines, and diagnostics.
- Add a Tatakai Server option on the download page linking directly to its GitHub repository and setup instructions.

### Translation

- Add a shared translation settings panel for community posts, comments, subtitles, and novel chapters, with a target language, per-surface controls, optional automatic translation, and an original-text toggle.
- Support free translation endpoints, configured cloud providers, compatible custom endpoints, and the existing on-device engine. Bound retries and automatic attempts so failed providers do not leave content translating indefinitely.
- Add subtitle translation and optional track pretranslation to desktop and mobile playback, and paragraph translation in the novel reader.
- Add an experimental desktop manga translation workspace with project/page management, image/folder/archive/PDF import, text detection and OCR, editable text and image layers, cleanup tools, font controls, translator credits, backups, and PNG/layered PSD export.
- Add provider selection and optional local-model setup for the translation workspace, including an offline-only mode. Expose downloaded manga chapters to the workspace through reader actions.

### Community

- Add community and discussion-thread following, with database-generated notifications for supported activity.
- Add post previews and locally saved drafts to feed and forum composers, including restoring draft images before publishing.
- Add translated comment rendering and richer supported-link previews. Decode legacy escaped comment text while retaining timestamp links.
- Add notification sound preferences, deduplicate realtime notification presentation, and apply the sound preference to activity and Watch Party messages.
- Hide deleted posts from normal feed results, add general-community language guidance, and refresh community banners and notification layouts.

### Playback and readers

- Add MPEG-DASH playback through the shared player and on-device header proxy, preserving original manifest URLs for relative media requests.
- Add preferred audio-language selection and carry extension, provider, and community-server identity through playback controls and diagnostics.
- Return playable extension results progressively, bound concurrent provider lookups, and add controls to stop lookups or search remaining sources. Avoid letting an unresolved source hide results already returned by other sources.
- Rework custom-source detail, watch, and read pages with provider switching, catalog context, library actions, progress, and clearer failure states.
- Share manga reader controls between catalog and custom sources. Improve fullscreen exit controls, page-size handling, and reading-position restoration when changing reading modes.
- Improve desktop fullscreen transitions when entering from a maximized window. Coalesce concurrent local-proxy startup requests and defer noncritical startup work.

### Discovery, profiles, and TV

- Introduce Tatakai Translate on the landing page, with its desktop editing workflow and model requirements.
- Update the landing page and extension FAQ for the expanded extension ecosystems, platform limits, community stacks, and server connections, with matching English, Spanish, and Japanese copy.
- Use a Read icon on manga and novel continue-reading cards while keeping Play for video.
- Cycle the mobile catalog header from Novel back to Anime, including its long-press shortcut, without opening the landing page.

- Resolve trending entries through current catalog identifiers and omit unresolved legacy entries instead of showing numeric titles and broken placeholder posters. Use the correct monthly view counter.
- Add manga and novel view counters to supported cards and detail pages, with delayed view recording, duplicate suppression, and bounded per-session counting.
- Allow guests to browse public playlists and tier lists while retaining protected editing and private-content checks. Separate query caches by viewer identity.
- Add compatibility-source results to app and TV search, keeping anime and manga provider results in their appropriate categories.
- Improve mobile anime, manga, and novel detail layouts, chapter/episode shortcuts, and hero title artwork.
- Improve TV focus movement, visible-card observation, delayed previews, and memoized rails to reduce unnecessary rendering. Add compatibility extension management to the TV extension page.
- Replace native selects and checkboxes with app-themed controls across settings, admin, extension, discovery, and TV screens.

### Administration and service status

- Add an admin content-catalog manager with poster previews, search, format filters, pagination, entry creation/editing, and reversible archiving that preserves user references.
- Replace browser-only status probes with Better Stack categories, service states, all-time and 30-day uptime, downtime, response times, and recent incidents. Make the public status page responsive and accessible without signing in.
- Use bounded monitoring requests with a second public origin as fallback. Display missing or stale health as unknown and preserve recorded historical downtime.
- Correct database, AniList GraphQL, and operations readiness monitoring. Keep operations controls protected and publish only allowlisted monitoring fields.

### Build and documentation

- Keep compatibility runtime downloads checksum-pinned when upstream rolling releases replace assets, and support unauthenticated local translation providers on systems without an unlocked OS keychain.

- Add desktop compatibility-runtime preparation and packaging, Android compatibility-host integration, native translation-engine builds, and dedicated translation verification workflows. Build the embedded server before Electron packaging and make Rust/process checks blocking in desktop CI.
- Share validated public build configuration across website, desktop, and mobile builds so MAL, AniList, MangaBaka, extension services, and other integrations retain their settings. Exclude provider/admin secrets and reject missing essential OAuth IDs or local callback URLs.
- Update Windows portable packaging and record startup timing for future performance comparisons.
- Reorganize architecture, development, extension, playback, download, and feature documentation. Keep local operator handoffs, credentials, generated runtime caches, and separate service repositories outside release notes and app source packaging.

### Database and release notes

- Include migrations for community/thread subscriptions and notifications, automatic watch-milestone badges, reversible catalog archiving, and manga/novel view counting. Migration deployment remains separate from an application release and requires its own approval.
- These notes describe the 6.3.0 update; publishing the release is a separate step. Community-server metadata requires an updated host; older or serverless hosts may not report continuous running time. Third-party source availability and device-specific behavior still require source/device validation.

---

## [6.2.3] - 2026-10-19

### Fixed
- Resolve playback sources from every installed extension that supports source streaming, so one unavailable provider no longer blocks results from the others.
- Keep quality selection within the chosen provider, preserve subtitle selections across track loading, and keep the page from scrolling behind CSS fullscreen playback.
- Hide the desktop playback cursor after inactivity and include extensions listening on port 8098 in host discovery.

---

## [6.2.2] - 2026-10-19

### Fixed
- Install extensions from the web catalog by opening Tatakai and handing the selected catalog entry to the in-app installer, including Stremio and Seanime manifests.
- Keep extension installs on the verified package download and remote-manifest validation paths.

---

## [6.2.1] - 2026-10-19

### Added
- Connect the desktop and mobile extension store to the standalone extension catalog API and publisher portal.
- Publish independently maintained extensions through the new catalog service.

---

## [6.2.0] - 2026-10-17

### Added
- Dedicated Android TV / Google TV app with remote navigation, TV discovery, profiles, library, downloads, community, and native playback controls.
- Secure TV linking at `https://tatakai.me/link`: expiring QR/PIN codes, companion approval, an independent TV login, and encrypted optional provider, IPTV, and extension transfers.
- Experimental IPTV playlists, channel favorites, and Now/Next guide support.
- Lightweight TV video wallpapers with still-image and reduced-motion fallbacks.
- Separate Android TV APK and flavor-aware updates that preserve the existing mobile application.
- Android TV download option on the website, plus distinct TV download analytics and release management in admin.

### Fixed
- Retain HLS/DASH transport hints through local proxy URLs and TV source changes.
- Preserve remote focus during pagination, profile navigation, and player menus.
- Require verified email for TV approval; pairing state is service-only, rate-limited, expiring, and cleared after acknowledgement.

### Validation
- Automated pairing tests cover authorization, encrypted login, concurrent approvals, expiry, replay, and acknowledgement. Database tests verify role restrictions and lookup limits.
- Physical TV HDR, passthrough, and device-specific launcher behavior still require hardware acceptance.

## [6.1.2] - 2026-10-15

### Added
- English, Spanish and Japanese interface catalogs and account-language request headers.
- On-device community translation controls, improved developer logs and an update changelog sheet.
- Private badge reward notifications and the existing-member OG milestone migration.
- Admin-controlled community image approval enforced by database triggers.
- Server-side visitor, retention and foreground-activity analytics with bounded request deadlines.

### Fixed
- Restore novel catalog fallback date-filter compatibility. Top Rated puts rated novels first; Newest uses full publication dates, with unknown values last and stable pagination.
- Keep novel catalog results separate from manga.
- Play Watch Party tunnel streams directly without waiting for unrelated episode metadata.
- Prevent Linux AppImage crashes when launcher output pipes close.
- Use consistent, privacy-aware watch-time totals in profile previews and full profiles.
- Cache eligible public avatars and banners through Redis, with original-source fallback.
- Correct analytics migration SQL aliases and validate named dollar-quoted PostgreSQL function bodies.
- Improve extension prompts, native downloads and novel chapter loading.

### Database
- The reviewed admin dashboard aggregate migration was installed on Server B separately. Release workflows do not automatically apply migrations.

## [6.1.1] - 2026-10-14

**Patch release.** Safe mobile pull-to-refresh, novel catalogue correctness, and faster search rendering.

### Added
- **Mobile Pull-to-Refresh** — New `MobilePullToRefresh` (`MobilePullToRefresh.tsx` + `pull-refresh-gesture.ts`) mounted in `MainLayout`: phone / native-mobile only, pull-down at scroll top refreshes active queries in place (navigation + local state preserved) with a `Pull to refresh` / `Release to refresh` / `Refreshing…` pill, offline + failure toasts, and a keyboard-accessible Refresh button; disabled on watch, manga/novel readers, auth, setup/onboarding, and integration routes, and never triggers from inputs, dialogs/menus, sliders, video, iframe, canvas, horizontal/upward swipes, or multitouch.

### Fixed
- **Novel Empty Filters** — `novel-client.ts` no longer sends empty `tags`/`statuses` arrays, so unfiltered novel searches return results instead of empty sets; partial upstream failures now surface via `payload.extensions.partial` (`partial: true`, `failedProviders: ['anilist-upstream']`) instead of hardcoded `false` / `[]`.
- **Novel Chapter Sorting** — `NovelGenreBrowsePage` `sortToBackend`: explicit sort wins over feed mode, `chapterCount` now maps to `CHAPTERS_DESC` (was `POPULARITY_DESC`) and `newest` to `START_DATE_DESC`; shared `normalizeCatalogSort` keeps canonical mixed-case options (`chapterCount`, `latestUpdate`) and is case-insensitive, so those URLs no longer fall back to `default`.
- **Stable Trending Pagination** — `preservesCatalogPageOrder` keeps `default` / `trending` pages in provider order (append, no popularity re-sort), so later pages with higher popularity no longer jump ahead; applied to both manga and novel catalogues.
- **Search Rendering** — `SearchPage.tsx` shows ready categories immediately (skeleton only when `hybridLoading && !hasAnyResult`) and filters `novel` / `light_novel` types out of manga results.
- **Sidebar Tooltips** — `NavIcon` no longer sets a native `title` alongside its custom hover label, so the button name appears once instead of twice; the hover label now uses `text-card-foreground` on `bg-card` so it stays readable on the selected (`nav-icon-active`) state.

### Changed
- **Manga Catalogue** — `MangaGenreBrowsePage` reuses the shared `catalog-sort.ts` normalizer + page-order guard for consistent sort-URL handling with novels.

---

## [6.1.0] - 2026-10-14

**Novels, extension ecosystems, and platform reliability.** Adds light/web-novel reading with offline support and narration, Stremio and Seanime integrations, expanded manga providers, playback coordination, download improvements, and stronger authentication handling. Operations tooling is maintained separately in TatakaiOPS.

### Added
- **Novels & Light Novels Vertical** — New `/novel` surfaces: `NovelHomePage`, `NovelPage`, `NovelReaderPage`, `NovelGenreBrowsePage` with hero, trending grid/section, genre slider, smart-discover, quick filters, search filters, extra lanes, infinite sections, recommendation grid, chapter provider rows, download modal, last-read/followed-updates rails, diagnostics, and `NovelReaderPanel` settings; client (`src/core/content/novel-client.ts`), runtime (`novel-extension-runtime.ts`), hooks (`useNovelData`, `useInfiniteNovelSections`, `useFollowedNovelUpdates`, `useNovelRecommendationEngine`, `useNovelReaderSettings`, `useNovelReadlist`), types (`src/types/novel.ts`), offline store/monitor (`novelOffline.ts`, `novel-download-monitor.ts`), and `NovelReadlistTab` sharing the `manga_readlist` table via the `novel` format migration.
- **Multi-Engine Novel Narration (TTS)** — System + on-device KittenTTS (ONNX `onnxruntime-web` WASM worker, `kitten.worker.ts`/`kittenBuffer.ts`/`kittenLocal.ts`, `narrator.ts`/`prosody.ts`) plus OpenAI, ElevenLabs, and OpenAI-compatible local server (`ttsIntegrations.ts`, `TtsIntegrationSettings.tsx`, `ExperimentalKittenSettings.tsx`); desktop `kitten-tts.cjs` + `kitten-tts-daemon.py` service.
- **Paragraph-Level Novel Community** — `ParagraphComments.tsx`, `ReaderSelectionComment.tsx`, `NovelDiscussCard.tsx`, and `src/lib/commentQuotes.ts` for quote/paragraph discussion threads.
- **Manga Provider Expansion & Safety** — Built-in `mangadex-api.ts` (native HTTP in apps, JSON-proxy on web, AniList mapping, chapter cache + `clearMangaDexChapterCache`) and `mangaupdates-api.ts`; reader safety stack (`mangaChapterFilters.ts`, `mangaChapterReliability.ts`, `mangaSourceFormat.ts`, `readlistDisplay.ts`, `readlistMetadata.ts`, `useResolvedMangaReadlist.ts`) with runtime/safety/catalog/direct test scripts and `chapter-cache-reset` coverage.
- **Extension Ecosystems (Stremio + Seanime)** — `src/core/extensions/ecosystems.ts` + `remote/` adapters (`transport`, `stremio`, `stremio-search`, `seanime`, `seanime-browser-compat`, `manga`, `media`, `metadata`, `custom`, `resolve`, `title-match`, `capabilities`, `diagnostics`, `installed`), `setup-ranking.ts`, `store-category.ts`, desktop `seanime-browser-host.cjs` (ChromeDP `newBrowser` with domain allow-list) + `configure-window.cjs` (contained `stremio://` capture), `RemoteExtensionsPanel.tsx`, `SourceDebug.tsx`, `audit-extension-store`/`import-extension-catalogs` scripts, docs (`docs/extension/ecosystems.md`, `docs/reference/features.md`, FAQ `ExtensionSupport`/`SeanimeVsTatakai`).
- **Playback Ownership & Preload** — `PlaybackCoordinator.ts` + `usePlaybackCoordinator.ts` (generation leases, serialized adapter switching, throttled/progress-deduped sinks, native ms→s conversion), `TorrentPreloadController.ts` + desktop `next-episode-preloader.cjs` (off by default, 80% trigger, pack-first, bounded 20 MiB piece window, source-change cancellation), `external-player.ts` handoff, and `docs/guides/playback-library-improvements.md`.
- **Shared Download Scoring** — `candidate-scorer.cjs` + `candidate-evaluator.cjs` (+ `.d.cts`) shared by desktop and web via `@tatakai/*` aliases (vite/tsconfig/electron `files`), `AutomationScheduler.tsx` mounted in `App.tsx`, and `autoDownload.simulate/setProfile` preview without side effects; `network-policy.ts` (Wi-Fi-only default) + `offlineEpisodeId.ts` on mobile.
- **Subtitle Core Extraction** — `subtitle-core.js` (+ `.d.ts`) packaged with Electron and re-exported by `subtitle-utils.ts`; `subtitle-service.ts` upload/sidecar path, concurrent background VTT conversion, and custom/source subtitle listing in Video settings.
- **Debrid Abstraction** — New `cloud-debrid-client.ts` (`DebridProviderAdapter`, `AvailabilityState`, abort-aware) behind `debrid-orchestrator.ts` (shared resolve cache with expiry, deduped pending resolves, base32 → hex magnet hash decode), with AllDebrid/Premiumize surfaces in Settings → Debrid and `Torbox`/`RealDebrid` client hardening.
- **Local Library Tools** — `src/core/library/match-policy.ts` (≥95 confidence + ≥10 gap + no season conflict for auto-match), `src/components/library/` (`OfflineMediaCard`, `AutomationProfiles`), and `mediaMetadataCache.ts`.
- **Native Mobile Media & Torrent Windows** — Android `TatakaiMediaPlugin.java` (network checks + external-player intents) + `TorrentPieceWindow.java` (+ `TorrentPieceWindowTest`), iOS bridge network/handoff intents, and `file_paths.xml`/`Info.plist`/`AndroidManifest.xml` updates.
- **Sideload & Open-Store Distribution** — `public/altstore/apps.json` + `scripts/generate-altstore-source.mjs` (`altstore:generate` npm script, CI-injected IPA size), `/download` + docs (`docs/guides/sideload-and-stores.md`) for AltStore/SideStore/StikStore/TrollStore/Obtainium/Droid-ify/F-Droid/IzzyOnDroid notes.
- **MangaBaka Sync Integration** — OAuth2/OIDC client (`src/lib/mangabaka.ts`, `mapping/mangabaka.ts` enrichment), `MangaBakaRedirectPage.tsx`, origin-aware redirect env (`VITE_MANGABAKA_*`), `Integrations` landing section, and `supabase/migrations/20261012000000_mangabaka_credentials.sql` (service_role-only `mangabaka_credentials`, RLS with no client policies).
- **Trust & Abuse Gating** — `EmailProofBanner.tsx` + `20261013000100_operations_email_proof.sql` (`tatakai_private.email_proof`, `has_verified_email()`/`record_email_proof()`, restrictive write policies + triggers on `public.*`/`storage.objects`); `20261013000200_storage_quota_serialization.sql` (per-owner serialized quota, `FOR UPDATE` counter, `user-media` guard).
- **Diagnostics & Release Transparency** — `src/core/diagnostics/` (`export-diagnostics.ts`, `recent-errors.ts`, `redaction.ts`), `DiagnosticsSettings.tsx`, `ReleaseDetails.tsx` + `normalized-update.ts`/`release-details.ts` (channel + staging metadata, explicit unavailable state), and `DeveloperMode` (`developerMode.ts`, `useDeveloperMode.ts`) gating per-provider diagnostics.
- **SEO, Telemetry & UI Primitives** — `scripts/seo/sitemap-utils.mjs` + XML-only sitemap headers in `vercel.json` (+ XSL route), `src/lib/posthog.ts` + `VITE_POSTHOG_*`/`VITE_OPERATIONS_AUTH_ENABLED` env, `src/components/ui/animated-beam.tsx` + `field.tsx`, new Chikra rank assets and `mobile_mangahome.jpg` brand shot.
- **Regression Coverage** — ~50 new/updated suites: novel (provider, runtime, host, syosetu, new-providers, recovery, auto-mapping, loading-perf, mobile-bundle/http, narrator), manga (chapter filters/merge/reliability/format/display/source, MangaDex/direct, MangaUpdates catalog, followed metadata, Baka metadata), extensions (catalog sync, configuration, download proxy, setup ranking, worker timeout, upstream failures, fixtures incl. pinned Seanime `comix.js`), playback (coordinator, media pipeline, TTS/kitten, download simulation, library match, media-metadata cache), remote/Stremio/Seanime resolution, sitemap serving, API integration safeguards, and mobile offline/custom/episode-id.

### Changed
- **Extension Host Runtime** — `desktop/runtime/extension-api-host/host-server.cjs`: novel `novel/chapters` + `novel/content` routes (flattened rows, 501 without `getNovelChapters/Content`, 404 on empty paragraphs, manga-TTL caching for chapters only), fingerprinted bundle loader (mtime/ctime/size + `browserDomains`/`permissions`, per-PID UUID temp copies, `onReload` cache clear, `browserHost.closeAll()` on invalidate), in-process `__tatakai_fetch__` shim routing novel/manga scrapes through the loopback `/proxy` Cloudflare ladder, legacy loopback wrapper recovery, and relaxed `apiServer` trust check (installed/loaded entries; legacy `sideloaded` no longer vetoes).
- **Automation Engine Slim-Down** — `automation-engine.ts` (`430` → slim) and `automation-matcher.ts` (`184` → thin) now delegate to the shared scorer/evaluator; rule-eligibility-before-scoring, deterministic provider order, stable-ID tie-breaks, and single rule-list + simulation UX per `playback-library-improvements.md`.
- **Subtitle Pipeline** — `subtitle-utils.ts` (`311` → `3` lines) delegates to `subtitle-core.js`; VTT dedupe now includes cue settings + exact text, overlap clamp kept, ASS centisecond/ms handling preserved.
- **Sideload & Store UX** — `SideloadExtensionModal.tsx` (`604` → compact review-before-install flow for `.kai`/URL/Stremio `manifest.json`/`stremio://`/Seanime JSON), `useExtensionStore.ts` expanded (setup ranking, banners-first + install-count ordering, external/unavailable filtering), `ExtensionsPanel.tsx` + `settingsCategories.tsx` (Developer Mode, diagnostics, novel reader entry).
- **Integrations & Auth** — `IntegrationsPanel.tsx` reworked (`684` lines) for MAL/AniList/MangaBaka tri-sync; `mal.ts`/`desktopOAuth.ts`/`externalIntegrations.ts` origin-aware (`<current-origin>/api/mal/redirect`, multi-URI MAL app), `MangaBaka` mapping enrichment, `discordRpc.ts` context, `badges.ts`/`rankUtils.ts` cosmetics, `queryClient.ts` hydration, and `.env.example` MangaBaka + multi-redirect docs.
- **Search & Discovery** — `SearchPage.tsx` (+`188`) universal anime/manga/novel/character search with producer/tag/status/year/score filters and AniList/MangaBaka tag taxonomy; `MangaPage.tsx` reworked, `useUpcomingAnime.ts`/`useMediaBanner.ts`/`useAnimeData.ts`/`useMangaData.ts`/`useFollowedMangaUpdates.ts`/`useMangaReadlist.ts` hardened; `Atlas`/`UpcomingAnimeSection`/`CinematicHero`/`UnifiedMediaCard`/`HeaderSearchSuggestions` refreshed.
- **Library & Downloads Views** — `OfflineLibraryPage.tsx` (`523` → consolidated anime/manga/novel rows), `DownloadPage.tsx` (+profiles/simulate), `MobileOfflineLibrary.tsx`, `SeasonDownloadModal.tsx`/`MangaChapterProviderRows.tsx`/`NovelChapterProviderRows.tsx`/`NovelDownloadModal.tsx` language/scanlator/translator filtering.
- **Player & Reader Chrome** — `VideoPlayer.tsx`/`MobileVideoPlayer.tsx`/`NativeTorrentPlayer.tsx`/`VideoSettingsPanel.tsx`/`ExternalPlayerButton.tsx`/`TorrentSourcePanel.tsx`/`EpisodeComments.tsx` coordinator wiring + subtitle/external-player affordances; `MangaReaderPage.tsx`/`NovelReaderPage.tsx` + `quickPeekStore.ts`/`MediaQuickPeek.tsx` continuity; `Header.tsx`/`Sidebar.tsx`/`MobileNav.tsx`/`DynamicIsland.tsx`/`MainLayout.tsx`/`AppRoutes.tsx` (novel + FAQ + MangaBaka redirect routes, tablet sidebar retained).
- **Desktop / Android / iOS Runtimes** — `ipc-runtime.cjs` (`312` changed), `host-server`/`extension-worker-pool`/`kai-format`/`local-proxy-server`/`share-tunnel`/`torrent/facade`/`session-manager`/`piece-prioritizer`/`file-scanner`/`media-identifier`/`auto-downloader`/`auto-download-sources`/`external-player`/`update-manager`/`preload.cjs`/`main.cjs` updates; Android `MainActivity`/`MediaPayloadValidator`/`MobileDownloadStore`/`Mux`/`LocalProxy`/`Torrent`/`CloudflareBypass` + tests; iOS `Bridge/Downloads/LocalProxy/Mux` plugins.
- **Build / Config / Docs** — `vite.config.ts` (ONNX `.wasm` assets, `worker.format=es`, `@tatakai/*` aliases, `commonjsOptions` for torrent/naming + download scorer, `typescript` chunk split, `web`-mode console stripping), `tsconfig*.json` path aliases, `vercel.json` CSP widened (`mangabaka.org`, `huggingface.co`, localhost/loopback, `blob:`) + sitemap XML headers, `.github/workflows/build.yml` memory/artifact gates, `package.json` deps (`@biwills/kittentts`, `cheerio`, `onnxruntime-web`, `pako`) + `altstore` scripts, `tailwind.config.ts`/`index.css`/`refreshed.css`, and extension docs (`README`, `overview`, `migration`, `manifest-reference`, `renderer-loader`, `security` slim) + `mobile-playback-and-downloads.md`.

### Fixed
- **Manga/Chapter Correctness** — Merge, filter, reliability, format, and readlist-display suites lock wrong-episode/season rejection, mixed-scanlator invalidation, grouped search, and provider-fallback ordering; `chapter-cache-reset` + `clearMangaDexChapterCache` prevent stale chapter reuse.
- **Extension Compatibility** — Catalog-sync, upstream-failure, worker-timeout, download-proxy, Seanime runtime/browser-compat, Stremio search-fallback, remote title-match/resolution/media-proxy, and title-alias auto-mapping suites pin diagnostics-over-guessing (no invented episode IDs, explicit unsupported-API errors).
- **Playback/Downloads** — Coordinator, media-pipeline, download-simulation, mobile-offline-custom/episode-id, and debrid-abstraction tests cover source-switch races, native ms units, simulation side-effect-freedom, bounded preload, subtitle encodings/formats, and provider cache isolation.
- **Novel/TTS** — Narrator, kitten-browser/buffer, and TTS-integration tests cover paragraph fetching, provider recovery, mobile bundle/HTTP paths, and engine error/timeout messaging.
- **Platform/SEO/Ops** — Sitemap-serving (XML-only, no HTML fallback), operations-API (email-proof + quota), `subtitle-engine`/`extension-load-signature` updates, and Android `MediaPayloadValidator`/`CloudflareBypass`/`TorrentPieceWindow` unit tests.

### Security
- Email-proof enforcement at both RLS-policy and trigger layers (`tatakai_private.require_email_proof_for_write()`), so `SECURITY DEFINER` RPCs cannot bypass the write gate; no existing accounts auto-confirmed.
- MangaBaka bearer tokens isolated in `mangabaka_credentials` (RLS enabled, no `authenticated`/`anon` policies, `service_role` only); UI sees only `{ connected, username, avatar }` via sync API.
- Storage quota serialized per owner (`SELECT … FOR UPDATE` on `profiles`, owner/bucket immutability, reconciled counters) to close concurrent-upload over-quota races.
- Diagnostics export redacts credentials/local paths, bounds logs/errors/provider health, and lists collection failures inside the ZIP; nothing auto-uploads.

## [6.0.7] - 2026-10-11

**Reliability & personalization release.** Native mobile downloads move fully on-device with resume and offline playback, desktop downloads survive restarts and skip unaired episodes, profiles gain premium cosmetics, discovery gets follow-up rails and smarter recommendations, and the player, reader, analytics, and SEO all get hardened.

### Added
- **Native Mobile Downloads Engine** — Android (foreground service with progress notification) and iOS (background `URLSession`) now own transfers, disk, and progress via a new `TatakaiDownloads` bridge; includes a queue with progress/retry/cancel, a searchable completed poster grid playing through `native-offline://`, delete-with-confirm, legacy `tatakai/anime/*.mp4` import, and manga per-page checkpoints with auto-resume on relaunch.
- **Mobile HLS Offline Packaging** — Offline HLS keeps init segments, AES-128 keys/IVs, byte ranges, discontinuities, and the selected variant/audio/subtitle tracks, validates every resource before completing, and serves them from the loopback proxy with Range/`416` support.
- **Mobile Streaming Cache & Request Budget** — New temp streaming cache (256 MB total, 32 MB/object, complete-writes only) separate from downloads, plus a shared budget (6 slots on Wi-Fi / 2 on cellular, playback > prefetch > downloads), HLS prefetch (~30 s Wi-Fi / ~10 s cellular), and Data Saver tiers that disable speculation and cap buffers.
- **Native Cloudflare Solver** — Shared native challenge solver for scrape, playback, and downloads with a master toggle and optional FlareSolverr URL in Mobile App Settings, synced at boot on Android and iOS.
- **Cinematic Hero & Refreshed Mobile Layout** — New shared carousel (max 5, 6 s autorotate pausing on interact/focus/hidden/reduced-motion, logo artwork with fallback, 44 px accessible pagination) for anime and manga, plus a `refreshed | classic` mobile appearance with 2:3 portrait posters and stable two-line titles.
- **Media Card Styles** — One shared `MediaCardFrame` (poster/badges/metadata/actions) behind anime, manga, and unified cards, with a global `poster | overlay` style selector, hover video previews on by default for anime, and normalized manga format labels.
- **Premium Profile Cosmetics** — 8 SVG avatar frames, 4 nameplates, 4 edge effects with arrive animation, and a live-preview picker gated by `premium-go/pro/ultra` or admin; server triggers enforce keys, strip revoked entitlements, and reject unknown keys, with avatar gallery paging, 8 MB profile-media uploads, and AA-corrected theme contrast.
- **Motion Preferences** — In-app reduced-motion control synced to `html[data-reduced-motion]`, OS `prefers-reduced-motion` live tracking, tiered CSS (fades kept, scale/slide killed), fade-only route transitions, and 44 px coarse-pointer targets.
- **Smarter Recommendations** — Rating-weighted taste profile with pruning and trend fitting, obscure-title and below-format-average penalties, tiering against your scored mean, MangaBaka tag/group enrichment, franchise dedupe, and richer manga metadata (status, chapters, relations, detailed tags).
- **Follow-Up Rails & Smart Discovery** — New followed-anime episode and followed-manga chapter rails (deep-link to the exact new episode/chapter with `N new` badges), `Best for you / Hidden gem / Trending` manga discover with format/status filters, recent-popular / most-follows / new / latest-update lanes, and a grouped manga tag picker with spoiler/adult markers.
- **Reader Tools & Resume** — Bottom `Reading tools` sheet (jump-to-page slider, zoom + reset, webtoon/page mode preserving page, rAF auto-scroll with speed), fullscreen minimal chrome with auto-hiding exit, double-click zoom, anchored resume via `ResizeObserver`/`MutationObserver`, and `pagehide` progress flush.
- **Desktop Download Resilience** — Crash-safe atomic writes, direct-file resume via `ETag`/`Range`/`If-Range`, per-segment HLS journals that reject live playlists and invalidate on host/path/sequence/key change, redirect-sniffing media resolver, and a `download-recovery.json` journal with auto-resume on by default plus a `Resume interrupted (n)` library button and a Downloads resume switch.
- **Release-Aware Downloads** — Episode picker and auto-downloader hide unaired episodes (AniList airing gate, specials don't block), queue dedup, completion-gated cursor advance, HLS-first source resolution with language filtering, and expired-link retry that re-resolves the same origin/path instead of switching content.
- **Admin Analytics Upgrade** — Page-visit attribution (`utm_*`, referrer host, channel, page title), realtime `tky-online` presence with live grid + 5-minute fallback, SVG world map with proportional bubbles and ranked list, DAU fixed for logged-out guests, and funnel/channel/referrer/session-quality views; trending counts cast to integer and the perf panel tolerates missing `app_version`.
- **Player Polish** — Single-owner desktop fullscreen controller with ancestor `transform/filter` unlocking and exact restore, merged Tatakai + AniSkip segments (source wins per OP/ED family, validated/clamped), mobile outer-thirds double-tap seek, 1–4x pinch zoom with reset chip, lock overlay, safe-area 44 px controls, stall watchdog with shared recovery ladder, parallel subtitles with 8 s abort, and playback metrics.
- **SEO Hardening** — JSON-LD (`TVSeries`/`Book`/`Article`/`ProfilePage`) on share pages and a sitemap branch that never serves HTML (XML-only responses, 8 s upstream timeout, XML validation, 503+XML fallback so crawlers retry instead of indexing an error page).
- **Mobile Showcase & Search Chips** — Landing mobile showcase with device screenshots, applied-filter chips with focus-moving remove/clear, and refreshed search/genre-browse surfaces.

  ### Changed
  - **Season Download Modal** — Released-episodes only, progressive SSE source fill with a shared request cache and dedup, 20 s/45 s start timeouts, server probing via query cache, prefetch cut to the `server` step, and retry that clears caches and invalidates `['servers']`.
  - **Offline Library** — Unified anime/manga offline rows with active cards, history retry, and manga rows fed by the download monitor's progress events.
  - **Mobile Playback Reliability** — One cold-start `502` retry after 1.2 s, playlist pre-warm (`bytes=0-1023`), redirect follower replaying provider headers + Range cross-host, 10-minute source cache with hydration wait and dedup, and quiet-window/cap tuning so slow servers still appear.
  - **Continue Watching/Reading Sync** — Local-first newest-wins merge kept, with clamped page/progress saves and theme-token cleanup in the reader.
  - **Settings Surfaces** — Downloads (auto-resume), card style, mobile appearance, and Cloudflare/FlareSolverr controls added to the relevant Settings panels; version surfaces stay on the single app-version source.

  ### Fixed
  - **Fullscreen Clipping** — Fixed player shifted-right/clipped by transformed/filtered ancestors via lock/unlock with `visualViewport` sync; body overflow restored on exit and Android back exits fullscreen first.
  - **Skip Edge Cases** — Skip times reset on `malId`/episode change, stale AniSkip responses ignored, invalid intervals filtered, and the skip button kept clickable above fullscreen controls with `aria-disabled`.
  - **Download Integrity** — Short reads error instead of completing, mixed-scanlator partials invalidated by `resume-source.json` identity, partial manga sets throw `Downloaded x/y pages. Resume…` instead of marking complete, and cancelled vs failed states split.
  - **Watch Containment** — Main-frame navigation away from the app is blocked while watching; embed pop-under blocking only fires when an embed is active; deep links validate `*.tatakai.me` and close the browser on OAuth handoffs.
  - **Trending Empty State** — `get_trending_anime` / `get_anime_metrics` cast `COUNT(*)` to integer, fixing the `42804 bigint ≠ integer` failure that left `/trending` empty.
  - **Mobile Controls Overlap** — 44 px targets verified at 320/393/480 px, seek slider keyboard-operable with buffered fill, locked taps reveal controls without seeking, and opposite-side/center taps never seek.
  - **Auth & Onboarding** — MAL redirect, AniList redirect, auth, onboarding, and setup pages corrected for the deep-link OAuth bridge and offline states.
  - **Reader Styling** — Reader `transform: none` fix, section rhythm tokens, dialog/peek shadows, and overlay-variant card hover restricted to `hover:hover + fine` pointers.

  ---

## [6.0.6] - 2026-10-06

**Feature & Stability release.** Major mobile media pipeline upgrade with native loopback proxy and in-app APK updater, universal deep links and OAuth bridge, TorBox & Real-Debrid orchestrator hardening, auto-download next episode/chapter, and reader resilience.

### Added
- **Mobile In-App Updater** — Sideloaded Android APK updates can now be checked, downloaded in-app with real-time progress indicators, and handed directly to Android's package installer without opening an external browser.
- **Native Mobile Loopback Proxy** — Android & iOS native local loopback media proxy (`127.0.0.1`) matching desktop's `LocalProxyServer`, enabling full header replay, Range requests, and playlist rewrite for `<video>`, `<img>`, HLS streams, and subtitle fetches.
- **Mobile Quick Peek Sheet** — Thumb-friendly swipe-to-dismiss bottom sheet and long-press quick-peek preview for media cards and posters across mobile views.
- **Auto-Download Next & Storage Manager** — Automatic queuing of the next episode or chapter upon download completion, Wi-Fi only download gating, and automatic eviction of watched offline media.
- **Universal Links & Mobile Deep Linking** — Registered `tatakai://` custom schemes and `https://tatakai.me/*` / `https://app.tatakai.me/*` universal App Links for deep linking directly into episodes, anime details, manga reader, and OAuth handoffs.
- **P2P Torrent Policy & Kill-Switch** — Configurable user toggle in Debrid settings to completely disable P2P swarm traffic while retaining direct cloud debrid streaming.
- **Double-Click Desktop Fullscreen Hint** — Helpful discovery tooltip and disambiguated single-click play/pause vs double-click fullscreen on the desktop video player.
- **HLS to MP4 Remuxing on Mobile** — Integrated Android `dev.ffmpegkit-maintained:ffmpeg-kit-https` (16 KB page-aligned for Android 15+) to remux downloaded HLS streams into standalone MP4 files matching desktop capabilities.

### Changed
- **Debrid Provider Orchestration** — Overhauled Real-Debrid and TorBox clients with robust token verification, multipart request generation, multi-file selection, query caching bypass during polling, and unified `DebridApiError` diagnostics.
- **Desktop & Mobile Download Flows** — Refactored anime and manga download modals into a streamlined step-by-step wizard (Series → Episodes/Chapters → Server/Source selection) with scanlator and language filtering.
- **Discord Webhook Forwarder & Error Logging** — Added smart client context detection (OS, browser, app version, route), 5-minute per-user throttling, 1-hour deduplication, rate limit backoff (429 handling), and isolated warning logs from webhook spam.
- **Continue Reading & Progress Sync** — Local-first optimistic progress persistence merging local device history with Supabase records (newest-wins) ensuring seamless sync even through offline transitions.
- **Vite & Electron Build Memory** — Increased Node memory limit to 6GB (`NODE_OPTIONS=--max-old-space-size=6144`) across production and Electron build pipelines to prevent out-of-memory errors on large bundles.

### Fixed
- **Manga Reader Image Lifecycle & Chapter Identity** — Fixed sticky error states across chapters by keying pages by chapter scope and URL, skipping redundant blob wrapping on native loopback URLs, and ranking provider sources by proven reliability.
- **Embed Pop-under & Navigation Hijacking** — Hardened Android `AntiHijackWebViewClient` and `AdHosts` with embed-active pop-under blocking to prevent untrusted player iframes from hijacking top-level app navigation.
- **Mobile Torrent Swarm Acceleration** — Injected curated default public fallback trackers for trackerless magnet links and infohashes, reduced initial prebuffer threshold to 2MB, and eliminated seek stuttering on already-downloaded byte ranges.
- **Desktop OAuth Redirect Mismatch** — Adopted an HTTPS-to-deep-link state bridge for AniList and MyAnimeList OAuth, allowing desktop authentication without requiring custom scheme registration on provider dashboards.
- **Mobile Bottom Navigation Fullscreen Leak** — Ensured mobile bottom navigation bar immediately unmounts when the mobile video player enters CSS-fallback fullscreen.
- **Haptic Feedback Throttling** — Added a 120ms throttle to rapid semantic haptic events and respected the system `prefers-reduced-motion` accessibility preference.

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
- **Streaming Source Mapping** — Extension providers mapped to Watch-page servers; Animepahe/Anikoto m3u8 and play-page resolution fixes; multilingual dub providers and FlixCloud resolution

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
