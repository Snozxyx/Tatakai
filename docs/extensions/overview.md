# Extension System Overview

Tatakai's extension system turns most advanced app features into a **modular ecosystem**. Extensions can add streaming/manga/novel sources, isolated read/watch verticals ("custom sources"), themes, analytics sinks, background services, platform modules, and React UI (pages + slots). Multiple extensions run simultaneously.

---

## Architecture

### Two Execution Planes

| Plane | Location | Responsibility | Communication |
|-------|----------|----------------|---------------|
| **Main Process (Node)** | `desktop/runtime/extension-api-host/` | Data plane: scraping, source resolution, HTTP API (`/api/v3/<ns>/...`) | In-process `require()` of `bundle.js` |
| **Renderer (Browser)** | `src/core/extensions/rendererLoader.ts` | Code plane: React pages, UI slots, services, modules | Dynamic `import()` of `renderer.js` blob URL |

### Two Contribution Classes

| Class | Declaration | Examples | Trust Required |
|-------|-------------|----------|----------------|
| **Data-driven** | JSON in `manifest.json` / methods on Node bundle | Custom sources, themes, analytics ingest URLs, anime/manga/novel sources | No — works for all installed extensions |
| **Code-driven** | `activate(ctx)` in `renderer.js` calling `ctx.registry.*` | React pages, UI slots, code analytics providers, services, modules | Yes — only for trusted extensions |

---

## Extension Package (`.kai`)

A `.kai` file is a ZIP archive:

```
my-extension.kai
├── manifest.json    (required) Extension metadata
├── bundle.js        (required) Node bundle (CommonJS)
├── renderer.js      (optional) Renderer ESM entry
├── README.md        (optional) Documentation
└── icon.png         (optional) 512x512 icon
```

**Validation:** `desktop/runtime/extension/kai-format.cjs` validates:
- Manifest schema (required fields, valid types, permissions)
- `bundle.js` size ≤ 10 MB
- `icon.png` size ≤ 512 KB
- Safe extension ID (no path traversal)
- `customSources[]` validation when `custom-source` capability declared

---

## Manifest Reference

**File:** `src/core/extensions/sdk/types.ts` → `ExtensionManifest`

```json
{
  "id": "tatakai.extension.nyaa-probe",
  "name": "Nyaa Probe",
  "version": "1.0.0",
  "type": "torrent" | "onlinestream" | "custom",
  "description": "Searches Nyaa for anime torrents",
  "icon": "data:image/png;base64,...",
  "banner": "data:image/png;base64,...",
  "permissions": [
    "network:domain:nyaa.si",
    "torrent:search"
  ],
  "capabilities": ["manga", "preview", "websiteIndex", "custom-source"],
  "priority": 50,
  "apiServer": {
    "namespace": "nyaa",
    "contract": "streaming-sources-v3",
    "routes": ["sources", "stream", "torrent"],
    "healthPath": "/health"
  },
  "customSources": [
    {
      "id": "nyaa-torrents",
      "name": "Nyaa Torrents",
      "kind": "watch",
      "description": "Anime torrents from Nyaa",
      "icon": "data:image/png;base64,...",
      "language": "ja",
      "providerGroup": "nyaa",
      "catalogMediaType": "anime"
    }
  ],
  "contributes": {
    "rendererEntry": "renderer.js",
    "themes": [
      { "id": "dark-sakura", "name": "Dark Sakura", "colors": { "--primary": "340 82% 65%" } }
    ],
    "analytics": [
      { "ingestUrl": "https://analytics.example.com/ingest", "events": ["play", "pause"] }
    ]
  }
}
```

### Key Fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | URL-safe identifier (letters, digits, `.`, `-`, `_`) |
| `name` | Yes | Display name |
| `version` | Yes | Semantic version |
| `type` | Yes | `torrent`, `onlinestream`, or `custom` |
| `permissions` | Yes | Array of permission strings (`network:domain:host`, `torrent:search`) |
| `capabilities` | No | Advertised capabilities for IPC discovery |
| `priority` | No | Ordering hint (lower = earlier). Default: 100 |
| `apiServer` | No | HTTP API server descriptor |
| `customSources` | No* | Required if `capabilities` includes `custom-source` |
| `contributes` | No | Data-driven + code-driven contributions |

---

## Installation & Discovery

### Auto-load (Development + Bundled)

The host scans `extension/*/dist/bundle.js` at startup (`autoLoadBundledExtensions` in `desktop/ipc/ipc-runtime.cjs`). Every bundled extension loads this way.

### Sideload / Install

User drops a `.kai` archive → validated by `kai-format.cjs` → installed to `<userData>/extensions/<id>/`.

### IPC Discovery

Renderer calls `electron.listInstalledExtensions()` → returns metadata for all registered extensions including capabilities, `apiServer`, `customSources`, `contributes`, `priority`.

---

## Multiple Extensions & Priority

When several extensions can resolve the same thing (sources, manga chapters, etc.), they are consulted in **`manifest.priority` order** (ascending; default `100`). An extension that must lead ships `priority: 0`.

The Watch page fans source resolution over **every** namespace the host has mounted that declares a `sources`/`stream` route — no per-extension wiring in the renderer.

---

## Where Things Live

