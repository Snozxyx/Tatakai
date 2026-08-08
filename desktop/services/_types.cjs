'use strict'

/**
 * @file _types.cjs
 * Shared JSDoc typedef stubs for all desktop production-readiness services.
 * Import these types in downstream services using:
 *   @typedef {import('./_types.cjs').LogService} LogService
 */

// ─── LogService ──────────────────────────────────────────────────────────────

/**
 * Structured, rotating logger running in the Electron main process.
 *
 * @typedef {object} LogService
 * @property {function(string, Record<string, unknown>=): void} debug
 * @property {function(string, Record<string, unknown>=): void} info
 * @property {function(string, Record<string, unknown>=): void} warn
 * @property {function(string, Record<string, unknown>=): void} error
 * @property {function(string, Record<string, unknown>=): void} fatal
 * @property {function(): string} getLogPath - Returns absolute path to current log file.
 * @property {function(number=): string[]} tail - Returns last N lines across rotated files (oldest first).
 * @property {function(): Promise<void>} close - Flushes pending writes and closes the stream.
 */

// ─── PerfSnapshot ────────────────────────────────────────────────────────────

/**
 * One sampling interval's memory and CPU metrics captured by PerfMonitor.
 *
 * @typedef {object} PerfSnapshot
 * @property {number} timestamp      - Unix epoch ms (Date.now()).
 * @property {number} heapUsedMB
 * @property {number} heapTotalMB
 * @property {number} rssMB
 * @property {number} externalMB
 * @property {number} cpuUser        - Microseconds of user CPU since last sample.
 * @property {number} cpuSystem      - Microseconds of system CPU since last sample.
 * @property {number} [rendererHeapMB]
 * @property {number} [rendererRssMB]
 */

// ─── VersionRecord ───────────────────────────────────────────────────────────

/**
 * A single append-only entry in `userData/updates/version-history.json`.
 *
 * @typedef {object} VersionRecord
 * @property {string} version          - The installed semver string, e.g. "5.3.0".
 * @property {UpdateChannel} channel
 * @property {string} installedAt      - ISO 8601 timestamp.
 * @property {'fresh-install'|'update'|'rollback'} source
 * @property {string} [previousVersion]
 */

// ─── UpdatePolicy ────────────────────────────────────────────────────────────

/**
 * An admin-controlled update directive fetched from the Supabase `update_policies` table.
 *
 * @typedef {object} UpdatePolicy
 * @property {UpdateType} type
 * @property {string} targetVersion              - semver string, e.g. "5.3.0".
 * @property {UpdateChannel} channel
 * @property {string} publishedAt               - ISO 8601 timestamp.
 * @property {string} [rollbackFromVersion]      - Populated when type === 'rollback'.
 * @property {string} [notes]                    - Admin-facing notes.
 */

// ─── UpdateChannel ───────────────────────────────────────────────────────────

/**
 * The release channel a device is subscribed to.
 *
 * @typedef {'stable'|'beta'|'experimental'} UpdateChannel
 */

// ─── UpdateType ──────────────────────────────────────────────────────────────

/**
 * The enforcement type of an active update policy.
 *
 * @typedef {'mandatory'|'recommended'|'experimental'|'rollback'} UpdateType
 */

// ─── CrashReport ─────────────────────────────────────────────────────────────

/**
 * A crash dump record from a previous session, surfaced by CrashService on restart.
 *
 * @typedef {object} CrashReport
 * @property {string} id    - Unique identifier of the crash dump.
 * @property {Date}   date  - Date/time of the crash.
 * @property {string} path  - Absolute path to the local minidump file.
 */

module.exports = {}
