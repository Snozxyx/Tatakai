'use strict'

/**
 * @file branding-init.cjs
 * Ensures all app storage paths and OS-level identifiers use "Tatakai" naming,
 * not generic Electron defaults. Also performs one-time migration of legacy
 * `Electron/` userData to `Tatakai/` on the first upgraded launch.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8
 */

const fs = require('fs')
const path = require('path')

// ─── Sentinel file names ─────────────────────────────────────────────────────

/** Written after a successful apply() to prevent re-runs (Req 7.8) */
const BRANDED_SENTINEL = '.branded'

/**
 * Written after a successful Electron/ → Tatakai/ migration so that subsequent
 * launches skip the copy step even if the legacy directory still exists (Req 7.8).
 */
const MIGRATION_DONE_SENTINEL = '.migration-done'

// ─── BrandingInit ────────────────────────────────────────────────────────────

/**
 * Applies Tatakai branding to the app and schedules the one-time userData
 * migration to run once the app is ready.
 *
 * Must be called before `app.on('ready')` fires.
 *
 * @param {Electron.App} electronApp - The Electron `app` object.
 */
function apply(electronApp) {
  // ── 1. Set app name (Req 7.1) ─────────────────────────────────────────────
  electronApp.setName('Tatakai')

  // ── 2. Windows AUMID (Req 7.2) ────────────────────────────────────────────
  if (process.platform === 'win32') {
    electronApp.setAppUserModelId('app.tatakai.me')
  }

  // ── 3. Post-ready checks and migration ────────────────────────────────────
  electronApp.on('ready', () => {
    _assertUserDataPath(electronApp)
    _runMigration(electronApp)
    _writeBrandedSentinel(electronApp)
  })
}

// ─── Internal helpers ────────────────────────────────────────────────────────

/**
 * Asserts that userData and logs paths contain 'Tatakai' and not 'Electron'.
 * Logs a warning (via console.warn since LogService isn't available yet) if the
 * assertion fails — but does not throw, so startup is never blocked (Req 7.3, 7.4).
 *
 * @param {Electron.App} electronApp
 */
function _assertUserDataPath(electronApp) {
  const userData = electronApp.getPath('userData')
  const logsPath = electronApp.getPath('logs')

  if (userData.includes('Electron')) {
    console.warn(
      '[BrandingInit] WARNING: userData path still contains "Electron".',
      { userData }
    )
  }

  if (!userData.includes('Tatakai')) {
    console.warn(
      '[BrandingInit] WARNING: userData path does not contain "Tatakai".',
      { userData }
    )
  }

  if (!logsPath.startsWith(userData)) {
    console.warn(
      '[BrandingInit] WARNING: logs path is not within the Tatakai userData directory.',
      { logsPath, userData }
    )
  }
}

/**
 * Performs a one-time copy of legacy `…/Electron/` userData to `…/Tatakai/`.
 *
 * Migration is skipped when:
 *  - The migration-done sentinel already exists (Req 7.8).
 *  - The Electron/ directory does not exist on disk (Req 7.6).
 *  - The Tatakai/ directory already has content (Req 7.6).
 *
 * On failure: logs via console.error (LogService is not yet available at this
 * point in startup) and continues — app starts with a fresh Tatakai directory
 * (Req 7.7).
 *
 * @param {Electron.App} electronApp
 */
