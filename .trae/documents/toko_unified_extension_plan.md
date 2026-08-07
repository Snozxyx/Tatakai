# Toko Unified Extension Plan

## Summary

Build a single marketplace-ready `custom` extension named `Toko` that unifies:

- Direct stream sources
- Anime torrent sources
- Manga chapter/page sources

The implementation will reuse the existing Tatakai extension runtime, the in-repo scraper service in [`extension/A1`](file:///e:/Code/TatakaiV5/extension/A1), and the raw provider scripts in [`extension/A2`](file:///e:/Code/TatakaiV5/extension/A2).  
It will also add desktop + API-backed random-timestamp preview support for anime cards and anime detail pages, and website-first episode/chapter indexing so Tatakai is not limited by AniList/Jikan metadata counts.

## Current State Analysis

1. Extension runtime already exists, but it is incomplete for scraper-heavy bundles.
   - Desktop runtime load/invoke flow already exists in [`desktop/ipc/ipc-runtime.cjs`](file:///e:/Code/TatakaiV5/desktop/ipc/ipc-runtime.cjs), [`desktop/runtime/extension/extension-registry.cjs`](file:///e:/Code/TatakaiV5/desktop/runtime/extension/extension-registry.cjs), and [`desktop/runtime/extension/kai-format.cjs`](file:///e:/Code/TatakaiV5/desktop/runtime/extension/kai-format.cjs).
   - SDK types promise worker globals for fetch, HTML parsing, and release parsing in [`src/core/extensions/sdk/tatakai-sdk.d.ts`](file:///e:/Code/TatakaiV5/src/core/extensions/sdk/tatakai-sdk.d.ts), but the host-side injection implementation is not present yet in the runtime.

2. Playback already routes through extension manifests, but only at the metadata/dispatch level.
   - Frontend source orchestration is in [`src/hooks/media/useCombinedSources.ts`](file:///e:/Code/TatakaiV5/src/hooks/media/useCombinedSources.ts) and [`src/lib/api/api-client.ts`](file:///e:/Code/TatakaiV5/src/lib/api/api-client.ts).
   - TatakaiAPI playback dispatch returns `extensionsToTry` in [`TatakaiAPI/src/routes/playback.ts`](file:///e:/Code/TatakaiV5/TatakaiAPI/src/routes/playback.ts).

3. Manga extension bridging already exists and is the best place to plug Toko manga support into the app.
   - Existing bridge: [`src/core/content/manga-extension-runtime.ts`](file:///e:/Code/TatakaiV5/src/core/content/manga-extension-runtime.ts)
   - Existing manga UI/source handling: [`src/pages/manga/MangaPage.tsx`](file:///e:/Code/TatakaiV5/src/pages/manga/MangaPage.tsx)

4. Hover/detail preview UX exists in the frontend, but actual preview loading is intentionally disabled right now.
   - Disabled preview card logic: [`src/components/anime/AnimeCardWithPreview.tsx`](file:///e:/Code/TatakaiV5/src/components/anime/AnimeCardWithPreview.tsx)
   - Disabled trending preview logic: [`src/components/anime/TrendingGrid.tsx`](file:///e:/Code/TatakaiV5/src/components/anime/TrendingGrid.tsx)
   - Disabled hero background preview: [`src/components/anime/VideoBackground.tsx`](file:///e:/Code/TatakaiV5/src/components/anime/VideoBackground.tsx)
   - Latest episode card preview placeholder: [`src/components/anime/LatestEpisodes.tsx`](file:///e:/Code/TatakaiV5/src/components/anime/LatestEpisodes.tsx)

5. The repo already contains a large amount of provider code to reuse.
   - Server-style providers and proxy helpers live in [`extension/A1/src/providers`](file:///e:/Code/TatakaiV5/extension/A1/src/providers) and [`extension/A1/src/providers/manga`](file:///e:/Code/TatakaiV5/extension/A1/src/providers/manga).
   - Raw provider scripts live in [`extension/A2/scripts/anime`](file:///e:/Code/TatakaiV5/extension/A2/scripts/anime), [`extension/A2/scripts/torrent`](file:///e:/Code/TatakaiV5/extension/A2/scripts/torrent), and [`extension/A2/scripts/manga`](file:///e:/Code/TatakaiV5/extension/A2/scripts/manga).

6. Marketplace/supporting schema already allows a single `custom` extension with rich metadata.
   - Runtime/SDK manifest type: [`src/core/extensions/sdk/types.ts`](file:///e:/Code/TatakaiV5/src/core/extensions/sdk/types.ts)
   - Canonical manifest storage: [`supabase/migrations/20260427000005_v6_extension_manifests.sql`](file:///e:/Code/TatakaiV5/supabase/migrations/20260427000005_v6_extension_manifests.sql)
   - Hub metadata fields such as categories/screenshots/banner already exist via [`supabase/migrations/20260508000001_v6_extension_hub_persistance.sql`](file:///e:/Code/TatakaiV5/supabase/migrations/20260508000001_v6_extension_hub_persistance.sql)

## Assumptions & Decisions

- `Toko` will ship as one marketplace extension of type `custom`.
- `Atsumaru` means the existing `atsu.moe` provider.
- V1 must cover every provider named by the user. Existing provider code will be reused first; providers without a matching implementation in the repo are explicitly part of v1 as net-new work.
- Hover/detail previews must work in both desktop and API-assisted flows. Desktop will use the local runtime fast path first; web will use a TatakaiAPI/A1-backed preview endpoint.
- Preview extraction only uses direct-stream providers, never torrent providers.
- Website-first episode/chapter indexing takes precedence over AniList/Jikan fallback counts whenever Toko can resolve the series.

## Provider Inventory

### Reuse from `A1`

- Direct stream: `animepahe`, `animeya`, `toonstream`, `animelok`, `watchanimeworld` (via `watchaw` / `toonworld`), `desidub`, `hindidubbed`, `aniworld`
- Manga: `allmanga`, `atsu`, `mangafire`, plus mapper-backed `asurascans`
- Shared proxy/fetch infrastructure: [`extension/A1/src/routes/proxy.ts`](file:///e:/Code/TatakaiV5/extension/A1/src/routes/proxy.ts), [`extension/A1/src/lib/fetcher.ts`](file:///e:/Code/TatakaiV5/extension/A1/src/lib/fetcher.ts)

### Reuse from `A2`

- Direct stream: `senshi`, `reanime`, `4anime.gg`
- Torrent: `nyaa`, `acg.rip`, `animetosho`, `subplease`, `seadex`, `nekobt`
- Manga: `animesama`, `asura`, `atsu`, `allmanga`

### Net-New V1 Work

- Direct stream: `anikoto`, `mkissa`, `anizone`, `animesalt`
- Torrent: `acgnx`, `aniliberty`
- Any alias normalization needed so frontend labels match the requested marketplace names exactly

## Proposed Changes

### 1. Complete the extension runtime for scraper bundles

**Files**

- Update [`desktop/runtime/extension/extension-worker-pool.cjs`](file:///e:/Code/TatakaiV5/desktop/runtime/extension/extension-worker-pool.cjs)
- Update [`desktop/ipc/ipc-runtime.cjs`](file:///e:/Code/TatakaiV5/desktop/ipc/ipc-runtime.cjs)
- Update [`desktop/preload.cjs`](file:///e:/Code/TatakaiV5/desktop/preload.cjs)
- Update [`src/types/electron-bridge.d.ts`](file:///e:/Code/TatakaiV5/src/types/electron-bridge.d.ts)
- Add a new helper module under `desktop/runtime/extension/` for worker runtime helpers

**What / Why / How**

- Implement the actual worker helper injection promised by the SDK:
  - domain-allowlisted fetch wrapper
  - HTML parser wrapper
  - release-name parser wrapper
- Expose installed extension listing with manifest metadata/capabilities so the manga bridge can discover Toko reliably.
- Add explicit runtime methods for:
  - preview source resolution
  - website-first episode index lookup
  - website-first manga chapter lookup
- Keep `runtime:resolve-sources` backward compatible, but add Toko-first ordering when the Toko extension is installed and enabled.

### 2. Add the Toko extension source package and bundle build flow

**Files**

- Add `src/core/extensions/toko/manifest.json`
- Add `src/core/extensions/toko/bundle.ts`
- Add `src/core/extensions/toko/providers/anime/*.ts`
- Add `src/core/extensions/toko/providers/torrent/*.ts`
- Add `src/core/extensions/toko/providers/manga/*.ts`
- Add `src/core/extensions/toko/shared/*.ts`
- Add `scripts/build-toko-kai.mjs`

**What / Why / How**

- Create a repo-owned source package for the Toko extension inside `src/core/extensions/` so it stays close to the existing SDK/runtime code.
- `bundle.ts` will export a single extension object that supports:
  - `validate()`
  - `single()`, `batch()`, `movie()` for playback
  - `getLanguages()`
  - `getMangaChapters()`
  - `getMangaPages()`
  - preview/index helper methods invoked through `extension:invoke`
- Provider adapters will normalize A1/A2/new provider outputs into one internal Toko shape.
- The build script will generate `bundle.js` plus a `.kai` package artifact for installation/marketplace upload.

### 3. Reuse A1 as the website scraper service for server-side indexing and preview support

**Files**

- Update [`extension/A1/src/providers/route.ts`](file:///e:/Code/TatakaiV5/extension/A1/src/providers/route.ts)
- Update [`extension/A1/endpoints/endpoints.json`](file:///e:/Code/TatakaiV5/extension/A1/endpoints/endpoints.json)
- Add `extension/A1/src/providers/toko/route.ts`
- Add `extension/A1/src/providers/toko/indexing.ts`
- Add `extension/A1/src/providers/toko/preview.ts`
- Add `extension/A1/src/providers/toko/providers/*.ts`

**What / Why / How**

- Add a server-side `toko` provider namespace inside A1 so Tatakai can ask for:
  - canonical website-first episode lists
  - canonical website-first manga chapter lists
  - preview candidate sources from direct-stream providers
- Reuse existing A1 provider modules where available instead of re-scraping in a second backend layer.
- Port A2 logic into A1-compatible adapters where no A1 server provider exists.
- Implement the net-new direct/torrent providers here when they are needed by web/API flows.

### 4. Make TatakaiAPI aware of Toko preview/index services and marketplace packaging

**Files**

- Update [`TatakaiAPI/src/server.ts`](file:///e:/Code/TatakaiV5/TatakaiAPI/src/server.ts)
- Update [`TatakaiAPI/src/routes/playback.ts`](file:///e:/Code/TatakaiV5/TatakaiAPI/src/routes/playback.ts)
- Add `TatakaiAPI/src/routes/previews.ts`
- Add `TatakaiAPI/src/routes/toko.ts`
- Update [`TatakaiAPI/src/routes/extensions.ts`](file:///e:/Code/TatakaiV5/TatakaiAPI/src/routes/extensions.ts)
- Update [`TatakaiAPI/src/services/extensionRegistry.ts`](file:///e:/Code/TatakaiV5/TatakaiAPI/src/services/extensionRegistry.ts)

**What / Why / How**

- Add API routes for:
  - preview resolution / random timestamp preview metadata
  - website-first episode/chapter index fetches
  - marketplace manifest details for Toko
- Update playback dispatch so `extensionsToTry` can include Toko-first ordering and preview/index hints.
- Ensure the marketplace payload for Toko includes:
  - `type: custom`
  - categories for anime/torrent/manga
  - screenshots/banner/icon
  - permissions covering every upstream domain used by Toko

### 5. Wire website-first indexing into anime and manga data flows

**Files**

- Update [`src/lib/api/api-client.ts`](file:///e:/Code/TatakaiV5/src/lib/api/api-client.ts)
- Update [`src/hooks/api/useAnimeData.ts`](file:///e:/Code/TatakaiV5/src/hooks/api/useAnimeData.ts)
- Update [`src/hooks/media/useCombinedSources.ts`](file:///e:/Code/TatakaiV5/src/hooks/media/useCombinedSources.ts)
- Update [`src/core/content/manga-client.ts`](file:///e:/Code/TatakaiV5/src/core/content/manga-client.ts)
- Update [`src/core/content/manga-extension-runtime.ts`](file:///e:/Code/TatakaiV5/src/core/content/manga-extension-runtime.ts)

**What / Why / How**

- For anime:
  - prefer Toko website indexes for exact episode counts and numbering
  - keep Jikan/AniList only as fallback metadata
- For manga:
  - merge Toko website chapter data before presenting counts/order in the UI
  - preserve existing extension-runtime read flow for chapter pages
- For playback:
  - keep the current runtime-first source resolution model
  - prefer Toko sources before generic marketplace ordering when installed

### 6. Restore and enhance anime hover/detail previews

**Files**

- Update [`src/components/anime/AnimeCardWithPreview.tsx`](file:///e:/Code/TatakaiV5/src/components/anime/AnimeCardWithPreview.tsx)
- Update [`src/components/anime/TrendingGrid.tsx`](file:///e:/Code/TatakaiV5/src/components/anime/TrendingGrid.tsx)
- Update [`src/components/anime/LatestEpisodes.tsx`](file:///e:/Code/TatakaiV5/src/components/anime/LatestEpisodes.tsx)
- Update [`src/components/anime/VideoBackground.tsx`](file:///e:/Code/TatakaiV5/src/components/anime/VideoBackground.tsx)
- Add a small preview client helper under `src/lib/api/`

**What / Why / How**

- Re-enable preview loading using a new two-tier strategy:
  - desktop: resolve preview through local Toko runtime + local proxy
  - web: resolve preview through TatakaiAPI/A1 Toko preview endpoint
- Use a random timestamp from a resolved direct-stream episode source.
- Cache preview metadata client-side to avoid repeated hover fetches.
- Use direct MP4/HLS preview source selection with proper HLS handling and retry/fallback behavior.

### 7. Add manga publisher / scanlator / provider categorization to the UI

**Files**

- Update [`src/pages/manga/MangaPage.tsx`](file:///e:/Code/TatakaiV5/src/pages/manga/MangaPage.tsx)
- Update [`src/types/manga.ts`](file:///e:/Code/TatakaiV5/src/types/manga.ts) if extra source metadata is required

**What / Why / How**

- Expand the chapter source presentation so users can see:
  - publisher metadata from content detail
  - scanlator/source labels from Toko chapter sources
  - grouped provider availability by website/source
- Keep current provider/language preference controls, but make the grouped source information explicit and human-readable.

### 8. Marketplace / extension hub presentation for Toko

**Files**

- Update [`src/hooks/api/useExtensions.ts`](file:///e:/Code/TatakaiV5/src/hooks/api/useExtensions.ts)
- Update [`src/pages/base/ExtensionHubPage.tsx`](file:///e:/Code/TatakaiV5/src/pages/base/ExtensionHubPage.tsx)
- Update [`src/pages/base/ExtensionDetailPage.tsx`](file:///e:/Code/TatakaiV5/src/pages/base/ExtensionDetailPage.tsx)

**What / Why / How**

- Ensure `custom` extensions with multi-domain categories like Toko are displayed clearly in hub/detail views.
- Surface category chips such as `Anime`, `Torrent`, `Manga`, `Preview`, `Website-first Indexing`.
- Make the install/detail view show that Toko is a unified source pack rather than a single-purpose extension.

### 9. Tests and verification coverage

**Files**

- Add/extend tests under `tests/`
- Add/extend API tests under `extension/A1/__tests__/`

**What / Why / How**

- Runtime tests:
  - worker helper injection
  - allowlisted domain fetch behavior
  - extension invocation for custom Toko helper methods
- Toko adapter tests:
  - provider normalization
  - source ordering
  - website-first episode/chapter selection
  - missing-provider fallback
- Preview tests:
  - desktop preview resolution
  - API preview metadata contract
  - frontend preview component fallback/retry handling
- Manga tests:
  - grouped provider/scanlator presentation
  - merged chapter ordering from Toko

## Verification Steps

1. Run static checks:
   - `npm run lint`
   - `npm run type-check`

2. Run test suites relevant to the change:
   - `bun test tests`
   - A1 provider tests covering direct/manga routes

3. Manual desktop verification:
   - sideload/install generated `Toko` `.kai`
   - verify runtime health shows Toko loaded
   - open an anime watch page and confirm Toko sources resolve before fallback providers
   - hover anime cards/trending cards and confirm preview playback starts
   - open an anime detail page and confirm background/info-page preview works
   - open a manga page and confirm grouped source/provider/scanlator metadata appears

4. Manual API/web verification:
   - verify TatakaiAPI preview endpoint returns preview source + timestamp metadata
   - verify website-first episode counts beat AniList/Jikan fallback when Toko resolves a title
   - verify chapter counts/order come from website sources when available

5. Marketplace verification:
   - confirm Toko manifest is visible as a single `custom` marketplace entry
   - confirm categories, screenshots, banner, icon, and description render correctly
   - confirm install flow still uses the `.kai` package path and signature rules
