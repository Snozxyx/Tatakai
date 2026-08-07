'use strict'

/**
 * @file log-service.cjs
 * Structured, rotating JSON logger for the Electron main process.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.7, 1.8, 1.10
 *
 * Usage:
 *   const { createLogService } = require('./services/log-service.cjs')
 *   const logger = createLogService({ app })
 *   logger.info('App started', { version: '1.0.0' })
 */

const fs = require('fs')
const path = require('path')

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates a new LogService instance.
 *
 * @param {object}        opts
 * @param {Electron.App}  opts.app               - Electron app object (provides userData path + version).
 * @param {number}        [opts.maxFileSizeMB=10] - Rotate threshold in MB (Req 1.3).
 * @param {number}        [opts.maxFiles=5]       - Maximum number of rotated files to keep (Req 1.4).
 * @param {object}        [opts.errorTracker]     - Optional ErrorTracker for ERROR/FATAL forwarding (Req 1.7).
 * @param {object}        [opts.ipcMain]          - Optional ipcMain for registering log:tail handler (Req 8.1).
 * @returns {import('./_types.cjs').LogService}
 */
function createLogService({ app, maxFileSizeMB = 10, maxFiles = 5, errorTracker = null, ipcMain = null } = {}) {
  // ── Config ─────────────────────────────────────────────────────────────────
  const ROTATE_THRESHOLD_BYTES = maxFileSizeMB * 1024 * 1024

  // ── Log directory and primary log file path ────────────────────────────────
  const logDir = path.join(app.getPath('userData'), 'logs')
  const LOG_FILE_NAME = 'app.log'

  /** Returns the absolute path for a given rotation index.
   *  index 0 → app.log (current)
   *  index 1 → app.1.log
   *  index N → app.N.log
   * @param {number} index
   */
  function _logPath(index) {
    if (index === 0) return path.join(logDir, LOG_FILE_NAME)
    return path.join(logDir, `app.${index}.log`)
  }

  // ── State ──────────────────────────────────────────────────────────────────
  let currentSizeBytes = 0
  /** @type {fs.WriteStream | null} */
  let logStream = null
  let _closing = false

  // ── Initialise log directory ───────────────────────────────────────────────
  try {
    fs.mkdirSync(logDir, { recursive: true })
  } catch (err) {
    console.error('[LogService] Failed to create log directory:', err)
  }

  // ── Seed currentSizeBytes from existing file ───────────────────────────────
  try {
    const stat = fs.statSync(_logPath(0))
    currentSizeBytes = stat.size
  } catch (_) {
    currentSizeBytes = 0
  }

  // ── Open write stream ──────────────────────────────────────────────────────
  _openStream()

  /**
   * Opens (or re-opens) the write stream to app.log in append mode.
   * The stream is used for close() drain semantics; actual writes use
   * appendFileSync for strict ordering and rotation correctness.
   */
  function _openStream() {
    try {
      logStream = fs.createWriteStream(_logPath(0), { flags: 'a' })
      logStream.on('error', (err) => {
        console.error('[LogService] Stream error:', err)
      })
    } catch (err) {
      console.error('[LogService] Failed to open log stream:', err)
      logStream = null
    }
  }

  // ── Rotation ───────────────────────────────────────────────────────────────

  /**
   * Rotates log files synchronously:
   *   app.(maxFiles-1).log → deleted
   *   app.(N).log          → app.(N+1).log  (for N from maxFiles-2 down to 1)
   *   app.log              → app.1.log
   * Then opens a fresh stream on app.log and resets currentSizeBytes.
   *
   * Req 1.3, 1.4
   */
  function rotate() {
    // Close the current stream before renaming files so the handle is released
    if (logStream && !logStream.destroyed) {
      try {
        logStream.end()
      } catch (_) {}
      logStream = null
    }

    // Shift files: delete the oldest excess file, then rename descending
    try {
      // Delete the file that would be pushed beyond maxFiles (app.(maxFiles-1).log)
      const excess = _logPath(maxFiles - 1)
      if (fs.existsSync(excess)) {
        fs.unlinkSync(excess)
      }

      // Rename: app.(N-1).log → app.N.log  (for N from maxFiles-1 down to 1)
      for (let i = maxFiles - 1; i >= 1; i--) {
        const src = _logPath(i - 1)
        const dst = _logPath(i)
        if (fs.existsSync(src)) {
          fs.renameSync(src, dst)
        }
      }
    } catch (err) {
      console.error('[LogService] Rotation rename failed:', err)
    }

    // Reset byte counter and open fresh stream
    currentSizeBytes = 0
    _openStream()
  }

  // ── Core write ─────────────────────────────────────────────────────────────

  /**
   * Serialises a log entry as a JSON line and writes it to the active stream.
   * Tracks byte count and triggers rotation when threshold is reached.
   *
   * Req 1.1, 1.2, 1.3, 1.8
   *
   * @param {string} level  - One of DEBUG|INFO|WARN|ERROR|FATAL
   * @param {string} msg    - Human-readable message.
   * @param {Record<string, unknown>} [ctx] - Optional structured context.
   */
  function write(level, msg, ctx) {
    /** @type {import('./_types.cjs').LogLine} */
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message: msg,
      pid: process.pid,
      version: app.getVersion ? app.getVersion() : 'unknown',
      platform: process.platform,
    }

    // Only include context when provided (Req 1.2)
    if (ctx !== undefined && ctx !== null) {
      entry.context = ctx
    }

    let line
    try {
      line = JSON.stringify(entry)
    } catch (err) {
      // Serialisation failure — fall back to a minimal safe line
      line = JSON.stringify({
        timestamp: entry.timestamp,
        level,
        message: '[LogService] Failed to serialise log entry',
        pid: entry.pid,
        version: entry.version,
        platform: entry.platform,
      })
    }

    const lineWithNewline = line + '\n'
    const byteLen = Buffer.byteLength(lineWithNewline, 'utf8')

    // Write to file synchronously for strict ordering (Req 1.8 — fall back to console.error on failure)
    try {
      fs.appendFileSync(_logPath(0), lineWithNewline, 'utf8')
    } catch (err) {
      console.error('[LogService] Write failed:', err, lineWithNewline.trim())
    }

    // Track bytes written since last rotation
    currentSizeBytes += byteLen

    // Trigger rotation if threshold reached (Req 1.3)
    if (currentSizeBytes >= ROTATE_THRESHOLD_BYTES) {
      try {
        rotate()
      } catch (err) {
        console.error('[LogService] Rotation failed:', err)
      }
    }

    // Forward ERROR / FATAL to ErrorTracker (Req 1.7)
    if (errorTracker && (level === 'ERROR' || level === 'FATAL')) {
      try {
        const sentryLevel = level === 'FATAL' ? 'fatal' : 'error'
        errorTracker.captureMessage(msg, sentryLevel)
      } catch (_) {
        // Never let ErrorTracker failures crash the log path
      }
    }
  }

  // ── Public level methods ───────────────────────────────────────────────────

  /** @param {string} msg @param {Record<string, unknown>=} ctx */
  function debug(msg, ctx) { write('DEBUG', msg, ctx) }

  /** @param {string} msg @param {Record<string, unknown>=} ctx */
  function info(msg, ctx) { write('INFO', msg, ctx) }

  /** @param {string} msg @param {Record<string, unknown>=} ctx */
  function warn(msg, ctx) { write('WARN', msg, ctx) }

  /** @param {string} msg @param {Record<string, unknown>=} ctx */
  function error(msg, ctx) { write('ERROR', msg, ctx) }

  /** @param {string} msg @param {Record<string, unknown>=} ctx */
  function fatal(msg, ctx) { write('FATAL', msg, ctx) }

  // ── getLogPath ─────────────────────────────────────────────────────────────

  /**
   * Returns the absolute path to the currently active log file (Req 1.10).
   *
   * @returns {string}
   */
  function getLogPath() {
    return _logPath(0)
  }

  // ── tail ──────────────────────────────────────────────────────────────────

  /**
   * Returns up to `lines` most-recent log lines across all rotated files, in
   * chronological order (oldest first).  Returns `[]` if no log files exist
   * (Req 1.5, 1.6).
   *
   * @param {number} [lines=200]
   * @returns {string[]}
   */
  function tail(lines = 200) {
    // Collect all existing log file paths from newest rotation back to current
    // Read in "newest first" (rotated files from highest index first, then app.log)
    // so we can stop once we have enough lines.
    const filePaths = []
    // app.log is the most-recently-written (current)
    filePaths.push(_logPath(0))
    for (let i = 1; i < maxFiles; i++) {
      filePaths.push(_logPath(i))
    }

    // Read lines from files. Since app.log has the most recent entries and
    // app.1.log has entries just before it (etc.), we read current file last
    // when building chronological order.
    // Strategy: collect all available lines up to limit, oldest-first output.

    // Build list of (filePath, lines[]) pairs for files that exist,
    // ordered oldest → newest: app.(maxFiles-1).log … app.1.log, app.log
    const fileContents = [] // [ [line, line, ...], ... ] oldest file first

    for (let i = maxFiles - 1; i >= 0; i--) {
      const fp = _logPath(i)
      try {
        if (!fs.existsSync(fp)) continue
        const content = fs.readFileSync(fp, 'utf8')
        const fileLines = content.split('\n').filter((l) => l.trim().length > 0)
        if (fileLines.length > 0) {
          fileContents.push(fileLines)
        }
      } catch (_) {
        // Skip unreadable files without throwing (Req 1.6 spirit)
      }
    }

    if (fileContents.length === 0) return []

    // Flatten all lines in chronological order (oldest first)
    const allLines = fileContents.flat()

    // Return at most `lines` most-recent entries, still oldest-first
    return allLines.slice(-lines)
  }

  // ── close ─────────────────────────────────────────────────────────────────

  /**
   * Flushes pending writes and closes the underlying stream (Req 1.9).
   * Since writes are synchronous (appendFileSync), all data is already on disk
   * by the time this is called. The stream is ended to release the file handle.
   *
   * @returns {Promise<void>}
   */
  function close() {
    return new Promise((resolve) => {
      if (_closing) {
        resolve()
        return
      }
      _closing = true
      if (!logStream || logStream.destroyed) {
        resolve()
        return
      }
      logStream.end(() => resolve())
    })
  }

  // ── IPC handler (Req 8.1) ─────────────────────────────────────────────────

  if (ipcMain) {
    ipcMain.handle('log:tail', (_event, lineCount) => {
      try {
        return tail(lineCount)
      } catch (err) {
        console.error('[LogService] IPC log:tail error:', err)
        return { error: err && err.message ? err.message : String(err) }
      }
    })
  }

  // ── Return public interface ───────────────────────────────────────────────

  return {
    debug,
    info,
    warn,
    error,
    fatal,
    getLogPath,
    tail,
    close,
    /** @internal — exposed for testing */
    _rotate: rotate,
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { createLogService }
