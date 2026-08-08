# Design Document: Electron Extension Platform

## Overview

The Electron Extension Platform is a multi-layered feature set for Tatakai's desktop application. It addresses four interconnected concerns: (1) critical runtime bug fixes to stabilize the desktop experience, (2) a fully implemented setup/onboarding flow with real IPC integrations, (3) a complete extension system with a curated hub, sideloading, sandboxed Web Worker execution, and an SDK, and (4) a country policy display with blurred IP detection and non-blocking restriction warnings.

The desktop Electron process is the first-class host for local extension execution. Web and mobile remain server-first. All new code is written in TypeScript and follows the existing project conventions (React 18, Vite, Zustand, TanStack Query, Tailwind CSS, Radix UI).

---

## Architecture

### High-Level Component Map

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Renderer Process (React)                      │
│                                                                       │
│  SetupPage.tsx          ExtensionHub.tsx        CountryPolicy.tsx    │
│  (onboarding wizard)    (browse/install/manage) (settings panel)     │
│         │                      │                       │             │
│         └──────────────────────┴───────────────────────┘             │
│                                │                                      │
│                    tatakaiRuntime (contextBridge)                     │
│                    window.electron (contextBridge)                    │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ IPC (ipcRenderer.invoke)
┌────────────────────────────────▼────────────────────────────────────┐
│                        Main Process (Node.js)                        │
│                                                                       │
│  ExtensionRegistry          ExtensionWorkerPool    IPCHandlers       │
│  (in-memory map)            (worker lifecycle)     (ipcMain.handle)  │
│         │                          │                                  │
│         └──────────────────────────┘                                 │
│                         │                                             │
│              ExtensionSandbox (Web Worker + Blob URL)                │
│              PermissionGuard (domain allowlist)                       │
│              PayloadSizeGuard (10 MB limit)                           │
│              TimeoutGuard (30s / 2min)                                │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                    Extension SDK (standalone package)                 │
│  src/core/extensions/sdk/                                            │
│  AbstractSource, SourceOptions, SourceResult, SubtitleTrack          │
│  tatakai-sdk.d.ts (injected globals typings)                         │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow: Extension Invocation

```
Renderer calls tatakaiRuntime.invokeExtension(id, method, args)
    │
    ▼
IPC: extension:invoke handler (main.cjs)
    │
    ▼
ExtensionRegistry.lookup(id)  ──── not found ──▶  { success: false, error: "Extension not loaded" }
    │ found
    ▼
ExtensionWorkerPool.getOrSpawn(id)
    │
    ▼
Web Worker (Blob URL, isolated context)
  - self.__tatakai_fetch__   (domain-allowlisted)
  - self.__tatakai_anitomy__ (anitomyscript)
  - self.__tatakai_parse_html__ (cheerio-like)
    │
    ▼
TimeoutGuard (30s per call, 2min cumulative)
PayloadSizeGuard (10 MB response limit)
PermissionGuard (domain allowlist from manifest)
    │
    ▼
Structured result returned to renderer
```

---

## Components and Interfaces

### 1. Extension SDK (`src/core/extensions/sdk/`)

#### `abstract-source.ts`

```typescript
export abstract class AbstractSource {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly version: string;
  abstract readonly type: 'torrent' | 'onlinestream' | 'custom';

  abstract validate(): Promise<boolean>;
  abstract single(options: SourceOptions): Promise<SourceResult[]>;
  abstract batch(options: SourceOptions): Promise<SourceResult[]>;
  abstract movie(options: SourceOptions): Promise<SourceResult[]>;
}
```

#### `types.ts`

