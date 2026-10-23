# Analytics Capability

Extensions can contribute analytics sinks **data-driven** (declarative POST endpoints) or **code-driven** (custom provider with full API). Data-driven works for all installed extensions; code-driven requires trust.

---

## Data-Driven Analytics (Manifest)

Declared in `manifest.json` → `contributes.analytics[]`. Registered at boot via `bootstrapExtensions.ts`.

```json
{
  "contributes": {
    "analytics": [
      {
        "ingestUrl": "https://analytics.example.com/ingest",
        "events": ["play", "pause", "seek", "episode_complete", "source_resolve"]
      },
      {
        "ingestUrl": "https://metrics.example.com/tatakai",
        "events": []  // Empty = forward all events
      }
    ]
  }
}
```

### Payload Format

Every event POSTs JSON to `ingestUrl`:

```json
{
  "type": "event" | "pageview" | "error",
  "name": "play",
  "payload": {
    "anilistId": 12345,
    "episode": 1,
    "quality": "1080p",
    "source": "Gogoanime"
  },
  "ts": 1705756800000
}
```

| Type | Name Examples | Payload |
|------|---------------|---------|
| `event` | `play`, `pause`, `seek`, `episode_complete`, `source_resolve`, `download_start`, `theme_change` | Event-specific |
| `pageview` | `/watch/123/1`, `/read/456/1`, `/settings` | `{ title, path }` |
| `error` | `source_failed`, `playback_error`, `sync_failed` | `{ message, stack, context }` |

### Implementation

```ts
// bootstrapExtensions.ts
function makeIngestProvider(extensionId: string, idx: number, cfg: ContributedAnalytics): AnalyticsProvider {
  const allow = new Set((cfg.events || []).filter(Boolean));
  const shouldSend = (name: string) => allow.size === 0 || allow.has(name);
  
  const post = (type: string, name: string, payload: Record<string, unknown>) => {
    if (!shouldSend(name)) return;
    fetch(cfg.ingestUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, name, payload, ts: Date.now() }),
      keepalive: true,  // Survives page transitions
    }).catch(() => { /* ignore network errors */ });
  };

  return {
    id: `${extensionId}:analytics:${idx}`,
    trackEvent: (name, params) => post('event', name, params || {}),
    trackPageView: (path, title) => post('pageview', path, { title }),
    trackError: (error, context) => post('error', error.message, { ...context }),
  };
}
```

**Fire-and-forget:** Uses `keepalive: true` to survive navigation. Network errors silently ignored.

---

## Code-Driven Analytics (Renderer)

For custom logic (batching, sampling, enrichment), implement `AnalyticsProvider` in renderer bundle:

```ts
// renderer.js
export async function activate(ctx) {
  const provider: AnalyticsProvider = {
    id: `${ctx.extensionId}:custom-analytics`,
    trackEvent: (name, params) => {
      // Custom logic: batch, sample, enrich, transform
      myAnalyticsQueue.push({ name, params, timestamp: Date.now() });
      if (myAnalyticsQueue.length >= 10) flush();
    },
    trackPageView: (path, title) => {
      myAnalyticsQueue.push({ type: 'pageview', path, title, timestamp: Date.now() });
    },
    trackError: (error, context) => {
      // Send immediately for errors
      sendToEndpoint({ type: 'error', error: error.message, context });
    },
  };
  
  ctx.analytics.registerProvider(provider);
}
```

### AnalyticsProvider Interface

```ts
interface AnalyticsProvider {
  id: string;                                    // Namespaced
  trackEvent: (name: string, params?: Record<string, any>) => void;
  trackPageView: (path: string, title?: string) => void;
  trackError?: (error: Error, context?: Record<string, any>) => void;
}
```

### Registration

```ts
// ExtensionContext.analytics
analytics.registerProvider(provider);
```

**Trust-gated:** Only loads for trusted extensions.

---

## Core Analytics Service

**File:** `src/core/analytics/AnalyticsService.ts`

```ts
class AnalyticsService {
  private providers: Map<string, AnalyticsProvider> = new Map();
  
  registerProvider(provider: AnalyticsProvider) { ... }
  unregisterProvider(id: string) { ... }
  
  // Fan-out to all registered providers
  trackEvent(name: string, params?: Record<string, any>) {
    this.providers.forEach(p => p.trackEvent?.(name, params));
  }
  
  trackPageView(path: string, title?: string) { ... }
  trackError(error: Error, context?: Record<string, any>) { ... }
}
```

**Auto-tracked events (core):**

| Event | When |
|-------|------|
| `app_boot` | App startup |
| `theme_change` | Theme switched |
| `language_change` | Language switched |
| `playback_start` | Video playback begins |
| `playback_complete` | Episode finishes |
| `source_resolve` | Sources fetched |
| `download_start` | Download queued |
| `download_complete` | Download finishes |
| `sync_start` | MAL/AniList sync begins |
| `sync_complete` | Sync finishes |
| `extension_install` | Extension installed |
| `extension_enable` | Extension enabled |

---

## Testing Checklist

- [ ] Data-driven: `ingestUrl` is HTTPS
- [ ] Data-driven: `events` allowlist works (empty = all)
- [ ] Data-driven: `keepalive: true` survives navigation
- [ ] Code-driven: Provider implements all three methods
- [ ] Code-driven: Batching/sampling doesn't lose critical events
- [ ] Code-driven: Errors sent immediately
- [ ] Both: Events appear in external dashboard
- [ ] Both: No console errors on network failure

---

## Privacy Notes

- **No PII** in payloads (only anilistId, episode, quality, source name)
- **Opt-out:** Users can disable analytics in Settings → Privacy
- **Local-first:** Core analytics can run without external endpoints
- **Transparent:** All events documented above

---

## Related

- [Extension Overview](extensions/overview.md)
- [Manifest Reference](extensions/manifest.md)
- [Themes Capability](extensions/capabilities/themes.md)
- [UI Slots/Pages](extensions/capabilities/ui-slots.md)