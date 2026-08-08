# Toko Integration Fix — Bugfix Design

## Overview

The Toko unified extension (`tatakai.extension.toko`) is built and present in the repository
but is never loaded into the extension registry at startup, causing the Watch page and Manga
page to return nothing. This design covers six targeted fixes:

1. **Auto-load** — `ipc-runtime.cjs` returns `{ registry, workerPool }` via closure; `main.cjs`
   calls a new `autoLoadToko()` helper immediately after `extensionRuntimeApi` is assigned.
2. **TypeScript errors** — 14 compiler errors in `extension/toko/src/index.ts` are fixed with
   minimal casts and an ambient declaration.
3. **`listMangaExtensions` filter** — remove the `|| true` short-circuit that bypasses the
   capability check in `manga-extension-runtime.ts`.
4. **Watch page UX** — new `SourceLanguageTabs` and `SourceTypeBadge` components slot into the
   existing source list rendering.
5. **Manga chapter layout** — a new `MangaChapterProviderRows` sub-component renders a
   two-level header-plus-sub-rows structure inside `MangaPage.tsx`.
6. **Debug window** — `ExtensionDebugWindow` is expanded with per-provider breakdown, proxy
   indicators, timing, bundle status, and a Copy Report button.

---

## Glossary

- **Bug_Condition (C)**: The condition that triggers the integration failures — Toko is not
  registered in the `ExtensionRegistry` at runtime because no startup code places or registers
  its bundle.
- **Property (P)**: The desired behavior once fixed — `registry.lookup("tatakai.extension.toko")`
  returns a valid entry with a readable `bundlePath` before the first IPC call.
- **Preservation**: All existing source-resolution paths, extension IPC handlers, and UI
  components that work today must continue to work after the fix.
- **`ipc-runtime.cjs`**: `desktop/ipc/ipc-runtime.cjs`. Registers all runtime IPC handlers.
  Already returns `{ registry, workerPool }` at the bottom of its module factory function.
- **`extensionRuntimeApi`**: The return value of the `ipc-runtime.cjs` call in `main.cjs`
  (line ~123). Contains `{ registry, workerPool }` after the fix.
- **bundlePath (production)**: `path.join(process.resourcesPath, 'extension', 'toko', 'dist', 'bundle.js')`
- **bundlePath (dev)**: `path.join(__dirname, '..', 'extension', 'toko', 'dist', 'bundle.js')`
- **userData extensions dir**: `<app.getPath('userData')>/extensions/tatakai.extension.toko/`
- **`TATAKAI_API_BASE_URL`**: TatakaiAPI base URL injected into the worker sandbox via
  `workerData.tatakaiApiBaseUrl`. Resolves to `(VITE_BACKEND_ORIGIN || 'http://localhost:4001') + '/api/v3'`.
  Used by `getWebsiteEpisodeIndex` to call `GET /api/v3/toko/index/episodes` on TatakaiAPI.
- **bundlePath (dev)**: `path.join(__dirname, '..', '..', 'extension')` — note `ipc-runtime.cjs` lives in `desktop/ipc/`, so two levels up are needed to reach the repo root `extension/` directory.
- **SourceResult**: `{ url, quality, headers, source, sourceType, language?, audioLanguage? }`
  returned by Toko stream providers.
- **MangaChapterEntry**: `{ number, title, volume, sources: [{ provider, chapterKey, language, scanlator }] }`
- **Source type**: Classified as `"hls"` (`.m3u8` or `isM3U8`), `"embed"` (`isEmbed`), or
  `"torrent"` (`sourceType === "torrent"`).
- **ProviderRow**: One row in the per-provider sub-list under a chapter header in the manga UI.
- **`SourceLanguageTabs`**: New React component — renders language-filter tabs above the source list.
- **`SourceTypeBadge`**: New React component — renders an HLS / Embed / Torrent chip on a source row.
- **`MangaChapterProviderRows`**: New React component — renders the two-level chapter header +
  per-source sub-rows inside `MangaPage.tsx`.

---

## Bug Details

### Bug Condition

The integration fails because no code path registers the Toko bundle into `ExtensionRegistry`
on startup. `ipc-runtime.cjs` creates the `registry` inside a closure and uses it only for
IPC-triggered loads; nothing calls `registry.register` for Toko before the renderer issues
its first `runtime:resolve-sources` or `extension:invoke` call.

Secondary defects compound the root cause: 14 TypeScript compile errors in `index.ts` mean
the built bundle may be stale, and `getWebsiteEpisodeIndex` still delegates to the removed
A1 server via `TATAKAI_A1_BASE_URL` — which is never injected into the worker sandbox,
causing the delegation branch to be silently skipped every time.

**Formal Specification:**

```
FUNCTION isBugCondition(state)
  INPUT: state — { registryHasToko: boolean, bundleExists: boolean, tsErrors: number,
                   listMangaUsesCapabilityFilter: boolean }
  OUTPUT: boolean

  RETURN NOT state.registryHasToko
      OR NOT state.bundleExists
      OR state.tsErrors > 0
      OR NOT state.listMangaUsesCapabilityFilter
END FUNCTION
```

