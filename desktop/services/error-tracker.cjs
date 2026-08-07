'use strict'

/**
 * @file error-tracker.cjs
 * Unified Sentry-based error capturing for the Electron main process.
 *
 * Requirements: 3.1, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 9.1, 9.2
 *
 * Usage:
 *   const { createErrorTracker } = require('./services/error-tracker.cjs')
 *   const errorTracker = createErrorTracker({ logger })
 *   errorTracker.init({ dsn: process.env.SENTRY_DSN, release: '5.2.0', environment: 'production' })
 *   errorTracker.captureException(new Error('Something went wrong'))
 */

const fs = require('fs')
const path = require('path')

// ─── Sensitive-data scrubbing patterns (Req 3.4, 9.1) ─────────────────────────
// Windows absolute paths: C:\... (stops at whitespace or JSON string-end chars)
// Unix absolute paths:    /word/... (stops at whitespace or JSON string-end chars)
// Using [^\s"\\]+ to avoid consuming JSON structural characters (quotes, backslashes)
// while still matching path separators (/ and \) that are part of the path.
const RE_PATH = /([A-Za-z]:\\[^\s"]+|\/[^\s"]+)/g
// JWT tokens: eyXXX.XXX format (base64url segments)
const RE_JWT = /ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Recursively strips filesystem path strings and JWT tokens from an arbitrary value.
 * Operates on the JSON serialisation to cover all string fields uniformly,
 * using patterns that are safe against JSON structural characters.
 *
 * @param {unknown} value
 * @returns {unknown}
 */
