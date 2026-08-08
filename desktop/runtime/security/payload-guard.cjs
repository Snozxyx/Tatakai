'use strict';

/**
 * Payload size guard for extension responses.
 *
 * Enforces a 10 MB maximum response payload per extension invocation.
 * If the serialized result exceeds the limit, the result array is truncated
 * to fit within the limit and the `truncated` flag is set to true.
 *
 * Validates: Requirements 9.6
 * Property 14: Extension response payload size limit
 */

const MAX_PAYLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Enforces the 10 MB payload size limit on an extension invocation result.
 *
 * @param {object} result - The raw result object from an extension invocation.
 *   Expected shape: { success: boolean, result?: any[], error?: string, ... }
 * @returns {object} The result with a `truncated` boolean flag added.
 *   - If the serialized size is within the limit: returns { ...result, truncated: false }
 *   - If the serialized size exceeds the limit: returns a truncated result with truncated: true
 */
function enforcePayloadLimit(result) {
  const serialized = JSON.stringify(result);
  const byteSize = Buffer.byteLength(serialized, 'utf8');

  if (byteSize <= MAX_PAYLOAD_BYTES) {
    return { ...result, truncated: false };
  }

  // Payload exceeds limit — truncate the result array to fit within 10 MB.
  // We binary-search for the largest prefix of result.result[] that fits.
  const items = Array.isArray(result.result) ? result.result : [];

  if (items.length === 0) {
    // No array to truncate; return the base object with truncated flag.
    // Strip the result field if it's not an array to avoid confusion.
    const base = { ...result, result: [], truncated: true };
    return base;
  }

  // Binary search for the largest prefix that fits within MAX_PAYLOAD_BYTES.
  let lo = 0;
  let hi = items.length;

  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2);
    const candidate = { ...result, result: items.slice(0, mid), truncated: true };
    const candidateSize = Buffer.byteLength(JSON.stringify(candidate), 'utf8');

    if (candidateSize <= MAX_PAYLOAD_BYTES) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }

  return { ...result, result: items.slice(0, lo), truncated: true };
}

module.exports = { MAX_PAYLOAD_BYTES, enforcePayloadLimit };
