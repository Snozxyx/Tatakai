'use strict';

/**
 * PermissionGuard — Domain allowlist enforcement for extension fetch calls.
 *
 * Provides `createAllowlistedFetch(allowedDomains, options)` which returns a
 * fetch-like function that only permits requests to hostnames matching the
 * extension's declared `permissions` list.
 *
 * Wildcard/subdomain matching is supported:
 *   - "*.nyaa.si"  matches "sub.nyaa.si" but NOT "nyaa.si" itself
 *   - "nyaa.si"    matches "nyaa.si" exactly (no subdomains)
 *
 * Blocked attempts are rejected with a `PermissionDeniedError` and logged
 * with the extension ID and the blocked URL.
 *
 * Validates: Requirements 9.2, 7.6
 * Property 12: Domain allowlist enforcement
 */

/**
 * Tests whether a hostname matches a single domain pattern.
 *
 * Supported patterns:
 *   - Exact match:    "nyaa.si"   → matches "nyaa.si" only
 *   - Wildcard:       "*.nyaa.si" → matches "sub.nyaa.si", "a.b.nyaa.si", etc.
 *                                   does NOT match "nyaa.si" itself
 *
 * @param {string} hostname - The hostname extracted from the request URL.
 * @param {string} pattern  - A domain pattern from the extension's permissions.
 * @returns {boolean}
 */
function matchDomain(hostname, pattern) {
  if (typeof hostname !== 'string' || typeof pattern !== 'string') {
    return false;
  }

  const h = hostname.toLowerCase();
  const p = pattern.toLowerCase();

  if (p.startsWith('*.')) {
    // Wildcard: "*.example.com" matches any subdomain of "example.com"
    const base = p.slice(2); // "example.com"
    // hostname must end with ".example.com" (at least one label before the dot)
    return h.endsWith('.' + base) && h.length > base.length + 1;
  }

  // Exact match
  return h === p;
}

/**
 * Creates a fetch-like function that enforces the given domain allowlist.
 *
 * @param {string[]} allowedDomains - Array of domain patterns (e.g. ["nyaa.si", "*.nyaa.si"]).
 * @param {object}   [options]      - Optional configuration.
 * @param {string}   [options.extensionId] - Extension ID used in log messages.
 * @param {Function} [options.fetchImpl]   - Underlying fetch implementation (defaults to global fetch).
 * @param {Function} [options.logger]      - Logger function for blocked attempts (defaults to console.warn).
 * @returns {Function} A fetch-like function `(url, init?) => Promise<Response>`.
 */
function createAllowlistedFetch(allowedDomains, options) {
  const domains = Array.isArray(allowedDomains) ? allowedDomains : [];
  const extensionId = (options && options.extensionId) || 'unknown-extension';
  const fetchImpl = (options && options.fetchImpl) || fetch;
  const logger = (options && options.logger) || console.warn;

  return async function allowlistedFetch(url, init) {
    let hostname;

    try {
      hostname = new URL(url).hostname;
    } catch {
      const err = new Error(`PermissionDeniedError: Invalid URL: ${url}`);
      err.name = 'PermissionDeniedError';
      throw err;
    }

    const permitted = domains.some((pattern) => matchDomain(hostname, pattern));

    if (!permitted) {
      logger(
        `[PermissionGuard] Extension "${extensionId}" blocked fetch to "${url}" — ` +
          `hostname "${hostname}" is not in the allowlist [${domains.join(', ')}]`
      );
      const err = new Error(`PermissionDeniedError: Domain not allowed: ${hostname}`);
      err.name = 'PermissionDeniedError';
      throw err;
    }

    return fetchImpl(url, init);
  };
}

module.exports = { createAllowlistedFetch, matchDomain };
