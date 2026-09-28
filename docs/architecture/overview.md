# Architecture Overview

Tatakai is one React codebase that ships to three targets, backed by a thin API
proxy and a Supabase project. Understanding the **four planes** below is enough
to place almost any file in the repo.

```
                         ┌─────────────────────────────────────────┐
                         │            React app  (src/)             │
                         │  Vite build → web · desktop · Android    │
                         └───────────────┬─────────────────────────┘
             ┌───────────────────────────┼───────────────────────────┐
             ▼                            ▼                           ▼
   ┌───────────────────┐      ┌────────────────────────┐   ┌───────────────────┐
   │  Web  (Vercel)    │      │  Desktop (Electron)     │   │  Android (Capacitor)│
   │  static + PWA     │      │  desktop/ main + runtime │   │  android/          │
   └─────────┬─────────┘      └───────────┬────────────┘   └─────────┬─────────┘
             │                            │                           │
             └────────────┬───────────────┴───────────────┬──────────┘
                          ▼                                ▼
              ┌────────────────────────┐        ┌────────────────────────┐
              │  TatakaiAPI proxy       │        │  Supabase               │
              │  (tatakaiapi/ + toko)   │        │  auth · Postgres · RPCs │
              │  provider aggregation,  │        │  storage · edge funcs   │
              │  CORS/proxy, webhooks   │        │  (supabase/)            │
              └────────────────────────┘        └────────────────────────┘
```

## 1. The React app (`src/`)

A single Vite + React + TypeScript application is the source of truth for all
three client targets. Key top-level folders:

| Folder | Purpose |
| --- | --- |
| `src/pages/` | Route screens, grouped by domain (`base`, `auth`, `watch`, `manga`, `community`, `profile`, `admin`, `forum`, `novel`, `custom`, `legal`, `error`). |
| `src/routes/` | Central route composition that wires the page domains together. |
| `src/components/` | Reusable UI, grouped by domain (`anime`, `manga`, `reader`, `watch`, `community`, `playlist`, `profile`, `settings`, `admin`, `moderation`, `extensions`, `layout`, `ui`, …). |
| `src/core/` | Framework-agnostic domain logic: `providers`, `player`, `content`, `download`, `recommendations`, `extensions`, `cache`, `network`, `analytics`, `profile`, `db`, `feature-flags`. |
| `src/contexts/` | App-wide React contexts: `AuthContext`, `BackendStatusContext`, `SettingsModalContext`, `IdleReclaimProvider`. |
| `src/hooks/` | Reusable hooks (`api/`, `ui/`, `user/`, …). |
| `src/integrations/` | External-service integration (Supabase client, AniList/MAL). |
| `src/lib/` | Small shared utilities (including `lib/changelog.ts`, the in-app changelog data). |
| `src/services/` | Client-side service wrappers. |
| `src/locales/` | i18n resources. |

See [frontend.md](frontend.md) for how these fit together.

## 2. The desktop shell (`desktop/`)

The Electron layer wraps the same web build and adds native capabilities the
browser can't provide: local media serving, torrent streaming, request proxying,
an in-process extension-API host, an optional home server, and OS integration.

- `desktop/main.cjs` — main-process entry.
- `desktop/preload.cjs` — the `window.electron` bridge exposed to the renderer.
- `desktop/ipc/` — one module per IPC domain (media, library, download managers
  for anime and manga, torrent, runtime, system, theme, home-server).
- `desktop/runtime/` — long-running subsystems: `torrent`, `proxy`,
  `extension-api-host`, `home-server`, `library`, `download`, `share-tunnel`,
  `warp`, `security`, `extension`.
- `desktop/services/` — background services (auto-downloader, update-manager,
  discord-rpc, crash-service, external-player, media-probe, perf-monitor, …).
- `desktop/window/` — window creation and global shortcuts.

See [desktop.md](desktop.md).

## 3. The API proxy (`tatakaiapi/` + provider extensions)

A thin server-side layer aggregates streaming/manga providers, handles CORS and
request proxying, holds provider secrets, and fans out webhooks. It exists so the
clients never talk to raw provider hosts directly and so secrets stay server-side.
Provider logic increasingly lives in **extensions** (e.g. `extension/toko`) that
expose an extension-API surface consumed by both the proxy and the desktop
extension-API host.

See [backend-and-data.md](backend-and-data.md#the-api-proxy).

## 4. Supabase (`supabase/`)

Auth, Postgres, storage, RPCs, and edge functions. Notable characteristics that
shape how you work with it:

- **Two id-spaces in `profiles`** — `profiles.id` and `profiles.user_id` are
  different; mixing them silently returns no rows. See
  [backend-and-data.md](backend-and-data.md#profiles-and-the-two-id-spaces).
- **Writes go through RPCs** — column-level grants mean privileged profile
  writes use `SECURITY DEFINER` functions rather than direct `UPDATE`s.
- **Migrations are written, not auto-applied** in this workflow, and the history
  is not cleanly replayable from scratch. `scripts/check-migrations.mjs`
  validates them. See [guides/development.md](../guides/development.md).

## The extension system spans planes

Extensions are the throughline of V6. A single extension can contribute **data**
(streaming/manga sources, custom verticals) that runs in the Node/host plane, and
**code** (themes, analytics, services, React pages/slots) that runs in the
renderer plane with app privileges behind a trust gate. This is documented in
depth in [extension/](../extension/README.md).

## Where a change usually goes

| Task | Likely location |
| --- | --- |
| New screen or route | `src/pages/<domain>/` + `src/routes/` |
| New reusable UI | `src/components/<domain>/` |
| Provider / player / download logic | `src/core/` (client) and/or the API proxy / an extension |
| Native/desktop capability | `desktop/runtime/` + `desktop/ipc/` + `desktop/preload.cjs` |
| Schema change | a new file in `supabase/migrations/` (written, validated, not applied) |
| New source/theme/UI as an add-on | an **extension** — see [extension/](../extension/README.md) |
