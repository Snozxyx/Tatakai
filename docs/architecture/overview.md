# Architecture Overview

Tatakai follows a **four-plane architecture** separating concerns across the web app, desktop shell, API proxy, and data layer.

---

## The Four Planes

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PLANE 1: WEB APP (React SPA)                      │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────────┐  │
│  │   Routing    │ │   Contexts   │ │  Data Fetch  │ │     UI Layer     │  │
│  │  (React      │ │  (Auth,      │ │  (TanStack   │ │  (Components,    │  │
│  │   Router)    │ │   Settings,  │ │   Query)     │ │   Theme,         │  │
│  │              │ │   Extensions)│ │              │ │   Animations)    │  │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────────┘  │
│         │                │                │                    │          │
│         └────────────────┼────────────────┼────────────────────┘          │
│                          ▼                ▼                               │
│                   ┌──────────────────────────────┐                        │
│                   │       CORE DOMAIN LAYER      │                        │
│                   │  extensions/  content/  api/ │                        │
│                   └──────────────────────────────┘                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
         ┌──────────────────┐ ┌───────────────┐ ┌──────────────────┐
         │ PLANE 2: DESKTOP │ │ PLANE 3: API  │ │ PLANE 4: DATA    │
         │    SHELL         │ │    PROXY      │ │     LAYER        │
         │   (Electron)     │ │  (TatakaiAPI) │ │   (Supabase)     │
         ├──────────────────┤ ├───────────────┤ ├──────────────────┤
         │ • Main Process   │ │ • Rate Limit  │ │ • PostgreSQL     │
         │ • Preload/IPC    │ │ • Cache       │ │ • Auth (OAuth,   │
         │ • Native Services│ │ • Auth Proxy  │ │   Email, Magic)  │
         │   - Torrent      │ │ • Request     │ │ • Realtime       │
         │   - Proxy/WARP   │ │   Transform   │ │ • Storage        │
         │   - Extension    │ │ • Edge Funcs  │ │ • Edge Functions │
         │     Host         │ │               │ │                  │
         │ • Background     │ │               │ │                  │
         │   Workers        │ │               │ │                  │
         └──────────────────┘ └───────────────┘ └──────────────────┘
```

---

## Plane 1: Web App (React SPA)

**Entry:** `src/main.tsx` → `App.tsx` → Router

### Key Architectural Decisions

| Aspect | Choice | Rationale |
|--------|--------|-----------|
| **State** | Zustand (global) + TanStack Query (server) | Separation of client vs server state |
| **Routing** | React Router v7 | Nested routes, lazy loading, data loaders |
| **Styling** | Tailwind CSS + CSS Variables | Theming, design tokens, dark/light |
| **Components** | shadcn/ui + custom | Accessible, customizable, copy-pasteable |
| **Animation** | CSS + Framer Motion (selective) | Performance, reduced-motion support |

### Core Domain Layer (`src/core/`)

```
src/core/
├── api/              # API clients (Supabase, TatakaiAPI, AniList, MAL)
├── content/          # Media types, sources, custom-source runtime
├── extensions/       # Extension system (registry, loader, bootstrap, SDK)
├── database/         # Local DB (Dexie/IndexedDB) for offline
├── hooks/            # Shared domain hooks
├── utils/            # Domain utilities
└── types/            # Shared TypeScript types
```

### Feature Modules (`src/features/`)

Each feature is self-contained:
```
features/
├── anime/            # Calendar, details, watch page
├── manga/            # Reader, library, discovery
├── novels/           # Reader, TTS, library
├── player/           # Video player, controls, subtitles
├── community/        # Posts, profiles, watch-together
├── recommendations/  # Engine, 3D graph, signals
├── downloads/        # Queue, manager, offline access
├── search/           # Universal search, filters, image search
├── settings/         # All settings panels
└── extensions/       # Extension management UI
```

---

## Plane 2: Desktop Shell (Electron)

**Entry:** `desktop/main.ts`

### Process Model

```
┌────────────────────────────────────────────────────────────┐
│                    MAIN PROCESS (Node)                      │
│  ┌─────────────┐  ┌─────────────┐  ┌────────────────────┐  │
│  │   IPC       │  │  Extension  │  │  Background        │  │
│  │   Handlers  │  │  API Host   │  │  Services          │  │
│  │             │  │  (HTTP +    │  │  • Torrent Engine  │  │
│  │  • Window   │  │   IPC)      │  │  • Proxy/WARP      │  │
│  │  • Menu     │  │             │  │  • Download Mgr    │  │
│  │  • Tray     │  │  Bundle     │  │  • Update Checker  │  │
│  │  • Dialogs  │  │  Loader     │  │  • Sync Scheduler  │  │
│  │  • Native   │  │             │  │                    │  │
│  │    APIs     │  │  kai-format │  │                    │  │
│  └─────────────┘  └─────────────┘  └────────────────────┘  │
└────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
       ┌──────────┐    ┌────────────┐  ┌──────────────┐
       │ Renderer │    │ Renderer 2 │  │ Renderer N   │
       │ Process  │    │ Process    │  │ Process      │
       │ (Web App)│    │ (Ext UI)   │  │ (Ext UI)     │
       └──────────┘    └────────────┘  └──────────────┘
