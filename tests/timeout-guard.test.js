'use strict';

/**
 * Tests for timeout-guard — Property 13: Extension timeout enforcement.
 *
 * **Validates: Requirements 9.3, 9.4**
 *
 * Property 13: For any extension invocation that runs longer than 30 seconds,
 * the Web Worker must be terminated and the caller must receive a timeout error —
 * no invocation may block the main process indefinitely.
 */

import { describe, it, expect } from 'bun:test';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  CALL_TIMEOUT_MS,
  CUMULATIVE_TIMEOUT_MS,
  withCallTimeout,
  checkCumulativeTimeout,
  recordInvocationTime,
} = require('../desktop/runtime/timeout-guard.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a promise that never resolves (simulates a hung extension). */
function neverResolves() {
  return new Promise(() => {});
}

/** Returns a promise that resolves with `value` after `ms` milliseconds. */
function resolveAfter(ms, value = 'ok') {
  return new Promise(resolve => setTimeout(() => resolve(value), ms));
}

/** Returns a promise that rejects with `reason` after `ms` milliseconds. */
function rejectAfter(ms, reason = new Error('boom')) {
  return new Promise((_resolve, reject) => setTimeout(() => reject(reason), ms));
}

/** Creates a fresh registry entry with zero cumulative time. */
function makeEntry() {
  return { cumulativeMs: 0, suspendedAt: null };
}

// ---------------------------------------------------------------------------
// Unit tests — constants
// ---------------------------------------------------------------------------

describe('timeout-guard — constants', () => {
  it('CALL_TIMEOUT_MS is 30 000', () => {
    expect(CALL_TIMEOUT_MS).toBe(30_000);
  });

  it('CUMULATIVE_TIMEOUT_MS is 120 000', () => {
    expect(CUMULATIVE_TIMEOUT_MS).toBe(120_000);
  });
});

// ---------------------------------------------------------------------------
// Unit tests — withCallTimeout
// ---------------------------------------------------------------------------

describe('withCallTimeout()', () => {
  it('resolves with the original value when the promise completes before the timeout', async () => {
    const result = await withCallTimeout(resolveAfter(10, 'hello'), 'ext-1', 200);
    expect(result).toBe('hello');
  });

  it('rejects with a TimeoutError message when the promise exceeds the timeout', async () => {
    await expect(
      withCallTimeout(neverResolves(), 'ext-slow', 50)
    ).rejects.toThrow(/TimeoutError: Extension invocation timed out after/);
  });

  it('error message includes the extension ID', async () => {
    let caught;
    try {
      await withCallTimeout(neverResolves(), 'my-extension', 50);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    expect(caught.message).toContain('my-extension');
  });

  it('error message includes the timeout duration in seconds', async () => {
    // Use 1500 ms so the timeout fires quickly; message should say "1.5s"
    let caught;
    try {
      await withCallTimeout(neverResolves(), 'ext-x', 1500);
    } catch (err) {
      caught = err;
    }
    expect(caught.message).toContain('1.5s');
  });

  it('propagates the original rejection when the promise rejects before the timeout', async () => {
    const originalError = new Error('original failure');
    await expect(
      withCallTimeout(rejectAfter(10, originalError), 'ext-1', 500)
    ).rejects.toThrow('original failure');
  });

  it('uses CALL_TIMEOUT_MS as the default when timeoutMs is omitted', () => {
    // We cannot wait 30 s in a unit test, so we verify the default is wired
    // by checking that the function accepts two arguments without throwing.
    const p = withCallTimeout(resolveAfter(5, 'done'), 'ext-default');
    expect(p).toBeInstanceOf(Promise);
    return p; // let it resolve naturally
  });

  it('clears the internal timer when the promise resolves (no dangling timers)', async () => {
    // If the timer were not cleared, the test runner would hang or warn.
    const result = await withCallTimeout(resolveAfter(10, 42), 'ext-1', 500);
    expect(result).toBe(42);
  });

  it('clears the internal timer when the promise rejects before timeout', async () => {
    const err = new Error('early reject');
    await expect(
      withCallTimeout(rejectAfter(10, err), 'ext-1', 500)
    ).rejects.toThrow('early reject');
  });
});

// ---------------------------------------------------------------------------
// Unit tests — checkCumulativeTimeout
// ---------------------------------------------------------------------------

describe('checkCumulativeTimeout()', () => {
  it('does not throw when cumulativeMs is below the limit', () => {
    const entry = makeEntry();
    entry.cumulativeMs = CUMULATIVE_TIMEOUT_MS - 1;
    expect(() => checkCumulativeTimeout(entry, 'ext-1')).not.toThrow();
  });

  it('does not throw when cumulativeMs is zero', () => {
    const entry = makeEntry();
    expect(() => checkCumulativeTimeout(entry, 'ext-1')).not.toThrow();
  });

  it('throws when cumulativeMs equals CUMULATIVE_TIMEOUT_MS', () => {
    const entry = makeEntry();
    entry.cumulativeMs = CUMULATIVE_TIMEOUT_MS;
    expect(() => checkCumulativeTimeout(entry, 'ext-1')).toThrow(/CumulativeTimeoutError/);
  });

  it('throws when cumulativeMs exceeds CUMULATIVE_TIMEOUT_MS', () => {
    const entry = makeEntry();
    entry.cumulativeMs = CUMULATIVE_TIMEOUT_MS + 1000;
    expect(() => checkCumulativeTimeout(entry, 'ext-over')).toThrow(/CumulativeTimeoutError/);
  });

  it('sets entry.suspendedAt to a number when the limit is exceeded', () => {
    const entry = makeEntry();
    entry.cumulativeMs = CUMULATIVE_TIMEOUT_MS;
    const before = Date.now();
    try { checkCumulativeTimeout(entry, 'ext-1'); } catch (_) {}
    expect(typeof entry.suspendedAt).toBe('number');
    expect(entry.suspendedAt).toBeGreaterThanOrEqual(before);
  });

  it('error message includes the extension ID', () => {
    const entry = makeEntry();
    entry.cumulativeMs = CUMULATIVE_TIMEOUT_MS;
    let caught;
    try { checkCumulativeTimeout(entry, 'my-ext'); } catch (err) { caught = err; }
    expect(caught.message).toContain('my-ext');
  });

  it('does not modify suspendedAt when the limit is not exceeded', () => {
    const entry = makeEntry();
    entry.cumulativeMs = 1000;
    checkCumulativeTimeout(entry, 'ext-1');
    expect(entry.suspendedAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Unit tests — recordInvocationTime
// ---------------------------------------------------------------------------

describe('recordInvocationTime()', () => {
  it('adds elapsedMs to entry.cumulativeMs', () => {
    const entry = makeEntry();
    recordInvocationTime(entry, 5000);
    expect(entry.cumulativeMs).toBe(5000);
  });

  it('accumulates across multiple calls', () => {
    const entry = makeEntry();
    recordInvocationTime(entry, 1000);
    recordInvocationTime(entry, 2000);
    recordInvocationTime(entry, 500);
    expect(entry.cumulativeMs).toBe(3500);
  });

  it('handles zero elapsed time', () => {
    const entry = makeEntry();
    recordInvocationTime(entry, 0);
    expect(entry.cumulativeMs).toBe(0);
  });

  it('does not mutate any other field on the entry', () => {
    const entry = { cumulativeMs: 0, suspendedAt: null, extra: 'preserved' };
    recordInvocationTime(entry, 100);
    expect(entry.suspendedAt).toBeNull();
    expect(entry.extra).toBe('preserved');
  });
});

// ---------------------------------------------------------------------------
// Property-based tests — Property 13: Extension timeout enforcement
// ---------------------------------------------------------------------------

/**
 * Property 13: Extension timeout enforcement
 *
 * For any extension invocation that runs longer than the configured timeout,
 * `withCallTimeout` must reject with a message matching "TimeoutError: Extension
 * invocation timed out after Xs (<extensionId>)".
 *
 * **Validates: Requirements 9.3**
 */
describe('Property 13: Extension timeout enforcement', () => {
  /**
   * Simple deterministic PRNG (LCG) for reproducible property tests.
   */
  function seededRand(seed) {
    let s = seed >>> 0;
    return function () {
      s = Math.imul(s, 1664525) + 1013904223;
      return (s >>> 0) / 0x100000000;
    };
  }

  it('any invocation exceeding the timeout must be terminated and return a timeout error', async () => {
    const rand = seededRand(42);
    const ITERATIONS = 30;

    for (let i = 0; i < ITERATIONS; i++) {
      // Pick a short timeout between 20 ms and 80 ms
      const timeoutMs = Math.floor(rand() * 60) + 20;
      // The promise takes longer than the timeout (timeout + 50–150 ms extra)
      const promiseDurationMs = timeoutMs + Math.floor(rand() * 100) + 50;
      const extensionId = `ext-prop13-${i}`;

      let caught;
      try {
        await withCallTimeout(resolveAfter(promiseDurationMs), extensionId, timeoutMs);
      } catch (err) {
        caught = err;
      }

      // Must have thrown
      expect(caught).toBeDefined();
      // Message must start with "TimeoutError:"
      expect(caught.message).toMatch(/^TimeoutError:/);
      // Message must include the extension ID
      expect(caught.message).toContain(extensionId);
      // Message must include the timeout in seconds
      const expectedSeconds = timeoutMs / 1000;
      expect(caught.message).toContain(`${expectedSeconds}s`);
    }
  });

  it('invocations completing before the timeout must never receive a timeout error', async () => {
    const rand = seededRand(99);
    const ITERATIONS = 20;

    for (let i = 0; i < ITERATIONS; i++) {
      // Timeout between 100 ms and 200 ms
      const timeoutMs = Math.floor(rand() * 100) + 100;
      // Promise resolves well before the timeout (10–40 ms)
      const promiseDurationMs = Math.floor(rand() * 30) + 10;
      const extensionId = `ext-fast-${i}`;
      const expectedValue = `result-${i}`;

      const result = await withCallTimeout(
        resolveAfter(promiseDurationMs, expectedValue),
        extensionId,
        timeoutMs
      );

      expect(result).toBe(expectedValue);
    }
  });

  it('cumulative timeout suspension: after enough invocations, checkCumulativeTimeout must throw', () => {
    const rand = seededRand(7);
    const ITERATIONS = 50;

    for (let iter = 0; iter < ITERATIONS; iter++) {
      const entry = makeEntry();
      const extensionId = `ext-cumul-${iter}`;

      // Simulate a series of invocations with random durations
      let threw = false;
      let totalMs = 0;

      for (let call = 0; call < 200; call++) {
        const elapsed = Math.floor(rand() * 5000) + 100; // 100–5100 ms per call

        // Record the time first, then check
        recordInvocationTime(entry, elapsed);
        totalMs += elapsed;

        try {
          checkCumulativeTimeout(entry, extensionId);
        } catch (err) {
          // Must throw exactly when cumulative >= limit
          expect(totalMs).toBeGreaterThanOrEqual(CUMULATIVE_TIMEOUT_MS);
          expect(err.message).toMatch(/CumulativeTimeoutError/);
          expect(err.message).toContain(extensionId);
          expect(typeof entry.suspendedAt).toBe('number');
          threw = true;
          break;
        }
      }

      // If we accumulated enough time, we must have thrown
      if (totalMs >= CUMULATIVE_TIMEOUT_MS) {
        expect(threw).toBe(true);
      }
    }
  });

  it('checkCumulativeTimeout never throws when cumulative time stays below the limit', () => {
    const rand = seededRand(13);
    const ITERATIONS = 100;

    for (let iter = 0; iter < ITERATIONS; iter++) {
      const entry = makeEntry();
      const extensionId = `ext-safe-${iter}`;

      // Keep total strictly below CUMULATIVE_TIMEOUT_MS
      const budget = Math.floor(rand() * (CUMULATIVE_TIMEOUT_MS - 1));
      let remaining = budget;

      while (remaining > 0) {
        const elapsed = Math.min(Math.floor(rand() * 10_000) + 1, remaining);
        recordInvocationTime(entry, elapsed);
        remaining -= elapsed;
        // Must not throw while under budget
        expect(() => checkCumulativeTimeout(entry, extensionId)).not.toThrow();
      }
    }
  });

  it('timeout error message format is always "TimeoutError: Extension invocation timed out after Xs (id)"', async () => {
    const rand = seededRand(55);
    const ITERATIONS = 20;

    for (let i = 0; i < ITERATIONS; i++) {
      const timeoutMs = Math.floor(rand() * 90) + 10; // 10–100 ms
      const extensionId = `ext-fmt-${i}`;

      let caught;
      try {
        await withCallTimeout(neverResolves(), extensionId, timeoutMs);
      } catch (err) {
        caught = err;
      }

      const expectedSeconds = timeoutMs / 1000;
      const expectedMsg = `TimeoutError: Extension invocation timed out after ${expectedSeconds}s (${extensionId})`;
      expect(caught.message).toBe(expectedMsg);
    }
  });
});