```typescript
export interface SourceOptions {
  anilistId: number;
  titles: string[];
  episode?: number;
  episodeCount?: number;
  resolution: string;
  tatakaiId?: string;
  countryCode?: string;
  exclusions?: string[];
  preferredLanguage?: string;
}

export interface SourceResult {
  source: string;
  url: string;
  quality: string;
  headers: Record<string, string>;
  subtitles: SubtitleTrack[];
}

export interface SubtitleTrack {
  url: string;
  label: string;
  language: string;
  default?: boolean;
}

export interface ExtensionManifest {
  id: string;
  name: string;
  version: string;
  type: 'torrent' | 'onlinestream' | 'custom';
  description: string;
  icon?: string;
  permissions: string[];
  signature?: string;
  signedBy?: string;
  approvedAt?: string;
  sideloaded?: boolean;
  deprecated?: boolean;
  screenshots?: string[];
  versionHistory?: VersionEntry[];
}

export interface VersionEntry {
  version: string;
  date: string;
  changelog: string;
}

export interface ExtensionInvokeResult {
  success: boolean;
  result?: SourceResult[];
  error?: string;
  truncated?: boolean;
}
```

#### `tatakai-sdk.d.ts`

```typescript
declare global {
  interface Window {
    __tatakai_fetch__: (url: string, init?: RequestInit) => Promise<Response>;
    __tatakai_anitomy__: (filename: string) => ParsedReleaseMetadata;
    __tatakai_parse_html__: (html: string) => CheerioLikeAPI;
  }
}

interface ParsedReleaseMetadata {
  releaseGroup?: string;
  animeTitle?: string;
  episodeNumber?: number;
  videoResolution?: string;
  audioTerm?: string;
  source?: string;
  isDualAudio?: boolean;
  isBatch?: boolean;
}

interface CheerioLikeAPI {
  find(selector: string): CheerioLikeAPI;
  first(): CheerioLikeAPI;
  attr(name: string): string | undefined;
  text(): string;
  html(): string;
  each(fn: (index: number, el: CheerioLikeAPI) => void): void;
}
```

---

### 2. Extension Registry (`desktop/runtime/extension-registry.cjs`)

```javascript
// In-memory registry of loaded extensions
class ExtensionRegistry {
  constructor() {
    this._registry = new Map(); // extensionId -> { manifest, workerRef, suspendedAt, cumulativeMs }
    this._killSwitches = new Set(); // extensionIds blocked by admin
  }

  register(extensionId, manifest) { ... }
  unregister(extensionId) { ... }
  lookup(extensionId) { ... }
  isKillSwitched(extensionId) { ... }
  setKillSwitch(extensionId, blocked) { ... }
  listLoaded() { ... } // returns string[]
}
```

---

### 3. Extension Worker Pool (`desktop/runtime/extension-worker-pool.cjs`)

```javascript
class ExtensionWorkerPool {
  constructor(registry) {
    this._workers = new Map(); // extensionId -> { worker, cumulativeMs, lastActivity }
  }

  async getOrSpawn(extensionId, extensionCode, manifest) { ... }
  async invoke(extensionId, method, args) { ... }
  terminate(extensionId) { ... }
  terminateAll() { ... }
}
```

Worker lifecycle:
- Workers are spawned lazily on first invocation
- Workers are reused across invocations within a session
- Workers are terminated on `unloadExtension`, on 2-minute cumulative timeout, or on app quit
- Each worker is created from a Blob URL wrapping the extension code with injected globals

---

### 4. Extension Sandbox (`desktop/runtime/extension-sandbox.cjs`)

The sandbox wraps extension code before creating the Blob URL:

```javascript
function wrapExtensionCode(extensionCode, manifest) {
  const allowedDomains = extractAllowedDomains(manifest.permissions);
  return `
    'use strict';
    // Injected runtime APIs
    const fetch = self.__tatakai_fetch__;
    const anitomyscript = self.__tatakai_anitomy__;
    const parseHtml = self.__tatakai_parse_html__;

    // Blocked globals (defensive re-assignment)
    const document = undefined;
    const window = undefined;
    const localStorage = undefined;
    const indexedDB = undefined;
    const XMLHttpRequest = undefined;

    // Extension code
    ${extensionCode}
  `;
}
```

The `__tatakai_fetch__` implementation in the main process enforces the domain allowlist:

