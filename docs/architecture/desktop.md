# Desktop Architecture (Electron)

## Overview

The desktop app wraps the React SPA in **Electron**, adding native integrations: torrent engine, proxy/WARP, extension host, background services, and OS integration (tray, menus, protocols).

---

## Process Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          MAIN PROCESS (Node.js)                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                        desktop/main.ts                                 │  │
│  │  • App lifecycle (ready, quit, activate)                              │  │
│  │  • Window management (create, configure, state)                       │  │
│  │  • Menu & Tray                                                        │  │
│  │  • Protocol handlers (tatakai://, custom-source://)                   │  │
│  │  • Auto-updater (electron-updater)                                    │  │
│  │  • Crash reporter                                                     │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                    │                                        │
│         ┌──────────────────────────┼──────────────────────────┐            │
│         ▼                          ▼                          ▼            │
│  ┌─────────────┐           ┌─────────────┐           ┌─────────────┐      │
│  │   IPC       │           │  Extension  │           │  Background │      │
│  │   Layer     │           │  API Host   │           │  Services   │      │
│  │             │           │             │           │             │      │
│  │ • extension:*│          │ • HTTP API  │           │ • Torrent   │      │
│  │ • torrent:*  │          │ • Bundle    │           │ • Proxy     │      │
│  │ • proxy:*    │          │   Loader    │           │ • WARP      │      │
│  │ • download:* │          │ • kai-format│           │ • Download  │      │
│  │ • window:*   │          │             │           │ • Sync      │      │
│  │ • settings:* │          │             │           │ • Update    │      │
│  └─────────────┘           └─────────────┘           └─────────────┘      │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
             ┌──────────┐    ┌────────────┐  ┌──────────────┐
             │Renderer 1│    │Renderer 2  │  │Renderer N    │
             │(Main App)│    │(Ext Page A)│  │(Ext Page B)  │
             └──────────┘    └────────────┘  └──────────────┘
```

---

## Main Process (`desktop/main.ts`)

### Window Configuration

```ts
function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 16, y: 16 }, // macOS
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: true,
    },
  });

  // CSP for security
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
          "script-src 'self' 'wasm-unsafe-eval'; " +
          "style-src 'self' 'unsafe-inline'; " +
          "img-src 'self' data: blob: https:; " +
          "media-src 'self' blob: https:; " +
          "connect-src 'self' https: wss: http://127.0.0.1:*; " +
          "worker-src 'self' blob:; " +
          "frame-src 'self' https:;",
        ],
      },
    });
  });

  // Load URL (dev vs prod)
  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(join(__dirname, '../dist/index.html'));
  }

  return win;
}
```

### Preload Script (`desktop/preload/preload.ts`)

```ts
// Secure bridge: only expose what's needed
contextBridge.exposeInMainWorld('tatakai', {
  // Version info
  version: app.getVersion(),
  platform: process.platform,

  // IPC invocations (typed)
  ipc: {
    invoke: (channel: string, ...args: unknown[]) =>
      ipcRenderer.invoke(channel, ...args),
    on: (channel: string, listener: (...args: unknown[]) => void) =>
      ipcRenderer.on(channel, listener),
    off: (channel: string, listener: (...args: unknown[]) => void) =>
      ipcRenderer.off(channel, listener),
  },

  // Native dialogs
  dialog: {
    showOpenDialog: (options: OpenDialogOptions) =>
      ipcRenderer.invoke('dialog:open', options),
    showSaveDialog: (options: SaveDialogOptions) =>
      ipcRenderer.invoke('dialog:save', options),
    showMessageBox: (options: MessageBoxOptions) =>
      ipcRenderer.invoke('dialog:message', options),
  },

  // Window controls
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    setFullScreen: (fullscreen: boolean) =>
      ipcRenderer.invoke('window:setFullScreen', fullscreen),
  },

  // Shell integration
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
    openPath: (path: string) => ipcRenderer.invoke('shell:openPath', path),
    showItemInFolder: (path: string) => ipcRenderer.invoke('shell:showInFolder', path),
  },

  // App info
  app: {
    getPath: (name: 'userData' | 'temp' | 'downloads') =>
      ipcRenderer.invoke('app:getPath', name),
    relaunch: () => ipcRenderer.invoke('app:relaunch'),
    quit: () => ipcRenderer.invoke('app:quit'),
  },
});
```

**Type Definitions:** `desktop/preload/preload.d.ts`

---

## IPC Layer (`desktop/ipc/`)

### Handler Registration

```ts
// desktop/ipc/index.ts
export function registerIpcHandlers() {
  // Extension management
  ipcMain.handle('extension:install', handleExtensionInstall);
  ipcMain.handle('extension:uninstall', handleExtensionUninstall);
  ipcMain.handle('extension:enable', handleExtensionEnable);
  ipcMain.handle('extension:disable', handleExtensionDisable);
  ipcMain.handle('extension:list', handleExtensionList);
  ipcMain.handle('extension:invoke', handleExtensionInvoke); // Fallback

  // Torrent engine
  ipcMain.handle('torrent:add', handleTorrentAdd);
  ipcMain.handle('torrent:remove', handleTorrentRemove);
  ipcMain.handle('torrent:pause', handleTorrentPause);
  ipcMain.handle('torrent:resume', handleTorrentResume);
  ipcMain.handle('torrent:stream', handleTorrentStream);
  ipcMain.handle('torrent:files', handleTorrentFiles);
  ipcMain.on('torrent:progress', handleTorrentProgress); // Event stream

  // Proxy/WARP
  ipcMain.handle('proxy:configure', handleProxyConfigure);
  ipcMain.handle('proxy:test', handleProxyTest);
  ipcMain.handle('proxy:status', handleProxyStatus);
  ipcMain.handle('warp:connect', handleWarpConnect);
  ipcMain.handle('warp:disconnect', handleWarpDisconnect);
  ipcMain.handle('warp:status', handleWarpStatus);

  // Downloads
  ipcMain.handle('download:queue', handleDownloadQueue);
  ipcMain.handle('download:pause', handleDownloadPause);
  ipcMain.handle('download:resume', handleDownloadResume);
  ipcMain.handle('download:cancel', handleDownloadCancel);
  ipcMain.handle('download:retry', handleDownloadRetry);
  ipcMain.handle('download:open', handleDownloadOpen);
  ipcMain.handle('download:folder', handleDownloadFolder);
  ipcMain.on('download:progress', handleDownloadProgress);

  // Settings (encrypted)
  ipcMain.handle('settings:get', handleSettingsGet);
  ipcMain.handle('settings:set', handleSettingsSet);
  ipcMain.handle('settings:reset', handleSettingsReset);

  // Window management
  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('window:maximize', () => mainWindow?.maximize());
  ipcMain.handle('window:close', () => mainWindow?.close());
  // ...

  // Auto-updater
  ipcMain.handle('update:check', handleUpdateCheck);
  ipcMain.handle('update:download', handleUpdateDownload);
  ipcMain.handle('update:install', handleUpdateInstall);
}
```

### Type-Safe IPC (Shared)

**File:** `shared/ipc/channels.ts`

```ts
// Shared between main and renderer
export const IpcChannels = {
  // Extension
  'extension:install': { args: [String, String], return: ExtensionManifest }, // path, source
  'extension:uninstall': { args: [String], return: void }, // namespace
  'extension:invoke': { args: [String, String, unknown[]], return: unknown }, // namespace, method, args

  // Torrent
  'torrent:add': { args: [TorrentAddOptions], return: TorrentInfo },
  'torrent:stream': { args: [String, Number], return: StreamInfo }, // infoHash, fileIndex

  // Downloads
  'download:queue': { args: [DownloadItem], return: String }, // returns downloadId
  'download:progress': { args: [DownloadProgress], return: void }, // Event (on)

  // Settings
  'settings:get': { args: [String], return: unknown }, // key
  'settings:set': { args: [String, unknown], return: void }, // key, value
} as const;
```

---

## Extension API Host (`desktop/runtime/extension-api-host/`)

### Host Server (`host-server.cjs`)

```js
// Loads extension bundles, exposes HTTP + IPC
class ExtensionHost {
  constructor() {
    this.extensions = new Map(); // namespace -> ExtensionInstance
    this.servers = new Map();    // namespace -> HTTP server
    this.portBase = 49152;       // Dynamic port allocation
  }

