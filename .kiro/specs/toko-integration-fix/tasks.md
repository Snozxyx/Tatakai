# Implementation Plan: Toko Integration Fix

## Overview

Seven tasks that restore the Toko unified extension end-to-end. The order ensures that
TypeScript is clean before the worker sandbox is updated, the extension can be registered
before filters and UI rely on it, and the three UI tasks are independent of each other.

## Task Dependency Graph

```json
{
  "waves": [
    { "wave": 1, "tasks": [1] },
    { "wave": 2, "tasks": [2, 3] },
    { "wave": 3, "tasks": [4] },
    { "wave": 4, "tasks": [5, 6, 7, 8] }
  ]
}
```

## Tasks

- [x] 1. Fix TypeScript compile errors in `extension/toko/src/index.ts`
  - Replace `.flatMap(r => r.value)` with `.flatMap(r => r.value as T[])` in `runProviders` (Change 2a)
  - Cast the result of `runProviders(MANGA_PROVIDERS, ...)` to `MangaChapterEntry[]` in `getMangaChapters` (Change 2b)
  - Cast the result of `runProviders(STREAM_PROVIDERS, ...)` to `SourceResult[]` in `getPreviewSource` (Change 2c)
  - Add ambient declaration `declare const TATAKAI_API_BASE_URL: string | undefined` after `declare const __tatakai_fetch__`; rename all `TATAKAI_A1_BASE_URL` references to `TATAKAI_API_BASE_URL` in `getWebsiteEpisodeIndex` (Change 2d)
  - Run `pnpm exec tsc --noEmit` inside `extension/toko/` and confirm zero errors
  - **Files:** `extension/toko/src/index.ts`
  - **Validates:** Requirements 2.4.1, 2.4.2, 2.4.3, 2.4.4, 2.4.5

- [x] 2. Inject `TATAKAI_API_BASE_URL` into the extension worker sandbox
  - In `getOrSpawn`, add `tatakaiApiBaseUrl: (process.env.VITE_BACKEND_ORIGIN || 'http://localhost:4001') + '/api/v3'` to the `workerData` object
  - In the `WORKER_BOOTSTRAP` string, after the `const __tatakai_allowedDomains__` line add: `const TATAKAI_API_BASE_URL = workerData.tatakaiApiBaseUrl || undefined;`
  - **Files:** `desktop/runtime/extension/extension-worker-pool.cjs`
  - **Validates:** Requirements 2.5.4, 2.5.5, 2.5.6, 2.5.7

- [x] 3. Implement Jikan-backed `/toko/index/episodes` endpoint in TatakaiAPI
  - Replace the stub body of `GET /api/v3/toko/index/episodes` in `TatakaiAPI/src/routes/toko.ts` with a real implementation:
    - Accept `anilistId` and optional `malId` as query params
    - Resolve `malId` from the AniList mapping via `resolveAnimeMappingByAniListId(anilistId)` when `malId` is not supplied directly
    - Call `jikanClient.getAnimeEpisodes(malId, page)` in a loop fetching all pages (up to 5 pages max = 500 episodes)
    - Return `{ provider: "jikan", episodeCount: N, episodes: [{ number, title?, aired? }] }` when episodes are found
    - Return `{ provider: null, episodeCount: 0, episodes: [] }` when no `malId` can be resolved or Jikan returns no data
  - Add imports: `jikanClient` from `../providers/jikan/client.js` and `resolveAnimeMappingByAniListId` from `../services/mapping/mappingResolver.js` (both already exist in the codebase)
  - **Files:** `TatakaiAPI/src/routes/toko.ts`
  - **Validates:** Requirements 2.5.1, 2.5.2, 2.5.3

- [x] 4. Implement bundled extension auto-load on startup
  - In `ipc-runtime.cjs`, extend the returned object with `autoLoadBundledExtensions(fs, path, logger, app)`: scan every subdirectory of the extension base dir (dev: `path.join(__dirname, '..', 'extension')`, prod: `path.join(process.resourcesPath, 'extension')`); for each subdir where both `dist/bundle.js` and `manifest.json` exist call `registry.register(manifest.id, manifest, bundlePath)`; log a warning and continue if a bundle is missing or manifest is unparseable
  - In `main.cjs`, call `extensionRuntimeApi.autoLoadBundledExtensions(fs, path, logger, app)` immediately after `extensionRuntimeRef.current = extensionRuntimeApi`
  - **Files:** `desktop/ipc/ipc-runtime.cjs`, `desktop/main.cjs`
  - **Validates:** Requirements 2.1.1, 2.1.2, 2.1.3, 2.1.4, 3.1, 3.3

- [x] 5. Fix `listMangaExtensions` capability filter
  - Remove `|| true` from the `.filter()` call inside `listMangaExtensions` so only extensions with `"manga"` or `"chapters"` in their `capabilities` array are returned
  - **Files:** `src/core/content/manga-extension-runtime.ts`
  - **Validates:** Requirement 2.3.2