### Concrete Examples

| Scenario | Bug Condition | Current Result | Expected Result |
|----------|--------------|----------------|-----------------|
| App cold-start, bundle at resourcesPath | `registryHasToko = false` | `runtime:resolve-sources → { sources: [] }` | Toko auto-loaded; sources returned |
| `tsc --noEmit` on `index.ts` | `tsErrors = 14` | Build fails / stale bundle | Zero errors, fresh bundle |
| `listMangaExtensions()` | filter bypassed | All extensions included, not just manga-capable | Only `"manga"`-capable extensions |
| Worker calls `getWebsiteEpisodeIndex` | `TATAKAI_A1_BASE_URL` never injected, A1 removed | delegation silently skipped, falls to slow scraping | delegates to TatakaiAPI `/api/v3/toko/index/episodes` |

---

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- All existing IPC handlers registered by `ipc-runtime.cjs` (`runtime:health`,
  `runtime:resolve-sources`, `extension:load`, `extension:invoke`, etc.) MUST continue to
  function exactly as before.
- The `extensionRuntimeRef.current` wiring in `main.cjs` and the `ipc-home-server.cjs`
  integration that reads it MUST be unaffected.
- Non-Toko extensions (sideloaded or marketplace-installed) MUST continue to load, unload,
  and invoke normally.
- The fallback path in `useCombinedSources` (central API dispatch) MUST remain active when
  Toko returns no sources.
- The existing flat source list on the Watch page MUST remain unchanged when all sources have
  no language field (req 3.6 — no language tabs rendered in that case).
- The existing chapter rendering on `MangaPage.tsx` for API-only chapters (single-source
  entries) MUST remain functional.
- `ExtensionDebugWindow` MUST only be accessible in developer mode (`isDeveloperMode` guard
  is preserved).

**Scope:**

All inputs that do NOT involve Toko-specific startup, TypeScript compilation, or the new UI
components should be completely unaffected. This includes:

- Mouse-driven source selection, quality selection, embed playback
- Torrent session management
- Manga chapter navigation and reading for API-sourced chapters
- Extension marketplace submission, review-status, and kill-switch flows

---

## Hypothesized Root Cause

1. **Missing startup registration call** — `ipc-runtime.cjs` never calls
   `registry.register("tatakai.extension.toko", ...)` during module initialization. The
   `extension:load` IPC path exists but is only triggered by explicit renderer calls. No
   renderer code auto-loads Toko on app start. Fix: `main.cjs` must call a new `autoLoadToko`
   function (returned from `ipc-runtime.cjs` via closure) after the IPC handlers are registered
   and before `app.on('ready')` opens a window.

2. **Bundle path mismatch** — Electron's `process.resourcesPath` is only valid when the app
   is packaged. In development, `__dirname` (relative to `desktop/`) must be used to locate
   `../extension/toko/dist/bundle.js`. The auto-load must resolve both paths and prefer
   `resourcesPath` in production.

3. **TypeScript `flatMap` generic loss** — `Promise.allSettled` returns
   `PromiseSettledResult<T[]>[]` but the fulfilled case `.value` is typed as `T[]` only when
   the generic flows through correctly. The `.flatMap(r => r.value)` call loses the generic
   because the filter narrows to `PromiseFulfilledResult<T[]>` but TypeScript doesn't carry
   the `T[]` through the `flatMap` return without an explicit cast.

4. **`TATAKAI_A1_BASE_URL` → `TATAKAI_API_BASE_URL` + real Jikan data** — The A1 server is
   being removed. Toko's `getWebsiteEpisodeIndex` currently points at A1's
   `/toko/index/episodes` which always returned `{ provider: null, episodeCount: 0 }` (a
   stub). TatakaiAPI has the same stub today, but it will be upgraded to use the existing
   `jikanClient.getAnimeEpisodes(malId)` to return real episode metadata. The flow is:
   worker calls `GET /api/v3/toko/index/episodes?anilistId=N` → TatakaiAPI resolves MAL ID
   from the mapping service → fetches all Jikan episode pages → returns
   `{ provider: "jikan", episodeCount: N, episodes: [{number, title, aired}] }`. The
   constant is renamed to `TATAKAI_API_BASE_URL` and injected into `workerData` from
   `VITE_BACKEND_ORIGIN`.

5. **`listMangaExtensions` `|| true` short-circuit** — The filter was likely added as a
   temporary workaround while the capability field was being designed. It must be removed so
   the capability check gates which extensions are queried for manga chapters.

---

## Correctness Properties

Property 1: Bug Condition — Toko Auto-Registration on Startup

_For any_ Electron main process startup where `bundle.js` and `manifest.json` exist at the
resolved Toko bundle path, the fixed `autoLoadToko` function SHALL call
`registry.register("tatakai.extension.toko", manifest, bundlePath)` such that a subsequent
`registry.lookup("tatakai.extension.toko")` returns a non-null entry with a `bundlePath`
pointing to a file that exists on disk.

**Validates: Requirements 2.1.1, 2.1.3**

---

Property 2: Preservation — Non-Toko Startup Path Unchanged