  async loadExtension(namespace, bundlePath, manifest) {
    // 1. Validate manifest (kai-format)
    const validated = await validateManifest(manifest);

    // 2. Create isolated context for bundle
    const context = createBundleContext(namespace, validated);

    // 3. Load bundle.js (CommonJS)
    const bundle = require(bundlePath);

    // 4. Initialize bundle with context
    if (bundle.init) await bundle.init(context);

    // 5. Start HTTP server for this extension
    const port = this.portBase++;
    const server = createHttpServer(bundle, namespace, port);
    await server.listen(port);

    // 6. Register IPC fallback
    ipcMain.handle(`extension:invoke:${namespace}`, (_, method, args) =>
      invokeBundleMethod(bundle, method, args)
    );

    this.extensions.set(namespace, { bundle, manifest: validated, port, server });
  }

  // Route: GET /api/v3/:namespace/sources
  // Route: GET /api/v3/:namespace/manga
  // Route: POST /api/v3/:namespace/custom-source/:sourceId/*
}
```

### Bundle Context (Node Side)

```ts
// Provided to extension's bundle.js
interface BundleContext {
  namespace: string;
  manifest: Manifest;
  logger: Logger;
  config: ExtensionConfig;        // User settings for this extension
  storage: ExtensionStorage;      // Key-value (encrypted)
  http: HttpClient;               // Outbound requests (with declared permissions)
  cache: CacheClient;             // Redis-backed cache
  database: DatabaseClient;       // SQLite for extension data
  emit: (event: string, data: unknown) => void; // Events to renderer
}
```

---

## Native Services

### Torrent Engine (`desktop/runtime/torrent/`)

| Component | Technology | Purpose |
|-----------|------------|---------|
| **WebTorrent** | JS (browser-compatible) | Streaming, DHT, WebRTC |
| **Native Addon** | Rust (libtorrent-rasterbar) | High-performance downloading, piece selection |
| **FFmpeg.wasm** | WebAssembly | Transcoding, thumbnail generation |

**Features:**
- Streaming playback (sequential download)
- Magnet + .torrent file support
- Selective file download
- Progress events via IPC
- Debrid integration (cached torrents → direct links)

### Proxy Service (`desktop/runtime/proxy/`)

```ts
// HTTP/HTTPS proxy with header injection
class ProxyService {
  async configure(config: ProxyConfig) {
    this.config = config;
    await this.restart();
  }

