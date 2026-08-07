# Implementation Plan: Electron Production Readiness

## Overview

Implements seven production-readiness services in `desktop/services/`, wires them into
`main.cjs`, extends the preload IPC bridge, adds the Supabase schema migration, installs
`semver` in the desktop package, and delivers three renderer React components. Each service
is built in dependency order: BrandingInit first (pre-ready, no deps), then LogService and
ErrorTracker (used by all others), then CrashService, PerfMonitor, PlatformAdapter, and
finally UpdateManager (depends on all prior services). Renderer components come last.

---

## Tasks

- [x] 1. Add `semver` dependency and shared type stubs
  - [x] 1.1 Add `semver` to the desktop package
    - Run `pnpm add semver` in the workspace root (it is a plain CJS package; pin exact
      version matching existing semver in the dependency tree)
    - Create `desktop/services/_types.cjs` exporting JSDoc typedef stubs for
      `LogService`, `PerfSnapshot`, `VersionRecord`, `UpdatePolicy`, `UpdateChannel`,
      `UpdateType`, and `CrashReport` so downstream services can `@typedef` import them
    - _Requirements: 5.1 (semver version comparison), design dependencies table_

- [x] 2. Implement BrandingInit (`desktop/services/branding-init.cjs`)
  - [x] 2.1 Write the `BrandingInit.apply()` function
    - Call `app.setName('Tatakai')` before `app.on('ready')`
    - On Windows: call `app.setAppUserModelId('app.tatakai.me')`
    - After ready: assert `app.getPath('userData')` ends with `Tatakai` not `Electron`
    - Write idempotency sentinel file `userData/.branded` on first successful apply
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.8_
  - [x] 2.2 Implement the legacy `Electron/` → `Tatakai/` migration
    - On `app.on('ready')`: check for `…/Electron/` directory existence
    - If present and `…/Tatakai/` not yet populated, copy recursively using `fs.cpSync`
      (Node 16+) with error handling that catches EPERM/EACCES
    - Write migration-done sentinel to prevent re-runs (Req 7.8)
    - On failure: log via `console.error` (LogService not yet available at this point),
      continue with fresh Tatakai directory (Req 7.7)
    - _Requirements: 7.5, 7.6, 7.7, 7.8_
  - [x]* 2.3 Write property test for BrandingInit idempotence (Property 12)
    - **Property 12: BrandingInit Migration Idempotence**
    - **Validates: Requirements 7.5, 7.6, 7.8**
    - Use `fast-check` to generate arbitrary numbers of repeated `apply()` calls with a
      mock `app` object; assert migration runs at most once and existing Tatakai files
      are never overwritten
    - File: `tests/services/branding-init.test.cjs`
  - [x]* 2.4 Write property test for userData path never containing 'Electron' (Property 5)
    - **Property 5: userData Path Never Contains 'Electron'**
    - **Validates: Requirements 7.3**
    - Generate arbitrary platform strings and mock `app.getPath` return values; after
      `apply()`, assert the returned path never contains the substring `'Electron'`
    - File: `tests/services/branding-init.test.cjs`

