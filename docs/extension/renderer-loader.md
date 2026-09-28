# Renderer Loader & `ExtensionContext`

The renderer loader (`src/core/extensions/rendererLoader.ts`) is how
**code-driven** contributions enter the app. It fetches a trusted extension's
`renderer.js`, loads it as an ES module, and calls its `activate(ctx)`.

## ⚠️ Security — read this first

A renderer contribution is **arbitrary JavaScript that runs in the app's own
realm** — same window, same React runtime, same DOM, same privileges as the app
itself. `import(blobURL)` is **not** a sandbox.

The **only** security boundary is the **trust gate**:

```ts
isTrusted(ext) = ext.sideloaded === true
              || (typeof ext.signature === 'string' && ext.signature.length > 0)
```

- The bundle is fetched over the `runtime:get-renderer-bundle` IPC, which
  **main-side refuses** for untrusted extensions (and rejects path traversal in
  `rendererEntry`).
- The loader itself re-checks `isTrusted` before executing.

Untrusted store extensions never reach the loader — they stay **data-only**
(their content is served through the vetted host router). Do not weaken this
gate; there is no in-realm sandbox behind it. Only sideload extensions you
trust. See [overview.md](overview.md#trust-model).

## Loading flow

1. `bootstrapExtensions` finds trusted rows with `contributes.rendererEntry`.
2. `loadRendererContribution(ext)` calls `window.electron.getRendererBundle(ext.id)`.
3. The source is wrapped in a `Blob({ type: 'text/javascript' })`; the loader
   `import(/* @vite-ignore */ blobUrl)`s it.
4. It calls `mod.activate ?? mod.default`, passing an `ExtensionContext`.
5. The returned value (if a function) is stored as the contribution's
   `dispose`. Blob URL, dispose fn are tracked in the `loaded` map.

On unload, `unloadRendererContribution` runs `dispose()`, calls
`extensionRegistry.unregisterAll(extId)`, and `URL.revokeObjectURL`s the blob.

## The React rule

`ctx.React` is the **app's own React instance**. A renderer bundle **must not
bundle its own React** — hooks and context are module-scoped, so a second copy
throws invalid-hook-call. Two mechanisms guarantee one instance:

- **Primary:** `ctx.React` is handed to `activate`. Assign it to a module-level
  binding before any component renders.
- **Fallback:** the loader also publishes `window.React` if unset, so bundles
  that reference a bare `React` global resolve to the same instance.

Build the renderer with esbuild `jsxFactory: 'React.createElement'`,
`jsxFragment: 'React.Fragment'`, and `react`/`react-dom` marked **external** — so
JSX compiles to calls on that module-level `React` binding and React is never
bundled. See [build-your-first-extension.md](build-your-first-extension.md).

## `ExtensionContext`

```ts
interface ExtensionContext {
  registry: typeof extensionRegistry;   // registerPage/Slot/Theme/AnalyticsProvider/Service/Module/CustomSource
  analytics: typeof analytics;          // AnalyticsService — registerProvider(...) for a code sink
  navigate: (path: string) => void;     // programmatic router navigation
  storage: ScopedStorage;               // localStorage, keys auto-prefixed `ext:<id>:`
  fetch: typeof fetch;                  // network permissions enforced main-side
  log: (...args: unknown[]) => void;    // console logger prefixed `[ext:<id>]`
  extensionId: string;                  // so contributions can namespace their ids
  React: typeof React;                  // the app's React instance (see above)
}

interface ScopedStorage { get(k): string | null; set(k, v): void; remove(k): void; }
```

### Namespacing

Give every contribution an id prefixed with your extension id (e.g.
`` `${EXT_ID}:about` ``). `unregisterAll(extensionId)` removes registrations by
that prefix, so correct namespacing is what makes clean unload work.

## `activate(ctx)` skeleton

```ts
let React: any;                          // assigned from ctx.React below
const EXT_ID = 'tatakai.extension.aurora';

export default function activate(ctx: ExtensionContext) {
  React = ctx.React;                     // BEFORE any component renders
  ctx.registry.registerPage({ /* … */ });
  ctx.registry.registerSlot({ /* … */ });
  ctx.analytics.registerProvider({ /* … */ });
  ctx.registry.registerModule({ /* … */ });
  return () => { /* dispose — clear timers, etc. */ };
}
```

See `extension/aurora/src/renderer.tsx` for a complete implementation exercising
all four axes.
