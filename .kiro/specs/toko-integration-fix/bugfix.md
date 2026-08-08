# Bugfix Requirements Document

## Introduction

The Toko unified extension (`extension/toko/`) is the official all-in-one Tatakai extension
covering anime streaming, torrent discovery, and manga reading across 28+ providers. Despite
being built, the extension does not work in the app: the Watch page shows no Toko sources
(HLS, embed, or torrent) and the Manga page shows no Toko chapters.

Beyond the core fix, this spec also covers required UX improvements that are only useful once
the integration is working: language-grouped source display on the Watch page, provider-grouped
chapter display on the Manga page, and an enhanced debug window.

Root causes identified from code inspection:

1. **No startup extension scan** — `ExtensionRegistry` is purely in-memory and resets on
   every app launch. No startup code walks the `extension/` directory and registers bundled
   extensions. This affects Toko and any other extension that ships as part of the repository
   (under `extension/<name>/dist/bundle.js`). The registry is therefore empty on cold start,
   so `runtime:resolve-sources` and `extension:invoke` both silently return nothing.

2. **TypeScript compile errors in `index.ts`** — `runProviders` returns `unknown[]` instead of
   `T[]` because `Promise.allSettled` loses the generic type through the `flatMap`; the
   `getMangaChapters` loop uses `ch` as `unknown`; `getPreviewSource` treats the result as `{}`.
   These errors prevent a clean build, meaning the distributed bundle may be stale or broken.

3. **`TATAKAI_A1_BASE_URL` must be replaced with `TATAKAI_API_BASE_URL`** —
   `getWebsiteEpisodeIndex` currently delegates to the A1 server via `TATAKAI_A1_BASE_URL`.
   A1 is being removed; TatakaiAPI already exposes an equivalent stub at
   `GET /api/v3/toko/index/episodes`. The fix renames the constant to `TATAKAI_API_BASE_URL`,
   updates `getWebsiteEpisodeIndex` to call TatakaiAPI instead, and injects the URL into the
   worker sandbox via `workerData` in `extension-worker-pool.cjs`.

4. **`listMangaExtensions` always returns all extensions** — the filter in
   `manga-extension-runtime.ts` short-circuits with `|| true`, meaning the capability check is
   bypassed entirely. This is harmless today but masks the real issue: the extension is not
   loaded at all.

5. **Watch page has no language grouping or source-type color coding** — sources from Toko
   providers carry language and type metadata but the UI does not surface them.

6. **Manga chapter page does not display the provider-grouped format** — chapters are shown as
   flat lists without per-provider language labels.

7. **Debug window is minimal** — the existing `ExtensionDebugWindow` tests three IPC methods
   and three API endpoints but does not show per-provider query status, proxy routing, worker
   logs, or timing granularity needed for diagnosing integration failures.

---

## Glossary

- **Toko**: The unified extension at `extension/toko/` with id `tatakai.extension.toko`.
- **Bundle**: The compiled output at `extension/toko/dist/bundle.js`.
- **userData extensions dir**: `<Electron app.getPath('userData')>/extensions/tatakai.extension.toko/`.
- **Sideload path**: Loading an extension via `extension:sideload-manifest` IPC, which skips signature verification.
- **Bundled extension**: Any extension that ships as part of the repository at
  `extension/<name>/dist/bundle.js` alongside `extension/<name>/manifest.json`. Toko is
  currently the only bundled extension. Bundled extensions are auto-loaded at startup by
  scanning the `extension/` directory; they do NOT require a userData copy.
- **`TATAKAI_API_BASE_URL`**: The TatakaiAPI base URL injected into the worker sandbox as a
  `workerData` field. Resolves to `http://localhost:4001/api/v3` in dev and
  `https://api.tatakai.me/api/v3` in prod (same env var `VITE_BACKEND_ORIGIN` used by
  `ipc-runtime.cjs`). Toko's `getWebsiteEpisodeIndex` uses this to call
  `GET /api/v3/toko/index/episodes`, which is already implemented as a stub on TatakaiAPI.
- **SourceResult**: The internal type `{ url, quality, headers, source, sourceType, language?, audioLanguage? }` returned by Toko providers.
- **MangaChapterEntry**: `{ number, title, volume, sources: [{ provider, chapterKey, language, scanlator }] }`.
- **Source type**: Classified as `"hls"` (`.m3u8` URL or `sourceType: "hls"`), `"embed"` (`isEmbed: true`), or `"torrent"` (`sourceType: "torrent"`).
- **Language group**: A human-readable label derived from `SourceResult.language` or `SourceResult.audioLanguage` (e.g. "English Sub", "Japanese", "Hindi").