function _runMigration(electronApp) {
  const tatakaiDir = electronApp.getPath('userData')
  const sentinelPath = path.join(tatakaiDir, MIGRATION_DONE_SENTINEL)

  // ── Idempotency guard (Req 7.8) ───────────────────────────────────────────
  if (fs.existsSync(sentinelPath)) {
    return
  }

  // ── Locate the legacy Electron/ userData directory ─────────────────────────
  const electronDir = _findLegacyElectronDir(tatakaiDir)

  // ── No legacy directory → skip migration (Req 7.6) ───────────────────────
  if (!electronDir || !fs.existsSync(electronDir)) {
    // Write the sentinel so we don't check again on every launch.
    _writeMigrationDoneSentinel(sentinelPath)
    return
  }

  // ── Tatakai directory already populated → skip migration (Req 7.6) ────────
  if (_isTatakaiDirPopulated(tatakaiDir)) {
    _writeMigrationDoneSentinel(sentinelPath)
    return
  }

  // ── Perform the copy (Req 7.5) ─────────────────────────────────────────────
  try {
    fs.cpSync(electronDir, tatakaiDir, {
      recursive: true,
      // Do not overwrite files that already exist in the destination.
      force: false,
      errorOnExist: false,
    })
    console.log('[BrandingInit] Migration complete: Electron/ → Tatakai/')
    _writeMigrationDoneSentinel(sentinelPath)
  } catch (err) {
    // EPERM / EACCES or any other failure → log and continue (Req 7.7)
    const code = err && err.code ? err.code : 'UNKNOWN'
    if (code === 'EPERM' || code === 'EACCES') {
      console.error(
        '[BrandingInit] Migration failed due to permission error — starting with fresh Tatakai directory.',
        { code, message: err.message }
      )
    } else {
      console.error(
        '[BrandingInit] Migration failed — starting with fresh Tatakai directory.',
        { code, message: err.message }
      )
    }
    // Write the sentinel anyway so we don't retry on every subsequent launch.
    _writeMigrationDoneSentinel(sentinelPath)
  }
}

/**
 * Derives the expected legacy `Electron/` userData directory from the current
 * `Tatakai/` userData path.
 *
 * Strategy: replace the last path segment "Tatakai" with "Electron".
 * e.g.  C:\Users\Alice\AppData\Roaming\Tatakai
 *    →  C:\Users\Alice\AppData\Roaming\Electron
 *
 * @param {string} tatakaiDir - Absolute path to the current Tatakai userData dir.
 * @returns {string|null} Absolute path to the legacy Electron dir, or null if
 *   the heuristic cannot derive it (e.g. path does not end with "Tatakai").
 */
function _findLegacyElectronDir(tatakaiDir) {
  const normalized = tatakaiDir.replace(/[\\/]+$/, '') // strip trailing slashes
  const basename = path.basename(normalized)

  if (basename !== 'Tatakai') {
    // The heuristic only applies when the directory is literally named "Tatakai".
    return null
  }

  return path.join(path.dirname(normalized), 'Electron')
}

/**
 * Returns true if the Tatakai userData directory has any content beyond the
 * sentinel files that BrandingInit itself writes.
 *
 * @param {string} tatakaiDir
 * @returns {boolean}
 */
function _isTatakaiDirPopulated(tatakaiDir) {
  try {
    const entries = fs.readdirSync(tatakaiDir)
    const nonSentinelEntries = entries.filter(
      (e) => e !== BRANDED_SENTINEL && e !== MIGRATION_DONE_SENTINEL
    )
    return nonSentinelEntries.length > 0
  } catch (_err) {
    // If we can't read the directory, treat as unpopulated.
    return false
  }
}

/**
 * Writes the `.branded` sentinel file into userData after a successful apply().
 * Errors are silently swallowed — a missing sentinel just means apply() runs
 * its checks again on the next launch (harmless).
 *
 * @param {Electron.App} electronApp
 */
function _writeBrandedSentinel(electronApp) {
  try {
    const sentinelPath = path.join(electronApp.getPath('userData'), BRANDED_SENTINEL)
    if (!fs.existsSync(sentinelPath)) {
      fs.mkdirSync(path.dirname(sentinelPath), { recursive: true })
      fs.writeFileSync(sentinelPath, new Date().toISOString(), 'utf8')
    }
  } catch (_err) {
    // Non-fatal; do not surface.
  }
}

/**
 * Writes the `.migration-done` sentinel file to prevent re-running the migration.
 *
 * @param {string} sentinelPath - Absolute path to write the sentinel.
 */
function _writeMigrationDoneSentinel(sentinelPath) {
  try {
    fs.mkdirSync(path.dirname(sentinelPath), { recursive: true })
    fs.writeFileSync(sentinelPath, new Date().toISOString(), 'utf8')
  } catch (_err) {
    // Non-fatal; the migration will attempt to run again next launch if this fails.
  }
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = { apply }
