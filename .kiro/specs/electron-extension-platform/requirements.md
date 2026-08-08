# Requirements Document

## Introduction

The Electron Extension Platform is a multi-faceted feature set for Tatakai's desktop application. It encompasses four interconnected areas: (1) fixing critical runtime bugs that currently break the desktop experience, (2) completing the setup/onboarding flow with real implementations for storage, country policy, WARP, and extensions, (3) building a full extension system with a curated hub, sideloading support, sandboxed Web Worker execution, and an SDK, and (4) implementing the country policy display with blurred IP/country detection, restriction warnings, and non-blocking VPN suggestions. The desktop Electron process is the first-class host for local extension execution; web and mobile remain server-first.

---

## Glossary

- **Setup Flow**: The 5-step desktop onboarding wizard in `SetupPage.tsx` that configures storage, Discord RPC, country policy, WARP/DoH, and extensions before first use.
- **Extension**: A signed JavaScript module that runs inside a sandboxed Web Worker and implements the `AbstractSource` interface to resolve anime episode sources.
- **Extension Hub**: The curated, admin-moderated marketplace of signed extensions accessible from within the app.
- **Sideloading**: The ability for power users to install unsigned extensions from a local file or URL, subject to explicit warnings and user confirmation.
- **Extension Manifest**: A JSON descriptor declaring an extension's `id`, `name`, `version`, `type`, `permissions`, `signature`, and `signedBy` fields.
- **AbstractSource**: The TypeScript base class that all extensions must implement, exposing `validate()`, `single()`, `batch()`, and `movie()` methods.
- **Web Worker Sandbox**: An isolated Web Worker context in which extension code executes, with no access to `document`, `window`, `localStorage`, or `XMLHttpRequest`.
- **tatakaiRuntime**: The `contextBridge`-exposed IPC bridge in `desktop/preload.cjs` that the renderer uses to communicate with the Electron main process.
- **WARP**: Cloudflare's 1.1.1.1 WARP proxy used as an optional transport layer to bypass geo-blocks and ISP DNS poisoning.
- **DoH**: DNS-over-HTTPS, always-on DNS resolution routed through Cloudflare's 1.1.1.1 resolver.
- **Country Policy**: The system that detects the user's country, checks it against a torrent-legality table, and displays a non-blocking warning with a VPN suggestion when the country restricts torrenting.
- **Kill Switch**: An admin-controlled flag that can remotely disable a specific extension across all clients.
- **IPC Handler**: A named `ipcMain.handle` registration in `desktop/main.cjs` that processes a specific `ipcRenderer.invoke` call from the renderer.
- **Content Graph**: Tatakai's internal anime catalog backed by AniList (primary) and Jikan (fallback).
- **Tatakai**: The desktop Electron application being built.
- **Renderer**: The sandboxed Chromium renderer process that runs the React application.
- **Main Process**: The Node.js Electron main process in `desktop/main.cjs`.

---

## Requirements

### Requirement 1: Critical Bug Fixes

**User Story:** As a developer, I want all known critical runtime bugs fixed before new features are built, so that the desktop application is stable and new features do not compound existing breakage.

#### Acceptance Criteria

1. WHEN the Electron development server starts, THE Main Process SHALL load the renderer from port `8090`, matching the Vite dev server port configured in `vite.config.ts`, eliminating the current port-8089 mismatch.
2. WHEN the `WatchPage` component renders and the episode data object has not yet loaded, THE Renderer SHALL display a loading skeleton instead of attempting to access properties on an `undefined` value, preventing the current crash.
3. WHEN the `AnimePage` component renders a list of episodes or related entries, THE Renderer SHALL assign a unique `key` prop to each list item that does not duplicate any other key in the same list, eliminating the React duplicate-key warning.
4. WHEN the desktop application renders the main layout on a screen wider than 1024 px, THE Renderer SHALL apply a left offset equal to the sidebar width so that page content is not obscured by the sidebar, fixing the current layout overlap.
5. IF a critical bug fix introduces a regression in an existing passing test, THEN THE Renderer SHALL fail the affected test and the fix SHALL be revised before merging.