---

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN the app starts THEN the system does NOT load any bundled extension into the extension
registry because no startup code scans the `extension/` directory and calls
`registry.register` for extensions that have a built `dist/bundle.js`. The registry is
therefore empty on cold start, so all extension-dependent IPC calls silently return nothing.

1.2 WHEN `runtime:resolve-sources` is called THEN the system returns an empty sources array
because `tatakai.extension.toko` is not present in the extension registry.

1.3 WHEN `extension:invoke` is called with method `getMangaChapters` THEN the system returns
`{ success: false, error: "toko_not_loaded" }` because the extension was never registered.

1.4 WHEN the TypeScript compiler processes `extension/toko/src/index.ts` THEN the system
reports at least 14 type errors (`unknown[]` not assignable to `SourceResult[]`, `ch` is of
type `unknown`, `TATAKAI_A1_BASE_URL` not declared, etc.) preventing a clean build.

1.5 WHEN a worker executes `getWebsiteEpisodeIndex` THEN the system references
`TATAKAI_A1_BASE_URL` which points to the A1 server that is being removed. This constant
is never injected into the worker sandbox, so the `typeof` guard silently skips the
delegation branch and falls back to the slow provider scraping path, returning incomplete
episode index data.

1.6 WHEN the Watch page renders sources from Toko THEN the system displays all sources in a
flat undifferentiated list with no language grouping and no visual distinction between HLS,
embed, and torrent source types.

1.7 WHEN the Manga chapter page renders chapters that have multiple provider sources THEN the
system does not display each provider as a separate labelled row under its chapter number,
and does not show a language label next to each provider.

1.8 WHEN a developer opens the Extension Debug Window THEN the system only shows three
aggregate IPC method results (single, batch, getMangaChapters) with no per-provider breakdown,
no proxy routing information, no worker log output, and no per-provider timing or error detail.

---

### Expected Behavior (Correct)

#### Requirement 2.1 — Bundled Extension Auto-Load on App Startup

**User Story:** As the Tatakai desktop app, I want all bundled extensions (those shipping
with the app under `extension/<name>/dist/bundle.js`) to be automatically registered on
startup, so that streams and manga chapters are available without manual installation.

**Acceptance Criteria:**

2.1.1 WHEN the Electron main process initialises THEN the system SHALL scan every
subdirectory of `<app resources>/extension/` (dev: `<repo root>/extension/`) and for each
subdirectory where both `dist/bundle.js` and `manifest.json` exist SHALL call
`registry.register(manifest.id, manifest, bundlePath)` such that a subsequent
`registry.lookup(manifest.id)` returns an object with `bundlePath` pointing to a readable file.

2.1.2 WHEN a subdirectory under `extension/` does NOT contain a valid `dist/bundle.js` OR
does not contain a parseable `manifest.json` THEN the system SHALL log a warning for that
entry AND SHALL continue scanning remaining subdirectories without throwing an exception.

2.1.3 WHEN the auto-load scan runs THEN it SHALL complete before the `runtime:health` IPC
handler is first callable, so that an immediate `runtime:health` call from the renderer
includes all auto-loaded extension IDs in its `loadedExtensions` array.

2.1.4 WHEN Toko (`tatakai.extension.toko`) is successfully auto-loaded THEN a subsequent
call to `registry.lookup("tatakai.extension.toko")` SHALL return an entry whose `bundlePath`
resolves to the built `extension/toko/dist/bundle.js`.

---

#### Requirement 2.2 — Streams Appear on the Watch Page

**User Story:** As a Tatakai user, I want Toko stream and torrent sources to appear on the
Watch page so that I can actually watch anime.

**Acceptance Criteria:**

2.2.1 WHEN `runtime:resolve-sources` is called with `{ anilistId, titles, episode, method: "single" }`
AND Toko is registered in the extension registry AND at least one stream provider resolves a
source THEN the system SHALL return `{ success: true, sources: [...] }` where `sources` contains
at least one item with a non-empty `url` field and `providerKey === "tatakai.extension.toko"`.

2.2.2 WHEN `runtime:resolve-sources` is called and Toko's `single()` call returns an empty
array (all providers timed out or returned nothing) THEN the system SHALL still return
`{ success: true, sources: [] }` rather than an error, and SHALL fall through to the central
API dispatch path.

