# Manifest Reference

Complete schema for `manifest.json` — the single source of truth for extension metadata, capabilities, and contributions.

---

## Schema (TypeScript)

```ts
// From src/core/extensions/sdk/types.ts
interface ExtensionManifest {
  // Core identity
  id: string;                          // URL-safe, unique (e.g. "tatakai.extension.nyaa")
  name: string;                        // Display name
  version: string;                     // Semantic version (e.g. "1.2.0")
  type: 'torrent' | 'onlinestream' | 'custom';
  description: string;                 // Shown in Extension Hub
  icon?: string;                       // Base64 data URL or HTTPS URL
  banner?: string;                     // Base64 data URL or HTTPS URL (detail page)
  screenshots?: string[];              // Base64 data URLs (detail page gallery)

  // Permissions & capabilities
  permissions: string[];               // Required: network:domain:host, torrent:search, etc.
  capabilities?: ExtensionCapability[]; // Advertised for IPC discovery

  // Ordering & categorization
  priority?: number;                   // Default: 100 (lower = earlier)
  categories?: string[];               // Hub display chips (e.g. ["Anime Stream", "Torrent"])

  // HTTP API server (Node bundle)
  apiServer?: ExtensionApiServer;

  // Custom sources (isolated verticals)
  customSources?: CustomSourceDescriptor[];

  // Contributions (data-driven + code-driven)
  contributes?: ExtensionContributions;

  // Metadata (auto-managed)
  signature?: string;                  // Ignored (legacy)
  signedBy?: string;                   // Ignored (legacy)
  sideloaded?: boolean;                // Ignored (legacy)
  approvedAt?: string;                 // ISO 8601 approval timestamp
  deprecated?: boolean;                // Hidden from hub if true
  versionHistory?: VersionEntry[];     // Changelog
  browserDomains?: string[];           // Seanime browser session domains
}
```

---

## Field Reference

### Core Identity

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| `id` | string | Yes | `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$` — no path separators, no `..` |
| `name` | string | Yes | Non-empty |
| `version` | string | Yes | Semantic version (semver) |
| `type` | enum | Yes | `torrent` \| `onlinestream` \| `custom` |
| `description` | string | Yes | Non-empty, shown in hub grid |
| `icon` | string | No | Base64 data URL (`data:image/png;base64,...`) or HTTPS URL |
| `banner` | string | No | Base64 data URL or HTTPS URL (detail page hero) |
| `screenshots` | string[] | No | Base64 data URLs (detail page gallery) |

### Permissions

Array of permission strings. **Required field** (can be empty `[]`).

| Pattern | Meaning | Example |
|---------|---------|---------|
| `network:domain:<host>` | Allow HTTP requests to domain | `network:domain:nyaa.si` |
| `torrent:search` | Allow torrent searching via engine | `torrent:search` |
| `torrent:download` | Allow torrent downloading | `torrent:download` |
| `parse:<parser>` | Allow specific parser | `parse:html`, `parse:json` |
| `storage:unlimited` | Bypass extension storage quota | `storage:unlimited` |

**Validation:** Only declared permissions are enforced at runtime. Undeclared network calls fail.

### Capabilities

Advertised for IPC discovery (`electron.listInstalledExtensions`). Extensions without declared capabilities still work for data-driven contributions.

```ts
type ExtensionCapability =
  | 'manga'           // Manga chapters/pages
  | 'preview'         // Preview/streaming source
  | 'websiteIndex'    // Website episode index
  | 'theme'           // Custom themes (data-driven)
  | 'analytics'       // Analytics sinks (data-driven)
  | 'service'         // Named services (code-driven)
  | 'module'          // Platform modules (code-driven)
  | 'ui'              // React pages/slots (code-driven)
  | 'custom-source'   // Isolated read/watch verticals
  | string;           // Arbitrary for forward compat
```

### Priority

Ordering hint across extensions. **Lower = earlier.**

| Value | Use Case |
|-------|----------|
| `0` | Primary/official extension (e.g., bundled Toko) |
| `50` | High-priority community extension |
| `100` | Default |
| `200+` | Fallback/low-priority |

Used for: source resolution, manga chapter aggregation, custom source listing.

### apiServer

Describes the in-process HTTP API server mounted at `/api/v3/<namespace>/...`.

```ts
interface ExtensionApiServer {
  namespace: string;           // URL-safe, unique (e.g. "toko", "aurora")
  contract: string;            // Contract identifier (e.g. "streaming-sources-v3")
  routes: string[];            // Gated route families
  healthPath?: string;         // Optional health check path
}
```

**Route Families (gated — must be declared to be reachable):**

| Route | Methods | Description |
|-------|---------|-------------|
| `sources` | `sourcesAll`, `streamAll`, `torrentAll`, `batch`, `single` | All source types |
| `stream` | `streamAll`, `single` | Direct streams only (HLS/MP4) |
| `torrent` | `torrentAll`, `single` | Torrent sources only |
| `providers` | `listProviders`, `runProvider` | Provider inventory + per-provider |
| `manga/chapters` | `getMangaChapters`, `debugMangaChapters` | Manga chapter lists |
| `manga/pages` | `getMangaPages` | Manga page images |
| `novel/chapters` | `getNovelChapters` | Novel chapter lists |
| `novel/content` | `getNovelContent` | Novel chapter content |
| `custom/*` | `customHome`, `customSearch`, `customInfo`, `customWatch`, `customRead` | Custom source verticals |