---

### Requirement 2: Setup Flow — Storage Step

**User Story:** As a new desktop user, I want the setup wizard to automatically detect and confirm a single default download location, so that I can complete setup quickly without manually browsing for a folder.

#### Acceptance Criteria

1. WHEN the Setup Flow reaches Step 1 on a desktop platform, THE Setup Flow SHALL invoke `electron.getDownloadsDir()` via the `tatakaiRuntime` bridge and display the resolved path as the pre-selected default storage location.
2. WHEN the default path is displayed, THE Setup Flow SHALL show a "Browse" button that, when activated, invokes `electron.selectDirectory()` and updates the displayed path with the user's selection.
3. WHEN the user advances past Step 1, THE Setup Flow SHALL persist the confirmed path to `localStorage` under the key `tatakai_download_path`.
4. IF `electron.getDownloadsDir()` returns an empty string or throws an error, THEN THE Setup Flow SHALL display a fallback path of the operating system's default Downloads folder and allow the user to proceed.
5. WHILE the Setup Flow is on a mobile (Capacitor) platform, THE Setup Flow SHALL display a read-only "App Storage" confirmation panel and SHALL NOT render the directory browser.

---

### Requirement 3: Setup Flow — Country Policy Step

**User Story:** As a new desktop user, I want the setup wizard to show me my detected country and a blurred IP address, warn me if my country restricts torrenting, and suggest a VPN — without blocking me from continuing — so that I am informed without being gated.

#### Acceptance Criteria

1. WHEN the Setup Flow reaches the Country Policy step, THE Setup Flow SHALL call a geolocation endpoint and display the detected country name alongside the user's IP address blurred with a CSS blur filter of at least 4 px.
2. WHEN the country is detected, THE Setup Flow SHALL look up the country code in the 196-country torrent-legality table and display a green "Permitted" badge if torrenting is legal or an amber "Restricted" badge if it is not.
3. WHEN the detected country is marked as restricted, THE Setup Flow SHALL display a non-blocking informational banner recommending a VPN and SHALL NOT disable the "Continue" button.
4. WHEN the user activates the "Reveal IP" control, THE Setup Flow SHALL remove the blur filter and display the full IP address.
5. IF the geolocation endpoint is unreachable, THEN THE Setup Flow SHALL display "Country: Unknown" and "IP: Hidden" and SHALL allow the user to proceed without a country acknowledgment checkbox.
6. THE Setup Flow SHALL persist the country acknowledgment state to `localStorage` under the key `tatakai_country_ack` when the user advances past this step.

---

### Requirement 4: Setup Flow — WARP / DoH Step

**User Story:** As a new desktop user, I want to optionally enable Cloudflare WARP and DNS-over-HTTPS during setup, so that my connection is more private and geo-blocks are bypassed when needed.

#### Acceptance Criteria

1. WHEN the Setup Flow reaches the WARP/DoH step, THE Setup Flow SHALL display a toggle for "WARP / DoH" that defaults to the `off` state.
2. WHEN the user enables the WARP toggle and advances, THE Setup Flow SHALL invoke `tatakaiRuntime.toggleWarp(true)` via the IPC bridge and persist `tatakai_enable_warp = "true"` to `localStorage`.
3. WHEN the user disables the WARP toggle and advances, THE Setup Flow SHALL invoke `tatakaiRuntime.toggleWarp(false)` and persist `tatakai_enable_warp = "false"` to `localStorage`.
4. THE Setup Flow SHALL display a one-sentence description explaining that WARP routes DNS queries through Cloudflare's 1.1.1.1 resolver and optionally proxies traffic to bypass geo-blocks.
5. IF `tatakaiRuntime.toggleWarp()` throws an error, THEN THE Setup Flow SHALL display a toast notification with the error message and SHALL allow the user to continue with WARP disabled.

---

### Requirement 5: Setup Flow — Extensions Step

**User Story:** As a new desktop user, I want to opt into the extension system during setup, so that I can immediately access curated sources after completing onboarding.