---

#### Requirement 2.3 — Manga Chapters Appear on the Manga Page

**User Story:** As a Tatakai manga reader, I want Toko manga chapters to appear in the chapter
list so that I can read manga.

**Acceptance Criteria:**

2.3.1 WHEN `extension:invoke` is called with `{ extensionId: "tatakai.extension.toko", method: "getMangaChapters", args: [{ anilistId, malId, title }] }`
AND Toko is registered THEN the system SHALL return `{ success: true, data: [...] }` where
`data` is an array of objects each containing at minimum: `number` (positive finite number),
`title` (string or null), and `sources` (non-empty array).

2.3.2 WHEN `window.electron.listInstalledExtensions()` is called in the renderer AND Toko is
registered AND `manifest.capabilities` contains the string `"manga"` THEN `fetchExtensionMangaChapters`
SHALL include `"tatakai.extension.toko"` in the list of extensions it queries (the
`|| true` short-circuit in `listMangaExtensions` SHALL be removed).

---

#### Requirement 2.4 — TypeScript Compile Errors Fixed in index.ts

**User Story:** As a developer, I want `extension/toko/src/index.ts` to compile cleanly so
the bundle is always valid and up to date.

**Acceptance Criteria:**

2.4.1 WHEN `tsc --noEmit` is run against `extension/toko/` THEN the compiler SHALL report
zero errors.

2.4.2 WHEN `runProviders<T>()` is called AND `Promise.allSettled()` returns fulfilled entries
THEN the `flatMap` step SHALL produce a value whose static type is `T[]` — specifically, the
expression `.flatMap(r => r.value)` SHALL be replaced with `.flatMap(r => r.value as T[])`.

2.4.3 WHEN `getMangaChapters` iterates over the merged `all` array THEN each loop variable
`ch` SHALL be statically typed as `MangaChapterEntry` — specifically, the loop SHALL cast
`const all = await runProviders(...) as MangaChapterEntry[]` before iteration.

2.4.4 WHEN `getPreviewSource` filters the results array and accesses `first.source` and
`first.url` THEN both accesses SHALL resolve without type error — specifically, the results
SHALL be cast as `SourceResult[]` after the `runProviders` call.

2.4.5 WHEN `getWebsiteEpisodeIndex` references the TatakaiAPI base URL THEN the compiler SHALL
resolve it without error — specifically, all `TATAKAI_A1_BASE_URL` references SHALL be
renamed to `TATAKAI_API_BASE_URL` and a `declare const TATAKAI_API_BASE_URL: string | undefined`
ambient declaration SHALL be added in the worker-sandbox globals block immediately after the
existing `declare const __tatakai_fetch__` declaration.

---

#### Requirement 2.5 — Replace A1 delegation with Jikan-backed TatakaiAPI in `getWebsiteEpisodeIndex`

**User Story:** As the extension runtime, I want `getWebsiteEpisodeIndex` to return real episode metadata (count + per-episode titles and air dates) from TatakaiAPI using the existing Jikan client, instead of always returning zero.

**Acceptance Criteria:**

2.5.1 WHEN `TatakaiAPI` receives `GET /api/v3/toko/index/episodes?anilistId=<id>` THEN the
system SHALL resolve the MAL ID from `anilistId` using the existing mapping service
(`resolveAnimeMappingByAniListId`), call `jikanClient.getAnimeEpisodes(malId)` for all pages,
and return `{ provider: "jikan", episodeCount: N, episodes: [{ number, title, aired }] }`.

2.5.2 WHEN the mapping lookup fails OR returns no `malId` THEN the system SHALL fall back to
`jikanClient.getAnimeFull(malId)` if a `malId` query param was supplied directly, OR return
`{ provider: null, episodeCount: 0, episodes: [] }` if neither is available.

2.5.3 WHEN the Jikan episode list spans multiple pages (`has_next_page: true`) THEN the
system SHALL fetch all pages (max 5 pages = 500 episodes) before returning the merged list.

2.5.4 WHEN a worker executes `getWebsiteEpisodeIndex` AND `TATAKAI_API_BASE_URL` is defined
in the worker scope THEN the system SHALL call
`GET <TATAKAI_API_BASE_URL>/toko/index/episodes?anilistId=...` via `__tatakai_fetch__` and
return the response when `provider` is non-null and `episodeCount > 0`.