```javascript
function createAllowlistedFetch(allowedDomains) {
  return async function(url, init) {
    const hostname = new URL(url).hostname;
    const permitted = allowedDomains.some(pattern => matchDomain(hostname, pattern));
    if (!permitted) {
      throw new Error(`PermissionDeniedError: Domain not allowed: ${hostname}`);
    }
    return fetch(url, init);
  };
}
```

---

### 5. IPC Handlers (`desktop/main.cjs` additions)

New handlers to be registered alongside existing `runtimeHandlers`:

```javascript
const extensionHandlers = {
  'extension:load': async (event, { extensionId, manifest }) => {
    // 1. Read bundle from extensions directory
    // 2. Verify signature if !manifest.sideloaded
    // 3. Check kill-switch
    // 4. Register in ExtensionRegistry
    // Returns: { success: boolean, error?: string }
  },

  'extension:unload': async (event, extensionId) => {
    // 1. Terminate worker if running
    // 2. Remove from registry
    // Returns: { success: true }
  },

  'extension:invoke': async (event, { extensionId, method, args }) => {
    // 1. Lookup in registry
    // 2. Check kill-switch
    // 3. Spawn/reuse worker
    // 4. Apply timeout guard (30s)
    // 5. Apply payload size guard (10 MB)
    // 6. Return result
  },

  'runtime:health': async () => {
    // Returns: { status: "ok", version, loadedExtensions: string[] }
    // Also polls kill-switch list and unloads flagged extensions
  },
};
```

---

### 6. Setup Flow Enhancements (`src/pages/auth/SetupPage.tsx`)

The existing `SetupPage.tsx` has the UI scaffolding but lacks real implementations. The following changes complete each step:

**Step 1 — Storage:**
- Replace `(window as any).electron.getDownloadsDir()` with `window.electron.getDownloadsDir()` (typed)
- Add error boundary: if call throws or returns empty, fall back to OS Downloads path
- Persist path to `localStorage` on step advance, not only on `handleComplete`

**Step 3 — Country Policy:**
- Add `useCountryPolicy()` hook that calls the geolocation endpoint
- Display country name + blurred IP (`filter: blur(6px)`)
- Look up country code in `TORRENT_LEGALITY_TABLE`
- Show green/amber badge
- Remove `disabled={!countryAck}` from Continue button (requirement: non-blocking)
- Add "Reveal IP" toggle

**Step 4 — WARP/DoH:**
- Call `window.tatakaiRuntime.toggleWarp(enableWarp)` on step advance
- Add one-sentence description: "Routes DNS queries through Cloudflare's 1.1.1.1 resolver and optionally proxies traffic to bypass geo-blocks."
- Wrap IPC call in try/catch; show toast on error

**Step 5 — Extensions:**
- Call `setFlag(FeatureFlag.EXTENSION_SCRAPING, enableExtensions)` on complete
- Add secondary notice about sideloading availability in Settings

---

### 7. Country Policy Hook (`src/core/country-policy/useCountryPolicy.ts`)

```typescript
interface CountryPolicyState {
  country: string | null;
  countryCode: string | null;
  ip: string | null;
  isRestricted: boolean;
  isLoading: boolean;
  error: boolean;
  ipRevealed: boolean;
  revealIp: () => void;
}

export function useCountryPolicy(): CountryPolicyState {
  // 1. Fetch geolocation endpoint (5s timeout)
  // 2. Look up countryCode in TORRENT_LEGALITY_TABLE
  // 3. Return state with revealIp toggle
}
```

#### Torrent Legality Table (`src/core/country-policy/torrent-legality.ts`)

```typescript
// 196-country lookup table
// true = permitted, false = restricted
export const TORRENT_LEGALITY_TABLE: Record<string, boolean> = {
  US: true,
  GB: true,
  DE: false,
  FR: false,
  JP: true,
  AU: false,
  // ... all 196 countries
};

export function isTorrentingPermitted(countryCode: string): boolean {
  return TORRENT_LEGALITY_TABLE[countryCode.toUpperCase()] ?? true;
}
```

