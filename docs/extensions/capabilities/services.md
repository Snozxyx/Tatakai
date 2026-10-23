# Services & Modules Capability

Code-driven contributions (trust-gated) allow extensions to register **services** (named APIs for cross-extension/app communication) and **modules** (long-lived background logic with lifecycle hooks).

---

## Capability Declaration

```json
{
  "capabilities": ["service", "module"],
  "contributes": {
    "rendererEntry": "renderer.js"
  }
}
```

**Requires trust** — only loads for trusted extensions.

---

## ExtensionContext Registry API

```ts
interface ExtensionContext {
  registry: ExtensionRegistry;
  // ...
}

// ExtensionRegistry methods
registerService(service: ExtensionService): void;
registerModule(module: ExtensionModule): void;
```

---

## Services

A **service** is a named API surface that other parts of the app (or other extensions) can consume via `extensionRegistry.getService(id)`.

### Interface

```ts
interface ExtensionService {
  id: string;                    // Namespaced: `${extensionId}:my-service`
  name: string;                  // Display name
  api?: Record<string, any>;     // Arbitrary API surface
}
```

### Registration

```ts
// renderer.js
export async function activate(ctx) {
  const myService = {
    // Public API
    async fetchSomething(param: string) {
      const res = await ctx.fetch(`https://api.example.com/${param}`);
      return res.json();
    },
    getConfig() {
      return { version: '1.0', featureFlags: ['a', 'b'] };
    },
    onEvent: (callback: (data: any) => void) => {
      // Event emitter pattern
      eventBus.on('my-event', callback);
      return () => eventBus.off('my-event', callback);
    },
  };

  ctx.registry.registerService({
    id: `${ctx.extensionId}:api`,
    name: 'My Extension API',
    api: myService,
  });
}
```

### Consumption

```ts
// Anywhere in the app (components, hooks, other extensions)
import { extensionRegistry } from '@/core/extensions/ExtensionRegistry';

function MyComponent() {
  const service = extensionRegistry.getService('my-extension:api');
  
  const handleClick = async () => {
    if (service?.api?.fetchSomething) {
      const data = await service.api.fetchSomething('endpoint');
      console.log(data);
    }
  };
  
  return <Button onClick={handleClick}>Call Service</Button>;
}
```

### Use Cases

| Use Case | Example |
|----------|---------|
| **Cross-extension API** | Torrent extension exposes `addMagnet()` for download manager |
| **Platform integration** | Discord Rich Presence service |
| **Shared state** | Auth token manager for API |
| **Event bus** | Custom events between extensions |

---

## Modules

A **module** is a long-lived background component with `init`/`dispose` lifecycle. Runs at app boot and persists until unload.

### Interface

```ts
interface ExtensionModule {
  id: string;                    // Namespaced: `${extensionId}:my-module`
  init: (ctx: any) => void | Promise<void>;
  dispose?: () => void;
}
```

### Registration

```ts
// renderer.js
export async function activate(ctx) {
  let syncInterval: NodeJS.Timeout;
  let ws: WebSocket;

  ctx.registry.registerModule({
    id: `${ctx.extensionId}:background-sync`,
    init: async (capabilityCtx) => {
      // capabilityCtx = ExtensionContext (same as activate)
      
      // Start background sync
      syncInterval = setInterval(() => {
        capabilityCtx.registry.getService('sync-manager')?.api?.triggerSync?.();
      }, 5 * 60 * 1000);

      // WebSocket connection
      ws = new WebSocket('wss://api.example.com/realtime');
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        capabilityCtx.registry.getService('notification-service')?.api?.show?.(data);
      };
    },
    dispose: () => {
      clearInterval(syncInterval);
      ws?.close();
    },
  });
}
```

### Lifecycle

| Phase | When |
|-------|------|
| `init` | After `activate()`, once at boot |
| `dispose` | On extension unload, app shutdown, or `unloadRendererContribution()` |

### Use Cases

| Use Case | Example |
|----------|---------|
| **Background sync** | Periodic library sync with external service |
| **WebSocket connections** | Real-time notifications, chat |
| **Scheduled tasks** | Daily recommendation refresh, cache cleanup |
| **Platform daemons** | KittenTTS daemon management, torrent seeding |
| **Global event listeners** | Keyboard shortcuts, media keys |

---

## Capability Context (passed to `init`)

```ts
interface CapabilityContext {
  registry: ExtensionRegistry;      // Full registry access
  analytics: AnalyticsService;      // Track events
  navigate: (path: string) => void; // Navigation
  storage: ScopedStorage;           // Namespaced localStorage
  fetch: typeof fetch;              // Network (permissions enforced main-side)
  log: (...args: unknown[]) => void;
  extensionId: string;
  React: typeof React;
}
```

Same as `ExtensionContext` passed to `activate()`.

---

## Cross-Extension Communication Pattern

### Service Provider (Extension A)

```ts
// Extension A renderer.js
export async function activate(ctx) {
  const torrentService = {
    async addMagnet(magnet: string, options?: { savePath?: string }) {
      return ctx.fetch('http://127.0.0.1:PORT/api/v3/torrent/add', {
        method: 'POST',
        body: JSON.stringify({ magnet, options }),
      });
    },
    onProgress: (callback: (progress: TorrentProgress) => void) => {
      // Subscribe to torrent progress events
      return eventBus.on('torrent:progress', callback);
    },
  };

  ctx.registry.registerService({
    id: `${ctx.extensionId}:torrent`,
    name: 'Torrent Service',
    api: torrentService,
  });
}
```

### Service Consumer (Extension B)

```ts
// Extension B renderer.js
export async function activate(ctx) {
  // Wait for service to be available
  const waitForService = (id: string, timeout = 5000) => 
    new Promise<ExtensionService>((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        const svc = ctx.registry.getService(id);
        if (svc) return resolve(svc);
        if (Date.now() - start > timeout) return reject(new Error('Timeout'));
        setTimeout(check, 100);
      };
      check();
    });

  const torrentSvc = await waitForService('torrent-extension:torrent');
  
  // Use it
  const handleDownload = async (magnet: string) => {
    await torrentSvc.api.addMagnet(magnet);
  };
  
  // Register a slot that uses the service
  ctx.registry.registerSlot({
    id: `${ctx.extensionId}:download-button`,
    slotId: 'anime:detail:actions',
    component: () => <DownloadButton onClick={handleDownload} />,
  });
}
```

---

## Module Best Practices

| Practice | Reason |
|----------|--------|
| **Minimal `init` work** | Don't block boot; defer heavy work to `setTimeout` or microtasks |
| **Cleanup in `dispose`** | Prevent memory leaks, close connections, clear intervals |
| **Handle re-init** | Module may be reloaded; guard against double-init |
| **Use `registry` for cross-cutting** | Access other services, register slots, track analytics |
| **Respect permissions** | Network calls go through `ctx.fetch` (main-side enforcement) |

---

## Testing Checklist

- [ ] Service `api` surface is well-defined and documented
- [ ] Service accessible via `extensionRegistry.getService(id)`
- [ ] Module `init` completes without errors
- [ ] Module `dispose` cleans up all resources (timers, sockets, listeners)
- [ ] Module handles being loaded after app boot (late registration)
- [ ] Cross-extension service consumption handles missing service gracefully
- [ ] Works in web, desktop, and mobile builds
- [ ] No memory leaks after repeated load/unload cycles

---

## Related

- [Extension Overview](extensions/overview.md)
- [Manifest Reference](extensions/manifest.md)
- [UI Slots/Pages](extensions/capabilities/ui-slots.md)
- [Renderer Loader](extensions/renderer-loader.md)