2.5.5 WHEN `TATAKAI_API_BASE_URL` is `undefined` in the worker scope OR the TatakaiAPI call
returns `provider: null` THEN the system SHALL fall through to the direct provider scraping
path without throwing.

2.5.6 WHEN `extension-worker-pool.cjs` spawns a worker THEN it SHALL inject
`TATAKAI_API_BASE_URL` into `workerData`, resolving to
`(process.env.VITE_BACKEND_ORIGIN || 'http://localhost:4001') + '/api/v3'` — the same value
already used as `TATAKAI_API_BASE` in `ipc-runtime.cjs`.

2.5.7 WHEN `extension/toko/src/index.ts` is compiled THEN all references to
`TATAKAI_A1_BASE_URL` SHALL be replaced with `TATAKAI_API_BASE_URL`, and a corresponding
ambient declaration `declare const TATAKAI_API_BASE_URL: string | undefined` SHALL be
present in the worker-sandbox globals block.

---

#### Requirement 2.6 — Watch Page: Language Grouping and Source-Type Color Coding

**User Story:** As a Tatakai user on the Watch page, I want sources grouped by language and
visually distinguished by type, so that I can quickly find the right stream.

**Acceptance Criteria:**

2.6.1 WHEN the Watch page renders a source list that contains at least two distinct language
values across the sources THEN the system SHALL render a language-tab row above the source
list; each tab label SHALL be the human-readable language string derived from `source.language`
or `source.audioLanguage` (e.g. "English Sub", "English Dub", "Japanese", "Hindi"); a tab
labelled "All" SHALL always be present as the first tab.

2.6.2 WHEN a user selects a language tab THEN the system SHALL filter the visible source rows
to show only sources whose resolved language matches the selected tab; selecting "All" SHALL
show all sources regardless of language.

2.6.3 WHEN all sources in the list have no language field (null or empty) THEN the system
SHALL NOT render any language tabs and SHALL display the source list in its existing flat
layout unchanged.

2.6.4 WHEN a source row is rendered AND the source URL ends in `.m3u8` OR `sourceType` is
`"hls"` OR `isM3U8` is `true` THEN the system SHALL display a badge with the text "HLS" using
background `bg-zinc-800` and text `text-zinc-400`.

2.6.5 WHEN a source row is rendered AND `isEmbed` is `true` THEN the system SHALL display a
badge with the text "Embed" using CSS variable `var(--accent)` as the background tint color.

2.6.6 WHEN a source row is rendered AND `sourceType` is `"torrent"` THEN the system SHALL
display a badge with the text "Torrent" using background `bg-green-900/30` and text
`text-green-400`.

2.6.7 WHEN a source row is rendered AND none of the criteria in 2.6.4–2.6.6 apply THEN the
system SHALL NOT render any source-type badge for that row.

---

#### Requirement 2.7 — Manga Chapter Page: Provider-Grouped Layout

**User Story:** As a Tatakai manga reader, I want each chapter to show all available providers
with their language labels so I can pick my preferred source.

**Acceptance Criteria:**

2.7.1 WHEN a chapter entry has two or more source entries THEN the system SHALL render the
chapter as a two-level structure: a non-clickable chapter header row showing chapter number
and title, followed by one indented sub-row per source entry.

2.7.2 WHEN a chapter entry has exactly one source entry THEN the system SHALL still render the
two-level structure (header + one sub-row) so the layout is consistent.

2.7.3 WHEN rendering a source sub-row THEN the system SHALL display the text in the format
`[providerName] (Language)` where `Language` is the output of `formatLanguageLabel(source.language)`.

2.7.4 WHEN a source sub-row has a non-null, non-empty `scanlator` field THEN the system SHALL
display `[providerName] • [scanlator] (Language)` instead.

2.7.5 WHEN a source sub-row has a non-null, non-empty `chapterKey` THEN clicking the sub-row
SHALL navigate to the chapter reader using that provider's `chapterKey` and `extensionId`.

2.7.6 WHEN a source sub-row has a null or empty `chapterKey` THEN the sub-row SHALL be
rendered as non-interactive (no click handler, cursor-default, reduced opacity) with no
navigation action.

2.7.7 WHEN the source sub-row matches the result of `getBestSource(chapter)` THEN the system
SHALL render that sub-row with a visual distinction (e.g. a `ring-1 ring-primary/40` border or
`bg-primary/5` background) to indicate it is the recommended choice.

2.7.8 WHEN the viewport width is below the `md` Tailwind breakpoint (768 px) THEN each source
sub-row SHALL be rendered as a compact pill/chip rather than a full-width row.