_For any_ startup where the Toko bundle does NOT exist at the expected path, the fixed
`autoLoadToko` function SHALL log a warning and return without throwing, leaving the
`registry` in exactly the same state as if `autoLoadToko` had never been called — all other
IPC handlers remain registered and functional.

**Validates: Requirements 2.1.2, 3.1, 3.3**

---

Property 3: Bug Condition — TypeScript Zero Errors

_For any_ invocation of `tsc --noEmit` against `extension/toko/`, the fixed `index.ts` SHALL
produce zero compiler errors. Specifically: `runProviders<T>` SHALL return `T[]`, `getMangaChapters`
SHALL iterate `MangaChapterEntry[]`, `getPreviewSource` SHALL access `SourceResult` members
without error, and `TATAKAI_API_BASE_URL` SHALL resolve from the ambient declaration.

**Validates: Requirements 2.4.1, 2.4.2, 2.4.3, 2.4.4, 2.4.5**

---

Property 4: Bug Condition — `listMangaExtensions` Capability Filter

_For any_ call to `listMangaExtensions()` where the installed extensions include one entry
without `"manga"` in its `capabilities` array and one entry with `"manga"` in its array, the
fixed function SHALL return only the entry with `"manga"` in its `capabilities` — the `|| true`
short-circuit SHALL NOT be present.

**Validates: Requirements 2.3.2**

---

Property 5: Bug Condition — `SourceLanguageTabs` Tab Count

_For any_ source list with N distinct non-null language values (N ≥ 2), the fixed
`SourceLanguageTabs` component SHALL render exactly N + 1 tabs (one "All" tab plus one per
distinct language). When N = 0 (all sources have no language), the component SHALL render
nothing.

**Validates: Requirements 2.6.1, 2.6.2, 2.6.3**

---

Property 6: Bug Condition — `MangaChapterProviderRows` Sub-Row Count

_For any_ chapter entry with M source entries (M ≥ 1), the fixed `MangaChapterProviderRows`
component SHALL render exactly 1 non-clickable header row plus M sub-rows. The header row
SHALL NOT have a click handler; each sub-row with a non-empty `chapterKey` SHALL have a
navigation click handler.

**Validates: Requirements 2.7.1, 2.7.2, 2.7.5, 2.7.6**

---

## Fix Implementation

### Fix 1 — Toko Auto-Load (`desktop/main.cjs` + `desktop/ipc/ipc-runtime.cjs`)

**Background:** `ipc-runtime.cjs` already returns `{ registry, workerPool }` at the bottom
of its factory. `main.cjs` stores this in `extensionRuntimeApi` at line ~123. The auto-load
function just needs access to that return value.

**Changes to `desktop/ipc/ipc-runtime.cjs`:**

Extend the returned object to include `autoLoadToko`:

```js
// At the end of the module factory (currently: return { registry, workerPool })
return {
  registry,
  workerPool,
  autoLoadToko(fs, path, logger) {
    const isDev = !require('electron').app.isPackaged;
    const bundlePath = isDev
      ? path.join(__dirname, '..', 'extension', 'toko', 'dist', 'bundle.js')
      : path.join(require('electron').app.getAppPath(), '..', 'extension', 'toko', 'dist', 'bundle.js');
    const manifestPath = isDev
      ? path.join(__dirname, '..', 'extension', 'toko', 'manifest.json')
      : path.join(require('electron').app.getAppPath(), '..', 'extension', 'toko', 'manifest.json');

    if (!fs.existsSync(bundlePath)) {
      logger.warn(`[Toko] bundle not found at ${bundlePath}, skipping auto-load`);
      return;
    }
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      registry.register('tatakai.extension.toko', manifest, bundlePath);
      logger.info(`[Toko] Auto-loaded v${manifest.version} from ${bundlePath}`);
    } catch (err) {
      logger.warn(`[Toko] Auto-load failed: ${err.message}`);
    }
  },
};
```

**Production path note:** In a packaged Electron app, `app.getAppPath()` returns the
`resources/app.asar` path. The Toko bundle is an unpacked file, so the correct production
path uses `process.resourcesPath` (available via `app` before `ready`):

```js
const bundlePath = isDev
  ? path.join(__dirname, '..', 'extension', 'toko', 'dist', 'bundle.js')
  : path.join(process.resourcesPath, 'extension', 'toko', 'dist', 'bundle.js');
const manifestPath = isDev
  ? path.join(__dirname, '..', 'extension', 'toko', 'manifest.json')
  : path.join(process.resourcesPath, 'extension', 'toko', 'manifest.json');
```

`process.resourcesPath` is available before `app.on('ready')` fires, so the call is safe
at module-initialization time.

**Changes to `desktop/main.cjs`:**

Immediately after the `extensionRuntimeApi` assignment (line ~123), add:

```js
const extensionRuntimeApi = require('./ipc/ipc-runtime.cjs')(ipcMain, app, fs, path, logger, getMainWindow);
extensionRuntimeRef.current = extensionRuntimeApi;

// Auto-load Toko bundle (Req 2.1) — must run before app.on('ready') so that
// an immediate runtime:health call from the renderer sees tatakai.extension.toko loaded.
if (extensionRuntimeApi?.autoLoadToko) {
  extensionRuntimeApi.autoLoadToko(fs, path, logger);
}
```