- [x] 3. Implement LogService (`desktop/services/log-service.cjs`)
  - [x] 3.1 Write the core structured writer and rotation logic
    - `createLogService({ app, maxFileSizeMB = 10, maxFiles = 5 })` factory
    - Open `fs.createWriteStream` to `userData/logs/app.log` (append mode)
    - `write(level, msg, ctx)`: serialise `{ timestamp, level, message, context, pid,
      version, platform }` as JSON + newline; track `currentSizeBytes`
    - `rotate()`: rename shift `app.log → app.1.log → … → app.(maxFiles-1).log`, delete
      excess, open fresh stream, reset `currentSizeBytes = 0`
    - Trigger rotation when `currentSizeBytes >= ROTATE_THRESHOLD_BYTES` after write
    - Catch all `fs` errors in write path and fall back to `console.error` (Req 1.8)
    - Expose `debug`, `info`, `warn`, `error`, `fatal` public methods
    - Expose `getLogPath()` returning absolute path to current log file (Req 1.10)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.8, 1.10_
  - [x] 3.2 Implement `tail()` and `close()`
    - `tail(lines = 200)`: read current file + rotated files newest-to-oldest, collect
      lines until `lines` limit reached, return array oldest-first; return `[]` if no
      files exist (Req 1.6)
    - `close()`: flush pending writes (drain event) then close stream, return Promise
    - _Requirements: 1.5, 1.6, 1.9_
  - [x] 3.3 Register IPC handler `log:tail` in LogService
    - `ipcMain.handle('log:tail', (_, lineCount) => logService.tail(lineCount))`
    - Wrap in try/catch returning structured error on failure (Req 8.6)
    - _Requirements: 8.1, 8.6_
  - [x]* 3.4 Write property test for log rotation file-count invariant (Property 1)
    - **Property 1: Log Rotation File-Count Invariant**
    - **Validates: Requirements 1.3, 1.4**
    - Use `fast-check` to generate sequences of arbitrary-length log messages; after
      each write, assert `countLogFiles() <= MAX_FILES` using a tmp-dir mock filesystem
    - File: `tests/services/log-service.test.cjs`
  - [x]* 3.5 Write property test for no silent log loss (Property 2)
    - **Property 2: No Silent Log Loss**
    - **Validates: Requirements 1.1, 1.2**
    - Generate a corpus of N messages, write all, then `tail(N + 100)` and assert every
      message is present in the returned lines across rotation boundaries
    - File: `tests/services/log-service.test.cjs`

- [x] 4. Implement ErrorTracker (`desktop/services/error-tracker.cjs`)
  - [x] 4.1 Write `ErrorTracker` main-process module
    - `createErrorTracker({ logger })` factory; reads telemetry consent from
      `userData/settings.json` on each capture call (lazy read, no caching)
    - `init({ dsn, release, environment })`: call `Sentry.init()` from `@sentry/node`
      with `beforeSend` hook; no-op if `dsn` is falsy
    - `captureException(err, ctx)`, `captureMessage(msg, level)`: gate on telemetry
      consent; call Sentry SDK methods
    - `setUser(user | null)`: `Sentry.setUser()`
    - `addBreadcrumb(crumb)`: `Sentry.addBreadcrumb()`
    - `beforeSend` hook: strip strings matching `/([A-Za-z]:\\[\S]+|\/[\S]+)/g` (paths)
      and `/ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g` (JWT) from event JSON
    - _Requirements: 3.1, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 9.1, 9.2_
  - [x] 4.2 Wire ErrorTracker into LogService ERROR/FATAL forwarding (Req 1.7)
    - In `LogService.write()`, after writing: if `level === 'ERROR' || 'FATAL'`, call
      `errorTracker.captureMessage(msg, levelToSentryLevel(level))`
    - Accept `errorTracker` as optional dep injected at `createLogService` factory call
    - _Requirements: 1.7_
  - [x]* 4.3 Write property test for telemetry consent gate (Property 6)
    - **Property 6: Telemetry Consent Gate**
    - **Validates: Requirements 3.5, 9.2**
    - Use `fast-check` to generate arbitrary sequences of `captureException` /
      `captureMessage` calls while settings.json has `telemetry: false`; mock Sentry
      transport and assert zero envelopes sent
    - File: `tests/services/error-tracker.test.cjs`
  - [x]* 4.4 Write property test for Sentry sensitive data scrubbing (Property 11)
    - **Property 11: Sentry Sensitive Data Scrubbing**
    - **Validates: Requirements 3.4, 9.1**
    - Generate arbitrary error messages containing filesystem paths and JWT tokens;
      assert `beforeSend` output contains none of those strings
    - File: `tests/services/error-tracker.test.cjs`