  // Injects Referer, User-Agent, custom headers
  // Only proxies requests that NEED headers (HLS/MP4 with headers)
  // Public URLs pass through untouched
}
```

### WARP Client (`desktop/runtime/warp/`)

- **Binary:** `cloudflare-warp` (Rust, bundled)
- **Modes:** Warp (privacy), Warp+ (speed), Teams (zero-trust)
- **Integration:** System proxy + per-request routing

### Download Manager (`desktop/runtime/download/`)

- Queue with priority, concurrency limits
- Resume support (HTTP Range + torrent piece completion)
- File naming, organization (anime/manga/novel folders)
- Checksum verification
- Progress via IPC events

---

## Extension Loading Flow

```
User installs .kai / enables bundled extension
        │
        ▼
kai-format.cjs validates:
  - manifest.json schema
  - signature (if present)
  - archive structure
  - declared permissions
        │
        ▼
Extension Registry assigns namespace (manifest.id)
        │
        ▼
Extension Host:
  1. Loads bundle.js (Node, CommonJS)
  2. Calls bundle.init(context)
  3. Starts HTTP server on dynamic port
  4. Registers IPC fallback handler
        │
        ▼
If manifest.contributes.rendererEntry:
  1. Copies renderer.js to blob URL
  2. Notifies renderer process (ExtensionRegistry.loadRenderer)
        │
        ▼
Renderer Loader (in web app):
  1. Dynamic import(blobUrl)
  2. Calls activate(ctx) with ExtensionContext
  3. Registers pages, slots, services, modules
```

---

## Background Services (Main Process)

| Service | Schedule | Purpose |
|---------|----------|---------|
| **Sync Scheduler** | Every 30 min | MAL/AniList/MangaBaka bidirectional sync |
| **Update Checker** | Every 4 hours | Check GitHub releases, notify |
| **Cache Cleanup** | Daily | Prune old extension cache, temp files |
| **Database Maintenance** | Weekly | Vacuum SQLite, analyze query plans |
| **Extension Health** | Every 5 min | Ping extension HTTP endpoints, restart dead |

---

## Auto-Updates (`electron-updater`)

```ts
// desktop/main.ts
autoUpdater.setFeedURL({
  provider: 'github',
  owner: 'snozxyx',
  repo: 'Tatakai',
});

