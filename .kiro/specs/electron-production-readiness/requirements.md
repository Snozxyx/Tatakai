# Requirements Document

## Introduction

This document defines the requirements for the Electron Production Readiness feature for the
Tatakai desktop application. The feature transforms the existing Electron app into a fully
production-hardened product across six interconnected pillars: structured logging and
diagnostics, crash reporting and error tracking, application health and performance monitoring,
admin-controlled update management with mandatory/optional/rollback channels, cross-platform
native behaviour, and consistent Tatakai branding throughout all storage paths and identifiers.

The existing codebase provides a minimal synchronous logger, a basic electron-updater
integration, installed Sentry packages, and `appId: "app.tatakai.me"` / `productName:
"Tatakai"` in `package.json`. Requirements below build on those foundations as zero-regression
additions that can be shipped incrementally.

---

## Glossary

- **LogService**: The structured, rotating logger running in the main process
  (`desktop/services/log-service.cjs`).
- **CrashService**: The wrapper around Electron's native `crashReporter` API
  (`desktop/services/crash-service.cjs`).
- **ErrorTracker**: The unified Sentry-based error capturing service for main and renderer
  processes (`desktop/services/error-tracker.cjs`).
- **PerfMonitor**: The periodic performance sampling service that maintains a bounded ring
  buffer of snapshots (`desktop/services/perf-monitor.cjs`).
- **UpdateManager**: The admin-controlled update orchestrator that integrates
  `electron-updater` with Supabase-driven policies (`desktop/services/update-manager.cjs`).
- **UpdatePolicy**: A row in the Supabase `update_policies` table describing a channel-scoped
  update directive.
- **PlatformAdapter**: The OS-abstraction layer for Windows, macOS, and Linux native
  behaviours (`desktop/services/platform-adapter.cjs`).
- **BrandingInit**: The one-time setup service that enforces Tatakai naming and performs
  one-time migration from legacy `Electron/` userData paths
  (`desktop/services/branding-init.cjs`).
- **Renderer**: The Electron renderer process running the React/TypeScript UI.
- **Main Process**: The Electron main process running Node.js CJS modules.
- **LogLine**: A single newline-terminated JSON object written to a log file.
- **PerfSnapshot**: An in-memory struct containing one sampling interval's memory and CPU metrics.
- **VersionRecord**: A single entry in the append-only `userData/updates/version-history.json` file.
- **UpdateChannel**: One of `'stable'`, `'beta'`, or `'experimental'`.
- **UpdateType**: One of `'mandatory'`, `'recommended'`, `'experimental'`, or `'rollback'`.
- **userData**: The platform-specific application data directory returned by `app.getPath('userData')`.
- **Sentry**: The third-party error-tracking platform at the configured DSN endpoint.
- **AUMID**: Application User Model ID — the Windows identity string `'app.tatakai.me'`.

---

## Requirements

### Requirement 1: Structured Logging

**User Story:** As a developer and support engineer, I want structured JSON log output with
automatic rotation and a tail IPC, so that I can diagnose production issues without access to
the user's filesystem directly.

#### Acceptance Criteria

1. WHEN the LogService writes a log entry, THE LogService SHALL produce a newline-terminated
   JSON object containing `timestamp` (ISO 8601), `level`, `message`, `pid`, `version`, and
   `platform` fields.

2. WHEN the LogService writes a log entry and `context` is provided, THE LogService SHALL
   include the `context` object in the JSON log line.

3. WHEN the cumulative bytes written to the current log file since the last rotation reaches
   10 MB, THE LogService SHALL rotate the log file before the next write.

4. WHEN the LogService rotates a log file, THE LogService SHALL keep at most 5 rotated files
   and delete any excess older files.

5. WHEN LogService.tail() is called, THE LogService SHALL return log lines in chronological
   order (oldest first), spanning rotated files as needed, and return at most the requested
   number of lines (defaulting to 200).

6. WHEN LogService.tail() is called and no log files exist, THE LogService SHALL return an
   empty array without throwing an exception.

