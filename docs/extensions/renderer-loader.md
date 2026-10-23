# Renderer Loader

How code-driven contributions (React pages, slots, services, modules, code analytics) load into the app's React runtime.

---

## Overview

- **Renderer bundle:** ESM `renderer.js` (declared in `manifest.contributes.rendererEntry`)
- **Loader:** `src/core/extensions/rendererLoader.ts`
- **Trust-gated:** Only loads for trusted extensions (validated at install)
- **Same React instance:** Bundle MUST use `ctx.React` (app's React) — never bundle its own

---

## Load Flow

```
bootstrapExtensions.ts (app boot)
        │
        ▼
loadRendererContribution(ext, navigate)
        │
        ▼
1. Get renderer bundle source via IPC
   electron.getRendererBundle(extensionId) → { source: string }
        │
        ▼
2. Create blob URL from source
   new Blob([source], { type: 'text/javascript' })
   URL.createObjectURL(blob)
        │
        ▼
3. Publish app's React to window (fallback)
   window.React = React
        │
        ▼
4. Dynamic import
   import(/* @vite-ignore */ blobUrl)
        │
        ▼
5. Call activate(ctx)
   mod.activate(ctx) or mod.default(ctx)
        │
        ▼
6. Register contributions via ctx.registry
   registerPage(), registerSlot(), registerService(), registerModule()
   analytics.registerProvider()
        │
        ▼
7. Track loaded contribution
   loaded.set(extensionId, { blobUrl, dispose })
```

---

## ExtensionContext API

```ts
interface ExtensionContext {
  /** The shared contribution registry (pages, slots, themes, services, modules…) */
  registry: ExtensionRegistry;
  
  /** Analytics singleton — an extension may registerProvider a code sink */
  analytics: AnalyticsService;
  
  /** Programmatic navigation (wired to the router at boot) */
  navigate: (path: string) => void;
  
  /** Namespaced localStorage, keys auto-prefixed with the extension id */
  storage: ScopedStorage;
  
  /** fetch, passed through as-is (network permissions enforced main-side) */
  fetch: typeof fetch;
  
  /** Namespaced console logger */
  log: (...args: unknown[]) => void;
  
  /** The owning extension id (so contributions can namespace their own ids) */
  extensionId: string;
  
  /** The app's OWN React instance. A renderer bundle MUST build any contributed
   * component with this (never bundle its own) — hooks and context are
   * module-scoped, so a second React instance breaks them. */
  React: typeof React;
}
```

### ScopedStorage

```ts
interface ScopedStorage {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}
// Keys auto-prefixed: `ext:${extensionId}:${key}`
```

---

## Activation Function

```ts
// renderer.js
export async function activate(ctx) {
  // ctx: ExtensionContext
  
  // Register pages
  ctx.registry.registerPage({
    id: `${ctx.extensionId}:my-page`,
    path: '/my-feature',
    component: ctx.React.memo(() => <MyPage />),
    label: 'My Feature',
    icon: 'sparkles',
  });

  // Register slots
  ctx.registry.registerSlot({
    id: `${ctx.extensionId}:header-btn`,
    slotId: 'header:actions',
    component: ctx.React.memo(() => <HeaderButton />),
  });

  // Register service
  ctx.registry.registerService({
    id: `${ctx.extensionId}:api`,
    name: 'My API',
    api: { doSomething: () => {} },
  });

  // Register module
  ctx.registry.registerModule({
    id: `${ctx.extensionId}:bg-task`,
    init: async (ctx) => { /* background work */ },
    dispose: () => { /* cleanup */ },
  });

  // Register code analytics
  ctx.analytics.registerProvider({
    id: `${ctx.extensionId}:analytics`,
    trackEvent: (name, params) => { /* custom logic */ },
    trackPageView: (path, title) => { /* custom logic */ },
  });

  // Optional: return dispose function
  return () => {
    // Cleanup timers, connections, etc.
  };
}
```

---

## Security Model

| Aspect | Implementation |
|--------|----------------|
| **Trust validation** | Only trusted extensions load renderer bundles (checked in main process) |
| **Network permissions** | `fetch` calls go through main process proxy; undeclared domains blocked |
| **Payload limits** | 10 MB limit on IPC responses (`enforcePayloadLimit`) |
| **Timeout guards** | All IPC calls have timeout (`withCallTimeout`) |
| **Kill switches** | Server-side kill list checked at runtime |
| **Same React instance** | Prevents hook/context corruption |
| **Scoped storage** | Namespaced localStorage prevents collisions |

---

## Main Process Side (IPC)

**File:** `desktop/ipc/ipc-runtime.cjs`

```js
// Electron preload exposes:
electron.getRendererBundle(extensionId) → Promise<{ success: boolean; source?: string; error?: string }>

// Implementation:
// 1. Reads bundle.js from extension directory
// 2. Returns source code as string
// 3. Only for trusted extensions
```

---

## Unloading

```ts
// rendererLoader.ts
export function unloadRendererContribution(extensionId: string): void {
  const rec = loaded.get(extensionId);
  if (!rec) return;
  
  try {
    rec.dispose?.();  // Call extension's dispose function
  } catch (e) {
    console.warn(`[rendererLoader] dispose threw for ${extensionId}`, e);
  }
  
  extensionRegistry.unregisterAll(extensionId);  // Remove all contributions
  URL.revokeObjectURL(rec.blobUrl);              // Revoke blob URL
  loaded.delete(extensionId);
}
```

**Triggered by:** Extension disable/uninstall, app shutdown.

---

## Vite Configuration

The renderer bundle is built separately from the main app:

```js
// extensions/<name>/vite.config.js
export default defineConfig({
  build: {
    lib: {
      entry: 'src/renderer.ts',
      name: 'MyExtensionRenderer',
      fileName: 'renderer',
      formats: ['es'],
    },
    rollupOptions: {
      external: ['react', 'react-dom', '@tanstack/react-query', 'zustand', 'framer-motion'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
        },
      },
    },
  },
});
```

**Key points:**
- **Externalize** React, TanStack Query, Zustand, Framer Motion — use app's copies
- **ESM output** — loader uses dynamic `import()`
- **No CSS extraction** — styles injected via JS or use Tailwind (app's Tailwind)

---

## Building

```bash
# Build all bundled extensions
pnpm ext:build

# Build specific extension
pnpm ext:build --filter=my-extension

# Output: extensions/my-extension/dist/renderer.js
```

---

## Debugging

### Console Logs

```ts
// In renderer bundle
ctx.log('MyExtension', 'Page mounted');  // Prefixed: [ext:my-extension] MyExtension Page mounted
```

### React DevTools

Components appear in React DevTools under the app's tree (same React instance).

### Network Tab

`fetch` calls show as requests to the proxy endpoint (main process).

### Blob URL

In DevTools Sources tab, look for `blob:http://localhost:5173/...` — this is the renderer bundle.

---

## Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| `activate` not called | Bundle doesn't export `activate` or `default` | Export `activate` function |
| Hooks break (`useContext` returns undefined) | Bundle includes own React | Use `ctx.React`, externalize React in build |
| Styles missing | CSS not injected | Use Tailwind classes or inject via `ctx.React.useEffect` |
| `fetch` fails | Domain not in `manifest.permissions` | Add `network:domain:example.com` |
| Slot not rendering | Wrong `slotId` | Use predefined slot IDs |
| Page 404 | Route not registered | Check `registerPage` path matches route |

---

## Testing Checklist

- [ ] Bundle builds as ESM (`renderer.js`)
- [ ] React externalized in build config
- [ ] `activate(ctx)` exported and called
- [ ] Uses `ctx.React` for all components
- [ ] Pages register with valid routes
- [ ] Slots use predefined `slotId`s
- [ ] Services/modules register correctly
- [ ] `dispose` cleans up resources
- [ ] Works in web, desktop, mobile
- [ ] No console errors on load/unload

---

## Related

- [Extension Overview](extensions/overview.md)
- [UI Slots/Pages](extensions/capabilities/ui-slots.md)
- [Services/Modules](extensions/capabilities/services.md)
- [Security](extensions/security.md)
- [Build First Extension](extensions/build-first.md)