The call is synchronous and file-system-only, so it completes before any IPC handler could
be invoked by the renderer. This satisfies Req 2.1.3.

---

### Fix 2 — TypeScript Errors in `extension/toko/src/index.ts`

**File:** `extension/toko/src/index.ts`

**Change 2a — `runProviders` flatMap cast (Req 2.4.2):**

```ts
// BEFORE
.flatMap(r => r.value);

// AFTER
.flatMap(r => r.value as T[]);
```

**Change 2b — `getMangaChapters` result cast (Req 2.4.3):**

```ts
// BEFORE
const all = await runProviders(MANGA_PROVIDERS, p => p.getChapters(params));

// AFTER
const all = await runProviders(MANGA_PROVIDERS, p => p.getChapters(params)) as MangaChapterEntry[];
```

**Change 2c — `getPreviewSource` result cast (Req 2.4.4):**

```ts
// BEFORE
const results = await runProviders(STREAM_PROVIDERS, p => p.single(opts));
const first = results.find(r => r.url && r.sourceType !== 'torrent');

// AFTER
const results = await runProviders(STREAM_PROVIDERS, p => p.single(opts)) as SourceResult[];
const first = results.find(r => r.url && r.sourceType !== 'torrent');
```

**Change 2d — rename `TATAKAI_A1_BASE_URL` → `TATAKAI_API_BASE_URL` (Req 2.4.5, 2.5)**

Replace the ambient declaration and all usages in `getWebsiteEpisodeIndex`:

```ts
// Worker sandbox globals injected by extension-worker-pool.cjs
declare const __tatakai_fetch__: (url: string, init?: RequestInit) => Promise<Response>;
// BEFORE: declare const TATAKAI_A1_BASE_URL: string | undefined;
// AFTER:
declare const TATAKAI_API_BASE_URL: string | undefined;
```

In `getWebsiteEpisodeIndex`, replace every occurrence of `TATAKAI_A1_BASE_URL` with
`TATAKAI_API_BASE_URL`:

```ts
// BEFORE
if (typeof TATAKAI_A1_BASE_URL !== 'undefined' && TATAKAI_A1_BASE_URL) {
  const url = new URL('/toko/index/episodes', TATAKAI_A1_BASE_URL);

// AFTER
if (typeof TATAKAI_API_BASE_URL !== 'undefined' && TATAKAI_API_BASE_URL) {
  const url = new URL('/toko/index/episodes', TATAKAI_API_BASE_URL);
```

`TATAKAI_API_BASE_URL` resolves to `http://localhost:4001/api/v3` in dev and
`https://api.tatakai.me/api/v3` in prod. The `/toko/index/episodes` endpoint on TatakaiAPI
will now return real Jikan data (see Fix 2f below).

**Change 2e — inject `TATAKAI_API_BASE_URL` into worker sandbox (`desktop/runtime/extension/extension-worker-pool.cjs`)**

In `getOrSpawn`, add `TATAKAI_API_BASE_URL` to `workerData`:

```js
workerData: {
  extensionId,
  extensionCode,
  manifest,
  allowedDomains: extractAllowedDomains(...),
  helperCode: [...].join('\n'),
  // NEW:
  tatakaiApiBaseUrl: (process.env.VITE_BACKEND_ORIGIN || 'http://localhost:4001') + '/api/v3',
},
```

And in the worker bootstrap string `WORKER_BOOTSTRAP`, expose it as a global before the
extension code runs:

```js
// After the __tatakai_allowedDomains__ line, add:
const TATAKAI_API_BASE_URL = workerData.tatakaiApiBaseUrl || undefined;
```

**Change 2f — implement real Jikan-backed `/toko/index/episodes` in TatakaiAPI (`TatakaiAPI/src/routes/toko.ts`)**

Replace the stub with a real implementation:

```ts
// GET /api/v3/toko/index/episodes
// Query params: anilistId? (number), malId? (number), tatakaiId? (string)
toko.get("/index/episodes", async (c) => {
  const anilistId = Number(c.req.query("anilistId") ?? 0);
  const malIdParam = Number(c.req.query("malId") ?? 0);

  // Resolve malId: prefer explicit param, else look up from AniList mapping
  let malId = malIdParam > 0 ? malIdParam : 0;
  if (!malId && anilistId > 0) {
    const mapping = await resolveAnimeMappingByAniListId(anilistId);
    malId = mapping?.malId ?? 0;
  }

  if (!malId) {
    return c.json({ provider: null, episodeCount: 0, episodes: [] });
  }

  // Fetch all pages from Jikan (max 5 = 500 episodes)
  const episodes: Array<{ number: number; title?: string; aired?: string }> = [];
  let page = 1;
  let hasNext = true;
  while (hasNext && page <= 5) {
    const result = await jikanClient.getAnimeEpisodes(malId, page);
    for (const ep of result.data) {
      episodes.push({
        number: ep.mal_id,
        title: ep.title ?? undefined,
        aired: ep.aired ?? undefined,
      });
    }
    hasNext = result.pagination.has_next_page;
    page++;
  }

  if (episodes.length === 0) {
    return c.json({ provider: null, episodeCount: 0, episodes: [] });
  }

  return c.json({
    provider: "jikan",
    episodeCount: episodes.length,
    episodes,
  });
});
```