7. WHEN a log entry is written at `ERROR` or `FATAL` level, THE LogService SHALL forward the
   message to ErrorTracker in the same process.

8. IF the underlying file write operation fails (e.g., disk full, permission denied), THEN
   THE LogService SHALL log the failure to `console.error` and continue accepting subsequent
   log calls without crashing the process.

9. WHEN LogService.close() is called, THE LogService SHALL flush all pending writes and close
   the underlying stream before resolving.

10. THE LogService SHALL expose a `getLogPath()` method that returns the absolute path to the
    currently active log file.

---

### Requirement 2: Crash Reporting

**User Story:** As a developer, I want native crash dumps uploaded to Sentry and previous-crash
detection on restart, so that I can be alerted to crashes that occurred in the field and
diagnose their root cause.

#### Acceptance Criteria

1. WHEN the application starts, THE CrashService SHALL register Electron's native
   `crashReporter` with `productName: "Tatakai"` before `app.on('ready')` fires.

2. WHERE `uploadToServer` is enabled and a Sentry DSN is configured, WHEN the application
   crashes, THE CrashService SHALL upload the native minidump to the configured Sentry DSN
   automatically.

3. WHEN the application becomes ready, THE CrashService SHALL check for crash reports from
   previous sessions via `crashReporter.getLastCrashReport()`.

4. WHEN a crash report from a previous session is detected, THE CrashService SHALL log the
   crash report details via LogService and notify the Renderer via IPC.

5. WHEN CrashService.clearCrashReports() is called, THE CrashService SHALL mark all
   previous crash reports as acknowledged.

6. IF the Sentry DSN environment variable is empty or undefined, THEN THE CrashService SHALL
   skip the `uploadToServer` flag and log a warning, while still writing local crash dumps to
   `app.getPath('crashDumps')`.

---

### Requirement 3: Error Tracking

**User Story:** As a developer, I want unified Sentry-based error capturing in both main and
renderer processes, with telemetry consent gating and sensitive-data scrubbing, so that I
receive actionable error reports while respecting user privacy.

#### Acceptance Criteria

1. WHEN ErrorTracker.init() is called in the Main Process, THE ErrorTracker SHALL initialise
   `@sentry/node` with the provided DSN, `release` set to `app.getVersion()`, and the
   provided `environment` value.

2. WHEN ErrorTracker.init() is called in the Renderer, THE ErrorTracker SHALL initialise
   `@sentry/react` with the same DSN, release, and environment values.

3. WHEN ErrorTracker.captureException() is called, THE ErrorTracker SHALL transmit the error
   event to Sentry.

4. WHEN ErrorTracker.captureException() is called and the error event contains a string
   matching a filesystem path pattern or a JWT format, THE ErrorTracker SHALL remove those
   strings from the event before transmission via the Sentry `beforeSend` hook.

5. WHILE the user's `userData/settings.json` contains `{ "telemetry": false }`,
   THE ErrorTracker SHALL not transmit any event data to Sentry for any capture call.

6. WHEN ErrorTracker.setUser() is called with a user object, THE ErrorTracker SHALL associate
   the user's `id` (and optional `email`) with all subsequent captured events.

7. WHEN ErrorTracker.setUser() is called with `null`, THE ErrorTracker SHALL clear the current
   user context from all subsequent captured events.

8. WHEN ErrorTracker.addBreadcrumb() is called, THE ErrorTracker SHALL record the breadcrumb
   in the current Sentry scope for inclusion in the next captured event.

9. WHEN ErrorTracker.captureMessage() is called, THE ErrorTracker SHALL transmit the message
   at the specified severity level to Sentry, subject to the telemetry consent gate in
   criterion 5.

---

### Requirement 4: Performance Monitoring

**User Story:** As a developer and support engineer, I want periodic sampling of heap, CPU,
and renderer memory metrics in a bounded ring buffer with high-usage warnings, so that I can
identify memory leaks and performance regressions in production.

#### Acceptance Criteria

1. WHEN PerfMonitor.start() is called, THE PerfMonitor SHALL begin sampling
   `process.memoryUsage()` and `process.cpuUsage()` at 30-second intervals.

