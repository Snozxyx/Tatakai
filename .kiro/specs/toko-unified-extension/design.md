# Design Document — Toko Unified Extension

## Overview

Toko is a single `custom`-type Tatakai marketplace extension (`id: "tatakai.extension.toko"`) that consolidates all anime direct-stream sources, torrent sources, and manga sources into one installable `.kai` package. It also introduces two new platform capabilities: random-timestamp hover/detail video previews and website-first episode/chapter indexing.

The implementation touches six layers of the Tatakai stack:

1. **Extension runtime** (`desktop/runtime/extension/`) — worker helper injection and new IPC methods
2. **Toko bundle** (`extension/toko/`) — provider adapters, manifest, and build pipeline
3. **A1 service** (`extension/A1/`) — new `/toko/*` routes for preview and index
4. **TatakaiAPI** (`TatakaiAPI/src/`) — proxy routes and dispatch ordering
5. **Frontend** (`src/`) — preview UI, episode override, manga provider UI, hub presentation
6. **Tests** (`tests/`) — unit and property-based coverage

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                        Electron Main Process                      │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │  extension-worker-pool.cjs                                  │ │
│  │   __tatakai_fetch__ (domain-gated + timeout)                │ │
│  │   __tatakai_parse_html__ (cheerio)                          │ │
│  │   __tatakai_anitomy__ (anitomyscript)                       │ │
│  │   extension:invoke dispatcher                               │ │
│  │   electron.listInstalledExtensions bridge                   │ │
│  └──────────────────────┬──────────────────────────────────────┘ │
│                         │  worker_threads                         │
│  ┌──────────────────────▼──────────────────────────────────────┐ │
│  │  tatakai.extension.toko  (bundle.js in worker sandbox)      │ │
│  │   TokoBundleClass                                           │ │
│  │   ├── Direct-stream providers  (11 A1-port + 3 A2-port + 4) │ │
│  │   ├── Torrent providers        (6 A2-port + 2 net-new)      │ │
│  │   └── Manga providers          (3 A1-port + 2 A2-port)      │ │
│  └─────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
         │ IPC (extension:invoke / electron.listInstalledExtensions)
         ▼
┌──────────────────────────────────────────────────────────────────┐
│                         React Frontend                            │
│  usePreviewSource  useWebsiteIndex  MangaPage  ExtensionHubPage  │
└──────────────────────────────────────────────────────────────────┘
         │ HTTP (web fallback)
         ▼