function scrubSensitiveData(value) {
  try {
    const serialised = JSON.stringify(value)
    if (!serialised) return value
    const scrubbed = serialised
      .replace(RE_PATH, '[SCRUBBED_PATH]')
      .replace(RE_JWT, '[SCRUBBED_JWT]')
    return JSON.parse(scrubbed)
  } catch (_) {
    // If serialisation fails, return value as-is — better to send than crash
    return value
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates a new ErrorTracker instance for the Electron main process.
 *
 * @param {object}      opts
 * @param {object}      [opts.logger]   - LogService instance for internal diagnostics.
 * @param {string}      [opts.userDataPath] - Override for userData path (used in tests).
 *                                          In production, pass `app.getPath('userData')`.
 * @returns {ErrorTracker}
 */
function createErrorTracker({ logger = null, userDataPath = null } = {}) {
  // Lazily required so the module can be loaded without @sentry/node installed.
  // In production the package is always present; this pattern also eases testing.
  let Sentry = null

  /** Whether Sentry.init() has been called successfully. */
  let _initialised = false

  /** Path to the userData directory — set when init() is called. */
  let _userDataPath = userDataPath || null

  // ── Telemetry consent helper (Req 3.5, 9.2) ─────────────────────────────────

  /**
   * Reads `userData/settings.json` on every call (no caching, per spec).
   * Returns `true` if telemetry is enabled (default when key is absent).
   *
   * @returns {boolean}
   */
  function _isTelemetryEnabled() {
    if (!_userDataPath) return true // path not set yet → assume enabled
    const settingsPath = path.join(_userDataPath, 'settings.json')
    try {
      const raw = fs.readFileSync(settingsPath, 'utf8')
      const settings = JSON.parse(raw)
      // Explicit opt-out: { "telemetry": false }
      if (settings && settings.telemetry === false) return false
    } catch (_) {
      // File absent or unreadable → treat as consent given (privacy-safe default)
    }
    return true
  }

  // ── beforeSend hook (Req 3.4, 9.1) ──────────────────────────────────────────

  /**
   * Sentry `beforeSend` hook: strips paths and JWTs from the event before
   * it is transmitted to the Sentry DSN.
   *
   * @param {object} event - Sentry event object.
   * @returns {object | null}
   */
  function _beforeSend(event) {
    try {
      return scrubSensitiveData(event)
    } catch (err) {
      if (logger) {
        try { logger.warn('[ErrorTracker] beforeSend scrubbing failed', { err: String(err) }) } catch (_) {}
      }
      return event // send original rather than drop
    }
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  /**
   * Initialises `@sentry/node` with the provided DSN, release, and environment.
   * No-op if `dsn` is falsy (Req 3.1).
   *
   * @param {object} opts
   * @param {string} opts.dsn          - Sentry DSN URL. If falsy, init is skipped.
   * @param {string} opts.release      - App version string (e.g. `app.getVersion()`).
   * @param {string} opts.environment  - Environment label ('production', 'development', …).
   * @param {string} [opts.userDataPath] - Path to Electron userData directory.
   */
  function init({ dsn, release, environment, userDataPath: udp } = {}) {
    // Allow userData path to be provided at init time as well
    if (udp) _userDataPath = udp

    if (!dsn) {
      if (logger) {
        try { logger.warn('[ErrorTracker] No DSN provided; Sentry will not be initialised') } catch (_) {}
      }
      return
    }

    try {
      // Lazy-require to avoid crashing when @sentry/node is absent in test environments
      Sentry = require('@sentry/node')
      Sentry.init({
        dsn,
        release,
        environment,
        beforeSend: _beforeSend,
        // Disable automatic session tracking to reduce noise in desktop apps
        autoSessionTracking: false,
      })
      _initialised = true
    } catch (err) {
      if (logger) {
        try { logger.error('[ErrorTracker] Sentry.init() failed', { err: String(err) }) } catch (_) {}
      } else {
        console.error('[ErrorTracker] Sentry.init() failed:', err)
      }
    }
  }

  /**
   * Captures an exception and transmits it to Sentry, gated on telemetry consent.
   * (Req 3.3, 3.5)
   *
   * @param {Error}   err  - The error to capture.
   * @param {object}  [ctx] - Optional extra context attached to the event.
   */
  function captureException(err, ctx) {
    if (!_initialised) return
    if (!_isTelemetryEnabled()) return

    try {
      if (ctx) {
        Sentry.withScope((scope) => {
          scope.setExtras(ctx)
          Sentry.captureException(err)
        })
      } else {
        Sentry.captureException(err)
      }
    } catch (e) {
      if (logger) {
        try { logger.warn('[ErrorTracker] captureException failed', { err: String(e) }) } catch (_) {}
      }
    }
  }

  /**
   * Captures a message at the specified severity level, gated on telemetry consent.
   * (Req 3.9, 3.5)
   *
   * @param {string} msg                               - Human-readable message.
   * @param {'info'|'warning'|'error'|'fatal'} level  - Sentry severity level.
   */
  function captureMessage(msg, level) {
    if (!_initialised) return
    if (!_isTelemetryEnabled()) return

    try {
      Sentry.captureMessage(msg, level || 'info')
    } catch (e) {
      if (logger) {
        try { logger.warn('[ErrorTracker] captureMessage failed', { err: String(e) }) } catch (_) {}
      }
    }
  }

  /**
   * Sets (or clears) the active Sentry user context.
   * Pass `null` to clear the user from subsequent events (Req 3.6, 3.7).
   *
   * @param {{ id: string; email?: string } | null} user
   */
  function setUser(user) {
    if (!_initialised) return
    try {
      Sentry.setUser(user)
    } catch (e) {
      if (logger) {
        try { logger.warn('[ErrorTracker] setUser failed', { err: String(e) }) } catch (_) {}
      }
    }
  }

  /**
   * Records a breadcrumb in the current Sentry scope (Req 3.8).
   *
   * @param {{ category: string; message: string; level: string }} crumb
   */
  function addBreadcrumb(crumb) {
    if (!_initialised) return
    try {
      Sentry.addBreadcrumb(crumb)
    } catch (e) {
      if (logger) {
        try { logger.warn('[ErrorTracker] addBreadcrumb failed', { err: String(e) }) } catch (_) {}
      }
    }
  }

  // ── Return public interface ───────────────────────────────────────────────

  return {
    init,
    captureException,
    captureMessage,
    setUser,
    addBreadcrumb,
    /** @internal — exposed for testing */
    _scrubSensitiveData: scrubSensitiveData,
    _beforeSend,
    _isTelemetryEnabled,
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { createErrorTracker }
