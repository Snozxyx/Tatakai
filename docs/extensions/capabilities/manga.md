# Manga Capability

Manga chapters/pages via extension bundles. Primary transport is the in-app extension-API host over HTTP — the same host that serves anime sources — so manga works for ANY sideloaded extension whose manifest declares `capabilities: ["manga"]`. Multiple extensions answer concurrently; results are merged by chapter number.

---

## Capability Declaration

```json
{
  "capabilities": ["manga", "chapters"],
  "apiServer": {
    "namespace": "mangadex",
    "contract": "streaming-sources-v3",
    "routes": ["manga/chapters", "manga/pages"],
    "healthPath": "/health"
  }
}
```

**Routes (ungated — always reachable, 501 if method absent):**
- `GET /api/v3/<ns>/manga/chapters` — Flat chapter rows
- `GET /api/v3/<ns>/manga/pages` — Page images for a chapter

---

## Bundle Methods

```ts
// Required for manga support
getMangaChapters(params: MangaChapterParams): Promise<MangaChapterEntry[]>

// Optional: debug variant with per-sub-provider diagnostics
debugMangaChapters(params: MangaChapterParams): Promise<{
  results: MangaChapterEntry[];
  diagnostics: ProviderDiagnostic[];
}>

// Required for reading
getMangaPages(params: MangaPagesParams): Promise<MangaPageResult>
```

---

## Request Parameters

### MangaChapterParams

```ts
interface MangaChapterParams {
  anilistId?: number;     // AniList media ID
  malId?: number;         // MyAnimeList ID
  title?: string;         // Single title
  titles?: string[];      // Multiple titles (for fuzzy search)
}
```

**No AniList pre-fetch here** — the bundle's internal `enrichMangaParams` does that once.

### MangaPagesParams

```ts
interface MangaPagesParams {
  chapterKey: string;          // Composite key from chapter row
  providerChapterId?: string;  // Provider-specific chapter ID
}
```

---

## Response Shapes

### MangaChapterEntry (Bundle → Host)

```ts
interface MangaChapterEntry {
  number: number;              // Chapter number
  title?: string | null;       // Chapter title
  volume?: number | null;      // Volume number
  sources: MangaChapterSource[]; // One per sub-provider
}
```

### MangaChapterSource

```ts
interface MangaChapterSource {
  provider: string;            // SUB-PROVIDER name (e.g. "mangadex", "allmanga")
  providerName?: string;       // Display name
  chapterKey: string;          // Composite key for pages request
  providerChapterId: string;   // Provider's chapter ID
  language?: string | null;    // BCP-47
  scanlator?: string | null;   // Scanlation group
  releaseDate?: string | null; // ISO 8601
}
```

### Flattened Chapter Row (Host → Renderer)

The host flattens nested entries into one row per (chapter, sub-provider):

```ts
interface MappedMangaChapter {
  number: number;
  title?: string | null;
  volume?: number | null;
  provider: string;            // SUB-PROVIDER name
  providerName?: string;
  chapterKey: string;          // Round-trips through reader URL
  providerChapterId: string;
  language?: string | null;
  scanlator?: string | null;
  releaseDate?: string | null;
}
```

**Sub-provider → namespace mapping:** The renderer maps `provider` (sub-provider name) to owning namespace via a lazy map populated during chapter fetches.

### MangaPageResult

```ts
interface MangaPageResult {
  pages: MangaPageImage[];
}

interface MangaPageImage {
  pageNumber: number;
  imageUrl: string;
  headers?: Record<string, string>;  // Referer/Origin for CDN
  width?: number;
  height?: number;
}
```

**Proxy:** Each page image is registered with the local proxy so CDN Referer/Origin headers are replayed during load. Returns `proxiedImageUrl` for the renderer. **Never cached** — proxy tokens expire in ~15 minutes.

---

## Host Response (GET /api/v3/<ns>/manga/chapters)

```json
{
  "namespace": "mangadex",
  "provider": "mangadex",
  "count": 150,
  "chapters": [
    {
      "number": 1,
      "title": "Chapter 1",
      "volume": 1,
      "provider": "mangadex",
      "providerName": "MangaDex",
      "chapterKey": "mangadex:ch-123",
      "providerChapterId": "ch-123",
      "language": "en",
      "scanlator": "Official",
      "releaseDate": "2024-01-15T00:00:00Z"
    }
  ],
  "providerStatus": [
    { "provider": "mangadex", "status": "ok", "resultCount": 150, "durationMs": 1200 }
  ],
  "cached": false,
  "fetchedAt": "2024-01-20T12:00:00Z"
}
```

---

## Host Response (GET /api/v3/<ns>/manga/pages)

```json
{
  "namespace": "mangadex",
  "count": 20,
  "pages": [
    {
      "pageNumber": 1,
      "imageUrl": "https://proxy.local/token/abc123",
      "proxiedImageUrl": "https://proxy.local/token/abc123",
      "headers": { "Referer": "https://mangadex.org/" },
      "width": 800,
      "height": 1200
    }
  ],
  "cached": false,
  "fetchedAt": "2024-01-20T12:00:00Z"
}
```

---

## Renderer Bridge (manga-extension-runtime.ts)

Primary transport: HTTP to extension-API host. IPC (`invokeExtension`) as fallback for early-launch race.

```ts
// Fan out to ALL manga-capable namespaces concurrently
const namespaces = mangaNamespaces(base.namespaces || []);

// Merge results by chapter number
const byNumber = new Map<number, MappedMangaChapter>();
for (const ns of namespaces) {
  const res = await fetch(`${baseUrl}/api/v3/${ns.namespace}/manga/chapters?...`);
  for (const row of res.chapters) {
    mergeRow(byNumber, row, ns.namespace);
  }
}
```

**Merge logic:** One row per (number, provider). Sub-provider name maps to namespace for pages request.

---

## Caching

| Endpoint | TTL | Cache Key |
|----------|-----|-----------|
| `manga/chapters` | 30 min | `manga-chapters:namespace:anilistId:malId:title:titles` |
| `manga/pages` | Never | N/A (proxy tokens expire) |

**Bypass:** `?refresh=1` or `?nocache=1`

---

## Testing Checklist

- [ ] `getMangaChapters` returns `MangaChapterEntry[]` with `sources` array
- [ ] Each source has `provider` (sub-provider name), `chapterKey`, `providerChapterId`
- [ ] `language` set (BCP-47)
- [ ] `scanlator` and `releaseDate` when available
- [ ] `getMangaPages` returns pages with `imageUrl` and `headers`
- [ ] `debugMangaChapters` implemented for per-provider diagnostics
- [ ] Handles missing `anilistId`/`malId` (falls back to `title`/`titles`)
- [ ] Chapter numbers are numeric, positive
- [ ] Volume numbers when applicable

---

## Related

- [Extension Overview](extensions/overview.md)
- [Anime Sources](extensions/capabilities/sources.md)
- [Novel Capability](extensions/capabilities/novels.md)
- [Custom Source](extensions/capabilities/custom-source.md)