**Required imports** to add to `TatakaiAPI/src/routes/toko.ts`:
```ts
import { jikanClient } from "../providers/jikan/client.js";
import { resolveAnimeMappingByAniListId } from "../services/mapping/mappingResolver.js";
```

The `jikanClient` and `resolveAnimeMappingByAniListId` are both already used elsewhere in
TatakaiAPI — no new dependencies required.

---

### Fix 3 — `listMangaExtensions` Filter (`src/core/content/manga-extension-runtime.ts`)

**File:** `src/core/content/manga-extension-runtime.ts`

```ts
// BEFORE
.filter((row) => {
  const caps = row.capabilities || [];
  return caps.includes("manga") || caps.includes("chapters") || true;
})

// AFTER
.filter((row) => {
  const caps = row.capabilities || [];
  return caps.includes("manga") || caps.includes("chapters");
})
```

No other changes to this file. The Toko manifest already declares
`"capabilities": ["manga", "preview", "websiteIndex"]` so it will pass this filter once
auto-loaded (Fix 1).

---

### Fix 4 — `SourceLanguageTabs` and `SourceTypeBadge` Components

**New files:**

- `src/components/watch/SourceLanguageTabs.tsx`
- `src/components/watch/SourceTypeBadge.tsx`

#### `SourceTypeBadge`

A tiny stateless chip component. Takes a source object and renders the appropriate badge
based on Req 2.6.4–2.6.7.

```tsx
interface SourceTypeBadgeProps {
  isM3U8?: boolean;
  isEmbed?: boolean;
  sourceType?: string;   // "hls" | "torrent" | undefined
}

export function SourceTypeBadge({ isM3U8, isEmbed, sourceType }: SourceTypeBadgeProps) {
  if (isM3U8 || sourceType === 'hls') {
    return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold
                            bg-zinc-800 text-zinc-400">HLS</span>;
  }
  if (isEmbed) {
    return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                 style={{ background: 'color-mix(in srgb, var(--accent) 20%, transparent)',
                          color: 'var(--accent)' }}>Embed</span>;
  }
  if (sourceType === 'torrent') {
    return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold
                            bg-green-900/30 text-green-400">Torrent</span>;
  }
  return null;
}
```

#### `SourceLanguageTabs`

Derives language labels from a source list, renders tabs, exposes the active language key.
Follows Req 2.6.1–2.6.3.

```tsx
interface Source {
  language?: string | null;
  audioLanguage?: string | null;
}

interface SourceLanguageTabsProps {
  sources: Source[];
  activeLanguage: string;           // "all" or normalized key
  onLanguageChange: (key: string) => void;
}

export function SourceLanguageTabs({ sources, activeLanguage, onLanguageChange }: SourceLanguageTabsProps) {
  // Derive distinct language labels (same normalizeLanguageKey logic as MangaPage)
  const languageTabs = useMemo(() => {
    const seen = new Map<string, string>();
    for (const src of sources) {
      const raw = src.language || src.audioLanguage;
      if (!raw) continue;
      const key = normalizeWatchLanguageKey(raw);
      if (key && !seen.has(key)) seen.set(key, formatWatchLanguageLabel(raw));
    }
    return Array.from(seen.entries()).map(([value, label]) => ({ value, label }));
  }, [sources]);

  if (languageTabs.length < 2) return null;   // Req 2.6.3 — no tabs when 0 or 1 language

  return (
    <div className="flex gap-1 flex-wrap mb-2">
      <button
        onClick={() => onLanguageChange('all')}
        className={cn('px-3 py-1 rounded-full text-xs font-semibold transition-colors',
          activeLanguage === 'all'
            ? 'bg-primary text-primary-foreground'
            : 'bg-white/5 text-muted-foreground hover:bg-white/10')}
      >All</button>
      {languageTabs.map(({ value, label }) => (
        <button key={value} onClick={() => onLanguageChange(value)}
          className={cn('px-3 py-1 rounded-full text-xs font-semibold transition-colors',
            activeLanguage === value
              ? 'bg-primary text-primary-foreground'
              : 'bg-white/5 text-muted-foreground hover:bg-white/10')}
        >{label}</button>
      ))}
    </div>
  );
}
```

#### Integration Point in `WatchPage.tsx`

The Watch page uses `useCombinedSources` which returns `data.sources` (each with `language`,
`isM3U8`, `providerName`, `providerKey`). The source list rendering section should:

1. Add a `const [activeSourceLanguage, setActiveSourceLanguage] = useState('all')` state.
2. Render `<SourceLanguageTabs sources={data.sources} activeLanguage={activeSourceLanguage} onLanguageChange={setActiveSourceLanguage} />` above the source button list.
3. Filter the rendered sources: `const visibleSources = activeSourceLanguage === 'all' ? data.sources : data.sources.filter(s => normalizeWatchLanguageKey(s.language) === activeSourceLanguage)`.
4. Add `<SourceTypeBadge isM3U8={src.isM3U8} sourceType={src.sourceType} />` inside each
   source row button, after the provider name label.