autoUpdater.on('update-available', (info) => {
  mainWindow.webContents.send('update:available', info);
});

autoUpdater.on('update-downloaded', (info) => {
  mainWindow.webContents.send('update:downloaded', info);
});

// User clicks "Install & Restart"
ipcMain.handle('update:install', () => {
  autoUpdater.quitAndInstall(false, true);
});
```

**Channels:** `latest` (stable), `beta` (pre-release), `alpha` (nightly)

---

## OS Integration

| Feature | Implementation |
|---------|----------------|
| **Protocol Handler** | `tatakai://watch/:animeId/:episodeId`, `tatakai://read/:mangaId/:chapterId` |
| **Tray** | Minimize to tray, quick actions (play/pause, search) |
| **Jump List (Win) / Dock Menu (macOS)** | Recent anime, continue watching |
| **Global Shortcuts** | `MediaPlayPause`, `MediaNextTrack`, `MediaPreviousTrack` |
| **File Associations** | `.kai` → "Install Extension", `.torrent` → "Add to Tatakai" |
| **Notifications** | Native OS notifications (new episode, download complete, sync) |

---

## Security Hardening

| Measure | Implementation |
|---------|----------------|
| **Context Isolation** | Enabled (default) |
| **Node Integration** | Disabled in renderer |
| **Sandbox** | Enabled for all renderer processes |
| **CSP** | Strict, nonces for inline scripts |
| **Permission Model** | Extensions declare `networkAccess`, `nativeAccess` in manifest |
| **Encrypted Settings** | `ENCRYPTION_KEY` + `crypto.subtle` (AES-GCM) |
| **Code Signing** | Windows (EV cert), macOS (Developer ID + Notarization) |

---

## Build & Distribution

### Build Commands

```bash
# Development
pnpm dev:desktop

# Production builds
pnpm build:desktop --win      # NSIS installer + portable
pnpm build:desktop --mac      # DMG + ZIP (universal)
pnpm build:desktop --linux    # AppImage + deb + rpm + snap

# All platforms
pnpm build:desktop
```

### Electron Builder Config (`desktop/builder.json5`)

```json5
{
  "appId": "me.tatakai.app",
  "productName": "Tatakai",
  "copyright": "Copyright © 2024 Snozxyx",
  "directories": { "output": "dist", "buildResources": "buildResources" },
  "files": [
    "dist/**/*",
    "preload.js",
    "runtime/**/*",
    "extensions/**/dist/**/*"
  ],
  "extraResources": [
    { "from": "extensions/", "to": "extensions/", "filter": ["**/*"] }
  ],
  "win": { "target": ["nsis", "portable"], "icon": "buildResources/icon.ico" },
  "mac": { "target": ["dmg", "zip"], "icon": "buildResources/icon.icns", "hardenedRuntime": true },
  "linux": { "target": ["AppImage", "deb", "rpm", "snap"], "icon": "buildResources/icon.png" },
  "nsis": { "oneClick": false, "allowToChangeInstallationDirectory": true },
  "publish": { "provider": "github", "owner": "snozxyx", "repo": "Tatakai" }
}
```

---

## Debugging

### Main Process

```bash
# Start with inspector
pnpm dev:desktop --inspect=9229

# VS Code launch.json
{
  "type": "node",
  "request": "attach",
  "name": "Attach to Electron Main",
  "port": 9229,
  "skipFiles": ["<node_internals>/**"]
}
```

### Renderer Process

- `Ctrl+Shift+I` (or `View → Toggle Developer Tools`)
- React DevTools, TanStack Query DevTools available

### Extension Host

- Logs to main process console
- HTTP API: `http://127.0.0.1:<port>/api/v3/<namespace>/...`
- Health check: `GET /api/v3/<namespace>/health`

---

## Related Documents

- [Architecture Overview](architecture/overview.md) — Full system
- [Frontend Architecture](architecture/frontend.md) — React app
- [Backend & Data](architecture/backend.md) — Supabase, API proxy
- [Extension System](extensions/overview.md) — Extension architecture