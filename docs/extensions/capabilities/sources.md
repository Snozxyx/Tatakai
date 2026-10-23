# Anime Streaming Sources Capability

Anime streaming is the original data-driven capability. An extension provides playable `SourceResult`s for an episode; the app's VideoPlayer consumes them.

---

## Capabilities & Roles

| Capability | Role | Host Method Group | Routes |
|------------|------|-------------------|--------|
| `sources` | Resolve all provider search / episode lists | `sourcesAll` / `batch` / `single` | `GET /api/v3/<ns>/sources` |
| `preview` | Provide a preview/streaming source | `getPreviewSource` | `GET /api/v3/<ns>/stream` |
| `websiteIndex` | Provide a website episode index | `getWebsiteEpisodeIndex` | `GET /api/v3/<ns>/website` |

**Note:** `preview` and `websiteIndex` are now **capability-gated and generic** — the runtime consults every extension declaring the capability, in `priority` order, and takes the first non-null result (error `no_capable_extension` if none). They are no longer hardcoded to a single extension.

---

## Bundle Contract for `route=sources`

The host's `GET /api/v3/<ns>/sources` handler calls `bundle.sourcesAll(opts, onChunk)` for progressive per-provider chunks (SSE), and falls back to `bundle.batch(opts)` (single-shot) when `sourcesAll` is absent.

**A sources extension MUST expose `sourcesAll`** (a stream-only extension can delegate to its `streamAll`), and ideally `batch` as an aggregate alias of `single`. A bundle with neither returns a "fallback … 0 sources" row for every request.

### Method Signatures

```ts
// Progressive (preferred) — streams results per provider via onChunk
sourcesAll(opts: SourceOptions, onChunk: (chunk: SourceChunk) => void): Promise<void>

// Fallback single-shot — returns all sources at once
batch(opts: SourceOptions): Promise<SourceResult[]>

// Single provider (used by per-provider route)
single(opts: SourceOptions): Promise<SourceResult[]>

// Stream-only progressive
streamAll(opts: SourceOptions, onChunk: (chunk: SourceChunk) => void): Promise<void>

// Torrent-only progressive
torrentAll(opts: SourceOptions, onChunk: (chunk: SourceChunk) => void): Promise<void>

// Per-provider (called via GET /api/v3/<ns>/providers/:name)
runProvider(providerName: string, opts: SourceOptions): Promise<SourceChunk>

// Provider inventory (called via GET /api/v3/<ns>/providers)
listProviders(): Promise<ProviderInfo[]>
```

---

## SourceOptions

```ts
interface SourceOptions {
  anilistId: number;              // AniList media ID
  titles: string[];               // All known titles (romaji, english, native, synonyms)
  episode?: number;               // Target episode (1-based), omitted for movies
  episodeCount?: number;          // Total episodes if known
  resolution: string;             // Preferred resolution ("1080p", "720p")
  tatakaiId?: string;             // Tatakai-internal media ID
  countryCode?: string;           // ISO 3166-1 alpha-2
  exclusions?: string[];          // Source IDs to exclude
  preferredLanguage?: string;     // Deprecated: single language
  preferredLanguages?: string[];  // Ordered list (e.g. ["hi", "en", "ja"])
  providerOptions?: {             // Optional provider tuning
    timeoutMs?: number;           // Default 20000
    maxConcurrency?: number;
    maxRetries?: number;
    retryDelayMs?: number;
  };
}
```

### Title Resolution

`opts.titles` carries whatever the caller supplied — usually one canonical title. Providers that search substring/LIKE-style catalogues should also try a subtitle-free base variant (`Mushoku Tensei: Jobless Reincarnation` → `Mushoku Tensei`).

Bundles should resolve fuller AniList title sets (romaji/synonyms) from `opts.anilistId` themselves — the distributor does not pre-enrich titles for all extensions. The host fetches AniList titles (canonical + up to 2 useful Latin-script synonyms) and merges with caller titles.

---

## SourceResult

Canonical shape (`src/core/extensions/sdk/types.ts`):

```ts
interface SourceResult {
  source: string;                     // Label, e.g. "Nyaa"
  url: string;                        // HLS manifest, MP4, or magnet
  quality: string;                    // "1080p" | "720p" | …
  headers: Record<string, string>;    // Referer/User-Agent required to fetch url
  refererCandidates?: string[];       // Ordered Referer fallbacks
  subtitles: SubtitleTrack[];
  audioLanguage?: string;             // BCP-47, e.g. "ja" — helps language resolver
  sourceType?: 'torrent' | 'debrid' | 'hls' | 'dash' | 'mp4' | 'custom';
  server?: string;                    // Server/group label for quality grouping
  providerName?: string;              // Provider display name
  providerPriority?: number;          // Extension's provider ranking (lower = preferred)
}
```

### SubtitleTrack

