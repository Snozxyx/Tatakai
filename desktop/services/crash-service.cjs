'use strict'

const fs = require('fs')
const path = require('path')

/**
 * @file crash-service.cjs
 * Registers Electron's native crash reporter and surfaces previous-crash
 * breadcrumbs on restart.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 *
 * Usage (before app.on('ready')):
 *   const { createCrashService } = require('./services/crash-service.cjs')
 *   const crashService = createCrashService()
 *   crashService.start({ dsn: process.env.SENTRY_DSN, uploadToServer: true })
 *
 * Usage (after app.on('ready'), inside ready handler):
 *   crashService.checkPreviousCrashes(mainWindow, logger)
 */

// ─── CrashService factory ────────────────────────────────────────────────────

/**
 * Creates a CrashService instance.
 *
 * The factory accepts no required arguments; dependencies (crashReporter, app)
 * are resolved lazily from `require('electron')` so that the module can be
 * loaded and tested without a live Electron environment by injecting mocks at
 * construction time.
 *
 * @param {{ crashReporter?: object, app?: object }} [deps] - Optional dependency overrides for testing.
 * @returns {{
 *   start: function({ dsn?: string, uploadToServer?: boolean }): void,
 *   checkPreviousCrashes: function(mainWindow: object, logger: object): void,
 *   clearCrashReports: function(): void,
 * }}
 */
