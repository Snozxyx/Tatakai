'use strict'

/**
 * @file perf-monitor.cjs
 * Periodic sampling of main-process memory, CPU, and renderer memory with a
 * bounded ring-buffer history for the Electron main process.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 8.2, 8.6
 *
 * Usage:
 *   const { createPerfMonitor } = require('./services/perf-monitor.cjs')
 *   const perfMonitor = createPerfMonitor({ logger, getMainWindow, ipcMain })
 *   perfMonitor.start()          // begins 30-second sampling loop
 *   perfMonitor.getSnapshot()    // most recent PerfSnapshot
 *   perfMonitor.getHistory(10)   // last 10 snapshots
 *   perfMonitor.stop()           // cancels the interval
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/** Default sampling interval in milliseconds (Req 4.1). */
const DEFAULT_INTERVAL_MS = 30_000

/** Default maximum number of snapshots to retain in the ring buffer (Req 4.4). */
const DEFAULT_MAX_ENTRIES = 120

/** Timeout in milliseconds for getProcessMemoryInfo() (Req 4.2). */
const RENDERER_INFO_TIMEOUT_MS = 2_000

/** Heap usage threshold in MB above which a WARN log is emitted (Req 4.5). */
const HEAP_WARN_MB = 512

/** RSS threshold in MB above which a WARN log is emitted (Req 4.6). */
const RSS_WARN_MB = 1024

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Wraps a Promise in a 2-second timeout via Promise.race.
 * Resolves with `null` if the inner promise does not settle within the timeout.
 *
 * @template T
 * @param {Promise<T>} promise
 * @param {number} [timeoutMs]
 * @returns {Promise<T | null>}
 */
function withTimeout(promise, timeoutMs = RENDERER_INFO_TIMEOUT_MS) {
  const timeout = new Promise((resolve) => {
    setTimeout(() => resolve(null), timeoutMs)
  })
  return Promise.race([promise, timeout])
}

// ─── Factory ─────────────────────────────────────────────────────────────────

/**
 * Creates a new PerfMonitor instance.
 *
 * @param {object}                    opts
 * @param {import('./_types.cjs').LogService} [opts.logger]         - Structured logger (optional; console fallback if absent).
 * @param {() => Electron.BrowserWindow | null} [opts.getMainWindow] - Getter for the main BrowserWindow (Req 4.2).
 * @param {number}                    [opts.maxEntries=120]          - Ring-buffer capacity (Req 4.4).
 * @param {Electron.IpcMain}          [opts.ipcMain]                 - Electron ipcMain for registering IPC handler (Req 4.10, 8.2).
 * @returns {PerfMonitor}
 */
