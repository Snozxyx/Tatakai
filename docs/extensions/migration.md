# Migration Guide

Changes for existing extensions migrating to the current extension system.

---

## Major Changes

### 1. Priority Replaces Hardcoded Leader Ordering

**Old:** Single "leader" extension hardcoded in source resolution.

**New:** `manifest.priority` (number, default 100). Extensions consulted in ascending priority order.

```json
// Old: implicit leader
// New: explicit priority
{
  "priority": 0    // Primary extension (like bundled Toko)
}
{
  "priority": 50   // High-priority community
}
{
  "priority": 100  // Default
}
```

**Migration:** Add `priority` to manifest. Lower = earlier in resolution.

---

### 2. Preview & WebsiteIndex Are Now Capability-Gated

**Old:** Hardcoded to specific extension.

**New:** Generic capability system — any extension declaring `preview` or `websiteIndex` capability participates.

```json
// Old: implicit
// New: explicit capabilities
{
  "capabilities": ["preview", "websiteIndex"],
  "apiServer": {
    "routes": ["stream", "website"]  // Must declare routes
  }
}
```

**Migration:** Add capabilities to manifest, ensure `apiServer.routes` includes `stream` and/or `website`.

---

### 3. Custom Sources Are Fully Isolated

**Old:** Custom sources partially integrated with watchlist/readlist.

**New:** Complete isolation — separate routes (`/x/<ns>/<id>/...`), separate React Query keys, separate progress storage.

**Migration:** 
- Ensure `customSources[]` in manifest
- Bundle implements `custom-source-v1` contract
- Don't call media-list mutations from custom source UI

---

### 4. Renderer Contributions Require Trust

**Old:** All installed extensions could contribute React UI.

**New:** Code-driven contributions (pages, slots, services, modules, code analytics) only load for **trusted extensions**.

**Migration:**
- Bundled extensions: automatically trusted
- Sideloaded: mark as trusted in Extension Hub UI, or user explicitly trusts
- Data-driven (themes, analytics, custom sources) still work for all

---

### 5. Manifest Fields Cleaned Up

**Removed/Ignored:**
- `signature` — legacy signing
- `signedBy` — legacy signing  
- `sideloaded` — legacy metadata

**Added:**
- `capabilities` — string[] for IPC discovery
- `priority` — number for ordering
- `categories` — string[] for hub display chips
- `browserDomains` — for Seanime browser sessions

---

## Contract Versions

| Contract | Version | Description |
|----------|---------|-------------|
| Streaming sources | `streaming-sources-v3` | Anime sources (sourcesAll, streamAll, torrentAll) |
| Manga | `streaming-sources-v3` | Same host, manga routes |
| Novel | `streaming-sources-v3` | Same host, novel routes |
| Custom source | `custom-source-v1` | Isolated verticals |

**Bundle must declare contract in `apiServer.contract`.**

---

## Bundle Method Changes

### Sources (Anime)

| Old | New | Notes |
|-----|-----|-------|
| `sources(opts)` | `sourcesAll(opts, onChunk)` | Progressive SSE |
| `single(opts)` | `single(opts)` | Fallback |
| `batch(opts)` | `batch(opts)` | Fallback aggregate |
| N/A | `streamAll(opts, onChunk)` | Stream-only |
| N/A | `torrentAll(opts, onChunk)` | Torrent-only |
| N/A | `runProvider(name, opts)` | Per-provider debugging |
| N/A | `listProviders()` | Provider inventory |

### Manga

| Old | New | Notes |
|-----|-----|-------|
| `getChapters(params)` | `getMangaChapters(params)` | Returns MangaChapterEntry[] |
| N/A | `debugMangaChapters(params)` | With diagnostics |
| `getPages(params)` | `getMangaPages(params)` | Returns pages with headers |

### Novel

| Old | New | Notes |
|-----|-----|-------|
| N/A | `getNovelChapters(params)` | Returns NovelChapterEntry[] |
| N/A | `getNovelContent(params)` | Returns chapter content |

### Custom Source