- [x] 5. Checkpoint — Ensure LogService, ErrorTracker, and BrandingInit tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement CrashService (`desktop/services/crash-service.cjs`)
  - [x] 6.1 Write `CrashService.start()` pre-ready registration
    - `createCrashService()` factory; `start({ dsn, uploadToServer })` calls
      `crashReporter.start({ productName: 'Tatakai', submitURL: dsn, uploadToServer })`
    - If `dsn` is falsy: skip `uploadToServer`, log warning to `console.warn`, still
      call `crashReporter.start` with local-only options (Req 2.6)
    - _Requirements: 2.1, 2.2, 2.6_
  - [x] 6.2 Implement previous-crash detection and IPC notification
    - On `app.on('ready')`: call `crashReporter.getLastCrashReport()`; if report exists,
      log via LogService and emit IPC push `mainWindow.webContents.send('crash:previous',
      report)` (Req 2.3, 2.4)
    - `clearCrashReports()`: write acknowledged list to
      `userData/crash-reports-acked.json` (Req 2.5)
    - Add IPC push channel `crash:previous` to preload bridge under `window.electron`
    - _Requirements: 2.3, 2.4, 2.5, 8.4_

- [x] 7. Implement PerfMonitor (`desktop/services/perf-monitor.cjs`)
  - [x] 7.1 Write sampling loop and ring buffer
    - `createPerfMonitor({ logger, getMainWindow, maxEntries = 120 })` factory
    - `start(intervalMs = 30_000)`: guard against double-start; `setInterval` collecting
      `process.memoryUsage()`, `process.cpuUsage(lastCpu)`, `getProcessMemoryInfo()`
      with 2 s timeout via `Promise.race`
    - Build `PerfSnapshot` struct matching design data model
    - Ring buffer: `history.push(snap); if (history.length > maxEntries) history.shift()`
    - `stop()`: `clearInterval(timer); timer = null`
    - `getSnapshot()`: return `history[history.length - 1]`
    - `getHistory(lastN)`: return `lastN ? history.slice(-lastN) : [...history]`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.7, 4.8, 4.9_
  - [x] 7.2 Add heap/RSS warning thresholds and IPC handler
    - After building snapshot: if `heapUsedMB > 512` emit `logger.warn(...)` (Req 4.5);
      if `rssMB > 1024` emit `logger.warn(...)` (Req 4.6)
    - `ipcMain.handle('perf:get-history', (_, lastN) => perfMonitor.getHistory(lastN))`
      wrapped in try/catch (Req 4.10, 8.2, 8.6)
    - Add `perf:get-history` to preload bridge
    - _Requirements: 4.5, 4.6, 4.10, 8.2, 8.6_
  - [x]* 7.3 Write property test for PerfMonitor history bound (Property 7)
    - **Property 7: PerfMonitor History Bound**
    - **Validates: Requirements 4.4**
    - Use `fast-check` to generate integers N > MAX_HISTORY_ENTRIES; simulate N push
      operations and assert `history.length === MAX_HISTORY_ENTRIES` after each
    - File: `tests/services/perf-monitor.test.cjs`

- [x] 8. Implement PlatformAdapter (`desktop/services/platform-adapter.cjs`)
  - [x] 8.1 Write `notify()`, `setBadgeCount()`, and `requestAttention()`
    - `createPlatformAdapter({ app, BrowserWindow, logger })` factory
    - `notify({ title, body, urgency })`: construct Electron `Notification`; on Linux
      with `urgency === 'critical'` set `urgency: 'critical'` in notification options;
      wrap `notification.show()` in try/catch logging failure via LogService (Req 6.6,
      6.7, 6.10)
    - `setBadgeCount(count)`: on macOS `app.dock.setBadge(count > 0 ? String(count) : '')`
      (Req 6.4, 6.5); on Windows overlay badge via `mainWindow.setOverlayIcon` if
      available, clear when count === 0 (Req 6.5)
    - `requestAttention()`: Windows `mainWindow.flashFrame(true)` (Req 6.2); macOS
      `app.dock.bounce('informational')` (Req 6.3)
    - _Requirements: 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.10_
  - [x] 8.2 Implement Windows AUMID, `ensureDesktopEntry()`, and `registerProtocol()`
    - On Windows: `app.setAppUserModelId('app.tatakai.me')` (Req 6.1)
    - `ensureDesktopEntry()`: on Linux, write `~/.local/share/applications/tatakai.desktop`
      if absent; on Windows/macOS no-op (Req 6.8, 6.9)
    - `registerProtocol(scheme)`: `app.setAsDefaultProtocolClient(scheme)` (Req 6.11)
    - _Requirements: 6.1, 6.8, 6.9, 6.11_
  - [x]* 8.3 Write property test for PlatformAdapter.notify() never throws (Property 8)
    - **Property 8: PlatformAdapter.notify() Never Throws**
    - **Validates: Requirements 6.10**
    - Use `fast-check` to generate arbitrary `{ title, body, urgency }` inputs and mock
      Electron `Notification` to throw randomly; assert no unhandled exception escapes
    - File: `tests/services/platform-adapter.test.cjs`