| Concern | File |
|---------|------|
| Manifest + data contracts (types) | `src/core/extensions/sdk/types.ts` |
| Host HTTP router + bundle loader | `desktop/runtime/extension-api-host/host-server.cjs` |
| Manifest validation | `desktop/runtime/extension/kai-format.cjs` |
| Generic capability routing, IPC, auto-load | `desktop/ipc/ipc-runtime.cjs` |
| Renderer registry (pub/sub) | `src/core/extensions/ExtensionRegistry.ts` |
| Boot wiring | `src/core/extensions/bootstrapExtensions.ts` |
| Renderer loader + `ExtensionContext` | `src/core/extensions/rendererLoader.ts` |
| Custom-source renderer client | `src/core/content/custom-source-runtime.ts` |
| Manga extension bridge | `src/core/content/manga-extension-runtime.ts` |
| Novel extension bridge | `src/core/content/novel-extension-runtime.ts` |
| Compatibility layer (Mihon/Aniyomi/etc.) | `src/core/extensions/compatibility/` |

---

## Capabilities

| Capability | Description | Plane | Routes |
|------------|-------------|-------|--------|
| `sources` | Anime streaming sources | Node (data) | `/api/v3/<ns>/sources` |
| `preview` | Preview/streaming source | Node (data) | `/api/v3/<ns>/stream` |
| `websiteIndex` | Website episode index | Node (data) | `/api/v3/<ns>/website` |
| `manga` | Manga chapters/pages | Node (data) | `/api/v3/<ns>/manga/*` |
| `novel` | Novel chapters/content | Node (data) | `/api/v3/<ns>/novel/*` |
| `custom-source` | Isolated read/watch verticals | Node (data) | `/api/v3/<ns>/custom/*` |
| `theme` | Custom themes | Data | N/A (registered at boot) |
| `analytics` | Analytics sinks | Data or Code | N/A |
| `ui` | React pages + UI slots | Renderer (code) | N/A |
| `service` | Named services | Renderer (code) | N/A |
| `module` | Platform modules | Renderer (code) | N/A |

---

## Compatibility Ecosystems

Tatakai also supports extensions from other ecosystems:

| Ecosystem | Status | Supported Types |
|-----------|--------|-----------------|
| **Native (Tatakai)** | ✅ Full | All capabilities |
| **Stremio** | ✅ HTTP/JSON | Streaming, Catalog, Metadata, Subtitle addons |
| **Seanime** | 🚧 Partial | JS/TS streaming, manga, torrent, custom-source |
| **Mihon** | 🚧 Preview | Source mapping, limited |
| **Aniyomi** | 🚧 Preview | Source mapping, limited |
| **CloudStream** | 🚧 Preview | Limited |
| **Sora** | 🚧 Preview | Interpreter preview |
| **MangaYomi** | 🚧 Preview | VM-based |

See `src/core/extensions/ecosystems.ts` and `src/core/extensions/compatibility/` for implementation.

---

## Security & Trust Model

| Aspect | Implementation |
|--------|----------------|
| **Code-driven contributions** | Only load for trusted extensions (validated at install) |
| **Network permissions** | Declared in `manifest.permissions` (`network:domain:host`) |
| **Native access** | Declared in `manifest.permissions` (`torrent:search`, etc.) |
| **Kill switches** | Server-side kill list checked at runtime (`registry.isKillSwitched`) |
| **Payload limits** | 10 MB limit on IPC responses (`enforcePayloadLimit`) |
| **Timeout guards** | All IPC calls have timeout (`withCallTimeout`) |
| **Signing** | Legacy signing fields ignored; trust based on install source |

---

## Development Workflow

1. **Scaffold:** Copy `extensions/aurora/` (reference extension exercising all capabilities)
2. **Develop:** Edit `manifest.json`, `bundle.js`, optional `renderer.js`
3. **Build:** `pnpm ext:build --filter=<name>` (outputs to `extensions/<name>/dist/`)
4. **Test:** Install via Extension Hub UI or auto-load in dev
5. **Package:** `pnpm ext:pack --filter=<name>` → produces `.kai` file
6. **Distribute:** Share `.kai` file or submit to marketplace

See [Build Your First Extension](extensions/build-first.md) for step-by-step guide.

---

## Related Documents

- [Manifest Reference](extensions/manifest.md) — Complete manifest schema
- [Capabilities: Sources](extensions/capabilities/sources.md) — Anime streaming sources
- [Capabilities: Manga](extensions/capabilities/manga.md) — Manga chapters/pages
- [Capabilities: Novels](extensions/capabilities/novels.md) — Novel chapters/content
- [Capabilities: Custom Sources](extensions/capabilities/custom-source.md) — Isolated verticals
- [Capabilities: Themes](extensions/capabilities/themes.md) — Custom themes
- [Capabilities: Analytics](extensions/capabilities/analytics.md) — Analytics providers
- [Capabilities: UI Slots/Pages](extensions/capabilities/ui-slots.md) — React pages & slots
- [Capabilities: Services/Modules](extensions/capabilities/services.md) — Services & modules
- [Renderer Loader](extensions/renderer-loader.md) — How renderer bundles load
- [Security](extensions/security.md) — Trust model & permissions
- [Migration](extensions/migration.md) — Migration from old format
- [Build First Extension](extensions/build-first.md) — Step-by-step guide