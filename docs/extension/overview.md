# Overview — Architecture, Boundaries, Trust

## Two execution planes

An extension can contribute code that runs in one or both of two places.

### 1. Main process (Node) — data plane

The extension's **`bundle.js`** is `require()`d **in-process** by the
extension-API host (`desktop/runtime/extension-api-host/host-server.cjs`) and
runs in the sandboxed worker pool. This is where scraping, source resolution,
and all data logic live. The host exposes each extension's `apiServer` over
local HTTP at `http://127.0.0.1:<port>/api/v3/<namespace>/…` and also via the
`extension:invoke` IPC channel (used as a fallback when HTTP is unavailable).

The Node bundle never renders UI. It answers method calls and returns JSON.

### 2. Renderer (browser) — code plane *(NEW)*

An extension may also ship a **`renderer.js`** ESM bundle
(`contributes.rendererEntry`). The **renderer loader**
(`src/core/extensions/rendererLoader.ts`) dynamically `import()`s it from a blob
URL and calls its default export `activate(ctx)`. Contributed React components
run in the **app's own React runtime**, so they can use hooks/context and reuse
the app's UI primitives.

## Two contribution classes

Every capability is either **data-driven** (no renderer code) or **code-driven**
(requires the renderer bundle).

| Class | How it's declared | Examples |
| --- | --- | --- |
| **Data-driven** | JSON in `manifest.json` / methods on the Node bundle | custom-source content, `contributes.themes`, `contributes.analytics` ingest URLs, anime/manga sources |
| **Code-driven** | `activate(ctx)` in `renderer.js` calling `ctx.registry.*` | React pages, UI slots, code analytics providers, services, platform modules |

Data-driven contributions work for **any** installed extension. Code-driven
contributions load **only for trusted extensions** (see below).

## Custom sources are isolated

A **custom source** (`capabilities: ["custom-source"]`, `customSources[]`) is a
self-contained read/watch vertical. It is **never** integrated with the anime
watchlist or manga readlist. Its content is addressed by `(namespace, sourceId)`
and rendered by app-owned generic pages under `/x/:namespace/:sourceId/…`. State
lives under separate React Query keys (`['custom', …]`) and never calls the
media-list mutations. See [capabilities/custom-source.md](capabilities/custom-source.md).

## Installation and permissions

All installed extensions use the same flow. Signing fields are ignored. Package structure, identifiers, archive limits, declared network access, publishing authentication, moderation, and kill switches remain enforced.

Native and Seanime code runs in the existing execution hosts. Renderer contributions and mobile providers run with application privileges. Stremio addons use HTTP/JSON only and execute no addon code.

## Loading & discovery

- **Auto-load (dev + bundled):** the host scans `extension/*/dist/bundle.js`
  (`autoLoadBundledExtensions` in `desktop/ipc/ipc-runtime.cjs`) and registers
  each with its `manifest.json`. Every bundled extension loads this way.
- **Sideload / install:** a `.kai` archive (a zip of `manifest.json` +
  `bundle.js` + optional `renderer.js` + `README.md` + `icon.png`) validated by
  `desktop/runtime/extension/kai-format.cjs`.

## Multiple extensions & ordering

More than one extension runs simultaneously. When several are capable of the
same thing, they are consulted in **`manifest.priority`** order (ascending;
default `100`). An extension that must lead ships `priority: 0`; the bundled
`aurora` example ships `priority: 50`. See [migration.md](migration.md).

## Where things live

| Concern | File |
| --- | --- |
| Manifest + data contracts (types) | `src/core/extensions/sdk/types.ts` |
| Host HTTP router + bundle loader | `desktop/runtime/extension-api-host/host-server.cjs` |
| Manifest validation | `desktop/runtime/extension/kai-format.cjs` |
| Generic capability routing, IPC, auto-load | `desktop/ipc/ipc-runtime.cjs` |
| Renderer registry (pub/sub) | `src/core/extensions/ExtensionRegistry.ts` |
| Boot wiring | `src/core/extensions/bootstrapExtensions.ts` |
| Renderer loader + `ExtensionContext` | `src/core/extensions/rendererLoader.ts` |
| Custom-source renderer client | `src/core/content/custom-source-runtime.ts` |
