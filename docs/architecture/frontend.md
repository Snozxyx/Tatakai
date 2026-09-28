# Frontend Architecture (`src/`)

The frontend is a **Vite + React 18 + TypeScript** single-page app. The same
build is served on the web (Vercel/PWA), wrapped by Electron for desktop, and
packaged by Capacitor for Android. This document explains how the app is wired.

## Stack

| Concern | Choice |
| --- | --- |
| Build | Vite |
| UI | React 18 + TypeScript, Tailwind CSS, shadcn-style primitives in `components/ui/` |
| Routing | `react-router-dom` v6 |
| Server state | `@tanstack/react-query` v5 |
| Local persistence | Dexie (IndexedDB) — offline library, caches, resume state |
| Auth / backend | `@supabase/supabase-js` |
| Animation | `framer-motion` |
| i18n | `i18next` / `react-i18next` (`src/locales/`) |

## Entry points

- `src/main.tsx` — bootstraps React, providers, and the router.
- `src/App.tsx` — top-level app shell.
- `src/routes/AppRoutes.tsx` — **central route composition**. Page domains under
  `src/pages/` are assembled here rather than scattered across the tree.
- `src/layouts/` — shared layout shells (e.g. `MainLayout`, which mounts global
  chrome such as the announcement popup and mobile nav).

## Routing & pages

Pages are grouped by product domain under `src/pages/`:

```
pages/
├── base/        home, search, downloads, extension detail, …
├── auth/        sign-in, setup, reset-password
├── watch/       anime info + player
├── manga/       manga hub, detail, reader
├── community/   feed platform
├── profile/     user profiles, public playlists
├── admin/       admin dashboard
├── forum/       forum surfaces
├── novel/       light-novel surfaces
├── custom/      extension-provided "custom source" verticals (/x/:ns/:sourceId)
├── legal/       legal pages
└── error/       error / offline screens
```

Large pages are being split into **presentational + logic modules** (for example
`AdminPage` → `UserManagementTab` + `StatTile`) so screens stay readable; expect
more pages to follow this pattern.

## The `core/` domain layer

`src/core/` holds framework-agnostic domain logic, kept out of components so it is
testable and reusable across web/desktop/mobile:

| Module | Responsibility |
| --- | --- |
| `core/providers/` | Streaming/manga provider clients and debrid orchestration (`realdebrid-client`, `torbox-client`, `debrid-orchestrator`). |
| `core/player/` | Playback engine glue (source selection, failover, quality). |
| `core/content/` | Content clients (anime/manga/character metadata). |
| `core/download/` | Download orchestration used by anime + manga download flows. |
| `core/recommendations/` | The hybrid recommender client. |
| `core/extensions/` | The extension runtime (see below). |
| `core/cache/` | Client caches, including the extension result cache. |
| `core/network/` | Fetch/proxy helpers and network policy. |
| `core/db/` | Dexie schema and local persistence. |
| `core/analytics/`, `core/activity/` | Instrumentation and activity tracking. |
| `core/feature-flags/` | Runtime feature flags / kill-switches. |

## The extension runtime (`core/extensions/`)

This is the client half of the extension system:

- `ExtensionRegistry.ts` — the in-memory registry of loaded extensions.
- `bootstrapExtensions.ts` / `defaultExtensions.ts` — startup wiring and built-ins.
- `rendererLoader.ts` — loads **code-plane** contributions (React pages, UI slots,
  services, themes) into the app's React runtime, behind the trust gate.
- `ExtensionSlot.tsx` — the component that renders extension-contributed UI into
  named slots across the app.
- `sdk/` — the API surface extensions build against.
- `store-api.ts` / `marketplace-client.ts` — the extension store/marketplace client.

Full details, including the security model, are in
[extension/renderer-loader.md](../extension/renderer-loader.md) and
[extension/security.md](../extension/security.md).

## App-wide state (`contexts/`)

- **`AuthContext`** — the signed-in user and session.
- **`BackendStatusContext`** — a **tri-state** (online / degraded / offline)
  backend health signal used to drive graceful offline behavior across the app.
- **`SettingsModalContext`** — controls the settings modal, including deep-links
  such as `openSettings('changelog')` used by the announcement popup.
- **`IdleReclaimProvider`** — reclaims resources when the app is idle.

## Data fetching

Server data is fetched through React Query hooks under `src/hooks/api/` (and
sibling domain hook folders: `auth`, `user`, `community`, `media`, `moderation`,
`admin`). Requests go to the **API proxy** and Supabase rather than to provider
hosts directly. Repeated provider results (anime servers, manga chapters) are
served instantly from a persistent SWR-style **extension result cache**; see
[features/streaming-playback.md](../features/streaming-playback.md) and
[features/manga.md](../features/manga.md).

## Offline & resilience

The desktop app is designed to **degrade gracefully** when the backend is
unreachable:

- `BackendStatusContext` exposes the tri-state health above.
- `ProtectedRoute` keeps an offline-safe route whitelist so the app remains
  navigable without a session round-trip.
- An `OfflineBanner` communicates degraded state.
- Downloaded anime and manga remain fully usable offline (see
  [features/downloads-and-offline.md](../features/downloads-and-offline.md)).

## Assets

Static assets live in `public/` and are served from the site root:

```
public/
├── assets/
│   ├── badge/    rank/role/premium badges
│   ├── brand/    marketing media (screenshots, feature clips)
│   ├── image/    content imagery
│   ├── logo/     app identity (logos, banner, favicon, placeholder targets)
│   ├── rank/     Mitsu + Chikra rank art
│   └── video/    ambient background video
├── manifest.json  robots.txt  sitemap.xml  sw.js   (web-platform files, kept at root)
└── placeholder.svg
```

When adding a public asset, reference it by its served path (e.g.
`/assets/logo/tatakaibanner.png`). PWA/SEO files (`manifest.json`, `robots.txt`,
`sitemap.xml`, `sw.js`) must stay at the public root.