2.7.9 WHEN a provider-preference or language filter is active THEN sub-rows whose
`provider` or `language` do not match the active filter SHALL be hidden; if all sub-rows of a
chapter are hidden by the filter, the chapter header SHALL also be hidden.

---

#### Requirement 2.8 — Enhanced Extension Debug Window

**User Story:** As a Tatakai developer, I want the debug window to show per-provider breakdown,
proxy routing, and timing, so I can diagnose integration failures without external tools.

**Acceptance Criteria:**

2.8.1 WHEN a test run completes THEN for each of the three aggregate methods (`single`, `batch`,
`getMangaChapters`) the system SHALL display a collapsible per-provider breakdown where each
row shows: `providerKey` (from `source.source` or `source.providerKey`), source count for
that provider, and one of the status labels `ok` / `empty` / `error`.

2.8.2 WHEN a provider has contributed zero sources to an aggregate result AND no error was
thrown THEN its status SHALL be displayed as `empty`; WHEN the method does not invoke that
provider type (e.g. torrent providers are not invoked by `single`) THEN the provider SHALL be
listed with status `skipped`.

2.8.3 WHEN the aggregate result contains sources THEN for each source URL in the expanded
view the system SHALL display a proxy-routing indicator: `🔀` if the URL starts with
`http://localhost` or `tatakai-media://`; `🌐` otherwise.

2.8.4 WHEN a source URL exceeds 80 characters THEN the system SHALL truncate it to 80
characters and append `…` in the display.

2.8.5 WHEN the test run completes THEN the system SHALL display the extension worker status
as one of: `loaded` (if `registry.lookup("tatakai.extension.toko")` returned a valid entry
before the run), `not loaded`, or `error: <message>`; the absolute bundle path SHALL be
shown alongside the status without truncation.

2.8.6 WHEN the user clicks a "Copy Report" button THEN the system SHALL copy to the clipboard
a JSON object with the following top-level keys: `timestamp` (ISO 8601 string), `config`
(`{ anilistId, episode, titles }`), `ipcResults` (array of `{ method, totalSources, providers: [{ provider, count, status }] }`),
`apiResults` (the existing array), `extensionStatus` (`{ loaded, bundlePath, error? }`).

2.8.7 WHEN the test runner issues `runtime:resolve-sources` THEN the system SHALL measure
total elapsed time from call to response and display it as "Total: Nms" in the result row;
individual per-provider timing SHALL NOT be required (deriving it from result grouping is
sufficient per option b).

---

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the app starts without the Toko extension present in `dist/` THEN the system SHALL
CONTINUE TO start normally without crashing — Toko auto-load SHALL be a best-effort
operation that logs a warning and proceeds.

3.2 WHEN `runtime:resolve-sources` is called and Toko returns no results THEN the system
SHALL CONTINUE TO fall back to the central API dispatch path for source resolution.

3.3 WHEN other extensions (non-Toko) are installed and `runtime:resolve-sources` is called
THEN the system SHALL CONTINUE TO invoke those extensions and return their results.

3.4 WHEN `extension:invoke` is called for methods other than Toko-specific ones THEN the
system SHALL CONTINUE TO route to the generic extension invoke fallthrough path unchanged.

3.5 WHEN the Manga page fetches chapters and no extension is installed THEN the system SHALL
CONTINUE TO display chapters from the TatakaiAPI without error.

3.6 WHEN the Watch page renders sources that do NOT have a language field (e.g. central API
dispatch results) THEN the system SHALL CONTINUE TO display them in the existing server
selection UI without language tabs.

3.7 WHEN the Manga chapter page is used without the Toko extension THEN the system SHALL
CONTINUE TO display chapters from API sources; the two-level layout SHALL only activate when
a chapter has more than one source entry.

3.8 WHEN all existing provider-preference, language-filter, sort-mode, and chapter-group
features on the Manga page are used THEN the system SHALL CONTINUE TO function correctly
with the new provider-grouped chapter display.

3.9 WHEN the Extension Debug Window is opened in non-developer mode THEN the system SHALL
CONTINUE TO be inaccessible (the `isDeveloperMode` guard is preserved).

3.10 WHEN `__tatakai_fetch__` is called inside a worker THEN the system SHALL CONTINUE TO
route all requests through `http://localhost:9001/proxy` — the proxy wiring is correct and
SHALL NOT be changed.