function createCrashService(deps) {
  // Resolve crashReporter — use injected mock in tests, real Electron in production.
  const crashReporter =
    (deps && deps.crashReporter) ||
    (() => {
      try {
        return require('electron').crashReporter
      } catch (_err) {
        // Running outside of Electron (e.g. unit tests without a mock injected).
        return null
      }
    })()

  // Resolve app — used to get userData path for the acknowledged-reports file.
  const app =
    (deps && deps.app) ||
    (() => {
      try {
        return require('electron').app
      } catch (_err) {
        return null
      }
    })()

  // ── start() ────────────────────────────────────────────────────────────────

  /**
   * Registers the native crash reporter. Must be called **before**
   * `app.on('ready')` fires so that crashes during app initialisation are
   * also captured (Req 2.1).
   *
   * When a Sentry DSN is provided and `uploadToServer` is true, native
   * minidumps are uploaded automatically to that DSN on the next launch
   * (Req 2.2).
   *
   * When `dsn` is falsy: `uploadToServer` is omitted from the options so
   * Electron keeps dumps local, and a warning is logged to `console.warn`
   * (Req 2.6). Local crash dumps are still written to `app.getPath('crashDumps')`.
   *
   * @param {object}  [opts]
   * @param {string}  [opts.dsn]            - Sentry DSN for minidump upload endpoint.
   * @param {boolean} [opts.uploadToServer] - Whether to upload dumps to the DSN.
   */
  function start(opts) {
    const { dsn, uploadToServer } = opts || {}

    if (!crashReporter) {
      console.warn('[CrashService] crashReporter is not available — skipping start()')
      return
    }

    // Pre-create the Crashpad database layout before the native handler starts.
    // On Windows, Crashpad stat()s a per-report `attachments\<uuid>` folder it
    // never creates, spamming stderr with
    //   GetFileAttributes ...\Crashpad\attachments\<uuid>: (0x2)
    // Materialising an empty folder for every known report keeps those paths
    // valid. Honest caveat: a crash minted after this runs can still emit the
    // warning once for its fresh uuid — this reduces, not guarantees.
    _prepareCrashDumpsDir()

    if (!dsn) {
      // Req 2.6: DSN is missing — warn and start in local-only mode.
      console.warn(
        '[CrashService] No Sentry DSN configured. ' +
          'Crash dumps will be written locally but NOT uploaded to a remote endpoint.'
      )

      crashReporter.start({
        productName: 'Tatakai',
        // submitURL must be a string; use empty string for local-only mode so
        // Electron still initialises the crash handler and writes minidumps to
        // app.getPath('crashDumps').
        submitURL: '',
        uploadToServer: false,
      })

      return
    }

    // Req 2.1, 2.2: Normal path — register with DSN and caller-supplied upload flag.
    crashReporter.start({
      productName: 'Tatakai',
      submitURL: dsn,
      uploadToServer: uploadToServer === true,
    })
  }

  // ── _prepareCrashDumpsDir() (private) ──────────────────────────────────────

  /**
   * Ensures the Crashpad database directory and its `attachments` subfolder
   * exist, and pre-creates a per-report `attachments/<uuid>` folder for every
   * report Crashpad already has on disk. Best-effort — never throws.
   *
   * Why per-report folders: on Windows the native Crashpad handler stat()s
   * `attachments\<report-uuid>` for each report in its database as it starts,
   * even when no attachments were ever registered. Every missing folder spams
   * stderr with
   *   GetFileAttributes ...\Crashpad\attachments\<uuid>: (0x2)
   * on *every* launch. Materialising an (empty) folder per known report makes
   * those stat()s succeed and silences the noise. We deliberately do NOT prune
   * empty folders here — an empty folder is exactly what suppresses the error.
   * New crashes minted after this runs may still emit the warning once for their
   * fresh uuid, so this reduces rather than eliminates.
   */
  function _prepareCrashDumpsDir() {
    let crashDumpsDir
    try {
      crashDumpsDir = app ? app.getPath('crashDumps') : null
    } catch (_err) {
      crashDumpsDir = null
    }
    if (!crashDumpsDir) return

    try {
      const attachmentsDir = path.join(crashDumpsDir, 'attachments')
      fs.mkdirSync(attachmentsDir, { recursive: true })

      // Collect report uuids from the Crashpad database. Reports live as
      // `<uuid>.dmp` under `reports/` (and legacy layouts under `completed/`,
      // `pending/`, `new/`); the uuid is the filename stem.
      const uuids = new Set()
      for (const sub of ['reports', 'completed', 'pending', 'new']) {
        let entries
        try {
          entries = fs.readdirSync(path.join(crashDumpsDir, sub))
        } catch (_) {
          continue // subdir may not exist yet
        }
        for (const entry of entries) {
          const stem = entry.replace(/\.[^.]+$/, '') // strip .dmp/.meta/etc
          if (/^[0-9a-fA-F-]{16,}$/.test(stem)) uuids.add(stem)
        }
      }

      // Materialise an empty attachment folder for each known report.
      for (const uuid of uuids) {
        try {
          fs.mkdirSync(path.join(attachmentsDir, uuid), { recursive: true })
        } catch (_) { /* ignore individual failures */ }
      }
    } catch (_err) {
      // Directory prep is a best-effort cosmetic fix — swallow any error.
    }
  }

  // ── checkPreviousCrashes() ─────────────────────────────────────────────────
  /**
   * Checks whether a crash report from the previous session exists.
   * Must be called inside `app.on('ready')` after the main window is available.
   *
   * When a crash report is found it is auto-forwarded (metadata only — no dumps,
   * no PII) to the tatakaiapi crash-ingest endpoint, which fans it out to the
   * Supabase crash_reports table and the Discord webhook server-side. It is also
   * logged via LogService and pushed to the renderer over the `crash:previous`
   * IPC for the admin panel. There is no native consent dialog (silent auto-send).
   *
   * @param {Electron.BrowserWindow} mainWindow  - The main BrowserWindow instance.
   * @param {import('./_types.cjs').LogService}  logger - LogService instance for structured logging.
   * @param {{ uploadEndpoint?: string }} [opts] - Optional overrides for testing.
   */
  function checkPreviousCrashes(mainWindow, logger, opts) {
    if (!crashReporter) {
      if (logger) logger.warn('[CrashService] crashReporter unavailable — skipping checkPreviousCrashes()')
      return
    }

    let report
    try {
      report = crashReporter.getLastCrashReport()
    } catch (err) {
      if (logger) logger.warn('[CrashService] getLastCrashReport() threw', { error: String(err) })
      return
    }

    if (!report) return

    const reportDate = report.date instanceof Date
      ? report.date.toISOString()
      : String(report.date)

    // Log it
    if (logger) {
      logger.error('[CrashService] Previous session crash detected', {
        id: report.id,
        date: reportDate,
        path: report.path,
      })
    }

    // Auto-forward (metadata only — no dumps, no PII) on next launch. There is
    // no native consent dialog: the previous dialog's wording already promised
    // "no personal data or media files", so we send the same metadata silently.
    // Fire-and-forget so the ready handler is never blocked, and failures never
    // reach the main process.
    const meta = {
      id: report.id,
      date: reportDate,
      path: report.path,
      app_version: (() => { try { return require('electron').app.getVersion() } catch (_) { return 'unknown' } })(),
      platform: process.platform,
      arch: process.arch,
      node_version: process.versions.node,
      electron_version: process.versions.electron,
    }
    setImmediate(async () => {
      // The endpoint (tatakaiapi) fans out to Supabase + Discord server-side, so
      // the desktop only has to make this one upload — no client-side webhook.
      await _uploadCrashReport(meta, opts, logger)
      if (logger) logger.info('[CrashService] Crash metadata auto-forwarded', { id: report.id })
    })

    // Always notify the renderer via IPC (for the admin CrashReportPanel)
    try {
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
        mainWindow.webContents.send('crash:previous', {
          id: report.id,
          date: reportDate,
          path: report.path,
        })
      }
    } catch (err) {
      if (logger) logger.warn('[CrashService] Failed to send crash:previous IPC', { error: String(err) })
    }
  }

  // ── _uploadCrashReport() (private) ────────────────────────────────────────

  /**
   * Uploads crash report metadata to the tatakaiapi crash-ingest route, which
   * inserts it into the Supabase `crash_reports` table via the service-role
   * client (see tatakaiapi/src/routes/crash.ts). The desktop app never holds a
   * Supabase key — the write is brokered server-side.
   *
   * Endpoint resolution (first non-empty wins):
   *   1. opts.uploadEndpoint (tests)
   *   2. process.env.CRASH_REPORT_ENDPOINT (explicit override)
   *   3. `${VITE_BACKEND_ORIGIN}/api/v3/crash` — same convention the runtime IPC
   *      uses (desktop/ipc/ipc-runtime.cjs), defaulting to the local dev API.
   * Fails silently — a failed upload must never crash the main process.
   *
   * @param {{ id: string, date: string, path: string }} report
   * @param {{ uploadEndpoint?: string }} [opts]
   * @param {object} [logger]
   */
  async function _uploadCrashReport(report, opts, logger) {
    const apiBase = (process.env.VITE_BACKEND_ORIGIN || 'http://localhost:4001').replace(/\/+$/, '')
    const endpoint =
      (opts && opts.uploadEndpoint) ||
      process.env.CRASH_REPORT_ENDPOINT ||
      `${apiBase}/api/v3/crash`

    try {
      // WHATWG URL (url.parse() is deprecated — DEP0169).
      const parsed = new URL(endpoint)
      // Pick the transport by protocol so both the local dev API (http) and a
      // production origin (https) work without extra config.
      const transport = parsed.protocol === 'http:' ? require('http') : require('https')
      const defaultPort = parsed.protocol === 'http:' ? 80 : 443
      const body = JSON.stringify({
        id: report.id,
        date: report.date,
        app_version: (() => { try { return require('electron').app.getVersion() } catch (_) { return 'unknown' } })(),
        platform: process.platform,
        arch: process.arch,
        node_version: process.versions.node,
        electron_version: process.versions.electron,
      })

      await new Promise((resolve, reject) => {
        const req = transport.request(
          {
            hostname: parsed.hostname,
            path: `${parsed.pathname}${parsed.search}`,
            port: parsed.port || defaultPort,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(body),
            },
          },
          (res) => {
            res.resume() // drain the response
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve()
            } else {
              reject(new Error(`HTTP ${res.statusCode}`))
            }
          }
        )
        req.on('error', reject)
        req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')) })
        req.write(body)
        req.end()
      })
      if (logger) logger.info('[CrashService] Crash metadata uploaded', { endpoint, id: report.id })
    } catch (err) {
      if (logger) logger.warn('[CrashService] Failed to upload crash report', { error: String(err) })
    }
  }

  // ── clearCrashReports() ────────────────────────────────────────────────────

  /**
   * Marks all known previous crash reports as acknowledged by writing an
   * acknowledged-reports file to `userData/crash-reports-acked.json` (Req 2.5).
   *
   * Writing this file lets the app (or UI) detect on subsequent launches whether
   * the crash has already been shown to the user.
   */
  function clearCrashReports() {
    let report = null

    if (crashReporter) {
      try {
        report = crashReporter.getLastCrashReport()
      } catch (_err) {
        // If we cannot read the report, still proceed to write the acked file.
      }
    }

    // Determine userData directory — prefer injected app, fall back to sensible default.
    let userDataPath
    try {
      userDataPath = app ? app.getPath('userData') : null
    } catch (_err) {
      userDataPath = null
    }

    if (!userDataPath) {
      console.warn('[CrashService] clearCrashReports(): userData path unavailable — cannot persist acknowledgement')
      return
    }

    const ackedFilePath = path.join(userDataPath, 'crash-reports-acked.json')

    let existingAcked = []
    try {
      if (fs.existsSync(ackedFilePath)) {
        existingAcked = JSON.parse(fs.readFileSync(ackedFilePath, 'utf8'))
        if (!Array.isArray(existingAcked)) existingAcked = []
      }
    } catch (_err) {
      existingAcked = []
    }

    // Append the current report id if we have one and it is not already acked.
    if (report && report.id) {
      if (!existingAcked.includes(report.id)) {
        existingAcked.push(report.id)
      }
    }

    try {
      fs.writeFileSync(ackedFilePath, JSON.stringify(existingAcked, null, 2), 'utf8')
    } catch (err) {
      console.error('[CrashService] clearCrashReports(): failed to write acked file', err)
    }
  }

  // ── Public interface ───────────────────────────────────────────────────────

  return { start, checkPreviousCrashes, clearCrashReports }
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = { createCrashService }