```

### Native Services (in `desktop/runtime/`)

| Service | Technology | Purpose |
|---------|------------|---------|
| **Extension API Host** | Node (Express-like) | Loads extension bundles, exposes HTTP + IPC |
| **Torrent Engine** | WebTorrent + native addon | Streaming + downloading torrents |
| **Proxy Service** | Custom HTTP/HTTPS proxy | Referer/UA injection, geo-bypass |
| **WARP Client** | cloudflare-warp (Rust) | Privacy routing, region unlock |
| **Home Server** | Optional self-hosted | Remote access, library server |

### IPC Surface (`desktop/ipc/`)

- **`extension:invoke`** — Call extension methods (fallback to HTTP)
- **`torrent:*`** — Add, remove, stream, progress
- **`proxy:*`** — Configure, test, status
- **`download:*`** — Queue, pause, resume, cancel
- **`window:*`** — Minimize, maximize, fullscreen, tray
- **`settings:*`** — Read/write encrypted settings

### Security

- **Context Isolation** — Enabled
- **Node Integration** — Disabled in renderer
- **Preload Scripts** — Expose only safe APIs via `contextBridge`
- **CSP** — Strict policy, nonces for inline scripts

---

## Plane 3: API Proxy (TatakaiAPI)

**Location:** `supabase/functions/tatakai-api/`

### Responsibilities

| Function | Description |
|----------|-------------|
| **Rate Limiting** | Per-user, per-endpoint, sliding window |
| **Caching** | Redis-backed, TTL per endpoint |
| **Auth Proxy** | Validate Supabase JWT, forward claims |
| **Request Transform** | Normalize external API responses |
| **Edge Functions** | Serverless logic (webhooks, scheduled jobs) |

### Endpoints

| Path | Purpose |
|------|---------|
| `/anime/*` | Search, details, episodes, sources |
| `/manga/*` | Search, details, chapters, pages |
| `/novels/*` | Search, details, chapters, content |
| `/extensions/*` | Manifest validation, catalog |
| `/community/*` | Posts, profiles, notifications |
| `/recommendations/*` | Engine queries, graph data |
| `/sync/*` | MAL/AniList/MangaBaka sync |

### Deployment

- **Production:** Supabase Edge Functions (Deno)
- **Local:** `pnpm supabase:start` → `http://localhost:54321/functions/v1/tatakai-api`

---

## Plane 4: Data Layer (Supabase)

### Database Schema (Key Tables)

| Table | Purpose |
|-------|---------|
| `profiles` | User profiles, settings, stats (two id-spaces: `auth` + `public`) |
| `media_lists` | Unified anime/manga/novel lists (status, progress, scores) |
| `media_entries` | Cached media metadata (titles, images, genres) |
| `watch_progress` | Episode timestamps, auto-skip marks |
| `read_progress` | Chapter/page positions, scroll offsets |
| `downloads` | Download queue, files, progress |
| `extensions` | Installed extensions, manifests, trust status |
| `community_posts` | Posts, comments, reactions |
| `watch_sessions` | Watch-together session state |
| `recommendation_signals` | ML features for recommendation engine |
| `ranks_badges` | User ranks, badge definitions, awards |

### Auth & Identity

- **Supabase Auth** — Email/password, OAuth (Discord, Google, GitHub), Magic Link
- **Two ID Spaces:**
  - `auth.uid()` — Supabase auth user (private)
  - `public_user_id` — Stable public identifier (for profiles, leaderboards)
- **Row Level Security (RLS)** — All tables protected, policies in migrations

### Realtime

| Channel | Events |
|---------|--------|
| `community:posts` | New posts, updates, deletions |
| `watch_together:*` | Playback state, user join/leave |
| `notifications:*` | Mentions, replies, system alerts |
| `downloads:*` | Progress, completion, errors |
| `sync:*` | MAL/AniList sync status |

### Migrations

- Versioned SQL in `supabase/migrations/`
- Applied via `supabase db push` (local) or dashboard (prod)
- **Never edit applied migrations** — create new ones

---

## Data Flow Examples

### 1. Playing an Anime Episode

```
User clicks "Watch" on Episode 5
        │
        ▼
Watch Page (React) → useEpisodeSources(animeId, epNum)
        │
        ▼
Extension Registry → fans out to ALL extensions with `sources` capability
        │
        ▼
Each Extension (Node bundle) → sourcesAll({ titles, anilistId })
        │
        ▼
Host aggregates → returns SourceResult[] (HLS, MP4, torrent)
        │
        ▼
applyProxy() → rewrites headed URLs to local proxy tokens
        │
        ▼
VideoPlayer (MediaChrome + HLS.js) → plays source
```

### 2. Installing an Extension

```
User drops .kai file / clicks "Install from URL"
        │
        ▼
kai-format.cjs → validates manifest, signature, structure
        │
        ▼
Extension Registry → assigns namespace, stores manifest
        │
        ▼
Extension Host → loads bundle.js, starts HTTP server on random port
        │
        ▼
If renderer.js exists → Renderer Loader dynamically imports it
        │
        ▼
activate(ctx) → registers UI slots, pages, services, modules
        │
        ▼
UI updates → new sources appear, new theme available, new pages mounted
```

### 3. Cross-Platform Sync (MAL)

```
User connects MAL in Settings
        │
        ▼
OAuth flow → MAL access_token stored (encrypted) in profiles
        │
        ▼
Sync Scheduler (desktop background) → runs every 30 min
        │
        ▼
TatakaiAPI /sync/mal → fetches user's list, compares with local
        │
        ▼
Bidirectional merge → local changes ↑, remote changes ↓
        │
        ▼
Realtime → pushes updates to all connected clients
```

---

## Extension System Architecture

See [Extension System Overview](extensions/overview.md) for full details.

**Key Files:**
- `src/core/extensions/sdk/types.ts` — Manifest types, capability contracts
- `src/core/extensions/ExtensionRegistry.ts` — Renderer-side pub/sub registry
- `src/core/extensions/rendererLoader.ts` — Dynamic `import()` of renderer bundles
- `desktop/runtime/extension-api-host/host-server.cjs` — Node bundle loader + HTTP router
- `desktop/runtime/extension/kai-format.cjs` — `.kai` validation, signing

---

## Deployment Targets

| Target | Build Command | Output |
|--------|---------------|--------|
| **Web** | `pnpm build` | `dist/` (static SPA) |
| **Desktop (Win)** | `pnpm build:desktop --win` | `desktop/dist/*.exe`, `*.msi` |
| **Desktop (macOS)** | `pnpm build:desktop --mac` | `desktop/dist/*.dmg`, `*.app` |
| **Desktop (Linux)** | `pnpm build:desktop --linux` | `desktop/dist/*.AppImage`, `*.deb`, `*.rpm` |
| **Android** | `pnpm cap:run:android --prod` | `mobile/android/app/build/outputs/*.apk` |
| **iOS** | `pnpm cap:run:ios --prod` | Xcode Archive → TestFlight/App Store |

---

## Related Documents

- [Frontend Architecture](architecture/frontend.md) — React app deep dive
- [Desktop Architecture](architecture/desktop.md) — Electron, native services, IPC
- [Backend & Data](architecture/backend.md) — Supabase schema, API, migrations
- [Extension System](extensions/overview.md) — Extension architecture, capabilities