#### Acceptance Criteria

1. WHEN the Setup Flow reaches the Extensions step, THE Setup Flow SHALL display a toggle for "Enable Extensions" that defaults to the `on` state.
2. WHEN the Extensions toggle is `on`, THE Setup Flow SHALL display a notice stating that only signed extensions from the official Tatakai Extension Hub will be permitted to run.
3. WHEN the user completes setup with the Extensions toggle `on`, THE Setup Flow SHALL persist `tatakai_enable_extensions = "true"` to `localStorage` and SHALL set the `EXTENSION_SCRAPING` feature flag to `true` via `setFlag()`.
4. WHEN the user completes setup with the Extensions toggle `off`, THE Setup Flow SHALL persist `tatakai_enable_extensions = "false"` to `localStorage` and SHALL leave the `EXTENSION_SCRAPING` feature flag at its default `false` value.
5. THE Setup Flow SHALL display a secondary notice that sideloading of unsigned extensions is available in Settings after setup completes.

---

### Requirement 6: Extension Hub — Browsing and Installation

**User Story:** As a desktop user, I want to browse a curated list of extensions in a Microsoft Store-style layout with screenshots and metadata, so that I can discover and install sources that match my preferences.

#### Acceptance Criteria

1. THE Extension Hub SHALL display a grid of extension cards, each showing the extension name, icon, type badge (`torrent` / `onlinestream` / `custom`), version, and a short description.
2. WHEN a user selects an extension card, THE Extension Hub SHALL navigate to an extension detail page that displays the extension name, icon, full description, version history, permissions list, screenshots carousel, and an "Install" or "Installed" button.
3. WHEN the user activates the "Install" button on a detail page, THE Extension Hub SHALL verify the extension's `signature` field against the Tatakai public key before writing the extension bundle to the extensions directory.
4. IF signature verification fails, THEN THE Extension Hub SHALL display an error dialog stating "Extension signature invalid — installation aborted" and SHALL NOT write any files to disk.
5. WHEN an installed extension has an available update, THE Extension Hub SHALL display an "Update" badge on the extension card and SHALL allow the user to update with a single activation.
6. THE Extension Hub SHALL support filtering extensions by type (`torrent`, `onlinestream`, `custom`) and sorting by name, popularity, and recently updated.
7. WHEN the user activates the "Uninstall" button for an installed extension, THE Extension Hub SHALL invoke `tatakaiRuntime.unloadExtension(extensionId)` and delete the extension bundle from disk.

---

### Requirement 7: Extension Sideloading

**User Story:** As a power user, I want to install unsigned extensions from a local file or URL, so that I can use community-built sources that are not yet in the curated hub.

#### Acceptance Criteria

1. WHEN the user navigates to Settings → Extensions → Sideload, THE Extension Hub SHALL display a file picker and a URL input field for loading an unsigned extension.
2. WHEN the user submits a sideload request, THE Extension Hub SHALL display a warning dialog stating "This extension is unsigned and has not been reviewed by Tatakai. It may access your network and local data. Install anyway?" with "Cancel" and "Install Anyway" options.
3. WHEN the user confirms sideload installation, THE Extension Hub SHALL parse the extension's manifest, validate that all declared `permissions` fields are recognized permission strings, and write the bundle to the extensions directory with a `sideloaded: true` flag.
4. IF the manifest is missing required fields (`id`, `name`, `version`, `type`, `permissions`), THEN THE Extension Hub SHALL display a validation error listing the missing fields and SHALL NOT install the extension.
5. WHEN a sideloaded extension is displayed in the installed extensions list, THE Extension Hub SHALL render a "Sideloaded — Unverified" badge on the extension card.
6. WHILE a sideloaded extension is executing, THE Extension Hub SHALL enforce the same Web Worker sandbox restrictions as curated extensions, including the domain allowlist derived from the extension's declared `permissions`.

---

### Requirement 8: Extension SDK and AbstractSource Contract

