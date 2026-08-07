'use strict'

/**
 * Property-based tests for PerfMonitor.
 *
 * Property 7: PerfMonitor History Bound
 * Validates: Requirements 4.4
 *
 * After N push operations where N > MAX_HISTORY_ENTRIES (120),
 * the ring buffer must never exceed MAX_HISTORY_ENTRIES entries.
 */

const { describe, it, expect, beforeEach, afterEach } = require('bun:test')
const fc = require('fast-check')
const { createPerfMonitor } = require('../../desktop/services/perf-monitor.cjs')

const MAX_HISTORY_ENTRIES = 120

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Minimal stub snapshot matching PerfSnapshot shape */
function makeSnap(i) {
  return {
    timestamp:   Date.now() + i,
    heapUsedMB:  50,
    heapTotalMB: 100,
    rssMB:       80,
    externalMB:  5,
    cpuUser:     0,
    cpuSystem:   0,
  }
}

/**
 * Patches process.memoryUsage and process.cpuUsage so that _tick() can be
 * called synchronously-ish without touching real system metrics.
 * Returns a restore function.
 */
function patchProcessMetrics() {
  const origMemory = process.memoryUsage
  const origCpu    = process.cpuUsage

  process.memoryUsage = () => ({
    rss:          80 * 1024 * 1024,
    heapTotal:   100 * 1024 * 1024,
    heapUsed:     50 * 1024 * 1024,
    external:      5 * 1024 * 1024,
    arrayBuffers:  0,
  })
  process.cpuUsage = (prev) => {
    if (prev) return { user: 0, system: 0 }
    return { user: 1000, system: 500 }
  }

  return () => {
    process.memoryUsage = origMemory
    process.cpuUsage    = origCpu
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PerfMonitor – History Bound (Property 7)', () => {
  let restore

  beforeEach(() => {
    restore = patchProcessMetrics()
  })

  afterEach(() => {
    restore()
  })

  /**
   * Property 7: PerfMonitor History Bound
   * Validates: Requirements 4.4
   *
   * For any N in [121, 300], after calling _tick() N times the ring buffer
   * length must equal exactly MAX_HISTORY_ENTRIES (120).
   */
  it('Property 7: history never exceeds MAX_HISTORY_ENTRIES after N > 120 pushes', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 121, max: 300 }),
        async (n) => {
          const mockLogger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, fatal: () => {} }
          // getMainWindow returns null → renderer memory query is skipped entirely
          const perfMonitor = createPerfMonitor({
            logger:         mockLogger,
            getMainWindow:  () => null,
            maxEntries:     MAX_HISTORY_ENTRIES,
          })

          // Drive _tick() n times directly (no real setInterval needed)
          for (let i = 0; i < n; i++) {
            await perfMonitor._tick()
          }

          const history = perfMonitor.getHistory()
          return history.length === MAX_HISTORY_ENTRIES
        },
      ),
      { numRuns: 10 },
    )
  })

  it('Property 7 (via _history): internal ring buffer is also bounded', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 121, max: 300 }),
        async (n) => {
          const perfMonitor = createPerfMonitor({
            logger:        { debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, fatal: () => {} },
            getMainWindow: () => null,
            maxEntries:    MAX_HISTORY_ENTRIES,
          })

          for (let i = 0; i < n; i++) {
            await perfMonitor._tick()
          }

          // Both the public API and the internal array must be bounded
          const publicHistory   = perfMonitor.getHistory()
          const internalHistory = perfMonitor._history

          return (
            publicHistory.length   === MAX_HISTORY_ENTRIES &&
            internalHistory.length === MAX_HISTORY_ENTRIES
          )
        },
      ),
      { numRuns: 10 },
    )
  })

  it('history length grows monotonically up to MAX then stays at MAX', async () => {
    const perfMonitor = createPerfMonitor({
      logger:        { debug: () => {}, info: () => {}, warn: () => {}, error: () => {}, fatal: () => {} },
      getMainWindow: () => null,
      maxEntries:    MAX_HISTORY_ENTRIES,
    })

    const limit = MAX_HISTORY_ENTRIES + 50

    for (let i = 0; i < limit; i++) {
      await perfMonitor._tick()
      const len = perfMonitor.getHistory().length
      const expected = Math.min(i + 1, MAX_HISTORY_ENTRIES)
      expect(len).toBe(expected)
    }
  })
})