---

### 8. Extension Hub (`src/pages/extensions/ExtensionHub.tsx`)

The Extension Hub is a new page accessible from the sidebar. It consists of:

- **ExtensionGrid**: Virtualized grid of `ExtensionCard` components
- **ExtensionCard**: Shows name, icon, type badge, version, short description, install/update/uninstall button
- **ExtensionDetailPage**: Full detail view with screenshots carousel, permissions list, version history
- **SideloadPanel**: File picker + URL input with warning dialog
- **ExtensionFilterBar**: Filter by type, sort by name/popularity/updated

State management via Zustand store (`useExtensionStore`):

```typescript
interface ExtensionStore {
  installed: Map<string, ExtensionManifest>;
  available: ExtensionManifest[];
  filter: 'all' | 'torrent' | 'onlinestream' | 'custom';
  sort: 'name' | 'popularity' | 'updated';
  install: (manifest: ExtensionManifest) => Promise<void>;
  uninstall: (extensionId: string) => Promise<void>;
  sideload: (source: File | string) => Promise<void>;
  setFilter: (filter: ExtensionStore['filter']) => void;
  setSort: (sort: ExtensionStore['sort']) => void;
}
```

---

### 9. Layout Fix (`src/components/layout/`)

The sidebar width is exposed as a CSS variable:

```css
:root {
  --sidebar-width: 240px;
  --sidebar-collapsed-width: 64px;
}
```

The main content container applies the offset conditionally:

```tsx
// src/components/layout/MainLayout.tsx
<main
  className={cn(
    "transition-all duration-200",
    sidebarVisible && !isMobile
      ? "lg:pl-[var(--sidebar-width)]"
      : "pl-0"
  )}
>
  {children}
</main>
```

---

### 10. Virtualized Grid and BlurHash (`src/components/browse/`)

```tsx
// VirtualizedAnimeGrid.tsx
import { useVirtualizer } from '@tanstack/react-virtual';
import { isEnabled, FeatureFlag } from '@/core/feature-flags/feature-flags';

export function AnimeGrid({ items }: { items: AnimeItem[] }) {
  if (!isEnabled(FeatureFlag.VIRTUAL_GRID) || items.length <= 50) {
    return <StandardGrid items={items} />;
  }
  return <VirtualizedGrid items={items} />;
}

// AnimeCard.tsx — BlurHash placeholder
export function AnimeCard({ item }: { item: AnimeItem }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="relative">
      {!loaded && item.blurHash && (
        <BlurHashCanvas hash={item.blurHash} width={200} height={280} />
      )}
      <img
        src={item.coverImage}
        onLoad={() => setLoaded(true)}
        className={cn(
          "absolute inset-0 transition-opacity duration-300",
          loaded ? "opacity-100" : "opacity-0"
        )}
      />
    </div>
  );
}
```

---

## Data Models

### Extension Manifest (stored on disk as JSON)

```json
{
  "id": "nyaasearch",
  "name": "Nyaa Search",
  "version": "1.2.0",
  "type": "torrent",
  "description": "Search Nyaa.si for anime torrents",
  "icon": "base64...",
  "permissions": ["network:domain:nyaa.si", "parse:html"],
  "signature": "sha256:abc123...",
  "signedBy": "tatakai-marketplace",
  "approvedAt": "2026-01-15T00:00:00Z",
  "sideloaded": false,
  "screenshots": ["base64...", "base64..."],
  "versionHistory": [
    { "version": "1.2.0", "date": "2026-02-01", "changelog": "Improved search accuracy" }
  ]
}
```

### Extension Registry Entry (in-memory)

```typescript
interface RegistryEntry {
  manifest: ExtensionManifest;
  bundlePath: string;
  loadedAt: number;
  workerRef: Worker | null;
  cumulativeMs: number;
  suspendedAt: number | null;
}
```

### Geolocation Response