**User Story:** As an extension developer, I want a well-defined TypeScript SDK with the AbstractSource base class and injected runtime APIs, so that I can build extensions that integrate reliably with Tatakai.

#### Acceptance Criteria

1. THE Extension SDK SHALL export an `AbstractSource` base class with abstract methods `validate(): Promise<boolean>`, `single(options: SourceOptions): Promise<SourceResult[]>`, `batch(options: SourceOptions): Promise<SourceResult[]>`, and `movie(options: SourceOptions): Promise<SourceResult[]>`.
2. THE Extension SDK SHALL export a `SourceOptions` interface containing at minimum: `anilistId: number`, `titles: string[]`, `episode?: number`, `resolution: string`, `tatakaiId?: string`, and `countryCode?: string`.
3. THE Extension SDK SHALL export a `SourceResult` interface containing at minimum: `source: string`, `url: string`, `quality: string`, `headers: Record<string, string>`, and `subtitles: SubtitleTrack[]`.
4. WHEN an extension's Web Worker is initialized, THE Main Process SHALL inject the following globals: `self.__tatakai_fetch__` (domain-allowlisted fetch), `self.__tatakai_anitomy__` (anitomyscript parser), and `self.__tatakai_parse_html__` (cheerio-like HTML parser).
5. THE Extension SDK SHALL include a TypeScript declaration file (`tatakai-sdk.d.ts`) that types all injected globals so extension authors receive IDE autocompletion.
6. THE Extension SDK SHALL be published as a standalone package under `src/core/extensions/sdk/` and SHALL NOT import any Tatakai application code outside of the `src/core/extensions/` directory.

---

### Requirement 9: Sandboxed Web Worker Execution

**User Story:** As a Tatakai user, I want extension code to run in a fully isolated sandbox so that a malicious or buggy extension cannot access my personal data, crash the app, or make unauthorized network requests.

#### Acceptance Criteria

1. WHEN an extension is invoked, THE Main Process SHALL execute the extension's JavaScript inside a Web Worker created from a Blob URL, ensuring the extension code has no access to `document`, `window`, `localStorage`, or `indexedDB`.
2. WHEN an extension's Web Worker attempts a `fetch()` call to a domain not listed in the extension's declared `permissions`, THE Main Process SHALL reject the request with a `PermissionDeniedError` and SHALL log the blocked attempt.
3. WHEN an extension invocation exceeds 30 seconds, THE Main Process SHALL terminate the Web Worker and return a timeout error to the caller.
4. WHEN an extension invocation exceeds 2 minutes of cumulative execution time within a single session, THE Main Process SHALL terminate the Web Worker, mark the extension as suspended, and notify the renderer via the `tatakaiRuntime.onPlaybackEvent` channel.
5. IF an extension's Web Worker throws an unhandled exception, THEN THE Main Process SHALL catch the error, log it with the extension ID and stack trace, and return a structured error object to the renderer without crashing the main process.
6. THE Main Process SHALL enforce a maximum response payload size of 10 MB per extension invocation; responses exceeding this limit SHALL be truncated and an error flag SHALL be set on the result.

---

### Requirement 10: Extension IPC Bridge (tatakaiRuntime)

**User Story:** As a renderer developer, I want the `tatakaiRuntime` IPC bridge to have fully implemented handlers for extension load, unload, and invoke operations, so that the renderer can manage extensions without direct Node.js access.

#### Acceptance Criteria

1. WHEN the renderer calls `tatakaiRuntime.loadExtension(extensionId, manifest)`, THE Main Process SHALL read the extension bundle from the extensions directory, verify the manifest's `signature` field if `sideloaded` is `false`, and register the extension in an in-memory extension registry.
2. WHEN the renderer calls `tatakaiRuntime.invokeExtension(extensionId, method, args)`, THE Main Process SHALL look up the extension in the registry, spawn or reuse its Web Worker, post the `{ method, args }` message, and return the resolved result to the renderer.
3. WHEN the renderer calls `tatakaiRuntime.unloadExtension(extensionId)`, THE Main Process SHALL terminate the extension's Web Worker if running, remove the extension from the registry, and return `{ success: true }`.
4. IF the renderer calls `tatakaiRuntime.invokeExtension` with an `extensionId` that is not in the registry, THEN THE Main Process SHALL return `{ success: false, error: "Extension not loaded" }` without throwing.
5. THE Main Process SHALL expose a `runtime:health` IPC handler that returns `{ status: "ok", version: string, loadedExtensions: string[] }` listing all currently registered extension IDs.
6. WHEN the admin kill-switch flag for an extension is set to `true` in the remote configuration, THE Main Process SHALL unload the extension on the next `runtime:health` poll and SHALL prevent `extension:load` from re-registering it.