2. WHEN a sampling interval fires and the main window is available and not destroyed,
   THE PerfMonitor SHALL query `webContents.getProcessMemoryInfo()` to capture renderer
   memory metrics, with the query guarded by a 2-second timeout.

3. WHEN a sampling interval fires, THE PerfMonitor SHALL append a PerfSnapshot to the
   in-memory history ring buffer.

4. WHILE the in-memory history ring buffer is at maximum capacity (120 entries),
   THE PerfMonitor SHALL remove the oldest entry before appending each new snapshot, so that
   the buffer never exceeds 120 entries.

5. WHEN a snapshot's `heapUsedMB` value exceeds 512 MB, THE PerfMonitor SHALL emit a `WARN`
   log entry via LogService including the heap value.

6. WHEN a snapshot's `rssMB` value exceeds 1 GB, THE PerfMonitor SHALL emit a `WARN` log
   entry via LogService including the RSS value.

7. WHEN PerfMonitor.stop() is called, THE PerfMonitor SHALL cancel the sampling interval
   and stop collecting new snapshots.

8. WHEN PerfMonitor.getSnapshot() is called, THE PerfMonitor SHALL return the most recently
   collected PerfSnapshot.

9. WHEN PerfMonitor.getHistory() is called, THE PerfMonitor SHALL return up to the last N
   PerfSnapshot entries from the ring buffer, where N defaults to all entries.

10. WHEN an IPC handler for the diagnostics panel queries performance history,
    THE PerfMonitor SHALL return the in-memory snapshot history via IPC without throwing.

---

### Requirement 5: Update Management

**User Story:** As an administrator, I want to control update channels and enforce mandatory,
recommended, experimental, and rollback update policies from a central Supabase table, so
that I can ensure all users are on a safe, supported version without requiring code deploys
to change update behaviour.

#### Acceptance Criteria

1. WHEN UpdateManager.checkOnStartup() is called, THE UpdateManager SHALL query the Supabase
   `update_policies` table filtered by the app's configured `UpdateChannel` and
   `active = true`.

2. WHEN an active UpdatePolicy of type `mandatory` is retrieved and the current app version
   is lower than `policy.targetVersion`, THE UpdateManager SHALL show a blocking,
   non-dismissible dialog and begin downloading the update immediately.

3. WHEN a mandatory update download completes, THE UpdateManager SHALL call
   `quitAndInstall()` without allowing the app to enter a fully interactive state.

4. IF a mandatory update download fails, THEN THE UpdateManager SHALL log the failure at
   `ERROR` level and display a notification to the user explaining the failure.

5. WHEN an active UpdatePolicy of type `recommended` is retrieved and the current app version
   is lower than `policy.targetVersion`, THE UpdateManager SHALL display a dismissible toast
   notification and allow the user to defer the update.

6. WHEN an active UpdatePolicy of type `experimental` is retrieved and the current app version
   is lower than `policy.targetVersion`, THE UpdateManager SHALL begin a silent background
   download and install the update on the next application launch.

7. WHEN an active UpdatePolicy of type `rollback` is retrieved, THE UpdateManager SHALL force-
   install the `targetVersion` by downloading the corresponding GitHub release asset and
   calling `quitAndInstall(isSilent=true, isForceRunAfter=true)`.

8. WHEN UpdateManager.rollbackTo() is called with a `version` equal to the current
   `app.getVersion()`, THE UpdateManager SHALL treat the call as a no-op, make no changes to
   `version-history.json`, and not call `app.quit()`.

9. IF the rollback target asset is not found in GitHub Releases, THEN THE UpdateManager SHALL
   reject with an `'asset-not-found'` error, log at `ERROR` level, and not call
   `quitAndInstall()`.

10. WHEN an update or rollback is successfully installed, THE UpdateManager SHALL append a
    new VersionRecord to `userData/updates/version-history.json` containing `version`,
    `channel`, `installedAt`, `source`, and `previousVersion`.

11. THE UpdateManager SHALL never delete or modify existing entries in
    `version-history.json`; records are append-only.