function createPerfMonitor({ logger = null, getMainWindow = null, maxEntries = DEFAULT_MAX_ENTRIES, ipcMain = null } = {}) {
  // ── State ──────────────────────────────────────────────────────────────────

  /** @type {import('./_types.cjs').PerfSnapshot[]} */
  const history = []

  /** @type {ReturnType<typeof setInterval> | null} */
  let timer = null

  /** Baseline CPU usage from the previous sampling tick. */
  let lastCpu = process.cpuUsage()

  // ── Internal log helper ───────────────────────────────────────────────────

  /**
   * Emits a warn-level message via LogService (if available) or console.warn.
   * @param {string} msg
   * @param {Record<string, unknown>=} ctx
   */
  function _warn(msg, ctx) {
    if (logger) {
      try { logger.warn(msg, ctx) } catch (_) {}
    } else {
      console.warn(msg, ctx)
    }
  }

  // ── Sampling tick ─────────────────────────────────────────────────────────

  /**
   * Executes one sampling iteration: collects main-process and renderer metrics,
   * builds a PerfSnapshot, and appends it to the ring buffer.
   *
   * Async because renderer memory query is async (Req 4.2).
   *
   * @returns {Promise<void>}
   */
  async function _tick() {
    // ── Main-process memory (Req 4.1) ────────────────────────────────────
    const mem = process.memoryUsage()

    // ── CPU delta since last sample (Req 4.1) ────────────────────────────
    const cpu = process.cpuUsage(lastCpu)
    // Update baseline for the next tick
    lastCpu = process.cpuUsage()

    // ── Renderer memory with 2 s timeout (Req 4.2) ───────────────────────
    let rendererHeapMB
    let rendererRssMB
    try {
      const win = getMainWindow ? getMainWindow() : null
      if (win && !win.isDestroyed()) {
        const info = await withTimeout(win.webContents.getProcessMemoryInfo(), RENDERER_INFO_TIMEOUT_MS)
        if (info !== null) {
          rendererHeapMB = info.privateBytes / 1024 / 1024
          // workingSetSize is available on all platforms; use it as the renderer RSS proxy
          rendererRssMB = info.workingSetSize / 1024 / 1024
        }
      }
    } catch (err) {
      // Renderer query failures are non-fatal — log and continue (Req 4.2 guards with null check)
      _warn('[PerfMonitor] Renderer memory query failed', { err: String(err) })
    }

    // ── Build PerfSnapshot (design data model) ────────────────────────────

    /** @type {import('./_types.cjs').PerfSnapshot} */
    const snap = {
      timestamp:    Date.now(),
      heapUsedMB:   mem.heapUsed  / 1024 / 1024,
      heapTotalMB:  mem.heapTotal / 1024 / 1024,
      rssMB:        mem.rss       / 1024 / 1024,
      externalMB:   mem.external  / 1024 / 1024,
      cpuUser:      cpu.user,
      cpuSystem:    cpu.system,
    }

    if (rendererHeapMB !== undefined) snap.rendererHeapMB = rendererHeapMB
    if (rendererRssMB  !== undefined) snap.rendererRssMB  = rendererRssMB

    // ── Ring buffer (Req 4.3, 4.4) ────────────────────────────────────────
    // Loop invariant: history.length <= maxEntries after each push
    history.push(snap)
    if (history.length > maxEntries) {
      history.shift()
    }

    // ── Threshold warnings (Req 4.5, 4.6) ────────────────────────────────
    if (snap.heapUsedMB > HEAP_WARN_MB) {
      _warn('[PerfMonitor] High heap usage detected', { heapUsedMB: snap.heapUsedMB })
    }
    if (snap.rssMB > RSS_WARN_MB) {
      _warn('[PerfMonitor] High RSS usage detected', { rssMB: snap.rssMB })
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Begins the periodic sampling loop.  Guards against double-start: if the
   * monitor is already running, subsequent calls are silently ignored (Req 4.1).
   *
   * @param {number} [intervalMs=30_000] - Sampling interval in milliseconds.
   */
  function start(intervalMs = DEFAULT_INTERVAL_MS) {
    // Precondition guard: do not start a second timer (Req 4.1)
    if (timer !== null) return

    // Reset CPU baseline to the moment sampling begins to avoid inflated first delta
    lastCpu = process.cpuUsage()

    timer = setInterval(() => {
      _tick().catch((err) => {
        _warn('[PerfMonitor] Tick error', { err: String(err) })
      })
    }, intervalMs)

    // Allow the Node.js event loop to exit even if the interval is active
    if (timer && typeof timer.unref === 'function') {
      timer.unref()
    }
  }

  /**
   * Cancels the sampling interval and stops collecting new snapshots (Req 4.7).
   */
  function stop() {
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }

  /**
   * Returns the most recently collected PerfSnapshot, or `undefined` if the
   * buffer is empty (Req 4.8).
   *
   * @returns {import('./_types.cjs').PerfSnapshot | undefined}
   */
  function getSnapshot() {
    return history[history.length - 1]
  }

  /**
   * Returns up to the last `lastN` snapshots from the ring buffer in
   * chronological order (oldest first).  When `lastN` is omitted or zero,
   * returns a shallow copy of the entire history (Req 4.9).
   *
   * @param {number} [lastN]
   * @returns {import('./_types.cjs').PerfSnapshot[]}
   */
  function getHistory(lastN) {
    if (lastN) return history.slice(-lastN)
    return [...history]
  }

  // ── IPC handler (Req 4.10, 8.2, 8.6) ────────────────────────────────────

  if (ipcMain) {
    ipcMain.handle('perf:get-history', (_event, lastN) => {
      try {
        return getHistory(lastN)
      } catch (err) {
        _warn('[PerfMonitor] IPC perf:get-history error', { err: String(err) })
        return { error: err && err.message ? err.message : String(err) }
      }
    })
  }

  // ── Return public interface ───────────────────────────────────────────────

  return {
    start,
    stop,
    getSnapshot,
    getHistory,
    /** @internal — exposed for testing only */
    _tick,
    _history: history,
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = { createPerfMonitor }