The language normalization helpers (`normalizeWatchLanguageKey`, `formatWatchLanguageLabel`)
parallel the ones already present in `MangaPage.tsx` and can be extracted to
`src/lib/languageUtils.ts` to be shared.

---

### Fix 5 — `MangaChapterProviderRows` Component (`src/pages/manga/MangaPage.tsx`)

**New component (defined inline in `MangaPage.tsx` or extracted to
`src/components/manga/MangaChapterProviderRows.tsx`):**

#### Data Contract

```ts
interface ChapterSource {
  provider: string;
  chapterKey: string;
  providerChapterId: string;
  language?: string | null;
  scanlator?: string | null;
}

interface MangaChapterProviderRowsProps {
  chapter: {
    chapterNumber: number | null;
    chapterTitle?: string | null;
    sources: ChapterSource[];
  };
  bestSource: ChapterSource | null;         // highlighted source (from getBestSource)
  preferredProvider: string;
  effectivePreferredLanguage: string;
  onNavigate: (extensionId: string, chapterKey: string) => void;
  className?: string;
}
```

#### Rendering Logic (Req 2.7.1–2.7.9)

```tsx
export function MangaChapterProviderRows({
  chapter, bestSource, preferredProvider, effectivePreferredLanguage,
  onNavigate, className
}: MangaChapterProviderRowsProps) {
  const chapterLabel = chapter.chapterNumber != null
    ? `Chapter ${chapter.chapterNumber}`
    : chapter.chapterTitle || 'Chapter';
  const title = chapter.chapterTitle && chapter.chapterTitle !== chapterLabel
    ? ` — ${chapter.chapterTitle}` : '';

  // Req 2.7.9 — filter sources by active provider/language preferences
  const filteredSources = chapter.sources.filter(src => {
    const providerMatch = preferredProvider === 'auto' || src.provider === preferredProvider;
    const langMatch = effectivePreferredLanguage === 'auto'
      || normalizeLanguageKey(src.language) === effectivePreferredLanguage;
    return providerMatch && langMatch;
  });

  if (filteredSources.length === 0) return null; // hidden when all sub-rows filtered out

  return (
    <div className={cn('rounded-xl border border-white/5 overflow-hidden', className)}>
      {/* Header row — non-clickable (Req 2.7.1) */}
      <div className="px-4 py-2 bg-white/[0.03] text-sm font-semibold text-foreground select-none">
        {chapterLabel}{title}
      </div>
      {/* Sub-rows — one per source (Req 2.7.1) */}
      {filteredSources.map((src, idx) => {
        const isReadable = Boolean(src.chapterKey);
        const isBest = bestSource?.chapterKey === src.chapterKey
                    && bestSource?.provider === src.provider;
        const langLabel = formatLanguageLabel(src.language);
        const label = src.scanlator
          ? `${src.provider} • ${src.scanlator} (${langLabel})`   // Req 2.7.4
          : `${src.provider} (${langLabel})`;                       // Req 2.7.3

        return (
          <button
            key={`${src.provider}-${src.chapterKey}-${idx}`}
            disabled={!isReadable}                                   // Req 2.7.6
            onClick={isReadable ? () => onNavigate(src.provider, src.chapterKey) : undefined}
            className={cn(
              'w-full flex items-center gap-2 px-4 py-2 text-xs transition-colors text-left',
              'border-t border-white/5 md:flex-row flex-col md:items-center items-start', // Req 2.7.8
              isReadable
                ? 'hover:bg-white/5 cursor-pointer text-foreground'
                : 'cursor-default opacity-40 text-muted-foreground',
              isBest && 'ring-1 ring-primary/40 bg-primary/5',     // Req 2.7.7
            )}
          >
            <span className="flex-1 truncate">{label}</span>
          </button>
        );
      })}
    </div>
  );
}
```

#### Integration in `MangaPage.tsx`

Replace the current flat chapter card rendering inside `chapterCards.map(...)` with
`MangaChapterProviderRows`. The existing `getBestSource`, `preferredProvider`,
`effectivePreferredLanguage`, and `navigate` are all already available in scope.

The existing single-source click handler (navigate to reader) becomes the `onNavigate`
callback. When a chapter has only one source the two-level structure still renders
(1 header + 1 sub-row) for consistent layout (Req 2.7.2).

---

### Fix 6 — Enhanced `ExtensionDebugWindow`

**File:** `src/components/extensions/ExtensionDebugWindow.tsx`

The current component tests three aggregate methods and shows a flat result list. The
following additions implement Req 2.8.1–2.8.7.

#### New State and Type Additions