12. WHEN UpdateManager.getVersionHistory() is called, THE UpdateManager SHALL return all
    records from `version-history.json` in the order they were recorded.

13. WHEN Supabase or GitHub Releases is unreachable at startup, THE UpdateManager SHALL log
    a `WARN` entry, skip the update check, and allow the application to start normally.

14. WHEN Supabase has been unreachable for 3 consecutive application launches while a
    mandatory update was expected, THE UpdateManager SHALL show a non-blocking toast
    informing the user that an update check could not be completed.

15. THE UpdateManager SHALL register IPC channels `update:check`, `update:download`,
    `update:install`, `update:rollback`, `update:get-history`, and `update:get-policy` in
    the main process.

16. WHEN an app instance is subscribed to the `stable` UpdateChannel, THE UpdateManager
    SHALL only apply policies fetched for the `stable` channel and SHALL NOT apply policies
    from `beta` or `experimental` channels.

17. WHEN `app.isPackaged` is `false` (development mode), THE UpdateManager SHALL bypass the
    update check entirely and log a debug message.

---

### Requirement 6: Platform Adaptation

**User Story:** As a user on Windows, macOS, or Linux, I want the Tatakai app to behave like
a first-class native citizen on my operating system, so that notifications, badges, and
taskbar integration feel consistent with other apps on my platform.

#### Acceptance Criteria

1. WHEN PlatformAdapter is initialised on Windows, THE PlatformAdapter SHALL call
   `app.setAppUserModelId('app.tatakai.me')` to register the correct AUMID.

2. WHEN PlatformAdapter.requestAttention() is called on Windows, THE PlatformAdapter SHALL
   invoke `BrowserWindow.flashFrame(true)` to flash the taskbar entry.

3. WHEN PlatformAdapter.requestAttention() is called on macOS, THE PlatformAdapter SHALL
   invoke `app.dock.bounce('informational')` to bounce the dock icon.

4. WHEN PlatformAdapter.setBadgeCount() is called with a positive integer on macOS,
   THE PlatformAdapter SHALL set `app.dock.setBadge()` to the string representation of that
   count.

5. WHEN PlatformAdapter.setBadgeCount() is called with zero on macOS or Windows,
   THE PlatformAdapter SHALL clear the dock badge or taskbar overlay badge.

6. WHEN PlatformAdapter.notify() is called with `title` and `body`, THE PlatformAdapter
   SHALL display a native OS notification using the platform's `Notification` API with the
   Tatakai application icon.

7. WHERE the platform is Linux and `urgency` is `'critical'`, WHEN PlatformAdapter.notify()
   is called, THE PlatformAdapter SHALL set the `libnotify` urgency level to `critical`.

8. WHEN PlatformAdapter.ensureDesktopEntry() is called on Linux and no `.desktop` file
   exists at `~/.local/share/applications/tatakai.desktop`, THE PlatformAdapter SHALL write
   a valid `.desktop` file at that path.

9. WHEN PlatformAdapter.ensureDesktopEntry() is called on Windows or macOS,
   THE PlatformAdapter SHALL perform no action (no-op).

10. IF a native OS notification cannot be displayed due to permission denial or API
    unavailability, THEN THE PlatformAdapter SHALL log the failure via LogService and SHALL
    NOT throw an uncaught exception.

11. WHEN PlatformAdapter.registerProtocol() is called, THE PlatformAdapter SHALL register
    the specified deep-link protocol using Electron's `app.setAsDefaultProtocolClient()`.

---

### Requirement 7: Branding Initialisation

**User Story:** As a developer, I want all application storage paths and OS-level identifiers
to use "Tatakai" naming rather than Electron defaults, so that users see consistent branding
in their filesystem and taskbar, and so that production data is stored at a predictable,
well-named location.

#### Acceptance Criteria

1. WHEN BrandingInit.apply() is called, THE BrandingInit SHALL call `app.setName('Tatakai')`
   before `app.on('ready')` fires.