```typescript
interface GeoResponse {
  country: string;       // "United States"
  countryCode: string;   // "US"
  ip: string;            // "203.0.113.42"
}
```

---

## Error Handling

| Scenario | Behavior |
|---|---|
| `getDownloadsDir()` returns empty or throws | Fall back to OS Downloads folder; allow user to proceed |
| Geolocation endpoint unreachable (5s timeout) | Display "Country: Unknown", "IP: Unavailable"; no restriction warning |
| `toggleWarp()` throws | Show toast with error message; continue with WARP disabled |
| Extension signature invalid | Show error dialog; abort installation; no files written |
| Extension manifest missing required fields | Show validation error listing missing fields; abort installation |
| Extension worker exceeds 30s | Terminate worker; return timeout error to renderer |
| Extension worker exceeds 2min cumulative | Terminate worker; mark extension suspended; notify renderer via `onPlaybackEvent` |
| Extension worker throws unhandled exception | Catch error; log with extension ID + stack trace; return structured error; main process continues |
| Extension response exceeds 10 MB | Truncate response; set `truncated: true` on result |
| `invokeExtension` called for unregistered extension | Return `{ success: false, error: "Extension not loaded" }` |
| Kill-switch set for loaded extension | Unload on next `runtime:health` poll; block re-registration |
| Fetch to non-permitted domain from extension | Reject with `PermissionDeniedError`; log blocked attempt |

---

## Security Considerations