┌──────────────────────────────────────────────────────────────────┐
│    TatakaiAPI  /api/v3/toko/*  /api/v3/extensions/:id  dispatch  │
└──────────────────────────────────────────────────────────────────┘
         │ HTTP proxy (10 s timeout)
         ▼
┌──────────────────────────────────────────────────────────────────┐
│    A1 Service  /toko/index/episodes  /toko/index/chapters        │
│               /toko/preview                                      │
└──────────────────────────────────────────────────────────────────┘
```


---

## 1. Worker Helper Injection (Req 1)

### Problem

`extension-worker-pool.cjs` already bootstraps workers with `__tatakai_fetch__`, `__tatakai_parse_html__`, and `__tatakai_anitomy__` via `globalThis`, but these are currently no-ops or undefined — the actual implementation bodies are missing. `extension-sandbox.cjs` handles the web-worker (renderer) path but is not used by the worker-pool path.

### Changes to `extension-worker-pool.cjs`

**`__tatakai_fetch__` implementation** — added to `WORKER_BOOTSTRAP` via `workerData`:

```
allowedDomains  = extractAllowedDomains(manifest.permissions)
proxyBaseUrl    = process.env.TATAKAI_PROXY_URL || 'http://localhost:9001'

__tatakai_fetch__(url, init):
  hostname = new URL(url).hostname
  if hostname not in allowedDomains → throw PermissionDeniedError
  AbortController with 30 s timeout
  forward init.headers (Referer, User-Agent) unchanged
  on ECONNREFUSED/ENOTFOUND to proxy → throw ProxyUnavailableError
  on timeout → throw FetchTimeoutError
```

**`__tatakai_parse_html__` implementation**:

```
__tatakai_parse_html__(html):
  if not string or empty → throw InvalidInputError
  load cheerio, return CheerioLikeAPI adapter (find/first/attr/text/html/each)
```

**`__tatakai_anitomy__` implementation**:

```
__tatakai_anitomy__(filename):
  if not string or empty → throw InvalidInputError
  call anitomyscript(filename), return ParsedReleaseMetadata
```

All three implementations are serialised as strings into `workerData.helperCode` and `eval`'d inside the worker bootstrap before extension code runs, so they share the worker's Node.js `require` context.

### `electron.listInstalledExtensions` bridge

A new IPC handler on the `electron` context bridge:

```ts
electron.listInstalledExtensions(): Promise<Array<{
  id, name, version, type, capabilities: string[]
}>>
```

The `capabilities` array is populated from the manifest's `capabilities` field (a new optional string-array field added to `ExtensionManifest`) — Toko's manifest sets `["manga", "preview", "websiteIndex"]`.


---

## 2. Toko Extension Bundle and Build Flow (Req 2)

### Directory structure

```
extension/toko/
  manifest.json          — id, type:"custom", version, permissions, categories, capabilities
  README.md
  icon.png
  src/
    index.ts             — TokoBundleClass (default export)
    types.ts             — MangaChapterEntry, MangaPageEntry, PreviewResult, WebsiteIndexResult
    utils/
      quality.ts         — normalizeQuality(), detectSourceType()
      timeout.ts         — withProviderTimeout(promise, 15_000)
    providers/
      stream/            — one file per Direct_Stream_Provider
      torrent/           — one file per Torrent_Provider
      manga/             — one file per Manga_Provider
  build.ts               — esbuild bundle script; zips into toko.kai
```

### `TokoBundleClass` public API

| Method | Returns | Notes |
|---|---|---|
| `validate()` | `{ valid, reason? }` | Checks at least one provider initialised |
| `single(opts)` | `SourceResult[]` | Direct-stream only; torrent providers not called |
| `batch(opts)` | `SourceResult[]` | Direct-stream + torrent |
| `movie(opts)` | `SourceResult[]` | Direct-stream only, no episode constraint |
| `getLanguages(opts)` | `LanguageCapability[]` | Aggregated from direct-stream providers |
| `getMangaChapters(params)` | `MangaChapterEntry[]` | Merged + deduplicated by chapter number |
| `getMangaPages(params)` | `MangaPageEntry[]` | Throws `ChapterNotFoundError` if key unknown |
| `getPreviewSource(params)` | `PreviewResult \| null` | Returns null-source object never throws |
| `getWebsiteEpisodeIndex(params)` | `WebsiteIndexResult` | Returns count + episode list |

### Provider execution pattern

```ts
async function runProviders<T>(
  providers: Provider[],
  fn: (p: Provider) => Promise<T[]>,
): Promise<T[]> {
  const results = await Promise.allSettled(
    providers.map(p => withProviderTimeout(fn(p), 15_000))
  );
  return results
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => (r as PromiseFulfilledResult<T[]>).value);
}
```

### Build script (`build.ts`)

Uses `esbuild` to bundle `src/index.ts` → `dist/bundle.js` (CJS, no external deps except Node built-ins). Then uses `jszip` to produce `toko.kai` containing `manifest.json`, `bundle.js`, `README.md`, `icon.png`. Exits with code 1 if any required file is missing.

### Quality normalisation (`utils/quality.ts`)

```ts
const QUALITY_MAP: Record<string, Quality> = {
  '2160p': '2160p', '4k': '2160p', 'uhd': '2160p',
  '1080p': '1080p', 'fhd': '1080p',
  '720p': '720p', 'hd': '720p',
  '480p': '480p', 'sd': '480p',
  '360p': '360p',
};
function normalizeQuality(raw: string): Quality {
  return QUALITY_MAP[raw.toLowerCase()] ?? 'unknown';
}
function detectSourceType(url: string): 'hls' | 'mp4' | 'unknown' {
  if (url.endsWith('.m3u8') || url.includes('/hls/')) return 'hls';
  if (url.match(/\.(mp4|m4v|webm|mkv)$/i)) return 'mp4';
  return 'unknown';
}
```


---

## 3–5. Provider Coverage

### Direct-Stream Providers (Req 3)

Each adapter lives in `extension/toko/src/providers/stream/<name>.ts` and exports a `StreamProvider` implementing:

```ts
interface StreamProvider {
  name: string;
  single(opts: SourceOptions): Promise<SourceResult[]>;
  movie?(opts: SourceOptions): Promise<SourceResult[]>;
}
```

| Provider | Source | Domain(s) |
|---|---|---|
| `animepahe` | A1 port | animepahe.ru |
| `animeya` | A1 port | animeya.to |
| `toonstream` | A1 port | toonstream.co |
| `animelok` | A1 port | animelok.com |
| `watchanimeworld` | A1 port (watchaw/toonworld) | watchanimeworld.com |
| `desidub` | A1 port | desidubbed.in |
| `hindidubbed` | A1 port | hindidubbed.in |
| `aniworld` | A1 port | aniworld.to |
| `senshi` | A2 port | senshianime.com |
| `reanime` | A2 port | reanime.net |
| `4anime` | A2 port | 4anime.gg |
| `anikoto` | net-new | anikoto.to |
| `mkissa` | net-new | mkissa.com |
| `anizone` | net-new | anizone.to |
| `animesalt` | net-new | animesalt.com |

A1-port adapters call A1's internal provider modules via `__tatakai_fetch__` to the A1 base URL (injected as `TATAKAI_A1_BASE_URL` in `workerData`). A2-port adapters replicate the scraping logic from the A2 TypeScript scripts using `__tatakai_fetch__` and `__tatakai_parse_html__`.

### Torrent Providers (Req 4)

Each adapter lives in `extension/toko/src/providers/torrent/<name>.ts` and returns `sourceType: "torrent"` results. Torrent providers are **only** invoked in `batch()`.

| Provider | Source |
|---|---|
| `nyaa` | A2 port |
| `acgrip` | A2 port |
| `animetosho` | A2 port |
| `subplease` | A2 port |
| `seadex` | A2 port |
| `nekobt` | A2 port |
| `acgnx` | net-new |
| `aniliberty` | net-new |

### Manga Providers (Req 5)

Each adapter lives in `extension/toko/src/providers/manga/<name>.ts` and exports:

```ts
interface MangaProvider {
  name: string;
  getChapters(params: MangaChapterParams): Promise<RawChapterEntry[]>;
  getPages(chapterKey: string): Promise<MangaPageEntry[]>;
}
```

| Provider | Source |
|---|---|
| `allmanga` | A1 port |
| `atsu` | A1 port (atsu.moe) |
| `mangafire` | A1 port |
| `animesama` | A2 port |
| `asura` | A2 port |

**Chapter merge algorithm** (in `getMangaChapters`):
1. Run all providers with `runProviders`.
2. For each result entry, key by `chapter.number`.
3. If a key already exists, push the new `source` entry into the existing `sources` array.
4. Return sorted ascending by chapter number.

`chapterKey` format: `"<provider>:<providerChapterId>"`, making keys globally unique and parseable by `getMangaPages`.


---

## 6. A1 Server-Side Indexing and Preview Support (Req 6)

### New file: `extension/A1/src/routes/toko.ts`

Registered in `extension/A1/src/server.ts` as `app.route('/toko', tokoRouter)`.

#### `GET /toko/index/episodes`

Query params: `tatakaiId`, `anilistId`, `titles[]`

Logic:
1. Try direct-stream providers in priority order (animepahe → aniworld → senshi → …).
2. For the first provider that resolves the title, extract episode count and episode list `[{ number, title, aired }]`.
3. Return `{ provider, episodeCount, episodes }`.
4. If no provider resolves: return `{ provider: null, episodeCount: 0, episodes: [] }` with HTTP 200.

#### `GET /toko/index/chapters`

Query params: `anilistId`, `malId`, `title`

Logic: same pattern against manga providers. Returns `{ provider, chapterCount, chapters: [{ number, title, scanlator, releaseDate }] }`.

#### `GET /toko/preview`

Query params: `anilistId`, `titles[]`, `episode`

Logic:
1. Resolve a `SourceResult` from the first available direct-stream provider.
2. Calculate `previewTimestampSec`:
   ```ts
   const duration = episodeDurationSec ?? 1440;
   const lo = Math.floor(duration * 0.60);
   const hi = Math.floor(duration * 0.80);
   const previewTimestampSec = Math.floor(Math.random() * (hi - lo + 1)) + lo;
   ```
3. Return `{ provider, streamUrl, isHls, previewTimestampSec }`.
4. If no provider resolves: return `{ provider: null, streamUrl: null, isHls: false, previewTimestampSec }` (still calculated) with HTTP 200.


---

## 7. TatakaiAPI Preview and Index Routes (Req 7)

### New file: `TatakaiAPI/src/routes/toko.ts`

Registered in `TatakaiAPI/src/server.ts` under `v3.route('/toko', tokoRouter)`.

All three proxy routes share a helper:

```ts
async function proxyToA1(path: string, query: Record<string, string>, c: Context) {
  const url = new URL(path, env.A1_BASE_URL);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  } catch (err) {
    return c.json({ success: false, error: 'upstream_unavailable' }, 503);
  }
  if (!res.ok) {
    return c.json({ success: false, error: 'upstream_error', status: res.status }, 502);
  }
  return c.json(await res.json(), res.status);
}
```

Routes:
- `GET /toko/preview` → `proxyToA1('/toko/preview', ...)`
- `GET /toko/index/episodes` → `proxyToA1('/toko/index/episodes', ...)`
- `GET /toko/index/chapters` → `proxyToA1('/toko/index/chapters', ...)`

### `GET /api/v3/extensions/:id`

Added to `TatakaiAPI/src/routes/extensions.ts` (new handler below existing `/:id/status`):

```ts
ext.get('/:id', async (c) => {
  const row = await getManifestById(c.req.param('id'));
  if (!row || row.is_killed) {
    return c.json({ success: false, error: 'extension_not_found' }, 404);
  }
  return c.json(jsonOk({
    id: row.extension_id,
    name: row.name ?? null,
    type: row.type ?? null,
    version: row.version ?? null,
    categories: (row as any).categories ?? [],
    description: row.description ?? null,
    permissions: row.permissions ?? [],
    icon: (row as any).icon ?? null,
    banner: (row as any).banner ?? null,
    screenshots: (row as any).screenshots ?? [],
    versionHistory: (row as any).version_history ?? [],
  }));
});
```

### Dispatch ordering (Req 7.4 / Req 13.2)

In the dispatch route handler, after building `extensionsToTry` from `listApprovedManifests()`:

```ts
const TOKO_ID = 'tatakai.extension.toko';
const tokoIdx = extensionsToTry.findIndex(e => e.id === TOKO_ID);
if (tokoIdx > 0) {
  const [toko] = extensionsToTry.splice(tokoIdx, 1);
  extensionsToTry.unshift(toko);
}
```


---

## 8. Website-First Episode and Chapter Indexing (Req 8)

### New hook: `src/hooks/useWebsiteIndex.ts`

```ts
interface WebsiteIndexResult {
  episodeCount: number;
  episodes: { number: number; title?: string; aired?: string }[];
  provider: string | null;
}

function useWebsiteIndex(params: { anilistId: number; tatakaiId?: string; titles: string[] }) {
  // Page-scoped cache keyed by anilistId
  // Desktop: extension:invoke getWebsiteEpisodeIndex (10 s timeout)
  // Web: GET /api/v3/toko/index/episodes
  // On failure/timeout/zero count: return null silently
}
```

The hook stores results in a `useRef`-based `Map<number, WebsiteIndexResult>` that is cleared on unmount (not persisted to context or localStorage).

### Episode selector integration

In the anime watch page component that builds episode entries:

```ts
const index = useWebsiteIndex({ anilistId, tatakaiId, titles });
const episodeCount = (index?.episodeCount ?? 0) > anilistEpisodeCount
  ? index!.episodeCount
  : anilistEpisodeCount;
```

Entries from `1..episodeCount` are generated, preferring Website_Index `title` and `aired` fields when available, falling back to AniList data. Deduplication key is episode number.

### Manga chapter merge

The existing `mergeChaptersWithExtensions` in `manga-extension-runtime.ts` already merges by chapter number. The `getMangaChapters` IPC method (Req 12.3) feeds into this existing path, so the frontend merge logic is unchanged — Toko's chapters are treated as another extension source.


---

## 9. Anime Hover and Detail Preview (Req 9)

### New hook: `src/hooks/usePreviewSource.ts`

```ts
interface PreviewSource {
  streamUrl: string;
  isHls: boolean;
  previewTimestampSec: number;
  provider: string | null;
}

function usePreviewSource(anilistId: number, titles: string[], episode?: number): {
  source: PreviewSource | null;
  loading: boolean;
}
```

**Two-tier resolution logic:**
1. If `window.electron?.invokeExtension` is available: call `extension:invoke getPreviewSource` with 5 000 ms `AbortController` timeout.
2. If tier 1 returns `null`, throws, or times out: call `GET /api/v3/toko/preview` with 5 000 ms timeout.
3. Cache result in page-scoped `Map<anilistId, PreviewSource>` (ref, cleared on unmount).
4. Return null if both tiers fail.

**Hover timer:** `AnimeCardWithPreview`, `TrendingGrid`, and `LatestEpisodes` use `useRef<ReturnType<typeof setTimeout>>` for a 200 ms hover guard. `onMouseLeave` cancels the timer and calls `abortController.abort()`.

**HLS playback:** When `isHls` is true, attach `hls.js` with fixed config:

```ts
new Hls({ maxBufferLength: 8, lowLatencyMode: false })
```

Seeking to `previewTimestampSec` is done in the `canplay` or `seeked` event; if seek is not yet possible, play from 0 and seek on `loadedmetadata`.

### `VideoBackground` component

Uses the same `usePreviewSource` hook with the detail page's `anilistId`. The resolved stream is set as the `<video>` `src` (MP4) or attached via `hls.js` (M3U8). The existing gradient/vignette overlay CSS classes are applied unchanged.

### Unavailable state

When both tiers return null: `<video>` is not rendered; the existing `<img>` poster is shown with a `data-preview-unavailable` attribute (CSS can style as desired, no error text).


---

## 10. Manga Provider and Scanlator Categorization UI (Req 10)

### Provider chip state

In `MangaPage` (or its chapter-list child component), a new `selectedProvider` state is derived from the unique provider names in the merged chapter list:

```ts
const providers = useMemo(() =>
  [...new Set(chapters.flatMap(ch => ch.sources.map(s => s.provider)))],
  [chapters]
);
const [selectedProvider, setSelectedProvider] = useState<string>(providers[0] ?? '');
```

A chip/tab is rendered per unique provider. The first provider is selected by default.

### Filtered chapter rows

```ts
const visibleChapters = chapters.map(ch => ({
  ...ch,
  sources: ch.sources.filter(s => s.provider === selectedProvider),
})).filter(ch => ch.sources.length > 0);
```

When `visibleChapters` is empty, render an empty-state message rather than a blank list.

### Scanlator display

Per source entry: render `source.scanlator` if non-null and non-empty; otherwise render `source.provider`. The chapter `number` and `title` are always taken from the top-level chapter object (Website_Index-authoritative), not from the source entry.

### Publisher metadata

Rendered in a collapsible or sidebar section. Checks for `author`, `serialization`, `status` on the content detail response; the entire section is hidden (not empty-rendered) when all three are absent.

---

## 11. Extension Hub Marketplace Presentation (Req 11)

### `ExtensionManifest` type extension

```ts
interface ExtensionManifest {
  // existing fields...
  categories?: string[];    // new: ["Anime Stream","Torrent","Manga","Preview","Website-first Indexing"]
  banner?: string;          // new: base64 or URL
  capabilities?: string[];  // new: ["manga","preview","websiteIndex"]
}
```

### Category chip rendering

In `ExtensionHubPage` / `ExtensionDetailPage`: when `manifest.type === 'custom'`, display chips from `manifest.categories`. Fallback label: `"Unified Extension"` when `categories` is empty or absent.

### Detail page resilience

Each section (description, screenshots, changelog, permissions, banner) checks its data before rendering. Missing sections render a placeholder string (e.g. `"No description available"`), never `undefined`/blank.

### Installation + health-check flow

```
1. User clicks Install
2. Download .kai → parseKaiFile() with signature check
3. If signatureValid === false → abort, show error
4. installKaiExtension() → write to userData/extensions/tatakai.extension.toko/
5. Send reload-extensions IPC to main process
6. Poll runtime:health every 500 ms for up to 5 s
7. If loadedExtensions includes toko id → show "Installed vX.X.X"
8. If 5 s elapses without confirmation → show warning state "Installed (not loaded)"
```

---

## 12. Runtime IPC Methods for Preview and Index (Req 12)

### IPC handler changes in Electron main process

New `extension:invoke` cases (added to the existing `ipcMain.handle('extension:invoke', ...)` handler):

```
getPreviewSource   → toko.getPreviewSource(payload)
                     → { success: true, data: { provider, streamUrl, isHls, previewTimestampSec } }

getWebsiteEpisodeIndex → toko.getWebsiteEpisodeIndex(payload)
                         → { success: true, data: { provider, episodeCount, episodes } }

getMangaChapters   → toko.getMangaChapters(payload)
                     → { success: true, data: { provider, chapterCount, chapters } }
```

When `tatakai.extension.toko` is not in the registry for `getPreviewSource` or `getWebsiteEpisodeIndex`:
→ return `{ success: false, error: 'toko_not_loaded' }` (not generic not-found).

When Toko is loaded but no source resolves for `getPreviewSource`:
→ Toko's method returns `{ provider: null, streamUrl: null, isHls: false, previewTimestampSec: 0 }` (no throw).

`getMangaChapters` is added to the `capabilities` field of the Toko manifest entry returned by `listInstalledExtensions`.


---

## 13. Toko-First Source Ordering (Req 13)

### Desktop runtime (`runtime:resolve-sources`)

In the existing `ipcMain.handle('runtime:resolve-sources', ...)` handler:

```js
const TOKO_ID = 'tatakai.extension.toko';
// after building targetExtensionIds from payload or registry.listLoaded():
const idx = targetExtensionIds.indexOf(TOKO_ID);
if (idx > 0) {
  targetExtensionIds.splice(idx, 1);
  targetExtensionIds.unshift(TOKO_ID);
}
```

Both the `extensionIds` payload path and the full-loaded-list fallback path apply this re-ordering.

### Frontend `useCombinedSources`

When processing a `SourceResult` where the originating extension is `tatakai.extension.toko`:

```ts
providerName = result.source || 'Toko';
displayName  = result.source || 'Toko';
```

Never falls back to `"Local runtime"` — always uses the provider's own `source` field value.

---

## 14. Tests and Verification (Req 14)

### Test runner

Vitest (already configured in `extension/A1/vitest.config.ts`). New test files added under `tests/toko/`.

### Test file layout

```
tests/toko/
  worker-helpers.test.ts       — __tatakai_fetch__ permission/timeout/header tests
  parse-html.test.ts           — __tatakai_parse_html__ cheerio adapter tests
  anitomy.test.ts              — __tatakai_anitomy__ input validation tests
  providers/
    stream-adapter.test.ts     — each direct-stream adapter fixture tests
    torrent-adapter.test.ts    — torrent adapters + single() exclusion test
    manga-merge.test.ts        — two-provider chapter merge test
  preview-timestamp.test.ts    — property-based timestamp range test
  episode-override.test.ts     — override count display tests
  preview-card.test.ts         — AnimeCardWithPreview unavailable state test
  manga-pages-roundtrip.test.ts — getMangaPages() roundtrip test
```

### Key test cases

**Worker helpers:**
- `__tatakai_fetch__` throws `PermissionDeniedError` for non-allowlisted hostname (mock HTTP client).
- `__tatakai_fetch__` forwards request to mock for allowlisted domain with correct headers.
- `__tatakai_parse_html__('')` throws `InvalidInputError`.
- `__tatakai_parse_html__('<h1>Hi</h1>').find('h1').text()` returns `'Hi'`.

**Preview timestamp (property-based):**
```ts
fc.assert(fc.property(
  fc.integer({ min: 600, max: 3600 }),
  (duration) => {
    const ts = calcPreviewTimestamp(duration);
    return ts >= Math.floor(duration * 0.60) && ts <= Math.floor(duration * 0.80);
  }
));
```

**Episode override:**
- Toko returns `episodeCount: 26`, AniList returns `24` → selector shows 26 entries.
- Toko returns `episodeCount: 0` → selector shows AniList's 24 entries.

**Manga merge:**
- Two providers each return chapter 42 → exactly one top-level object with chapter number 42 and two `sources` entries.

**Preview unavailable:**
- Render `AnimeCardWithPreview` with mock resolver that rejects → `<img>` present, no `<video>` element, no element with error-state class.

---

## Data Flow Diagrams

### Preview hover flow

```
hover >200ms
  → usePreviewSource.startResolve()
      → tier1: extension:invoke getPreviewSource (5s timeout)
          success → cache + attach video
          fail/null → tier2: GET /api/v3/toko/preview (5s timeout)
              success → cache + attach video
              fail → show poster with data-preview-unavailable
mouseLeave (before resolve)
  → clearTimeout(hoverTimer)
  → abortController.abort()
  → no video attached
```

### Episode count resolution flow

```
watch page mounts
  → useWebsiteIndex({ anilistId, titles })
      desktop? → extension:invoke getWebsiteEpisodeIndex (10s)
      web?     → GET /api/v3/toko/index/episodes
      result.episodeCount > anilistCount
          → use result.episodeCount as override
      failure/0/null
          → use anilistCount silently
```

---

## File Change Summary

| File | Change type |
|---|---|
| `desktop/runtime/extension/extension-worker-pool.cjs` | Modify — implement helper bodies |
| `desktop/runtime/extension/extension-sandbox.cjs` | Modify — export `extractAllowedDomains` for reuse |
| `src/core/extensions/sdk/types.ts` | Modify — add `categories`, `capabilities` to `ExtensionManifest` |
| `extension/toko/` | New — entire directory |
| `extension/A1/src/routes/toko.ts` | New |
| `extension/A1/src/server.ts` | Modify — register toko router |
| `TatakaiAPI/src/routes/toko.ts` | New |
| `TatakaiAPI/src/server.ts` | Modify — register toko router under v3 |
| `TatakaiAPI/src/routes/extensions.ts` | Modify — add `GET /:id` route |
| `TatakaiAPI/src/routes/playback.ts` | Modify — Toko-first dispatch ordering |
| `src/hooks/usePreviewSource.ts` | New |
| `src/hooks/useWebsiteIndex.ts` | New |
| `src/components/anime/AnimeCardWithPreview.tsx` | Modify — integrate usePreviewSource |
| `src/components/anime/TrendingGrid.tsx` | Modify — integrate usePreviewSource |
| `src/components/anime/LatestEpisodes.tsx` | Modify — integrate usePreviewSource |
| `src/components/anime/VideoBackground.tsx` | Modify — integrate usePreviewSource |
| `src/components/manga/MangaPage.tsx` | Modify — provider chips, scanlator UI |
| `src/components/extensions/ExtensionHubPage.tsx` | Modify — custom type categories, health check |
| `src/components/extensions/ExtensionDetailPage.tsx` | Modify — placeholder resilience |
| `src/core/content/manga-extension-runtime.ts` | Modify — listInstalledExtensions filter update |
| `tests/toko/` | New — all test files |
