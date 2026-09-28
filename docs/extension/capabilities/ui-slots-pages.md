# UI: Pages & Slots

The renderer bundle can contribute React UI in two ways: **routed pages** (whole
screens) and **slots** (components injected at named mount points in existing
screens). Both are code-driven — they require `contributes.rendererEntry` and
only load for trusted extensions. Contributed components run in the app's own
React, so hooks/context work and you can reuse app UI primitives.

See [renderer-loader.md](../renderer-loader.md) for how `activate(ctx)` runs.

## Routed pages

```ts
ctx.registry.registerPage({
  id: `${EXT_ID}:about`,     // namespaced (prefix = extension id)
  path: '/aurora-about',     // app route
  label: 'Aurora',           // nav label
  icon: 'sparkles',          // optional lucide icon name
  component: AuroraAboutPage, // React.ComponentType
});
```

Pages route through `CatchAllHandler` in `src/routes/AppRoutes.tsx`
(`/:slug` → looks up `extensionRegistry.getPages()`), wrapped in
`ProtectedRoute`. Once the registry is populated at boot, the page is reachable
at its `path`.

```ts
interface ExtensionPage { id: string; path: string; component: React.ComponentType; label: string; icon?: string; }
```

## Slots

A slot component is rendered wherever the app mounts an `<ExtensionSlot slotId=…>`
with a matching `slotId`. The app passes `props` to your component; return
`null` to render nothing (e.g. scope by namespace).

```ts
ctx.registry.registerSlot({
  id: `${EXT_ID}:home-banner`,
  slotId: 'custom-home-top',
  component: AuroraHomeBanner,   // React.ComponentType<any>, receives the slot's props
});
```

```ts
interface ExtensionSlot { id: string; slotId: string; component: React.ComponentType<any>; }
```

### Available mount points

| `slotId` | Location | Props passed |
| --- | --- | --- |
| `home-top` | Top of the home page | — |
| `home-bottom` | Bottom of the home page | — |
| `anime-details-after-title` | Anime detail page, after the title | `{ anime }` |
| `settings-panel-bottom` | Settings modal panel | `{ category }` |
| `custom-home-top` | Top of a custom-source home | `{ namespace, sourceId, kind }` |
| `custom-home-bottom` | Bottom of a custom-source home | `{ namespace, sourceId, kind }` |
| `custom-info-after-title` | Custom-source info page, after title | `{ namespace, sourceId, id, kind, info }` |

Multiple extensions can register to the same `slotId`; all render. Adding a new
mount point is a one-line `<ExtensionSlot slotId="…" props={…} />` in the host
component.

## Cleanup

Page and slot ids are prefixed with the extension id. On unload,
`unregisterAll(extensionId)` removes every registration whose id starts with
that prefix, and the loader revokes the blob URL and calls your `dispose()`.

## Example

`extension/aurora/src/renderer.tsx` registers `AuroraAboutPage` (a `/aurora-about`
page with a working `React.useState` counter) and `AuroraHomeBanner` (a
`custom-home-top` slot that renders only when `props.namespace === 'aurora'`).