```ts
interface SubtitleTrack {
  url: string;                        // Subtitle file URL
  label: string;                      // Display label ("English", "Japanese")
  language: string;                   // BCP-47 ("en", "ja")
  default?: boolean;                  // Auto-select
}
```

---

## Host Processing Pipeline

### 1. Type Detection (`resolveSourceType`)

```ts
function resolveSourceType(s) {
  const t = (s.sourceType || s.type || '').toLowerCase();
  const url = s.url || '';
  if (t === 'torrent' || s.isTorrent || /^magnet:/i.test(url)) return 'torrent';
  if (t === 'custom' || t === 'embed' || s.isEmbed) return 'embed';
  if (t === 'hls' || s.isM3U8 || /\.m3u8($|[?#/])/i.test(url)) return 'hls';
  if (t === 'mp4' || /\.(mp4|m4v|webm|mkv)($|[?#])/i.test(url)) return 'mp4';
  return 'embed';
}
```

### 2. Language Inference (`inferLanguage`)

If `audioLanguage` missing or `und`:
1. Check `PROVIDER_DEFAULT_LANG` map (provider-specific defaults)
2. Check source label/URL for keywords (dub, sub, hindi, tamil, etc.)
3. Default: Japanese sub

### 3. Normalization (`normalizeSource`)

```ts
function normalizeSource(s) {
  const type = resolveSourceType(s);
  const inferred = inferLanguage(s);
  // Returns enriched source with:
  // - providerName, providerKey, server
  // - audioLanguage, language, languageLabel, isDub
  // - type, sourceType, fileFormat
  // - isM3U8, isEmbed, isTorrent
  // - seeders, leechers, peers (torrent)
  // - providerPriority
}
```

### 4. Proxy Application (`applyProxy`)

Only HLS/MP4 sources **with headers** are rewritten to a tokenized localProxy URL (so Referer/UA locks work). Header-free public URLs are returned untouched. Subtitles are proxied alongside when present.

```ts
function applyProxy(normalized, rawHeaders, localProxy) {
  if (!rawHeaders || !localProxy) return normalized;
  if (normalized.type === 'hls' || normalized.type === 'mp4') {
    return { ...normalized, url: localProxy.registerSource({ url: normalized.url, headers: rawHeaders }) };
  }
  return normalized;
}
```

---

## Source Chunk (Progressive SSE)

```ts
interface SourceChunk {
  results: SourceResult[];            // Batch of results from one provider
  diagnostic?: {
    provider: string;                 // Provider name
    status: 'ok' | 'empty' | 'error' | 'timeout';
    durationMs: number;
    attempts: number;
    error?: string;
    resultCount: number;
  };
}
```

**SSE Events:**
- `event: source` — Individual `SourceResult`
- `event: provider_status` — Diagnostic for a provider
- `event: done` — `{ totalCount, cached }`
- `event: error` — `{ message }`

---

## Caching

| Mode | TTL | Key Includes |
|------|-----|--------------|
| `sources` / `stream` | 10 min | mode, anilistId, episode, resolution, preferredLanguages |
| `torrent` | 30 min | Same |
| `manga/chapters` | 30 min | namespace, anilistId, malId, title, titles |

**Cache stores:** Normalized source + raw headers (NOT proxied URL — tokens expire in ~15 min). On cache hit, proxy tokens are re-minted from raw headers.

**Bypass:** `?refresh=1` or `?nocache=1` forces re-scrape.

---

## Minimal Source Example

A header-free MP4 source (plays directly, no proxy needed):

```ts
{
  source: "Aurora",
  url: "https://cdn.example.com/video.mp4",
  quality: "720p",
  headers: {},
  subtitles: [],
  sourceType: "mp4"
}
```

---

## Relationship to Custom Sources

`customWatch` returns `{ sources: SourceResult[] }` and goes through the **same** `applyProxy` path — so a custom watch source plays through the identical pipeline.

---

## Per-Provider Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `GET /api/v3/<ns>/providers` | `listProviders()` | Inventory (cheap, no network) |
| `GET /api/v3/<ns>/providers/:name` | `runProvider(name, opts)` | Run exactly one provider (debugging) |

---

## Testing Checklist

- [ ] `sourcesAll` implemented with `onChunk` callback
- [ ] `batch` implemented as fallback
- [ ] `audioLanguage` set on all results (BCP-47)
- [ ] `headers` include required Referer/UA
- [ ] `sourceType` set correctly
- [ ] `server` field for quality grouping
- [ ] `providerPriority` for extension's internal ranking
- [ ] Subtitles included with `language` and `label`
- [ ] Handles `preferredLanguages` array
- [ ] Respects `exclusions`
- [ ] Caching works (cache hit returns same results, fresh tokens)

---

## Related

- [Extension Overview](extensions/overview.md)
- [Manifest Reference](extensions/manifest.md)
- [Manga Capability](extensions/capabilities/manga.md)
- [Custom Source Capability](extensions/capabilities/custom-source.md)
- [Renderer Loader](extensions/renderer-loader.md)