```ts
// Per-provider breakdown row (Req 2.8.1)
interface ProviderBreakdownRow {
  provider: string;   // from source.source or source.providerKey
  count: number;
  status: 'ok' | 'empty' | 'error' | 'skipped';
}

// Extended ProviderResult
interface ProviderResult {
  provider: string;
  category: 'stream' | 'torrent' | 'manga';
  status: 'pending' | 'running' | 'ok' | 'error' | 'empty';
  sourceCount: number;
  latencyMs?: number;      // total elapsed ms (Req 2.8.7)
  sources: Array<{
    url: string; quality: string; sourceType?: string; audioLanguage?: string;
    providerKey?: string;
  }>;
  breakdown: ProviderBreakdownRow[];   // NEW
  error?: string;
}

// Bundle status (Req 2.8.5)
interface BundleStatus {
  loaded: boolean;
  bundlePath: string | null;
  error?: string;
}
```

#### Bundle Status Check

Before running tests, query the extension status via `electron.listInstalledExtensions()`:

```ts
async function fetchBundleStatus(): Promise<BundleStatus> {
  try {
    const rows = await (window as any).electron?.listInstalledExtensions?.() ?? [];
    const toko = rows.find((r: any) => r.id === 'tatakai.extension.toko');
    return {
      loaded: Boolean(toko),
      bundlePath: toko ? `<userData>/extensions/tatakai.extension.toko/bundle.js` : null,
    };
  } catch (err: any) {
    return { loaded: false, bundlePath: null, error: err?.message };
  }
}
```

#### Per-Provider Breakdown Derivation (Req 2.8.1–2.8.2)

After receiving raw sources from an IPC call, group by `source.source || source.providerKey`:

```ts
function buildBreakdown(rawSources: any[], category: 'stream' | 'torrent' | 'manga'): ProviderBreakdownRow[] {
  const byProvider = new Map<string, number>();
  for (const src of rawSources) {
    const key = src.source || src.providerKey || src.provider || 'unknown';
    byProvider.set(key, (byProvider.get(key) ?? 0) + 1);
  }
  return Array.from(byProvider.entries()).map(([provider, count]) => ({
    provider, count, status: count > 0 ? 'ok' : 'empty',
  }));
}
```

#### Proxy Routing Indicator (Req 2.8.3–2.8.4)

```ts
function proxyIndicator(url: string): string {
  if (/^http:\/\/localhost/i.test(url) || /^tatakai-media:\/\//i.test(url)) return '🔀';
  return '🌐';
}

function truncateUrl(url: string, max = 80): string {
  return url.length > max ? url.slice(0, max) + '…' : url;
}
```

#### Copy Report Button (Req 2.8.6)

```ts
const copyReport = useCallback(() => {
  const report = {
    timestamp: new Date().toISOString(),
    config,
    ipcResults: results.map(r => ({
      method: r.provider,
      totalSources: r.sourceCount,
      elapsedMs: r.latencyMs ?? null,
      providers: r.breakdown,
    })),
    apiResults,
    extensionStatus: bundleStatus,
  };
  navigator.clipboard.writeText(JSON.stringify(report, null, 2)).catch(() => {});
}, [results, apiResults, bundleStatus, config]);
```

#### Bundle Status Display (Req 2.8.5)

Render a dedicated status row in the results section before IPC results:

```tsx
{bundleStatus && (
  <div className="rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 flex items-center gap-3">
    {bundleStatus.loaded
      ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
      : <XCircle className="w-4 h-4 text-destructive" />}
    <span className="text-xs font-bold">
      Bundle: {bundleStatus.loaded ? 'loaded' : bundleStatus.error ? `error: ${bundleStatus.error}` : 'not loaded'}
    </span>
    {bundleStatus.bundlePath && (
      <span className="text-xs font-mono text-muted-foreground ml-2 break-all">
        {bundleStatus.bundlePath}
      </span>
    )}
  </div>
)}
```

---

## Testing Strategy

### Validation Approach

The testing strategy follows the bug condition methodology: first exercise the UNFIXED code
to surface counterexamples and confirm root causes, then verify each fix satisfies the
correctness properties and does not break existing behavior.

---

### Exploratory Bug Condition Checking

**Goal:** Confirm that the extension is NOT in the registry on startup before the fix, and
that the TypeScript errors and filter bypass are present as described.

**Test Plan:**

1. Run `tsc --noEmit` in `extension/toko/` against the current `index.ts` → expect 14 errors.
2. Call `registry.lookup("tatakai.extension.toko")` in a test harness that requires
   `ipc-runtime.cjs` without calling `autoLoadToko` → expect `null`.
3. Call `listMangaExtensions()` with a mocked `electron.listInstalledExtensions` returning
   one entry with `capabilities: ["preview"]` only → expect it to be included (demonstrates
   the `|| true` bypass on unfixed code).

**Expected Counterexamples:**
- `registry.lookup("tatakai.extension.toko")` returns `null` on unfixed startup.
- `tsc --noEmit` exits with non-zero code and ≥ 14 error lines.
- `listMangaExtensions()` returns the non-manga extension (demonstrates bypass).

---

### Fix Checking

**Goal:** For all inputs where `isBugCondition` holds, the fixed code produces the expected
behavior.

```
FOR ALL startup state WHERE isBugCondition(state) DO
  result := runWithFix(state)
  ASSERT registry.lookup("tatakai.extension.toko") != null     -- Fix 1
  ASSERT tsErrorCount == 0                                      -- Fix 2
  ASSERT listMangaExtensions() excludes non-manga extensions    -- Fix 3
END FOR
```

