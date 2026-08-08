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

  // ── checkPreviousCrashes() ─────────────────────────────────────────────────

  /**
   * Checks whether a crash report from the previous session exists.
   * Must be called inside `app.on('ready')` after the main window is available.
   *
   * When a crash report is found:
   *   - Shows a native dialog asking the user if they want to submit the report
   *   - If the user consents: uploads the report metadata to the configured endpoint
   *   - Logs the crash details via LogService
   *   - Sends an IPC push `crash:previous` to the renderer for the admin panel
   *
   * @param {Electron.BrowserWindow} mainWindow  - The main BrowserWindow instance.
   * @param {import('./_types.cjs').LogService}  logger - LogService instance for structured logging.
   * @param {{ dialog?: object, uploadEndpoint?: string }} [opts] - Optional overrides for testing.
   */
  function checkPreviousCrashes(mainWindow, logger, opts) {
    if (!crashReporter) {
      if (logger) logger.warn('[CrashService] crashReporter unavailable — skipping checkPreviousCrashes()')
      return
    }

    // Resolve dialog — allow injection for tests
    const electronDialog =
      (opts && opts.dialog) ||
      (() => {
        try { return require('electron').dialog } catch (_) { return null }
      })()

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

    // Show native crash report dialog (async so it doesn't block the ready handler)
    if (electronDialog) {
      setImmediate(async () => {
        try {
          const { response } = await electronDialog.showMessageBox(mainWindow || null, {
            type: 'error',
            title: 'Tatakai crashed',
            message: 'It looks like Tatakai crashed during your last session.',
            detail:
              'Would you like to send a crash report to the developers?\n\n' +
              'This report contains technical information that helps us fix bugs. ' +
              'No personal data or media files are included.\n\n' +
              `Crash ID: ${report.id || 'unknown'}\n` +
              `Time: ${new Date(reportDate).toLocaleString()}`,
            buttons: ['Send Crash Report', 'No Thanks'],
            defaultId: 0,
            cancelId: 1,
            noLink: true,
          })

          if (response === 0) {
            // User consented — upload report metadata
            await _uploadCrashReport({ id: report.id, date: reportDate, path: report.path }, opts, logger)
            if (logger) logger.info('[CrashService] Crash report submitted by user')
          } else {
            if (logger) logger.info('[CrashService] User declined crash report submission')
          }
        } catch (err) {
          if (logger) logger.warn('[CrashService] Failed to show crash dialog', { error: String(err) })
        }
      })
    }

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
   * Uploads crash report metadata to the configured endpoint.
   * Uses a Supabase Edge Function or any HTTPS endpoint injected via opts.uploadEndpoint.
   * Fails silently — a failed upload should never crash the main process.
   *
   * @param {{ id: string, date: string, path: string }} report
   * @param {{ uploadEndpoint?: string }} [opts]
   * @param {object} [logger]
   */
  async function _uploadCrashReport(report, opts, logger) {
    const endpoint =
      (opts && opts.uploadEndpoint) ||
      process.env.CRASH_REPORT_ENDPOINT ||
      null

    if (!endpoint) {
      // No endpoint configured — log locally only
      if (logger) logger.info('[CrashService] No CRASH_REPORT_ENDPOINT set; crash metadata logged locally only')
      return
    }

    try {
      const https = require('https')
      const url = require('url')
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
        const parsed = url.parse(endpoint)
        const req = https.request(
          {
            hostname: parsed.hostname,
            path: parsed.path,
            port: parsed.port || 443,
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
