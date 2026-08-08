'use strict'

/**
 * @file platform-adapter.cjs
 * Abstracts OS-specific native behaviours behind a single interface, covering
 * notifications, dock/taskbar badges, attention requests, deep-link protocol
 * registration, and Linux .desktop file creation.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11
 */

const fs = require('fs')
const path = require('path')
const os = require('os')

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Creates a new PlatformAdapter instance.
 *
 * @param {object}       opts
 * @param {Electron.App} opts.app            - Electron `app` object.
 * @param {typeof import('electron').BrowserWindow} opts.BrowserWindow - Electron BrowserWindow class.
 * @param {import('./_types.cjs').LogService} opts.logger - LogService instance for error reporting.
 * @returns {PlatformAdapter}
 */
function createPlatformAdapter({ app, BrowserWindow, logger }) {
  // ── Windows AUMID (Req 6.1) ───────────────────────────────────────────────
  // Registered eagerly on construction so it is set before any window is shown.
  if (process.platform === 'win32') {
    try {
      app.setAppUserModelId('app.tatakai.me')
    } catch (err) {
      _logWarn(logger, '[PlatformAdapter] Failed to set AUMID', err)
    }
  }

  // ─── notify ─────────────────────────────────────────────────────────────

  /**
   * Displays a native OS notification with the given title and body.
   *
   * On Linux, when `urgency === 'critical'`, the libnotify urgency level is set
   * to `'critical'`.  All errors are caught and logged — no exception is ever
   * allowed to escape (Req 6.6, 6.7, 6.10).
   *
   * @param {object}                                              opts
   * @param {string}                                              opts.title
   * @param {string}                                              opts.body
   * @param {'low'|'normal'|'critical'}                          [opts.urgency='normal']
   */
  function notify({ title, body, urgency = 'normal' }) {
    // Lazily require Notification so this module can be loaded in environments
    // where electron is not yet fully initialised.
    let Notification
    try {
      Notification = require('electron').Notification
    } catch (err) {
      _logError(logger, '[PlatformAdapter] Failed to require electron.Notification', err)
      return
    }

    // Guard: Notification may not be supported on all platforms/configurations.
    if (typeof Notification.isSupported === 'function' && !Notification.isSupported()) {
      _logWarn(logger, '[PlatformAdapter] Notification.isSupported() returned false — skipping')
      return
    }

    /** @type {Electron.NotificationConstructorOptions} */
    const options = { title, body }

    // Linux critical urgency (Req 6.7)
    if (process.platform === 'linux' && urgency === 'critical') {
      options.urgency = 'critical'
    }

    try {
      const notification = new Notification(options)
      notification.show()
    } catch (err) {
      // Req 6.10: never throw — log and continue
      _logError(logger, '[PlatformAdapter] Failed to show notification', err)
    }
  }

  // ─── setBadgeCount ───────────────────────────────────────────────────────

  /**
   * Sets a numeric badge on the dock icon (macOS) or taskbar overlay (Windows).
   * Passing `count === 0` clears the badge on both platforms (Req 6.4, 6.5).
   *
   * @param {number} count - Non-negative integer.
   */
  function setBadgeCount(count) {
    if (process.platform === 'darwin') {
      _setBadgeMacOS(app, count, logger)
    } else if (process.platform === 'win32') {
      _setBadgeWindows(BrowserWindow, count, logger)
    }
    // Linux: no native badge API — silently no-op.
  }

  // ─── requestAttention ────────────────────────────────────────────────────

  /**
   * Requests the user's attention by flashing the taskbar entry (Windows) or
   * bouncing the dock icon (macOS) (Req 6.2, 6.3).
   */
  function requestAttention() {
    if (process.platform === 'win32') {
      _flashFrameWindows(BrowserWindow, logger)
    } else if (process.platform === 'darwin') {
      _bounceDockMacOS(app, logger)
    }
    // Linux: no direct equivalent — silently no-op.
  }

  // ─── registerProtocol ────────────────────────────────────────────────────

  /**
   * Registers the given URL scheme as the default protocol client for the app
   * (Req 6.11).
   *
   * @param {string} scheme - e.g. `'tatakai'`
   */
  function registerProtocol(scheme) {
    try {
      app.setAsDefaultProtocolClient(scheme)
    } catch (err) {
      _logError(logger, `[PlatformAdapter] Failed to register protocol "${scheme}"`, err)
    }
  }

  // ─── ensureDesktopEntry ──────────────────────────────────────────────────

  /**
   * Writes `~/.local/share/applications/tatakai.desktop` on Linux if it does
   * not already exist (Req 6.8).  No-op on Windows and macOS (Req 6.9).
   */
  function ensureDesktopEntry() {
    if (process.platform !== 'linux') return

    const desktopDir = path.join(os.homedir(), '.local', 'share', 'applications')
    const desktopFile = path.join(desktopDir, 'tatakai.desktop')

    if (fs.existsSync(desktopFile)) return

    const execPath = app.getPath ? app.getPath('exe') : process.execPath
    const iconPath = path.join(path.dirname(execPath), 'resources', 'icon.png')

    const content = [
      '[Desktop Entry]',
      'Name=Tatakai',
      'Comment=Tatakai Desktop',
      `Exec=${execPath} %U`,
      `Icon=${iconPath}`,
      'Terminal=false',
      'Type=Application',
      'Categories=Game;',
      'MimeType=x-scheme-handler/tatakai;',
      'StartupNotify=true',
    ].join('\n') + '\n'

    try {
      fs.mkdirSync(desktopDir, { recursive: true })
      fs.writeFileSync(desktopFile, content, 'utf8')
    } catch (err) {
      _logError(logger, '[PlatformAdapter] Failed to write .desktop file', err)
    }
  }

  // ─── Return public interface ──────────────────────────────────────────────

  return {
    notify,
    setBadgeCount,
    requestAttention,
    registerProtocol,
    ensureDesktopEntry,
  }
}