- [x] 9. Implement UpdateManager (`desktop/services/update-manager.cjs`)
  - [x] 9.1 Set up Supabase client and policy fetching
    - `createUpdateManager({ ipcMain, autoUpdater, logger, app, supabaseUrl,
      supabaseKey })` factory
    - Initialise `@supabase/supabase-js` client with `supabaseUrl` + `supabaseKey`
    - `fetchPolicy(channel)`: query `update_policies` table where `channel = channel`
      and `active = true`, return first row mapped to `UpdatePolicy` interface; catch
      network errors and return `null` (Req 5.1, 5.13)
    - Guard: if `!app.isPackaged` log debug message and return early (Req 5.17)
    - _Requirements: 5.1, 5.13, 5.17, 9.5_
  - [x] 9.2 Implement `mandatory` and `recommended` policy handling
    - `checkOnStartup(channel)`: call `fetchPolicy`; if null run standard
      `autoUpdater.checkForUpdates()` and return (Req 5.13)
    - Mandatory path (`semver.lt(current, target)`): broadcast IPC
      `updater-event { type: 'mandatory-update' }`, call `autoUpdater.downloadUpdate()`;
      on `update-downloaded` call `quitAndInstall()` (Req 5.2, 5.3)
    - On download error: log at ERROR, send `updater-event { type: 'error' }` (Req 5.4)
    - Recommended path: send `updater-event { type: 'available' }` with dismissible flag
      (Req 5.5)
    - Implement 3-consecutive-launch grace period counter in `userData/update-misses.json`
      for mandatory Supabase-unreachable scenario (Req 5.14)
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.14_
  - [x]* 9.3 Write property test for mandatory update blocking state (Property 3)
    - **Property 3: Mandatory Update Blocks Interactive State**
    - **Validates: Requirements 5.2, 5.3**
    - Use `fast-check` to generate pairs of semver strings `(current, target)` where
      `semver.lt(current, target)` is true; assert that with a mandatory policy the mock
      `quitAndInstall` is always called and interactive window creation is never reached
    - File: `tests/services/update-manager.test.cjs`
  - [x] 9.4 Implement `experimental` policy and `rollbackTo()`
    - Experimental path: `autoUpdater.downloadUpdate()` silently, install on next launch
      via `autoUpdater.autoInstallOnAppQuit = true` (Req 5.6)
    - `rollbackTo(version)`: no-op if `version === app.getVersion()` (Req 5.8); fetch
      GitHub release asset URL for `version`; download; call
      `quitAndInstall(true, true)`; if asset not found reject with `'asset-not-found'`,
      log ERROR, do NOT call quitAndInstall (Req 5.7, 5.9)
    - _Requirements: 5.6, 5.7, 5.8, 5.9_
  - [x]* 9.5 Write property test for rollback to current version is a no-op (Property 4)
    - **Property 4: Rollback to Current Version is a No-Op**
    - **Validates: Requirements 5.8**
    - Use `fast-check` to generate valid semver strings; call `rollbackTo(currentVersion)`
      and assert `version-history.json` is unchanged and `app.quit` is never called
    - File: `tests/services/update-manager.test.cjs`
  - [x] 9.6 Implement version history persistence
    - `appendVersionRecord(record)`: read `userData/updates/version-history.json`, parse,
      push new `VersionRecord`, write back; create file/dir if absent (Req 5.10)
    - `getVersionHistory()`: read and return all records; return `[]` if file absent
      (Req 5.12)
    - Append record after successful mandatory, recommended, experimental, or rollback
      install (Req 5.10)
    - Never delete or modify existing entries (Req 5.11)
    - _Requirements: 5.10, 5.11, 5.12_
  - [x]* 9.7 Write property test for version history append-only (Property 10)
    - **Property 10: Version History is Append-Only**
    - **Validates: Requirements 5.10, 5.11**
    - Use `fast-check` to generate sequences of install and rollback events; after each
      event assert `getVersionHistory().length` only increases and no prior record is
      mutated
    - File: `tests/services/update-manager.test.cjs`
  - [x] 9.8 Register all UpdateManager IPC channels
    - `update:check` → `checkOnStartup(channel)`
    - `update:download` → `autoUpdater.downloadUpdate()`
    - `update:install` → `autoUpdater.quitAndInstall()`
    - `update:rollback` → `rollbackTo(version)`
    - `update:get-history` → `getVersionHistory()`
    - `update:get-policy` → `fetchPolicy(channel)`
    - All handlers wrapped in try/catch returning structured `{ error }` on failure
      (Req 5.15, 8.3, 8.6)
    - Wire `autoUpdater` events (`checking-for-update`, `update-available`,
      `update-not-available`, `download-progress`, `update-downloaded`, `error`) to
      broadcast `updater-event` IPC to renderer (Req 8.5)
    - _Requirements: 5.15, 8.3, 8.5, 8.6_
  - [x]* 9.9 Write property test for channel isolation (Property 9)
    - **Property 9: Channel Isolation**
    - **Validates: Requirements 5.16**
    - Use `fast-check` to generate update policies for all channels; assert that an
      UpdateManager configured for `'stable'` never applies a policy whose `channel`
      is `'beta'` or `'experimental'`
    - File: `tests/services/update-manager.test.cjs`