2. WHEN BrandingInit.apply() is called on Windows, THE BrandingInit SHALL call
   `app.setAppUserModelId('app.tatakai.me')`.

3. WHEN BrandingInit.apply() completes and the app is ready, THE BrandingInit SHALL ensure
   that `app.getPath('userData')` resolves to a path ending in `Tatakai` and does not
   contain the string `'Electron'`.

4. WHEN BrandingInit.apply() completes and the app is ready, THE BrandingInit SHALL ensure
   that `app.getPath('logs')` resolves to a path within the `Tatakai` userData directory.

5. WHEN BrandingInit.apply() is called and a legacy `…/Electron/` userData directory exists
   on disk, THE BrandingInit SHALL copy all contents from the legacy directory to
   `…/Tatakai/` exactly once on first upgraded launch.

6. WHEN BrandingInit.apply() is called and the `…/Tatakai/` userData directory already
   exists (no legacy migration needed), THE BrandingInit SHALL skip the migration step
   without modifying any existing files.

7. IF the legacy userData migration fails due to disk permission errors, THEN
   THE BrandingInit SHALL log the failure via LogService, skip the migration, and allow the
   application to start using a fresh `Tatakai/` userData directory.

8. WHEN BrandingInit.apply() has already been called in a previous run (idempotent guard),
   THE BrandingInit SHALL not attempt to re-migrate userData or overwrite existing Tatakai
   directory contents.

---

### Requirement 8: IPC Surface

**User Story:** As a renderer developer, I want a documented set of IPC channels exposed by
the production services, so that the UI can display logs, performance metrics, update
notifications, and crash alerts without direct filesystem access.

#### Acceptance Criteria

1. THE LogService SHALL expose an IPC handler for `log:tail` that accepts an optional line
   count and returns the result of `LogService.tail()`.

2. THE PerfMonitor SHALL expose an IPC handler for `perf:get-history` that returns the
   current in-memory snapshot history.

3. THE UpdateManager SHALL expose IPC handlers for `update:check`, `update:download`,
   `update:install`, `update:rollback`, `update:get-history`, and `update:get-policy` in
   the main process.

4. WHEN a CrashService detects a previous-session crash on startup, THE CrashService SHALL
   send an IPC message to the Renderer including the crash report details.

5. THE UpdateManager SHALL broadcast update lifecycle events to the Renderer via IPC channel
   `updater-event`, including event types: `checking`, `available`, `not-available`,
   `downloading`, `downloaded`, `mandatory-update`, and `error`.

6. WHEN any IPC handler encounters an unhandled error, THE handler SHALL return a structured
   error object (not throw) to the Renderer and log the error via LogService.

---

### Requirement 9: Security and Privacy

**User Story:** As a user, I want the application to handle my crash data and telemetry
responsibly, and as a developer I want update delivery to be tamper-resistant, so that the
app is both trustworthy and safe to operate.

#### Acceptance Criteria

1. WHEN an error event is transmitted to Sentry, THE ErrorTracker SHALL strip any strings
   matching filesystem path patterns or JWT token formats via the `beforeSend` hook before
   transmission.

2. WHILE the user's `userData/settings.json` contains `{ "telemetry": false }`,
   THE ErrorTracker SHALL not transmit data to Sentry for any capture call (as stated in
   Requirement 3.5).

3. WHEN the app downloads an update on Windows or macOS, THE UpdateManager SHALL rely on
   `electron-updater`'s built-in code-signing verification to validate the download before
   installation.

4. WHEN the app downloads an update on Linux, THE UpdateManager SHALL rely on
   `electron-updater`'s `sha512` checksum verification via `latest-linux.yml` before
   installation.

5. THE UpdateManager SHALL use a Supabase anon-read-only key for querying `update_policies`
   and SHALL NOT use a service role key in the shipped application bundle.

6. THE CrashService SHALL keep the Sentry DSN in a server-side environment variable and
   SHALL NOT include it in the Renderer process bundle.

7. WHEN new IPC channels are registered by production services, THE IPC handlers SHALL
   follow the existing pattern of named, explicit handlers with no generic pass-through
   invoke for production builds.