// ─── Platform-specific helpers ────────────────────────────────────────────────

/**
 * Sets (or clears) the macOS dock badge (Req 6.4, 6.5).
 *
 * @param {Electron.App} app
 * @param {number}       count
 * @param {import('./_types.cjs').LogService} logger
 */
function _setBadgeMacOS(app, count, logger) {
  try {
    if (app.dock && typeof app.dock.setBadge === 'function') {
      app.dock.setBadge(count > 0 ? String(count) : '')
    }
  } catch (err) {
    _logError(logger, '[PlatformAdapter] Failed to set macOS dock badge', err)
  }
}

/**
 * Sets (or clears) the Windows taskbar overlay icon (Req 6.5).
 * Uses the focused or first available BrowserWindow.
 *
 * @param {typeof import('electron').BrowserWindow} BrowserWindow
 * @param {number} count
 * @param {import('./_types.cjs').LogService} logger
 */
function _setBadgeWindows(BrowserWindow, count, logger) {
  try {
    const win = _getMainWindow(BrowserWindow)
    if (!win || typeof win.setOverlayIcon !== 'function') return

    if (count === 0) {
      // Clear the overlay (Req 6.5)
      win.setOverlayIcon(null, '')
      return
    }

    // Render a simple badge onto a NativeImage
    let nativeImage
    try {
      nativeImage = require('electron').nativeImage
    } catch (_) {
      return
    }

    const badge = _createBadgeImage(nativeImage, count)
    win.setOverlayIcon(badge, String(count))
  } catch (err) {
    _logError(logger, '[PlatformAdapter] Failed to set Windows overlay badge', err)
  }
}

/**
 * Flashes the taskbar button for the focused or first available window (Req 6.2).
 *
 * @param {typeof import('electron').BrowserWindow} BrowserWindow
 * @param {import('./_types.cjs').LogService} logger
 */