- [x] 6. Add Watch page language tabs and source-type badges
  - Create `src/lib/languageUtils.ts` exporting `normalizeWatchLanguageKey(raw: string): string` and `formatWatchLanguageLabel(raw: string): string`
  - Create `src/components/watch/SourceTypeBadge.tsx` — stateless chip: "HLS" (`bg-zinc-800 text-zinc-400`) when `isM3U8` or `sourceType === 'hls'`; "Embed" (`var(--accent)` tint) when `isEmbed`; "Torrent" (`bg-green-900/30 text-green-400`) when `sourceType === 'torrent'`; returns `null` otherwise
  - Create `src/components/watch/SourceLanguageTabs.tsx` — derives distinct language tabs from the sources array using `normalizeWatchLanguageKey`; renders an "All" tab plus one tab per distinct language; returns `null` when fewer than 2 distinct language values
  - Wire into the Watch page source list: add `activeSourceLanguage` state (default `'all'`), render `<SourceLanguageTabs>` above the source list, filter visible sources by active language, add `<SourceTypeBadge>` inside each source row
  - **Files:** `src/lib/languageUtils.ts`, `src/components/watch/SourceTypeBadge.tsx`, `src/components/watch/SourceLanguageTabs.tsx`, `src/pages/watch/WatchPage.tsx`
  - **Validates:** Requirements 2.6.1, 2.6.2, 2.6.3, 2.6.4, 2.6.5, 2.6.6, 2.6.7, 3.6

- [ ] 7. Implement manga chapter provider-grouped layout
  - Create `src/components/manga/MangaChapterProviderRows.tsx` — renders a non-clickable header row (chapter number + title) followed by one sub-row per source; sub-row format: `[provider] (Language)` or `[provider] • [scanlator] (Language)` when scanlator is present; best source sub-row highlighted with `ring-1 ring-primary/40 bg-primary/5`; sub-rows with empty `chapterKey` are non-interactive (disabled, cursor-default, reduced opacity); responsive pill layout below the `md` breakpoint; sub-rows hidden when provider or language filter is active and does not match; entire chapter hidden when all sub-rows are filtered out
  - Replace the flat chapter card rendering in `src/pages/manga/MangaPage.tsx` with `<MangaChapterProviderRows>`, passing `bestSource`, `preferredProvider`, `effectivePreferredLanguage`, and `onNavigate`
  - **Files:** `src/components/manga/MangaChapterProviderRows.tsx`, `src/pages/manga/MangaPage.tsx`
  - **Validates:** Requirements 2.7.1, 2.7.2, 2.7.3, 2.7.4, 2.7.5, 2.7.6, 2.7.7, 2.7.8, 2.7.9, 3.7, 3.8

- [x] 8. Enhance `ExtensionDebugWindow` with per-provider breakdown, proxy indicators, timing, bundle status, and Copy Report
  - Add `BundleStatus` state populated from `electron.listInstalledExtensions()` checking for `tatakai.extension.toko`; display a bundle status panel before IPC results showing `loaded` / `not loaded` / `error: <message>` and the absolute bundle path
  - After each IPC call, group sources by `source.source || source.providerKey` to build a per-provider breakdown; each row shows provider key, source count, and status label (`ok` / `empty` / `error` / `skipped`)
  - For each source URL in the expanded view, prepend a proxy-routing indicator: `🔀` if URL starts with `http://localhost` or `tatakai-media://`, `🌐` otherwise; truncate URLs longer than 80 characters with `…`
  - Measure `Date.now()` before and after each `runtime:resolve-sources` call and display the elapsed time as "Total: Nms" in the result row
  - Add a "Copy Report" button that writes to the clipboard a JSON object with keys: `timestamp`, `config`, `ipcResults` (with per-provider breakdown), `apiResults`, `extensionStatus`
  - **Files:** `src/components/extensions/ExtensionDebugWindow.tsx`
  - **Validates:** Requirements 2.8.1, 2.8.2, 2.8.3, 2.8.4, 2.8.5, 2.8.6, 2.8.7, 3.9

## Notes

- Task 1 (TS fixes) must complete before Task 4 (auto-load), since the bundle rebuild needs clean types.
- Tasks 2 (worker inject) and 3 (TatakaiAPI endpoint) are independent of each other and can run in parallel after Task 1.
- Task 4 (auto-load) depends on Tasks 1 and 2 being done so the worker sandbox has `TATAKAI_API_BASE_URL` when workers are spawned.
- Tasks 5–8 are independent of each other and can run in parallel, but all depend on Task 4 so Toko is loaded and testable end-to-end.
- The Watch page file path (`src/pages/watch/WatchPage.tsx`) should be verified against the actual project structure before editing.
