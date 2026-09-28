# Desktop Architecture (`desktop/`)

The desktop app is an **Electron** shell around the same web build. It provides
native capabilities the browser can't: local media serving, torrent streaming,
request proxying/anti-bot bypass, an in-process extension-API host, an optional
home server, downloads, and OS integration (tray, shortcuts, Discord RPC,
auto-update).

All files are CommonJS (`.cjs`) because they run in the Electron main process.

## Process model

```
┌─────────────────────────── Electron main process ───────────────────────────┐
│  main.cjs                                                                     │
│    ├── window/            BrowserWindow creation + global shortcuts           │
│    ├── ipc/               IPC handlers (one module per domain)                │
│    ├── runtime/           long-running subsystems (torrent, proxy, hosts, …)  │
│    └── services/          background services (updates, auto-DL, RPC, …)      │
└───────────────────────────────────┬───────────────────────────────────────────┘
                                     │  contextBridge (preload.cjs → window.electron)
┌───────────────────────────────────▼───────────────────────────────────────────┐
│  Renderer  (the React app from src/, loaded from the built dist/)             │
└───────────────────────────────────────────────────────────────────────────────┘
```

- **`main.cjs`** — creates the window, wires IPC, and starts runtime subsystems.
  Non-essential runtime services are **deferred** at startup to reduce memory and
  speed up first paint.
- **`preload.cjs`** — the security boundary. It exposes a curated `window.electron`
  API to the renderer via `contextBridge`; the renderer never gets raw Node access.
- **`splash.html` / `offline.html`** — the startup splash and the offline
  fallback document.

## IPC surface (`desktop/ipc/`)

Each IPC domain is its own module so the surface stays legible:

| Module | Domain |
| --- | --- |
| `ipc-media.cjs` | Local media serving (`tatakai-media://`) and probing |
| `ipc-library.cjs` / `ipc-manga-library.cjs` | Downloaded anime / manga libraries |
| `ipc-download-manager.cjs` / `ipc-manga-download-manager.cjs` | Download queues |
| `ipc-torrent.cjs` | Torrent session control |
| `ipc-runtime.cjs` | Runtime subsystem control |
| `ipc-system.cjs` | OS integration |
| `ipc-theme.cjs` | Theme bridge |
| `ipc-home-server.cjs` | The optional home server |

> **Header loss across IPC:** request headers do not survive the IPC boundary,
> so downloaders that need provider headers (referer, cookies, etc.) run in the
> **main process**, not the renderer. This is why manga/anime downloading and
> media fetching live behind IPC rather than in client code.

## Runtime subsystems (`desktop/runtime/`)

| Subsystem | Responsibility |
| --- | --- |
| `torrent/` | Torrent session, candidate discovery, HLS remux, and stream bridging for torrent playback. |
| `proxy/` | Local proxy server and Cloudflare/anti-bot bypass so provider hosts are reachable. |
| `extension-api-host/` | In-process HTTP host that serves the extension API (e.g. `/api/v3/<ns>/manga/{chapters,pages}`), with a supervisor. This is what makes manga reading HTTP-primary and generic across manga-capable extensions. |
| `home-server/` | The optional self-hosted server (see [../guides/home-server.md](../guides/home-server.md)). |
| `share-tunnel/` / `warp/` | Tunnels used for host-streamed Watch2Together sessions and outbound connectivity. |
| `download/` / `library/` | Download engine and on-disk library management. |
| `security/` | Runtime security helpers. |
| `extension/` | Desktop-side extension packaging/formatting (`kai-format`). |

## Background services (`desktop/services/`)

`auto-downloader` (queued/automatic downloads), `update-manager` (auto-update; see
[../guides/desktop-signing.md](../guides/desktop-signing.md)), `discord-rpc`,
`crash-service` / `error-tracker`, `external-player`, `media-probe`,
`perf-monitor`, `platform-adapter`, `theme-bridge`, `branding-init`, and
`log-service`.

## Memory & resilience

- A **disk-cache cap** bounds Electron's on-disk cache.
- Runtime services are started lazily/deferred rather than all at boot.
- Combined with the renderer's offline behavior
  ([frontend.md](frontend.md#offline--resilience)), the desktop app stays usable
  when the backend is unreachable and downloaded content stays playable offline.

## Local media serving

Downloaded and remuxed media is served to the renderer via a custom
`tatakai-media://` protocol handled in `ipc-media.cjs`, so the player can treat
local files like any other source.

## Building & signing

See [../guides/development.md](../guides/development.md) for `electron:dev` /
`electron:build`, and [../guides/desktop-signing.md](../guides/desktop-signing.md)
for code signing and how it interacts with auto-update.