function _flashFrameWindows(BrowserWindow, logger) {
  try {
    const win = _getMainWindow(BrowserWindow)
    if (win && typeof win.flashFrame === 'function') {
      win.flashFrame(true)
    }
  } catch (err) {
    _logError(logger, '[PlatformAdapter] Failed to flash taskbar frame', err)
  }
}

/**
 * Bounces the macOS dock icon with an informational bounce (Req 6.3).
 *
 * @param {Electron.App} app
 * @param {import('./_types.cjs').LogService} logger
 */
function _bounceDockMacOS(app, logger) {
  try {
    if (app.dock && typeof app.dock.bounce === 'function') {
      app.dock.bounce('informational')
    }
  } catch (err) {
    _logError(logger, '[PlatformAdapter] Failed to bounce macOS dock', err)
  }
}

/**
 * Returns the focused BrowserWindow, falling back to the first available one.
 *
 * @param {typeof import('electron').BrowserWindow} BrowserWindow
 * @returns {import('electron').BrowserWindow | null}
 */
function _getMainWindow(BrowserWindow) {
  if (!BrowserWindow) return null
  const focused = BrowserWindow.getFocusedWindow()
  if (focused && !focused.isDestroyed()) return focused
  const all = BrowserWindow.getAllWindows()
  return all.find((w) => !w.isDestroyed()) || null
}

/**
 * Creates a small circular badge NativeImage with the count number inside.
 * Falls back to a plain solid-colour circle if canvas is unavailable.
 *
 * @param {typeof import('electron').nativeImage} nativeImage
 * @param {number} count
 * @returns {import('electron').NativeImage}
 */
function _createBadgeImage(nativeImage, count) {
  const SIZE = 16
  // Build a minimal 16×16 PNG badge using raw pixel data via a data URI
  // We encode a simple SVG as a data URL that Electron can render via nativeImage.
  const label = count > 99 ? '99+' : String(count)
  // Create a simple solid red circle badge via nativeImage.createFromDataURL
  // using a base64-encoded SVG circle with the count overlaid.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}">` +
    `<circle cx="8" cy="8" r="8" fill="#e53e3e"/>` +
    `<text x="8" y="11.5" text-anchor="middle" font-size="${label.length > 1 ? '6' : '8'}" ` +
    `font-family="sans-serif" fill="white" font-weight="bold">${label}</text>` +
    `</svg>`

  const dataUrl = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64')
  try {
    return nativeImage.createFromDataURL(dataUrl)
  } catch (_) {
    // If SVG data URL fails, return an empty image (overlay will still clear correctly)
    return nativeImage.createEmpty()
  }
}

// ─── Logging helpers ──────────────────────────────────────────────────────────

/**
 * Logs a warning via LogService if available, otherwise falls back to console.warn.
 *
 * @param {import('./_types.cjs').LogService|null|undefined} logger
 * @param {string} msg
 * @param {Error} [err]
 */
function _logWarn(logger, msg, err) {
  const ctx = err ? { message: err.message, code: err.code } : undefined
  if (logger && typeof logger.warn === 'function') {
    logger.warn(msg, ctx)
  } else {
    console.warn(msg, ctx || '')
  }
}

/**
 * Logs an error via LogService if available, otherwise falls back to console.error.
 *
 * @param {import('./_types.cjs').LogService|null|undefined} logger
 * @param {string} msg
 * @param {Error} [err]
 */
function _logError(logger, msg, err) {
  const ctx = err ? { message: err.message, code: err.code } : undefined
  if (logger && typeof logger.error === 'function') {
    logger.error(msg, ctx)
  } else {
    console.error(msg, ctx || '')
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { createPlatformAdapter }

/**
 * @typedef {object} PlatformAdapter
 * @property {function({title: string, body: string, urgency?: 'low'|'normal'|'critical'}): void} notify
 * @property {function(number): void} setBadgeCount
 * @property {function(): void} requestAttention
 * @property {function(string): void} registerProtocol
 * @property {function(): void} ensureDesktopEntry
 */
