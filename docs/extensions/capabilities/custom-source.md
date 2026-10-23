# Custom Source Capability

A **custom source** (`capabilities: ["custom-source"]`, `customSources[]`) is a **self-contained read/watch vertical**. It is **never** integrated with the anime watchlist or manga readlist. Its content is addressed by `(namespace, sourceId)` and rendered by app-owned generic pages under `/x/:namespace/:sourceId/...`. State lives under separate React Query keys (`['custom', ...]`) and never calls the media-list mutations.

---

## Capability Declaration

```json
{
  "capabilities": ["custom-source"],
  "customSources": [
    {
      "id": "webtoon-xyz",
      "name": "Webtoon XYZ",
      "kind": "read",
      "description": "Korean webtoons from Webtoon XYZ",
      "icon": "data:image/png;base64,...",
      "language": "ko",
      "providerGroup": "webtoon-xyz",
      "catalogMediaType": "manga"
    },
    {
      "id": "anime-stream-xyz",
      "name": "Anime Stream XYZ",
      "kind": "watch",
      "description": "Anime streaming from Anime Stream XYZ",
      "icon": "data:image/png;base64,...",
      "language": "ja",
      "providerGroup": "anime-stream-xyz",
      "catalogMediaType": "anime"
    }
  ],
  "apiServer": {
    "namespace": "customxyz",
    "contract": "custom-source-v1",
    "routes": ["custom/home", "custom/search", "custom/info", "custom/watch", "custom/read"],
    "healthPath": "/health"
  }
}
```

---

## Contract: `custom-source-v1`

Bundle implements these methods:

| Method | Purpose | Route |
|--------|---------|-------|
| `customHome(sourceId)` | Home page sections | `GET /api/v3/<ns>/custom/home` |
| `customSearch(sourceId, query, page?, filters?)` | Search results | `GET /api/v3/<ns>/custom/search` |
| `customInfo(sourceId, id)` | Detail page (episodes/chapters) | `GET /api/v3/<ns>/custom/info` |
| `customWatch(sourceId, id, episodeId)` | Watch sources (kind=watch) | `GET /api/v3/<ns>/custom/watch` |
| `customRead(sourceId, id, chapterId)` | Read pages (kind=read) | `GET /api/v3/<ns>/custom/read` |

---

## Data Contracts

### CustomMediaCard (Home/Search Grid)

```ts
interface CustomMediaCard {
  nsfw?: boolean;
  isAdult?: boolean;
  genres?: string[];
  id: string;                    // Stable ID for info/watch/read
  title: string;
  image?: string;                // Cover URL
  subtitle?: string;             // Secondary line ("Ep 12", "Ongoing")
  badge?: string;                // Corner badge ("HD", "NEW")
}
```

### CustomHomeSection

```ts
interface CustomHomeSection {
  title: string;
  items: CustomMediaCard[];
}
```

### CustomHomeResult

```ts
interface CustomHomeResult {
  sections: CustomHomeSection[];
  filters?: CustomFilterSchema;  // Optional declarative filter UI
}
```

### CustomFilterSchema

```ts
interface CustomFilterOption {
  value: string;
  label: string;
}

interface CustomFilterGroup {
  key: string;                   // Sent back in CustomSearchFilters
  label: string;
  options: CustomFilterOption[];
}

interface CustomFilterSchema {
  tags?: string[];               // Multi-select chips
  groups?: CustomFilterGroup[];  // Single-select dropdowns
}
```

### CustomSearchFilters (User Selection)

```ts
interface CustomSearchFilters {
  tags?: string[];               // Selected tag chips
  [groupKey: string]: string | string[] | undefined; // Selected dropdown values
}
```

### CustomSearchResult

```ts
interface CustomSearchResult {
  results: CustomMediaCard[];
  hasNextPage?: boolean;
}
```

### CustomInfoEntry (Episode/Chapter List)

```ts
interface CustomInfoEntry {
  id: string;                    // Stable ID for watch/read
  label: string;                 // Display ("Episode 1", "Chapter 12")
  number?: number;               // Numeric ordinal
}
```

### CustomInfoResult

```ts
interface CustomInfoResult {
  id: string;
  title: string;
  image?: string;
  description?: string;
  catalogIds?: {                 // Verified catalogue references
    anilist?: number | string;
    mal?: number | string;
  };
  banner?: string;
  meta?: Record<string, string>; // Freeform header metadata
  entries: CustomInfoEntry[];    // Episodes (watch) or chapters (read)
}
```

### CustomWatchResult (kind=watch)

```ts
interface CustomWatchResult {
  sources: SourceResult[];       // Reuses anime SourceResult!
}
```

### CustomReadPageImage (kind=read)

```ts
interface CustomReadPageImage {
  pageNumber: number;
  imageUrl: string;
  headers?: Record<string, string>; // Referer/Origin for CDN
}
```

### CustomReadResult (kind=read)

```ts
interface CustomReadResult {
  pages: CustomReadPageImage[];
}
```

---

## Host Routes