**Ungated routes** (always reachable, return 501 if method absent): `providers`, `manga/*`, `novel/*`, `custom/*`.

### customSources

Isolated read/watch verticals. Each gets generic app-owned UI at `/x/<namespace>/<sourceId>/...`.

```ts
interface CustomSourceDescriptor {
  nsfw?: boolean;                    // Hidden unless mature content enabled
  id: string;                        // Stable ID (used in routes)
  kind: 'read' | 'watch';            // Reader or watch page
  name: string;                      // Display name
  icon?: string;                     // Base64 data URL or HTTPS URL
  description?: string;              // Short description
  providerGroup?: string;            // Language variant grouping key
  language?: string;                 // BCP-47 language code
  catalogMediaType?: 'anime' | 'manga' | 'novel'; // Verified catalogue link opt-in
}
```

**Required** when `capabilities` includes `'custom-source'`.

### contributes

Data-driven + code-driven contributions.

```ts
interface ExtensionContributions {
  rendererEntry?: string;            // Path to renderer ESM entry (code-driven)
  themes?: ContributedTheme[];       // Declarative themes (data-driven)
  analytics?: ContributedAnalytics[]; // Declarative analytics (data-driven)
}
```

#### ContributedTheme (Data-Driven)

```ts
interface ContributedTheme {
  id: string;                        // Unique within extension
  name: string;                      // Display name
  colors: Record<string, string>;    // CSS custom properties (e.g. { "--primary": "340 82% 65%" })
  info?: {                           // Switcher metadata
    label?: string;
    description?: string;
    accent?: string;
  };
}
```

Registered at boot via `bootstrapExtensions.ts` → `ExtensionRegistry.registerTheme()`.

#### ContributedAnalytics (Data-Driven)

```ts
interface ContributedAnalytics {
  ingestUrl: string;                 // HTTPS endpoint receiving POST {type, name, payload, ts}
  events?: string[];                 // Allowlist (empty = all events)
}
```

Registered at boot → `AnalyticsService.registerProvider()`.

#### rendererEntry (Code-Driven)

Path to ESM bundle (`renderer.js`). Loaded by `rendererLoader.ts` → calls `activate(ctx)`.

**Trust-gated:** Only loads for trusted extensions (validated at install).

---

## Validation Rules (kai-format.cjs)

1. **Required fields present:** `id`, `name`, `version`, `type`, `permissions`
2. **Valid ID:** `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$`, no `..`, not `.` or `..`
3. **Valid type:** One of `torrent`, `onlinestream`, `custom`
4. **Permissions array:** Must be array
5. **apiServer (if present):**
   - `namespace`: non-empty, `^[a-z0-9][a-z0-9-]*$`
   - `contract`: non-empty string
   - `routes`: array
6. **customSources (if custom-source capability):**
   - Non-empty array
   - Each entry: `id` (non-empty), `kind` (`read` or `watch`), `name` (non-empty)
7. **bundle.js:** ≤ 10 MB
8. **icon:** ≤ 512 KB
9. **Legacy fields stripped:** `signature`, `signedBy`, `sideloaded` removed

---

## Example: Complete Manifest

```json
{
  "id": "tatakai.extension.toko",
  "name": "Toko",
  "version": "3.2.1",
  "type": "onlinestream",
  "description": "Primary streaming & manga source for Tatakai",
  "icon": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
  "banner": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
  "permissions": [
    "network:domain:animepahe.ru",
    "network:domain:animetosho.org",
    "network:domain:nyaa.si",
    "torrent:search",
    "parse:html",
    "parse:json"
  ],
  "capabilities": ["manga", "preview", "websiteIndex", "custom-source", "novel"],
  "priority": 0,
  "categories": ["Anime Stream", "Manga", "Torrents", "Novels"],
  "apiServer": {
    "namespace": "toko",
    "contract": "streaming-sources-v3",
    "routes": ["sources", "stream", "torrent", "providers", "manga/chapters", "manga/pages", "novel/chapters", "novel/content", "custom/home", "custom/search", "custom/info", "custom/watch", "custom/read"],
    "healthPath": "/health"
  },
  "customSources": [
    {
      "id": "toko-webtoons",
      "name": "Toko Webtoons",
      "kind": "read",
      "description": "Korean webtoons from Toko",
      "icon": "data:image/png;base64,...",
      "language": "ko",
      "providerGroup": "toko-webtoons",
      "catalogMediaType": "manga"
    }
  ],
  "contributes": {
    "rendererEntry": "renderer.js",
    "themes": [
      {
        "id": "toko-dark",
        "name": "Toko Dark",
        "colors": {
          "--primary": "340 82% 65%",
          "--background": "340 15% 5%",
          "--card": "340 12% 8%"
        },
        "info": { "label": "Toko", "description": "Official Toko theme", "accent": "350 90% 70%" }
      }
    ],
    "analytics": [
      { "ingestUrl": "https://analytics.takai.me/ingest", "events": ["source_resolve", "playback_start"] }
    ]
  }
}
```

---

## Related

- [Extension Overview](extensions/overview.md) — System architecture
- [Build First Extension](extensions/build-first.md) — Step-by-step guide
- [Capabilities](extensions/capabilities/) — Per-capability guides