- [x] 10. Checkpoint — Ensure all service tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Create Supabase `update_policies` migration SQL
  - [x] 11.1 Write the migration file
    - Create `supabase/migrations/20240101000000_create_update_policies.sql`
    - Schema: `id UUID PK DEFAULT gen_random_uuid()`, `channel TEXT NOT NULL CHECK(...)`,
      `type TEXT NOT NULL CHECK(...)`, `target_version TEXT NOT NULL`,
      `rollback_from_version TEXT`, `active BOOLEAN NOT NULL DEFAULT true`,
      `notes TEXT`, `published_at TIMESTAMPTZ NOT NULL DEFAULT now()`,
      `created_by UUID`
    - Add unique partial index: `UNIQUE (channel) WHERE active = true` to enforce single
      active policy per channel
    - Add RLS policy: `SELECT` open to `anon` role (public read); `INSERT/UPDATE/DELETE`
      restricted to `authenticated` with `service_role` check
    - _Requirements: 5.1, 9.5, design data model_

- [x] 12. Wire all services into `desktop/main.cjs`
  - [x] 12.1 Replace legacy `logger.cjs` usage with new LogService
    - Remove `const logger = require('./logger.cjs')` import
    - Add imports for all seven new services at top of `main.cjs`
    - Call `BrandingInit.apply(app)` and `CrashService.start(...)` before all existing
      pre-ready code (before `protocol.registerSchemesAsPrivileged`)
    - Construct `logService`, `errorTracker` (with `logService` injected), `perfMonitor`,
      `platformAdapter`, `updateManager` immediately after
    - Pass `logService` as the `logger` arg to all existing IPC modules that currently
      receive the old `logger` reference
    - _Requirements: 1.1–1.10, 2.1, 3.1, 7.1–7.4_
  - [x] 12.2 Wire `app.on('ready')` initialisation sequence
    - After `createMainWindow`: call `perfMonitor.start()`, `platformAdapter.init()`,
      `platformAdapter.ensureDesktopEntry()`, `crashService.checkPreviousCrashes(mainWindow)`
    - After main window is created: call `updateManager.checkOnStartup('stable')`
    - On `app.on('will-quit')`: call `await logService.close()`, `perfMonitor.stop()`
    - _Requirements: 2.3, 4.1, 6.1, 6.8, 6.11, 7.1_