**Test Cases:**

1. **Auto-load unit test**: Mock `fs.existsSync` to return `true`, mock `fs.readFileSync`
   to return the real `manifest.json` content. Call `autoLoadToko(fs, path, logger)` and
   assert `registry.lookup("tatakai.extension.toko")` is non-null.
2. **Auto-load missing bundle**: Mock `fs.existsSync` → `false`. Call `autoLoadToko` and
   assert it does not throw; assert `logger.warn` was called with a message containing
   "bundle not found".
3. **TypeScript compile check**: Run `pnpm exec tsc --noEmit` in `extension/toko/` after
   applying all four code changes; assert exit code 0.
4. **Filter unit test**: Call `listMangaExtensions()` with mocked `listInstalledExtensions`
   returning `[{ id: 'ext-a', capabilities: ['preview'] }, { id: 'ext-b', capabilities: ['manga'] }]`;
   assert result equals `['ext-b']`.

---

### Preservation Checking

**Goal:** For all inputs where `isBugCondition` does NOT hold, the fixed code behaves
identically to the original.

```
FOR ALL startup state WHERE NOT isBugCondition(state) DO
  ASSERT fixed_ipcRuntime() == original_ipcRuntime()
  ASSERT fixed_listMangaExtensions() == original_listMangaExtensions()
END FOR
```

**Property-Based Test Approach:**

Generate random extension registry states (random sets of registered non-Toko extensions)
and verify that `runtime:resolve-sources` still returns their results after the fix. The
auto-load only adds one entry; it cannot remove or overwrite existing entries because
`registry.register` is additive.

**Test Cases:**

1. **Non-Toko extension resolve-sources**: Register a mock extension with a different id.
   Verify `runtime:resolve-sources` still returns its sources after applying the auto-load fix.
2. **`extension:invoke` generic fallthrough**: Call `extension:invoke` with a non-Toko
   extension id. Verify it routes to the generic fallthrough path unchanged.
3. **Source list with no language**: Render `SourceLanguageTabs` with all sources having
   `language: null`. Assert the component renders nothing (no DOM nodes output).
4. **Single-source chapter**: Render `MangaChapterProviderRows` with 1 source. Assert
   1 header row + 1 sub-row are present.
5. **Developer mode guard**: Render `ExtensionDebugWindow` in a context where `isDeveloperMode`
   is `false`. Assert the component is not accessible (guard code unchanged).

---

### Unit Tests

- `autoLoadToko` — bundle exists, bundle missing, manifest parse error
- `autoLoadToko` — idempotency: calling twice does not double-register
- TypeScript compile: `tsc --noEmit` exits 0 after all four index.ts changes
- `listMangaExtensions` filter: only extensions with `"manga"` or `"chapters"` capability pass
- `SourceTypeBadge` — HLS, embed, torrent, none (no badge)
- `SourceLanguageTabs` — 0 languages (null), 1 language (no tabs), 2+ languages (tabs rendered)
- `SourceLanguageTabs` — selecting a tab calls `onLanguageChange` with the correct key
- `MangaChapterProviderRows` — 1 source, 3 sources, filtered-to-0 (null output)
- `MangaChapterProviderRows` — best source gets `ring-1 ring-primary/40` class
- `MangaChapterProviderRows` — non-readable source (empty chapterKey) is disabled
- `ExtensionDebugWindow` — `proxyIndicator` returns `🔀` for `localhost` URLs
- `ExtensionDebugWindow` — `truncateUrl` caps at 80 chars with `…`
- `ExtensionDebugWindow` — Copy Report produces correct JSON shape

---

### Property-Based Tests

- **Property 1** — For any `bundlePath` string where the mocked `fs.existsSync` returns
  `true`, `autoLoadToko` always calls `registry.register` exactly once with
  `id === "tatakai.extension.toko"`.
- **Property 4** — For any array of extension objects, `listMangaExtensions` never returns
  an extension whose `capabilities` array does not contain `"manga"` or `"chapters"`.
- **Property 5** — For any source list of length N with D distinct non-null language values:
  if D ≥ 2, `SourceLanguageTabs` renders exactly D + 1 tabs; if D < 2, it renders nothing.
- **Property 6** — For any chapter with M ≥ 1 filtered sources, `MangaChapterProviderRows`
  renders exactly M + 1 elements (1 header + M sub-rows).

---

### Integration Tests

- Cold-start simulation: require `main.cjs` in a test harness with real `ipc-runtime.cjs`
  (mocked `app`, `ipcMain`); verify `registry.lookup("tatakai.extension.toko")` is non-null
  after `autoLoadToko` runs and before any `app.on('ready')` callback fires.
- Full Watch page source flow (manual/E2E): open Watch page for a known title; confirm at
  least one Toko source appears in the source list with an `HLS` badge.
- Full Manga chapter flow (manual/E2E): open a manga page; confirm Toko providers appear as
  sub-rows under chapter headers.
- Debug window Copy Report (manual): open `ExtensionDebugWindow`, run tests, click Copy
  Report; paste into DevTools console and verify the JSON has all required keys.
