# Novel Capability

Novel chapters/content via extension bundles. Primary transport is the in-app extension-API host over HTTP (same host that serves manga chapters), so novels work for extensions whose manifest declares `capabilities: ["novel"]`.

---

## Capability Declaration

```json
{
  "capabilities": ["novel"],
  "apiServer": {
    "namespace": "toko",
    "contract": "streaming-sources-v3",
    "routes": ["novel/chapters", "novel/content"],
    "healthPath": "/health"
  }
}
```

**Routes (ungated — always reachable, 501 if method absent):**
- `GET /api/v3/<ns>/novel/chapters` — Chapter list for a novel
- `GET /api/v3/<ns>/novel/content` — Chapter text content

---

## Bundle Methods

```ts
// Required for novel support
getNovelChapters(params: NovelChapterParams): Promise<NovelChapterEntry[]>

// Required for reading
getNovelContent(params: NovelContentParams): Promise<NovelContentResult>
```

---

## Request Parameters

### NovelChapterParams

```ts
interface NovelChapterParams {
  anilistId?: number;      // AniList media ID (for anime-adapted novels)
  malId?: number;          // MyAnimeList ID
  mangabakaId?: number;    // MangaBaka ID
  title?: string;          // Single title
  titles?: string[];       // Multiple titles
  fullScan?: boolean;      // Whether to fetch all chapters (vs incremental)
}
```

### NovelContentParams

```ts
interface NovelContentParams {
  chapterKey: string;           // Composite key from chapter list
  providerChapterId?: string;   // Provider-specific chapter ID
}
```

---

## Response Shapes

### NovelChapterEntry (Bundle → Host)

```ts
interface NovelChapterEntry {
  number: number;              // Chapter number
  title?: string | null;       // Chapter title
  volume?: number | null;      // Volume number
  sources: NovelChapterSource[]; // One per sub-provider/translator
}
```

### NovelChapterSource

```ts
interface NovelChapterSource {
  provider: string;            // SUB-PROVIDER name (e.g. "novelfull", "royalroad")
  providerName?: string;       // Display name
  chapterKey: string;          // Composite key for content request
  providerChapterId: string;   // Provider's chapter ID
  language?: string | null;    // BCP-47
  translator?: string | null;  // Translator/group
  releaseDate?: string | null; // ISO 8601
}
```

### Flattened Chapter Aggregate (Host → Renderer)

```ts
interface NovelChapterAggregate {
  number: number;
  title?: string | null;
  volume?: number | null;
  sources: NovelChapterSource[];
}
```

### NovelContentResult

```ts
interface NovelContentResult {
  content: string;             // HTML or plain text content
  nextChapterKey?: string;     // For preloading
  prevChapterKey?: string;
}
```

---

## Host Response (GET /api/v3/<ns>/novel/chapters)

```json
{
  "namespace": "toko",
  "provider": "toko",
  "pending": false,
  "chapters": [
    {
      "number": 1,
      "title": "Prologue",
      "volume": 1,
      "sources": [
        {
          "provider": "novelfull",
          "providerName": "NovelFull",
          "chapterKey": "novelfull:ch-1",
          "providerChapterId": "ch-1",
          "language": "en",
          "translator": "Official",
          "releaseDate": "2023-06-15T00:00:00Z"
        }
      ]
    }
  ],
  "providersAvailable": ["novelfull", "royalroad"],
  "failedProviders": [],
  "cached": false,
  "fetchedAt": "2024-01-20T12:00:00Z"
}
```

---

## Host Response (GET /api/v3/<ns>/novel/content)

```json
{
  "namespace": "toko",
  "chapterKey": "novelfull:ch-1",
  "content": "<p>It was a dark and stormy night...</p>",
  "nextChapterKey": "novelfull:ch-2",
  "prevChapterKey": null,
  "cached": false,
  "fetchedAt": "2024-01-20T12:00:00Z"
}
```

---

## Renderer Bridge (novel-extension-runtime.ts)

Similar to manga runtime — fans out to all novel-capable namespaces, merges by chapter number.

```ts
const namespaces = novelNamespaces(base.namespaces || []);

// Merge by chapter number, deduplicate by provider
const byNumber = new Map<number, NovelChapterAggregate>();
for (const ns of namespaces) {
  const res = await fetch(`${baseUrl}/api/v3/${ns.namespace}/novel/chapters?...`);
  for (const agg of res.chapters) {
    mergeRows(byNumber, agg, ns.namespace);
  }
}
```

**Sub-provider → namespace mapping:** Same lazy map pattern as manga for content requests.

---

## Caching

| Endpoint | TTL | Cache Key |
|----------|-----|-----------|
| `novel/chapters` | 30 min | Based on anilistId/malId/mangabakaId + titles |
| `novel/content` | Never | N/A (content fetched per-read) |

**Bypass:** `?refresh=1` or `?nocache=1`

---

## TTS Integration

Novel content flows to the **NovelReader** component which supports 5 TTS engines:
- **System TTS** — Device built-in
- **KittenTTS** — On-device model (desktop via Python daemon)
- **OpenAI** — API-based
- **ElevenLabs** — API-based
- **Local Server** — OpenAI-compatible endpoints

The extension only provides chapter text; TTS is handled by the app.

---

## Testing Checklist

- [ ] `getNovelChapters` returns `NovelChapterEntry[]` with `sources` array
- [ ] Each source has `provider`, `chapterKey`, `providerChapterId`
- [ ] `language` and `translator` set when available
- [ ] `getNovelContent` returns `content` (HTML or plain text)
- [ ] Handles `fullScan` parameter for initial load
- [ ] Chapter numbers are numeric, positive
- [ ] Volume numbers when applicable
- [ ] Content includes proper paragraph structure for TTS

---

## Related

- [Extension Overview](extensions/overview.md)
- [Anime Sources](extensions/capabilities/sources.md)
- [Manga Capability](extensions/capabilities/manga.md)
- [Custom Source](extensions/capabilities/custom-source.md)