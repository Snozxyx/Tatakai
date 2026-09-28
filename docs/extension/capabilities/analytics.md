# Injected Analytics

An extension can inject analytics providers that receive **every** app analytics
event (page views, events, errors). Providers are fanned out to by the app's
`AnalyticsService` singleton, isolated per-call so a throwing provider can't
break the others or the built-in GA path.

Two ways to contribute — data-driven (ingest URL) or code-driven (a provider
object from the renderer bundle).

## Data-driven — ingest URL

```jsonc
"capabilities": ["analytics"],
"contributes": {
  "analytics": [
    { "ingestUrl": "https://aurora-analytics.example/ingest", "events": [] }
  ]
}
```

`bootstrapExtensions` wraps each entry into an `AnalyticsProvider` (via
`makeIngestProvider`) that POSTs events to `ingestUrl`, and registers it with
`AnalyticsService`. `events` (optional) can filter which event names are sent;
an empty array means "all".

## Code-driven — provider object

From the renderer bundle's `activate(ctx)`:

```ts
ctx.analytics.registerProvider({
  id: `${EXT_ID}:analytics`,
  trackEvent: (name, params) => ctx.log('event', name, params),
  trackPageView: (path, title) => ctx.log('pageview', path),
  trackError: (err, context) => ctx.log('error', err?.message),
});
```

### `AnalyticsProvider`

```ts
interface AnalyticsProvider {
  id: string;                                                    // namespaced with the extension id
  trackEvent: (name: string, params?: Record<string, any>) => void;
  trackPageView: (path: string, title?: string) => void;
  trackError?: (error: Error, context?: Record<string, any>) => void;
}
```

## How it wires up

- `src/core/analytics/AnalyticsService.ts` holds `private providers[]` with
  `registerProvider` / `unregisterProvider`. `trackEvent` / `trackPageView` /
  `trackError` call the built-in sinks first, then fan out to every provider
  inside individual `try/catch` blocks.
- `analytics.init()` already runs in `main.tsx`; providers are consulted
  **per-call**, so late registration during boot is safe — events fired after a
  provider registers reach it.
- Provider ids are prefixed with the extension id so `unregisterAll` removes
  them on unload.

## Privacy note

Analytics providers see all app events. Only trusted (sideloaded/signed)
extensions load renderer code that can register code providers; ingest URLs are
declared statically in the manifest and visible to the user.