- [x] 13. Extend `desktop/preload.cjs` IPC bridge
  - [x] 13.1 Add new IPC bridge entries to `window.electron`
    - `logTail: (lines) => ipcRenderer.invoke('log:tail', lines)`
    - `perfGetHistory: (lastN) => ipcRenderer.invoke('perf:get-history', lastN)`
    - `updateCheck: (channel) => ipcRenderer.invoke('update:check', channel)`
    - `updateDownload: () => ipcRenderer.invoke('update:download')`
    - `updateInstall: () => ipcRenderer.invoke('update:install')`
    - `updateRollback: (version) => ipcRenderer.invoke('update:rollback', version)`
    - `updateGetHistory: () => ipcRenderer.invoke('update:get-history')`
    - `updateGetPolicy: (channel) => ipcRenderer.invoke('update:get-policy', channel)`
    - `onCrashPrevious: (cb) => { const h = (_, d) => cb(d); ipcRenderer.on('crash:previous', h); return () => ipcRenderer.removeListener('crash:previous', h) }`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 9.7_

- [x] 14. Build renderer React components
  - [x] 14.1 Create `UpdateNotificationUI` component (`src/components/desktop/UpdateNotificationUI.tsx`)
    - Subscribe to `window.electron.onUpdaterEvent` on mount; unsubscribe on unmount
    - Render a non-dismissible blocking modal for `mandatory-update` events
    - Render a dismissible `<Sonner>` toast for `available` events
    - Show download progress bar for `downloading` events (use existing progress data)
    - Show install prompt on `downloaded` event with "Restart Now" button calling
      `window.electron.updateInstall()`
    - _Requirements: 5.2, 5.3, 5.5, 8.5_
  - [x] 14.2 Create `LogViewerPanel` component (`src/components/desktop/LogViewerPanel.tsx`)
    - On open: call `window.electron.logTail(500)` and display lines in a virtualised
      list (use existing `@tanstack/react-virtual`)
    - Colour-code lines by level (DEBUG grey, INFO white, WARN amber, ERROR/FATAL red)
    - Add refresh button re-fetching tail on click
    - _Requirements: 8.1_
  - [x] 14.3 Create `PerfMetricsPanel` component (`src/components/desktop/PerfMetricsPanel.tsx`)
    - On open: call `window.electron.perfGetHistory()` and render a sparkline using
      existing `recharts` for `heapUsedMB` and `rssMB` over time
    - Auto-refresh every 30 s while panel is open
    - Highlight samples exceeding thresholds (heap > 512, rss > 1024) in amber
    - _Requirements: 4.9, 8.2_

- [x] 15. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass and all new IPC channels are exercised by at least one test.
  - Ask the user if any questions arise before closing.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP build
- BrandingInit (task 2) must complete before LogService (task 3) since paths are set there
- ErrorTracker (task 4) must be wired into LogService before CrashService / PerfMonitor use it
- The Supabase migration (task 11) is independent of all service tasks and can run in parallel
- Renderer components (task 14) depend only on the preload bridge (task 13) being in place
- Property tests use `bun test tests/services/` as the test command (`--run` for single pass)
- The `semver` package is a CJS-compatible package and does not require any bundler changes
- `version-history.json` append-only invariant is critical for rollback audit trails
- All IPC handlers follow the explicit named handler pattern per security requirements (Req 9.7)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "2.2"] },
    { "id": 2, "tasks": ["2.3", "2.4", "3.1", "11.1"] },
    { "id": 3, "tasks": ["3.2", "3.4", "3.5", "4.1"] },
    { "id": 4, "tasks": ["3.3", "4.2", "4.3", "4.4"] },
    { "id": 5, "tasks": ["6.1", "7.1", "8.1"] },
    { "id": 6, "tasks": ["6.2", "7.2", "7.3", "8.2", "8.3", "9.1"] },
    { "id": 7, "tasks": ["9.2", "9.4", "9.6"] },
    { "id": 8, "tasks": ["9.3", "9.5", "9.7", "9.8"] },
    { "id": 9, "tasks": ["9.9", "12.1"] },
    { "id": 10, "tasks": ["12.2", "13.1"] },
    { "id": 11, "tasks": ["14.1", "14.2", "14.3"] }
  ]
}
```