| Route | Method | Params | Response |
|-------|--------|--------|----------|
| `GET /api/v3/<ns>/custom/home` | `customHome(sourceId)` | `sourceId` | `CustomHomeResult` |
| `GET /api/v3/<ns>/custom/search` | `customSearch(sourceId, query, page, filters)` | `sourceId, q, page, filters` | `CustomSearchResult` |
| `GET /api/v3/<ns>/custom/info` | `customInfo(sourceId, id)` | `sourceId, id` | `CustomInfoResult` |
| `GET /api/v3/<ns>/custom/watch` | `customWatch(sourceId, id, episodeId)` | `sourceId, id, episodeId` | `CustomWatchResult` |
| `GET /api/v3/<ns>/custom/read` | `customRead(sourceId, id, chapterId)` | `sourceId, id, chapterId` | `CustomReadResult` |

---

## Renderer Integration

### Generic Pages (App-Owned)

- `/x/:namespace/:sourceId` → Home (sections + filters)
- `/x/:namespace/:sourceId/search?q=...` → Search results
- `/x/:namespace/:sourceId/info/:id` → Detail (episodes/chapters list)
- `/x/:namespace/:sourceId/watch/:id/:episodeId` → VideoPlayer (uses `SourceResult[]`)
- `/x/:namespace/:sourceId/read/:id/:chapterId` → MangaReader (uses page images)

### Discovery

```ts
// List all custom sources across all extensions
import { listAllCustomSources } from '@/core/content/custom-source-runtime';

const sources = await listAllCustomSources();
// Returns: CustomSourceEntry[] with { namespace, extensionId, ...descriptor }
```

### State Isolation

- **React Query keys:** `['custom', namespace, sourceId, ...]` — never `['anime', ...]` or `['manga', ...]`
- **Progress:** Stored separately (not in `watch_progress` or `read_progress` tables)
- **Catalogue links:** Optional `catalogIds` in `CustomInfoResult` for verified AniList/MAL links (UI only, not for list sync)

---

## Proxy & Playback

- `customWatch` returns `SourceResult[]` → goes through **same `applyProxy` pipeline** as anime sources
- `customRead` page images → proxied via `localProxy.registerSource()` with headers
- **Headers required** for CDN Referer/Origin validation (same as anime/manga)

---

## Offline Support

Custom sources support offline via the same download manager:
- `kind=watch` → Download episodes (HLS/MP4/torrent)
- `kind=read` → Download chapter images
- Progress tracked in `downloads` table with `source_id` = `${namespace}::${sourceId}`

---

## Testing Checklist

- [ ] `customHome` returns sections with `CustomMediaCard[]`
- [ ] `customSearch` supports `query`, `page`, `filters` (tags + groups)
- [ ] `customInfo` returns `entries` with `id`, `label`, `number`
- [ ] `catalogIds` populated for verified catalogue links
- [ ] `customWatch` returns valid `SourceResult[]` (with headers, subtitles)
- [ ] `customRead` returns pages with `imageUrl` and `headers`
- [ ] Filter schema (`CustomFilterSchema`) rendered correctly in UI
- [ ] NSFW flag respected (hidden unless mature content enabled)
- [ ] `providerGroup` groups language variants in sidebar
- [ ] Offline downloads work for both kinds

---

## Minimal Example

### Manifest
```json
{
  "id": "tatakai.extension.mycustom",
  "name": "My Custom Source",
  "version": "1.0.0",
  "type": "custom",
  "capabilities": ["custom-source"],
  "customSources": [
    { "id": "mywebtoon", "name": "My Webtoon", "kind": "read", "language": "ko" }
  ],
  "apiServer": {
    "namespace": "mycustom",
    "contract": "custom-source-v1",
    "routes": ["custom/home", "custom/search", "custom/info", "custom/read"]
  }
}
```

### Bundle (custom-source-v1)
```js
class MyCustomSource {
  async customHome(sourceId) {
    return {
      sections: [{ title: "Popular", items: [{ id: "1", title: "Tower of God", image: "..." }] }],
      filters: { tags: ["Action", "Fantasy"], groups: [{ key: "status", label: "Status", options: [{ value: "ongoing", label: "Ongoing" }, { value: "completed", label: "Completed" }] }] }
    };
  }

  async customSearch(sourceId, query, page = 1, filters = {}) {
    return { results: [...], hasNextPage: true };
  }

  async customInfo(sourceId, id) {
    return { id, title: "Tower of God", entries: [{ id: "ep1", label: "Chapter 1", number: 1 }] };
  }

  async customRead(sourceId, id, chapterId) {
    return { pages: [{ pageNumber: 1, imageUrl: "https://...", headers: { Referer: "https://..." } }] };
  }
}
module.exports = new MyCustomSource();
```

---

## Related

- [Extension Overview](extensions/overview.md)
- [Anime Sources](extensions/capabilities/sources.md)
- [Manga Capability](extensions/capabilities/manga.md)
- [Renderer Loader](extensions/renderer-loader.md)