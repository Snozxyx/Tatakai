'use strict';

/**
 * Tests for enforcePayloadLimit — Property 14: Extension response payload size limit.
 *
 * **Validates: Requirements 9.6**
 *
 * Property 14: For any extension invocation that produces a response payload
 * larger than 10 MB, the result must have `truncated: true` set and the payload
 * must not exceed 10 MB — no oversized payload may be returned to the renderer.
 * Responses <= 10 MB must have `truncated: false`.
 */

import { describe, it, expect } from 'bun:test';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { MAX_PAYLOAD_BYTES, enforcePayloadLimit } = require('../desktop/runtime/payload-guard.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal ExtensionInvokeResult-shaped object.
 * @param {any[]} items - The result array items.
 * @param {boolean} [success=true]
 * @returns {{ success: boolean, result: any[], error: undefined, truncated: undefined }}
 */
function makeResult(items, success = true) {
  return { success, result: items };
}

/**
 * Build a SourceResult-like item with a payload of approximately `targetBytes` bytes.
 * We pad the `url` field to reach the desired size.
 * @param {number} targetBytes - Approximate byte size of the item when JSON-serialised.
 */
function makePaddedItem(targetBytes) {
  // A base item without padding is ~80 bytes when serialised.
  const base = {
    source: 'test',
    url: '',
    quality: '1080p',
    headers: {},
    subtitles: [],
  };
  const baseSize = Buffer.byteLength(JSON.stringify(base), 'utf8');
  const padding = Math.max(0, targetBytes - baseSize);
  return { ...base, url: 'x'.repeat(padding) };
}

/**
 * Measure the serialised byte size of an object.
 * @param {object} obj
 * @returns {number}
 */
function byteSize(obj) {
  return Buffer.byteLength(JSON.stringify(obj), 'utf8');
}

// ---------------------------------------------------------------------------
// Unit tests — specific examples
// ---------------------------------------------------------------------------

describe('enforcePayloadLimit — unit tests', () => {
  // --- constant ---
  it('MAX_PAYLOAD_BYTES equals 10 MB', () => {
    expect(MAX_PAYLOAD_BYTES).toBe(10 * 1024 * 1024);
  });

  // --- small payloads (under limit) ---
  describe('payloads within the 10 MB limit', () => {
    it('returns truncated: false for an empty result array', () => {
      const input = makeResult([]);
      const output = enforcePayloadLimit(input);
      expect(output.truncated).toBe(false);
      expect(output.result).toEqual([]);
    });

    it('returns truncated: false for a single small item', () => {
      const input = makeResult([makePaddedItem(100)]);
      const output = enforcePayloadLimit(input);
      expect(output.truncated).toBe(false);
      expect(output.result).toHaveLength(1);
    });

    it('returns truncated: false for a result that is exactly at the limit', () => {
      // Build a result whose serialised size is exactly MAX_PAYLOAD_BYTES.
      // We construct the wrapper first, then pad to fill the remaining space.
      const wrapper = { success: true, result: [], truncated: false };
      const wrapperSize = byteSize(wrapper);
      // Each item in the array adds commas and brackets; approximate with one item.
      // We'll just verify that a payload at the limit is not truncated.
      const available = MAX_PAYLOAD_BYTES - wrapperSize - 2; // -2 for array brackets
      const item = makePaddedItem(available);
      const input = makeResult([item]);
      const output = enforcePayloadLimit(input);
      // The output should be within the limit and not truncated.
      expect(byteSize(output)).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES);
      expect(output.truncated).toBe(false);
    });

    it('preserves all fields from the input when not truncated', () => {
      const input = { success: true, result: [makePaddedItem(50)], error: undefined };
      const output = enforcePayloadLimit(input);
      expect(output.success).toBe(true);
      expect(output.truncated).toBe(false);
    });

    it('returns truncated: false for a failed result with no result array', () => {
      const input = { success: false, error: 'Something went wrong' };
      const output = enforcePayloadLimit(input);
      expect(output.truncated).toBe(false);
    });
  });

  // --- large payloads (over limit) ---
  describe('payloads exceeding the 10 MB limit', () => {
    it('sets truncated: true when the payload exceeds 10 MB', () => {
      // Create ~11 MB of items (11 items × ~1 MB each).
      const items = Array.from({ length: 11 }, () => makePaddedItem(1024 * 1024));
      const input = makeResult(items);
      const output = enforcePayloadLimit(input);
      expect(output.truncated).toBe(true);
    });

    it('returns a payload <= 10 MB when the input exceeds 10 MB', () => {
      const items = Array.from({ length: 11 }, () => makePaddedItem(1024 * 1024));
      const input = makeResult(items);
      const output = enforcePayloadLimit(input);
      expect(byteSize(output)).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES);
    });

    it('returns fewer items than the input when truncated', () => {
      const items = Array.from({ length: 11 }, () => makePaddedItem(1024 * 1024));
      const input = makeResult(items);
      const output = enforcePayloadLimit(input);
      expect(output.result.length).toBeLessThan(items.length);
    });

    it('returns a prefix of the original result array (not a random subset)', () => {
      const items = Array.from({ length: 11 }, (_, i) => ({
        ...makePaddedItem(1024 * 1024),
        source: `source-${i}`,
      }));
      const input = makeResult(items);
      const output = enforcePayloadLimit(input);
      // The returned items must be the first N items of the original array.
      for (let i = 0; i < output.result.length; i++) {
        expect(output.result[i].source).toBe(`source-${i}`);
      }
    });

    it('sets truncated: true and result: [] when a single item exceeds 10 MB', () => {
      // One item that is itself > 10 MB.
      const hugeItem = makePaddedItem(MAX_PAYLOAD_BYTES + 1024);
      const input = makeResult([hugeItem]);
      const output = enforcePayloadLimit(input);
      expect(output.truncated).toBe(true);
      expect(output.result).toEqual([]);
    });

    it('preserves success field when truncating', () => {
      const items = Array.from({ length: 11 }, () => makePaddedItem(1024 * 1024));
      const input = makeResult(items, true);
      const output = enforcePayloadLimit(input);
      expect(output.success).toBe(true);
      expect(output.truncated).toBe(true);
    });

    it('handles non-array result field gracefully when over limit', () => {
      // If result is not an array but the total payload is somehow > 10 MB
      // (e.g., a huge error string), the function should still return truncated: true
      // and result: [].
      const bigError = 'e'.repeat(MAX_PAYLOAD_BYTES + 1);
      const input = { success: false, error: bigError };
      const output = enforcePayloadLimit(input);
      expect(output.truncated).toBe(true);
      expect(output.result).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// Property-based tests — Property 14
// ---------------------------------------------------------------------------

/**
 * Property 14: Extension response payload size limit
 *
 * For any extension invocation that produces a response payload larger than
 * 10 MB, the result must have `truncated: true` set and the payload must not
 * exceed 10 MB.  Responses <= 10 MB must have `truncated: false`.
 *
 * **Validates: Requirements 9.6**
 */
describe('enforcePayloadLimit — Property 14: payload size limit', () => {
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

  /**
   * Generate a random array of SourceResult-like items whose total serialised
   * size is approximately `targetTotalBytes`.
   *
   * @param {number} count - Number of items.
   * @param {number} itemBytes - Approximate bytes per item.
   */
  function makeItems(count, itemBytes) {
    return Array.from({ length: count }, () => makePaddedItem(itemBytes));
  }

  // -------------------------------------------------------------------------
  // Core property: responses > 10 MB → truncated: true AND size <= 10 MB
  // -------------------------------------------------------------------------

  it('any response > 10 MB must have truncated: true and size <= 10 MB', () => {
    const rand = seededRand(42);
    const ITERATIONS = 100;

    for (let iter = 0; iter < ITERATIONS; iter++) {
      // Generate a payload that is definitely > 10 MB.
      // Use between 11 and 20 items of ~1 MB each.
      const count = 11 + Math.floor(rand() * 10);
      const itemBytes = Math.floor(rand() * 512 * 1024) + 512 * 1024; // 512 KB – 1 MB
      const items = makeItems(count, itemBytes);
      const input = makeResult(items);

      // Verify the input is actually over the limit before testing.
      if (byteSize(input) <= MAX_PAYLOAD_BYTES) {
        // Skip this iteration if the generated payload happened to be under the limit.
        continue;
      }

      const output = enforcePayloadLimit(input);

      expect(output.truncated).toBe(true);
      expect(byteSize(output)).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES);
    }
  });

  // -------------------------------------------------------------------------
  // Core property: responses <= 10 MB → truncated: false
  // -------------------------------------------------------------------------

  it('any response <= 10 MB must have truncated: false', () => {
    const rand = seededRand(99);
    const ITERATIONS = 100;

    for (let iter = 0; iter < ITERATIONS; iter++) {
      // Generate a payload that is definitely <= 10 MB.
      // Use between 0 and 5 items of ~100 KB each (max ~500 KB total).
      const count = Math.floor(rand() * 6);
      const itemBytes = Math.floor(rand() * 100 * 1024) + 1024; // 1 KB – 100 KB
      const items = makeItems(count, itemBytes);
      const input = makeResult(items);

      // Verify the input is actually under the limit before testing.
      if (byteSize(input) > MAX_PAYLOAD_BYTES) {
        continue;
      }

      const output = enforcePayloadLimit(input);

      expect(output.truncated).toBe(false);
    }
  });

  // -------------------------------------------------------------------------
  // Idempotency: applying enforcePayloadLimit twice preserves the size guarantee
  // -------------------------------------------------------------------------

  it('enforcePayloadLimit applied twice still satisfies the size guarantee', () => {
    const rand = seededRand(7);
    const ITERATIONS = 50;

    for (let iter = 0; iter < ITERATIONS; iter++) {
      const count = Math.floor(rand() * 15);
      const itemBytes = Math.floor(rand() * 1024 * 1024) + 1024;
      const items = makeItems(count, itemBytes);
      const input = makeResult(items);

      const once = enforcePayloadLimit(input);
      const twice = enforcePayloadLimit(once);

      // Both applications must satisfy the size guarantee.
      expect(byteSize(once)).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES);
      expect(byteSize(twice)).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES);

      // The second application must not further reduce the result array.
      // (The first call already found the maximum fitting prefix.)
      expect(twice.result.length).toBe(once.result.length);
    }
  });

  // -------------------------------------------------------------------------
  // Monotonicity: truncated output is always a prefix of the input items
  // -------------------------------------------------------------------------

  it('truncated output is always a prefix of the original result array', () => {
    const rand = seededRand(13);
    const ITERATIONS = 50;

    for (let iter = 0; iter < ITERATIONS; iter++) {
      const count = 12 + Math.floor(rand() * 8); // 12–19 items
      const itemBytes = Math.floor(rand() * 512 * 1024) + 512 * 1024; // 512 KB – 1 MB
      const items = makeItems(count, itemBytes).map((item, i) => ({
        ...item,
        source: `item-${i}`,
      }));
      const input = makeResult(items);

      if (byteSize(input) <= MAX_PAYLOAD_BYTES) {
        continue;
      }

      const output = enforcePayloadLimit(input);

      // Every item in the output must match the corresponding item in the input.
      for (let i = 0; i < output.result.length; i++) {
        expect(output.result[i].source).toBe(`item-${i}`);
      }
    }
  });

  // -------------------------------------------------------------------------
  // Maximality: the truncated result is as large as possible (binary search)
  // -------------------------------------------------------------------------

  it('truncated result contains the maximum number of items that fit within 10 MB', () => {
    const rand = seededRand(55);
    const ITERATIONS = 30;

    for (let iter = 0; iter < ITERATIONS; iter++) {
      const count = 12 + Math.floor(rand() * 8);
      const itemBytes = Math.floor(rand() * 512 * 1024) + 512 * 1024;
      const items = makeItems(count, itemBytes);
      const input = makeResult(items);

      if (byteSize(input) <= MAX_PAYLOAD_BYTES) {
        continue;
      }

      const output = enforcePayloadLimit(input);

      if (!output.truncated) {
        continue;
      }

      // Adding one more item must push the payload over the limit.
      const n = output.result.length;
      if (n < items.length) {
        const withOneMore = {
          ...output,
          result: items.slice(0, n + 1),
          truncated: true,
        };
        expect(byteSize(withOneMore)).toBeGreaterThan(MAX_PAYLOAD_BYTES);
      }
    }
  });

  // -------------------------------------------------------------------------
  // Boundary: payloads right at the limit boundary
  // -------------------------------------------------------------------------

  it('payload at exactly the limit boundary is not truncated', () => {
    // Build a result whose serialised size is as close to MAX_PAYLOAD_BYTES as
    // possible without exceeding it.
    const wrapper = { success: true, result: [], truncated: false };
    const wrapperSize = byteSize(wrapper);
    // Leave room for the array brackets and one item.
    const available = MAX_PAYLOAD_BYTES - wrapperSize - 2;
    const item = makePaddedItem(Math.max(0, available - 10)); // slightly under
    const input = makeResult([item]);

    // Confirm the input is within the limit.
    expect(byteSize(input)).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES);

    const output = enforcePayloadLimit(input);
    expect(output.truncated).toBe(false);
    expect(byteSize(output)).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES);
  });
});