---

### Requirement 11: Country Policy Display

**User Story:** As a desktop user, I want to see my detected country name and a blurred IP address in the app's settings or status area, with a warning if my country restricts torrenting and a non-blocking VPN suggestion, so that I am informed about my legal context without being prevented from using the app.

#### Acceptance Criteria

1. WHEN the user opens the Country Policy settings panel, THE Renderer SHALL display the detected country name and the user's IP address blurred with a CSS `filter: blur(6px)` style.
2. WHEN the detected country code is present in the restricted-countries list, THE Renderer SHALL display an amber warning banner reading "Torrenting may be restricted in [Country Name]. Consider using a VPN."
3. WHEN the detected country code is not present in the restricted-countries list, THE Renderer SHALL display a green status indicator reading "Torrenting is permitted in [Country Name]."
4. WHEN the user activates the "Show IP" toggle, THE Renderer SHALL remove the blur filter and display the full IP address in plain text.
5. IF the geolocation service returns an error or times out after 5 seconds, THEN THE Renderer SHALL display "Country: Unknown" and "IP: Unavailable" and SHALL NOT show a restriction warning.
6. THE country policy warning SHALL be non-blocking: THE Renderer SHALL NOT disable any navigation, playback, or download controls based on the detected country.
7. WHEN the user activates the "Learn about VPNs" link in the warning banner, THE Renderer SHALL open the Cloudflare WARP download page in the system browser via `shell.openExternal()`.

---

### Requirement 12: Desktop Layout Fix

**User Story:** As a desktop user, I want the main content area to be correctly offset from the sidebar so that no content is hidden behind the navigation panel.

#### Acceptance Criteria

1. WHEN the desktop application renders on a viewport wider than 1024 px with the sidebar visible, THE Renderer SHALL apply a `padding-left` or `margin-left` equal to the sidebar's rendered width to the main content container.
2. WHEN the sidebar is collapsed or hidden, THE Renderer SHALL remove the sidebar offset from the main content container so that content fills the full available width.
3. WHEN the viewport width is 1024 px or narrower, THE Renderer SHALL render the sidebar as an overlay or bottom navigation and SHALL NOT apply a horizontal offset to the main content container.
4. THE layout offset adjustment SHALL be applied via a CSS variable or Tailwind utility class so that a single change to the sidebar width propagates to all affected layout containers.

---

### Requirement 13: Performance — Virtualized Grids and BlurHash

**User Story:** As a user browsing large anime catalogs, I want the grid to remain smooth and images to load with placeholder blur hashes, so that the app does not lag or show jarring image pops.

#### Acceptance Criteria

1. WHEN a browse grid renders more than 50 items, THE Renderer SHALL use a virtualized list component (such as `@tanstack/react-virtual`) that renders only the items currently visible in the viewport plus a configurable overscan buffer.
2. WHEN a cover image has not yet loaded, THE Renderer SHALL display a BlurHash placeholder decoded from the image's stored hash string at the same dimensions as the final image.
3. WHEN a cover image finishes loading, THE Renderer SHALL transition from the BlurHash placeholder to the loaded image using a CSS opacity transition of 300 ms or less.
4. THE virtualized grid SHALL maintain scroll position when the user navigates back to a previously visited browse page within the same session.
5. WHEN the `VIRTUAL_GRID` feature flag is `false`, THE Renderer SHALL fall back to a standard non-virtualized grid to preserve backward compatibility.