1. **Renderer sandbox**: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` — already enforced in `main.cjs`. No changes needed.
2. **Extension code isolation**: Extensions run in Web Workers created from Blob URLs. They have no access to `document`, `window`, `localStorage`, `indexedDB`, or `XMLHttpRequest`.
3. **Domain allowlist**: The `__tatakai_fetch__` proxy enforces the extension's declared `permissions` before forwarding any network request.
4. **Signature verification**: Curated extensions are verified against the Tatakai public key (Ed25519) before installation and before loading. Sideloaded extensions skip signature verification but are clearly marked.
5. **Kill switch**: Admin can remotely disable any extension. The main process polls the kill-switch list on every `runtime:health` call and unloads flagged extensions immediately.
6. **Payload size limit**: 10 MB cap on extension responses prevents memory exhaustion attacks.
7. **Timeout enforcement**: 30-second per-call and 2-minute cumulative limits prevent runaway extensions from degrading app performance.
8. **No eval in workers**: Worker CSP is set to `script-src 'none'` to block `eval()` and `Function()` constructor usage.
9. **IPC allowlist**: All IPC channels are explicitly named. The generic `invoke()` backdoor was removed in Phase 0 (already done per `preload.cjs` comment).

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: React list keys are unique

*For any* list of episodes or related entries rendered by `AnimePage`, all React `key` props within the same list must be distinct — no two items in the same list share a key.

**Validates: Requirements 1.3**

---

### Property 2: Setup storage path round-trip

*For any* valid directory path returned by `electron.getDownloadsDir()` or selected via `electron.selectDirectory()`, advancing past Step 1 of the Setup Flow must result in `localStorage.getItem('tatakai_download_path')` returning that exact path.

**Validates: Requirements 2.1, 2.2, 2.3**

---

### Property 3: Country badge correctness

*For any* country code in the 196-country torrent-legality table, the Setup Flow and Country Policy panel must display a green "Permitted" badge if `isTorrentingPermitted(code)` returns `true`, and an amber "Restricted" badge if it returns `false`.

**Validates: Requirements 3.2, 11.2, 11.3**

---

### Property 4: Country policy is non-blocking

*For any* detected country (including restricted countries and unknown), the Setup Flow's "Continue" button and the Country Policy panel's navigation, playback, and download controls must remain enabled and interactive.

**Validates: Requirements 3.3, 11.6**

---

### Property 5: WARP toggle persistence round-trip

*For any* boolean value of the WARP toggle (true or false), completing the WARP step must result in `tatakaiRuntime.toggleWarp` being called with that value AND `localStorage.getItem('tatakai_enable_warp')` returning the string representation of that value.

**Validates: Requirements 4.2, 4.3**

---

### Property 6: Extensions toggle feature flag round-trip

*For any* boolean value of the Extensions toggle, completing setup must result in `localStorage.getItem('tatakai_enable_extensions')` matching the toggle value AND the `EXTENSION_SCRAPING` feature flag matching the toggle value.

**Validates: Requirements 5.3, 5.4**

---

### Property 7: Extension card renders all required fields

*For any* extension manifest in the Extension Hub, the rendered extension card must display the extension name, icon, type badge, version, and short description — no required field may be absent or empty in the rendered output.

**Validates: Requirements 6.1**

---

### Property 8: Extension filter and sort correctness

*For any* list of extensions and any combination of type filter and sort order, the filtered result must contain only extensions matching the selected type, and the sorted result must be ordered according to the selected sort criterion.

**Validates: Requirements 6.6**

---

### Property 9: Signature verification gates installation

*For any* extension manifest, installation must succeed if and only if the `signature` field verifies against the Tatakai public key (for curated extensions) or the `sideloaded` flag is `true` (for sideloaded extensions). An invalid signature must always abort installation without writing files.

**Validates: Requirements 6.3, 6.4, 10.1**

---

### Property 10: Sideload manifest validation

*For any* extension manifest submitted via sideloading, installation must be rejected if any of the required fields (`id`, `name`, `version`, `type`, `permissions`) is absent, and the error message must list all missing fields.

**Validates: Requirements 7.3, 7.4**

---

### Property 11: Web Worker sandbox isolation

*For any* extension code that attempts to access `document`, `window`, `localStorage`, `indexedDB`, or `XMLHttpRequest` inside its Web Worker, the access must result in `undefined` or a `ReferenceError` — the extension must never successfully read or write these globals.

**Validates: Requirements 9.1**

---

### Property 12: Domain allowlist enforcement

*For any* extension and any URL, a `fetch()` call from the extension's Web Worker must succeed if and only if the URL's hostname matches a domain pattern declared in the extension's `permissions` field. All other fetch attempts must be rejected with a `PermissionDeniedError`.

**Validates: Requirements 9.2, 7.6**

---

### Property 13: Extension timeout enforcement

*For any* extension invocation that runs longer than 30 seconds, the Web Worker must be terminated and the caller must receive a timeout error — no invocation may block the main process indefinitely.

**Validates: Requirements 9.3**

---

### Property 14: Extension response payload size limit

*For any* extension invocation that produces a response payload larger than 10 MB, the result must have `truncated: true` set and the payload must not exceed 10 MB — no oversized payload may be returned to the renderer.

**Validates: Requirements 9.6**

---

### Property 15: Extension registry health report

*For any* set of loaded extensions, `runtime:health` must return a `loadedExtensions` array that contains exactly the IDs of all currently registered (non-suspended, non-kill-switched) extensions — no more, no fewer.

**Validates: Requirements 10.5**

---

### Property 16: Layout offset matches sidebar state

*For any* viewport width and sidebar visibility state, the main content container's left offset must equal the sidebar width when the viewport is wider than 1024 px and the sidebar is visible, and must equal zero otherwise.

**Validates: Requirements 12.1, 12.2, 12.3**

---

### Property 17: Virtualized grid renders only visible items

*For any* list of more than 50 anime items with the `VIRTUAL_GRID` feature flag enabled, the number of DOM nodes rendered by the grid must be less than or equal to the number of items visible in the viewport plus the overscan buffer — never the full list length.

**Validates: Requirements 13.1**

---

### Property 18: BlurHash placeholder precedes image load

*For any* anime cover image that has a stored BlurHash string, the BlurHash canvas must be present in the DOM before the `<img>` element reports `complete = true`, and the `<img>` must transition to `opacity: 1` within 300 ms of the load event.

**Validates: Requirements 13.2, 13.3**
