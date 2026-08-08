'use strict';

/**
 * Timeout guards for extension invocations.
 *
 * Enforces two independent timeout policies:
 *  1. Per-call timeout  — 30 seconds per individual invocation.
 *  2. Cumulative timeout — 2 minutes of total execution time per session.
 *
 * Validates: Requirements 9.3, 9.4
 * Property 13: Extension timeout enforcement
 */

/** Maximum wall-clock time (ms) allowed for a single extension invocation. */
const CALL_TIMEOUT_MS = 30_000; // 30 seconds

/** Maximum cumulative execution time (ms) allowed per extension session. */
const CUMULATIVE_TIMEOUT_MS = 120_000; // 2 minutes

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Wraps a promise with a per-call timeout.
 *
 * If the promise does not resolve or reject within `timeoutMs` (defaults to
 * CALL_TIMEOUT_MS), the returned promise is rejected with an Error whose
 * message matches: `TimeoutError: Extension invocation timed out after 30s (<extensionId>)`.
 *
 * @param {Promise<any>} promise     - The promise to race against the timeout.
 * @param {string}       extensionId - The extension ID (used in the error message).
 * @param {number}       [timeoutMs=CALL_TIMEOUT_MS] - Override timeout in ms.
 * @returns {Promise<any>} Resolves with the original promise's value, or rejects
 *   with a timeout Error if the timeout fires first.
 */
function withCallTimeout(promise, extensionId, timeoutMs = CALL_TIMEOUT_MS) {
  let timeoutHandle;

  const timeoutPromise = new Promise((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      const seconds = timeoutMs / 1000;
      reject(
        new Error(
          `TimeoutError: Extension invocation timed out after ${seconds}s (${extensionId})`
        )
      );
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutHandle);
  });
}

/**
 * Checks whether an extension's cumulative execution time has exceeded the limit.
 *
 * If `entry.cumulativeMs >= CUMULATIVE_TIMEOUT_MS`, sets `entry.suspendedAt`
 * to `Date.now()` and throws an Error whose message starts with
 * `CumulativeTimeoutError: ...`.
 *
 * This function is a no-op (returns without throwing) when the cumulative time
 * is still within the allowed budget.
 *
 * @param {object}      entry         - A mutable registry entry object.
 * @param {number}      entry.cumulativeMs  - Total ms of execution so far.
 * @param {number|null} entry.suspendedAt   - Timestamp when suspended, or null.
 * @param {string}      extensionId   - The extension ID (used in the error message).
 * @throws {Error} When the cumulative limit is exceeded (message starts with "CumulativeTimeoutError:").
 */
function checkCumulativeTimeout(entry, extensionId) {
  if (entry.cumulativeMs >= CUMULATIVE_TIMEOUT_MS) {
    entry.suspendedAt = Date.now();
    throw new Error(
      `CumulativeTimeoutError: Extension "${extensionId}" exceeded cumulative execution limit of ${CUMULATIVE_TIMEOUT_MS / 1000}s and has been suspended`
    );
  }
}

/**
 * Records the elapsed time of a completed invocation into the registry entry.
 *
 * Adds `elapsedMs` to `entry.cumulativeMs`. Call this after every invocation
 * so the cumulative counter stays accurate.
 *
 * @param {object} entry           - A mutable registry entry object.
 * @param {number} entry.cumulativeMs - Total ms of execution so far (mutated in place).
 * @param {number} elapsedMs       - The number of milliseconds the last invocation took.
 */
function recordInvocationTime(entry, elapsedMs) {
  entry.cumulativeMs += elapsedMs;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

module.exports = {
  CALL_TIMEOUT_MS,
  CUMULATIVE_TIMEOUT_MS,
  withCallTimeout,
  checkCumulativeTimeout,
  recordInvocationTime,
};
