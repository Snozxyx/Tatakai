# Services & Platform Modules

Two code-driven contribution types let an extension add long-lived behavior and
integrations. Both are registered from the renderer bundle's `activate(ctx)` and
therefore load only for trusted extensions.

## Platform modules

A **module** is a long-lived unit with an `init` (run once at boot) and an
optional `dispose` (run on unload). Use it for background behavior: heartbeats,
polling, wiring an integration, seeding storage.

```ts
interface ExtensionModule {
  id: string;                              // namespaced (prefix = extension id)
  init: (ctx: ExtensionContext) => void | Promise<void>;
  dispose?: () => void;
}
```

```ts
let timer: ReturnType<typeof setInterval> | undefined;
ctx.registry.registerModule({
  id: `${EXT_ID}:module`,
  init: () => {
    const boots = Number(ctx.storage.get('boots') || '0') + 1;
    ctx.storage.set('boots', String(boots));   // scoped, per-extension storage
    ctx.log('module init — boot #', boots);
  },
  dispose: () => { if (timer) clearInterval(timer); ctx.log('module dispose'); },
});
```

- `init` receives the same `ctx` given to `activate` (see
  [renderer-loader.md](../renderer-loader.md)): scoped `storage`, scoped `fetch`,
  `navigate`, `analytics`, `registry`, `log`, `extensionId`, `React`.
- `bootstrapExtensions` invokes `module.init(ctx)` at boot; `dispose()` runs on
  unload. Ids are prefixed so `unregisterAll` cleans them up.

## Services (integrations)

A **service** exposes a named API surface to the rest of the app — an
integration point other code can look up.

```ts
interface ExtensionService {
  id: string;             // namespaced
  name: string;
  api?: Record<string, any>;
}
```

```ts
ctx.registry.registerService({
  id: `${EXT_ID}:sync`,
  name: 'Aurora Sync',
  api: { pushProgress: async (x) => { /* … */ } },
});
```

Consumers read `extensionRegistry.getServices()` and call `service.api.*`.

## Lifecycle summary

| Phase | What happens |
| --- | --- |
| Boot | `bootstrapExtensions` loads trusted renderer bundles, then calls each registered `module.init(ctx)`. Services are available via `getServices()`. |
| Runtime | Modules run; services are callable. |
| Unload | Loader calls the bundle's returned `dispose()`, then `unregisterAll(extensionId)` clears the extension's modules/services/pages/slots/themes; each module's own `dispose()` also runs. |

## Example

`extension/aurora/src/renderer.tsx` registers a module that persists a `boots`
counter through `ctx.storage` on each `init` and clears its interval on
`dispose` — a minimal but complete platform-module example.
