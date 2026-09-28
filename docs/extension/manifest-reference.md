# Manifest Reference

Every extension ships a `manifest.json` at its root. Fields are validated by
`desktop/runtime/extension/kai-format.cjs` and typed by `ExtensionManifest` in
`src/core/extensions/sdk/types.ts`.

## Required fields

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `string` | Reverse-DNS unique id, e.g. `tatakai.extension.aurora`. Used as the registry key prefix and for cleanup. |
| `name` | `string` | Display name. |
| `type` | `string` | Extension family, e.g. `"custom"`, `"anime"`. |
| `version` | `string` | Semver. |

`REQUIRED_MANIFEST_FIELDS` is intentionally small. Everything below is optional
and validated only **if present**.

## Identity & metadata

```jsonc
{
  "author": "Tatakai",
  "description": "One-paragraph summary shown in the extension UI.",
  "categories": ["Custom Source", "Example"],
  "priority": 50
}
```

- **`priority`** *(number, default `100`)* — ordering when multiple extensions
  are capable of the same thing; **ascending** (lower wins). An extension that
  must lead ships `0`. See [migration.md](migration.md).

## `capabilities`

```jsonc
"capabilities": ["custom-source", "theme", "analytics", "ui", "module"]
```

Declares what the extension participates in. Recognized values:

| Capability | Meaning | Doc |
| --- | --- | --- |
| `sources` / `preview` / `websiteIndex` | Anime streaming source roles | [sources.md](capabilities/sources.md) |
| `manga` | Manga chapters/pages | [manga.md](capabilities/manga.md) |
| `custom-source` | Isolated read/watch vertical | [custom-source.md](capabilities/custom-source.md) |
| `theme` | Contributes theme(s) | [themes.md](capabilities/themes.md) |
| `analytics` | Contributes analytics sink(s) | [analytics.md](capabilities/analytics.md) |
| `ui` | Contributes React pages/slots | [ui-slots-pages.md](capabilities/ui-slots-pages.md) |
| `service` / `module` | Services / platform modules | [services-modules.md](capabilities/services-modules.md) |

Capability routing is **generic** — no extension id is special-cased. When
`capabilities` includes `custom-source`, `customSources[]` must be a non-empty
array (validated).

## `apiServer`

Declares the extension's HTTP contract, mounted by the host at
`/api/v3/<namespace>/…`.

```jsonc
"apiServer": {
  "namespace": "aurora",              // unique; the URL segment. Mounted ONLY if trusted.
  "contract": "custom-source-v1",     // named contract the bundle implements
  "routes": ["custom/home", "custom/search", "custom/info", "custom/watch"],
  "healthPath": "/health"             // optional
}
```

- The **namespace is trust-gated**: `findNamespaceEntry` refuses to mount it for
  a non-trusted extension. Namespaces must not collide across extensions.

## `customSources`

Required when `capabilities` includes `custom-source`. Each descriptor powers a
sidebar entry and the `/x/:namespace/:sourceId` routes.

```jsonc
"customSources": [
  {
    "id": "aurora-films",             // required; unique within the extension
    "kind": "watch",                  // required; "read" | "watch"
    "name": "Aurora Open Films",      // required; sidebar label
    "icon": "film",                   // optional; lucide icon name
    "description": "…"                // optional
  }
]
```

`kind` decides the terminal page: `watch` → `CustomWatchPage` (VideoPlayer),
`read` → `CustomReadPage` (manga reader). Validated: `id`, `name`, and
`kind ∈ {read, watch}` are required per entry.

## `contributes`

Renderer + data contributions.

```jsonc
"contributes": {
  "rendererEntry": "renderer.js",     // code-driven: path within the bundle to the ESM renderer
  "themes": [ /* RegisteredTheme[] — see themes.md */ ],
  "analytics": [ { "ingestUrl": "https://…/ingest", "events": [] } ]
}
```

- **`rendererEntry`** *(string)* — loaded **only for trusted extensions**. See
  [renderer-loader.md](renderer-loader.md).
- **`themes`** *(data-driven)* — each entry is `{ id, name, colors, info }`. See
  [themes.md](capabilities/themes.md) for the `colors` (HSL-triple) shape.
- **`analytics`** *(data-driven)* — each `{ ingestUrl, events? }` becomes an
  ingest-POST analytics provider. See [analytics.md](capabilities/analytics.md).

## Trust & permissions

```jsonc
"sideloaded": true,
"permissions": ["network:domain:commondatastorage.googleapis.com"]
```

- **`sideloaded`** *(boolean)* — when `true`, the extension is **trusted** (its
  namespace mounts and its renderer bundle loads). Otherwise it must carry a
  valid signature. See [overview.md](overview.md#trust-model).
- **`permissions`** *(string[])* — capability grants; `network:domain:<host>`
  scopes the `ctx.fetch` given to renderer code and documents host access.

## Full example

See `extension/aurora/manifest.json` for a manifest that uses every field above.