| Old | New | Notes |
|-----|-----|-------|
| N/A | `customHome(sourceId)` | Home sections + filters |
| N/A | `customSearch(sourceId, query, page, filters)` | Search with filter schema |
| N/A | `customInfo(sourceId, id)` | Detail + entries |
| N/A | `customWatch(sourceId, id, episodeId)` | Returns SourceResult[] |
| N/A | `customRead(sourceId, id, chapterId)` | Returns page images |

---

## IPC Changes

### `electron.listInstalledExtensions`

**New return shape:**
```ts
interface InstalledRow {
  id: string;
  name?: string;
  version?: string;
  type?: string;
  capabilities: string[];           // NEW: from manifest.capabilities
  apiServer?: ExtensionApiServer;   // NEW: full apiServer object
  customSources?: CustomSourceDescriptor[]; // NEW
  contributes?: ExtensionContributions;     // NEW: themes, analytics, rendererEntry
  sideloaded?: boolean;
  signature?: string;
  priority: number;                 // NEW: default 100
}
```

### `runtime:get-api-base`

**Returns:**
```ts
{
  baseUrl: string;                    // e.g. "http://127.0.0.1:49152"
  namespaces: [{
    namespace: string;
    extensionId: string;
    contract: string;
    routes: string[];
    providerRoutes: string[];
    capabilities: string[];
    customSources: CustomSourceDescriptor[];
    customRoutes: string[];
  }];
}
```

---

## Renderer Loader Changes

### ExtensionContext

```ts
// Old: limited context
// New: full capability context
interface ExtensionContext {
  registry: ExtensionRegistry;      // Full registry API
  analytics: AnalyticsService;      // Register code analytics
  navigate: (path: string) => void; // Router navigation
  storage: ScopedStorage;           // Namespaced localStorage
  fetch: typeof fetch;              // Proxied fetch
  log: (...args) => void;           // Namespaced console
  extensionId: string;
  React: typeof React;              // App's React instance (CRITICAL)
}
```

### Activation

```ts
// Old: activate()
// New: activate(ctx) or default(ctx)
export async function activate(ctx) { ... }
// OR
export default async function activate(ctx) { ... }

// Return dispose function for cleanup
return () => { /* cleanup */ };
```

---

## Compatibility Layer

For extensions from other ecosystems:

| Ecosystem | Status | Migration Path |
|-----------|--------|----------------|
| **Stremio** | ✅ Supported | HTTP/JSON addon — no changes needed |
| **Seanime** | 🚧 Partial | JS/TS providers → compatibility VM |
| **Mihon** | 🚧 Preview | Source mapping → native extension |
| **Aniyomi** | 🚧 Preview | Source mapping → native extension |
| **CloudStream** | 🚧 Preview | Source mapping → native extension |
| **Sora** | 🚧 Preview | Interpreter → native extension |

See `src/core/extensions/compatibility/` for implementation.

---

## Testing Migration

### Checklist

- [ ] `manifest.priority` set appropriately
- [ ] `manifest.capabilities` declares all used capabilities
- [ ] `apiServer.routes` includes all needed route families
- [ ] Bundle implements `sourcesAll` (progressive) for anime sources
- [ ] Bundle implements `getMangaChapters`/`getMangaPages` for manga
- [ ] Bundle implements `getNovelChapters`/`getNovelContent` for novels
- [ ] Custom sources use `custom-source-v1` contract
- [ ] Renderer bundle uses `ctx.React` (not bundled React)
- [ ] Data-driven contributions work without trust
- [ ] Code-driven contributions work with trust
- [ ] `electron.listInstalledExtensions` returns expected shape
- [ ] `runtime:get-api-base` returns correct namespaces

---

## Breaking Changes Summary

| Change | Impact | Effort |
|--------|--------|--------|
| Priority system | Low | Add one field |
| Capability gating | Medium | Add capabilities, verify routes |
| Custom source isolation | Medium | Verify separate state/UI |
| Trust-gated renderer | High (for UI extensions) | Ensure trust status |
| Manifest cleanup | Low | Remove legacy fields |
| New bundle methods | Medium | Implement progressive APIs |

---

## Related

- [Extension Overview](extensions/overview.md)
- [Manifest Reference](extensions/manifest.md)
- [Capabilities](extensions/capabilities/)
- [Renderer Loader](extensions/renderer-loader.md)