'use strict';

/**
 * Tests for PermissionGuard — Property 12: Domain allowlist enforcement.
 *
 * **Validates: Requirements 9.2, 7.6**
 *
 * Property 12: For any extension and any URL, a fetch() call from the
 * extension's Web Worker must succeed if and only if the URL's hostname
 * matches a domain pattern declared in the extension's permissions field.
 * All other fetch attempts must be rejected with a PermissionDeniedError.
 */

import { describe, it, expect } from 'bun:test';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { createAllowlistedFetch, matchDomain } = require('../desktop/runtime/permission-guard.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a mock fetch implementation that resolves with a minimal Response-like
 * object, recording the URL it was called with.
 */
function makeMockFetch() {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, url };
  };
  impl.calls = calls;
  return impl;
}

/**
 * Suppresses logger output during tests.
 */
const silentLogger = () => {};

// ---------------------------------------------------------------------------
// Unit tests — matchDomain()
// ---------------------------------------------------------------------------

describe('matchDomain() — unit tests', () => {
  describe('exact matching', () => {
    it('matches identical hostnames', () => {
      expect(matchDomain('nyaa.si', 'nyaa.si')).toBe(true);
    });

    it('matches case-insensitively', () => {
      expect(matchDomain('NYAA.SI', 'nyaa.si')).toBe(true);
      expect(matchDomain('nyaa.si', 'NYAA.SI')).toBe(true);
    });

    it('does not match a subdomain against an exact pattern', () => {
      expect(matchDomain('sub.nyaa.si', 'nyaa.si')).toBe(false);
    });

    it('does not match a parent domain against an exact pattern', () => {
      expect(matchDomain('si', 'nyaa.si')).toBe(false);
    });

    it('does not match an unrelated domain', () => {
      expect(matchDomain('example.com', 'nyaa.si')).toBe(false);
    });

    it('matches a multi-label domain exactly', () => {
      expect(matchDomain('api.example.co.uk', 'api.example.co.uk')).toBe(true);
    });
  });

  describe('wildcard matching', () => {
    it('matches a direct subdomain with *.domain.com', () => {
      expect(matchDomain('sub.nyaa.si', '*.nyaa.si')).toBe(true);
    });

    it('matches a deep subdomain with *.domain.com', () => {
      expect(matchDomain('a.b.nyaa.si', '*.nyaa.si')).toBe(true);
    });

    it('does NOT match the bare domain itself with *.domain.com', () => {
      expect(matchDomain('nyaa.si', '*.nyaa.si')).toBe(false);
    });

    it('does not match an unrelated domain with a wildcard pattern', () => {
      expect(matchDomain('example.com', '*.nyaa.si')).toBe(false);
    });

    it('does not match a domain that merely ends with the base string', () => {
      // "evilnyaa.si" should not match "*.nyaa.si"
      expect(matchDomain('evilnyaa.si', '*.nyaa.si')).toBe(false);
    });

    it('matches case-insensitively for wildcard patterns', () => {
      expect(matchDomain('SUB.NYAA.SI', '*.nyaa.si')).toBe(true);
    });
  });

  describe('invalid inputs', () => {
    it('returns false when hostname is not a string', () => {
      expect(matchDomain(null, 'nyaa.si')).toBe(false);
      expect(matchDomain(undefined, 'nyaa.si')).toBe(false);
      expect(matchDomain(123, 'nyaa.si')).toBe(false);
    });

    it('returns false when pattern is not a string', () => {
      expect(matchDomain('nyaa.si', null)).toBe(false);
      expect(matchDomain('nyaa.si', undefined)).toBe(false);
      expect(matchDomain('nyaa.si', 42)).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// Unit tests — createAllowlistedFetch()
// ---------------------------------------------------------------------------

describe('createAllowlistedFetch() — unit tests', () => {
  describe('permitted domains', () => {
    it('calls the underlying fetch for an exact-match domain', async () => {
      const mockFetch = makeMockFetch();
      const guardedFetch = createAllowlistedFetch(['nyaa.si'], {
        extensionId: 'test-ext',
        fetchImpl: mockFetch,
        logger: silentLogger,
      });

      const result = await guardedFetch('https://nyaa.si/search?q=test');
      expect(result.ok).toBe(true);
      expect(mockFetch.calls).toHaveLength(1);
      expect(mockFetch.calls[0].url).toBe('https://nyaa.si/search?q=test');
    });

    it('calls the underlying fetch for a wildcard-matched subdomain', async () => {
      const mockFetch = makeMockFetch();
      const guardedFetch = createAllowlistedFetch(['*.nyaa.si'], {
        extensionId: 'test-ext',
        fetchImpl: mockFetch,
        logger: silentLogger,
      });

      const result = await guardedFetch('https://api.nyaa.si/torrents');
      expect(result.ok).toBe(true);
      expect(mockFetch.calls).toHaveLength(1);
    });

    it('passes init options through to the underlying fetch', async () => {
      const mockFetch = makeMockFetch();
      const guardedFetch = createAllowlistedFetch(['example.com'], {
        fetchImpl: mockFetch,
        logger: silentLogger,
      });

      const init = { method: 'POST', headers: { 'Content-Type': 'application/json' } };
      await guardedFetch('https://example.com/api', init);
      expect(mockFetch.calls[0].init).toBe(init);
    });

    it('permits a domain when the allowlist contains multiple patterns', async () => {
      const mockFetch = makeMockFetch();
      const guardedFetch = createAllowlistedFetch(['nyaa.si', 'example.com', '*.cdn.net'], {
        fetchImpl: mockFetch,
        logger: silentLogger,
      });

      await guardedFetch('https://example.com/data');
      await guardedFetch('https://static.cdn.net/file');
      expect(mockFetch.calls).toHaveLength(2);
    });
  });

  describe('blocked domains', () => {
    it('throws PermissionDeniedError for a domain not in the allowlist', async () => {
      const mockFetch = makeMockFetch();
      const guardedFetch = createAllowlistedFetch(['nyaa.si'], {
        extensionId: 'test-ext',
        fetchImpl: mockFetch,
        logger: silentLogger,
      });

      await expect(guardedFetch('https://evil.com/steal')).rejects.toThrow(
        'PermissionDeniedError: Domain not allowed: evil.com'
      );
      expect(mockFetch.calls).toHaveLength(0);
    });

    it('throws PermissionDeniedError for the bare domain when only wildcard is declared', async () => {
      const mockFetch = makeMockFetch();
      const guardedFetch = createAllowlistedFetch(['*.nyaa.si'], {
        fetchImpl: mockFetch,
        logger: silentLogger,
      });

      // "nyaa.si" itself is NOT covered by "*.nyaa.si"
      await expect(guardedFetch('https://nyaa.si/page')).rejects.toThrow(
        'PermissionDeniedError: Domain not allowed: nyaa.si'
      );
      expect(mockFetch.calls).toHaveLength(0);
    });

    it('throws PermissionDeniedError when the allowlist is empty', async () => {
      const mockFetch = makeMockFetch();
      const guardedFetch = createAllowlistedFetch([], {
        fetchImpl: mockFetch,
        logger: silentLogger,
      });

      await expect(guardedFetch('https://nyaa.si/')).rejects.toThrow('PermissionDeniedError');
      expect(mockFetch.calls).toHaveLength(0);
    });

    it('throws PermissionDeniedError when allowedDomains is not an array', async () => {
      const mockFetch = makeMockFetch();
      const guardedFetch = createAllowlistedFetch(null, {
        fetchImpl: mockFetch,
        logger: silentLogger,
      });

      await expect(guardedFetch('https://nyaa.si/')).rejects.toThrow('PermissionDeniedError');
    });

    it('throws PermissionDeniedError for an invalid URL', async () => {
      const mockFetch = makeMockFetch();
      const guardedFetch = createAllowlistedFetch(['nyaa.si'], {
        fetchImpl: mockFetch,
        logger: silentLogger,
      });

      await expect(guardedFetch('not-a-valid-url')).rejects.toThrow('PermissionDeniedError');
      expect(mockFetch.calls).toHaveLength(0);
    });

    it('logs the blocked attempt', async () => {
      const logMessages = [];
      const guardedFetch = createAllowlistedFetch(['nyaa.si'], {
        extensionId: 'my-ext',
        fetchImpl: makeMockFetch(),
        logger: (msg) => logMessages.push(msg),
      });

      await expect(guardedFetch('https://evil.com/')).rejects.toThrow('PermissionDeniedError');
      expect(logMessages).toHaveLength(1);
      expect(logMessages[0]).toContain('my-ext');
      expect(logMessages[0]).toContain('evil.com');
    });
  });

  describe('edge cases', () => {
    it('handles HTTP (non-HTTPS) URLs correctly', async () => {
      const mockFetch = makeMockFetch();
      const guardedFetch = createAllowlistedFetch(['nyaa.si'], {
        fetchImpl: mockFetch,
        logger: silentLogger,
      });

      const result = await guardedFetch('http://nyaa.si/page');
      expect(result.ok).toBe(true);
    });

    it('handles URLs with ports correctly', async () => {
      const mockFetch = makeMockFetch();
      const guardedFetch = createAllowlistedFetch(['localhost'], {
        fetchImpl: mockFetch,
        logger: silentLogger,
      });

      const result = await guardedFetch('http://localhost:3000/api');
      expect(result.ok).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Property-based tests — Property 12: Domain allowlist enforcement
// ---------------------------------------------------------------------------

/**
 * Property 12: Domain allowlist enforcement
 *
 * For any extension and any URL, a fetch() call must succeed if and only if
 * the URL's hostname matches a domain pattern declared in the extension's
 * permissions field. All other fetch attempts must be rejected with a
 * PermissionDeniedError.
 *
 * **Validates: Requirements 9.2, 7.6**
 */
describe('PermissionGuard — Property 12: Domain allowlist enforcement', () => {
  // -------------------------------------------------------------------------
  // Deterministic PRNG for reproducible property tests
  // -------------------------------------------------------------------------
  function seededRand(seed) {
    let s = seed >>> 0;
    return function () {
      s = Math.imul(s, 1664525) + 1013904223;
      return (s >>> 0) / 0xffffffff;
    };
  }

  // -------------------------------------------------------------------------
  // Domain generators
  // -------------------------------------------------------------------------

  const TLDS = ['com', 'net', 'org', 'io', 'si', 'tv', 'co', 'uk'];
  const LABELS = ['nyaa', 'api', 'cdn', 'static', 'media', 'search', 'data', 'files', 'sub', 'proxy'];

  function randomLabel(rand) {
    return LABELS[Math.floor(rand() * LABELS.length)];
  }

  function randomTld(rand) {
    return TLDS[Math.floor(rand() * TLDS.length)];
  }

  /** Generate a random base domain like "nyaa.si" */
  function randomBaseDomain(rand) {
    return `${randomLabel(rand)}.${randomTld(rand)}`;
  }

  /** Generate a random subdomain of a base domain like "api.nyaa.si" */
  function randomSubdomain(base, rand) {
    return `${randomLabel(rand)}.${base}`;
  }

  /** Generate a random permission pattern: either exact or wildcard */
  function randomPattern(rand) {
    const base = randomBaseDomain(rand);
    return rand() < 0.5 ? base : `*.${base}`;
  }

  /** Generate a list of 1–5 permission patterns */
  function randomPermissions(rand) {
    const count = Math.floor(rand() * 5) + 1;
    const patterns = [];
    for (let i = 0; i < count; i++) {
      patterns.push(randomPattern(rand));
    }
    return patterns;
  }

  /**
   * Given a list of permission patterns, generate a hostname that IS permitted.
   * For exact patterns, return the pattern itself.
   * For wildcard patterns, return a subdomain of the base.
   */
  function permittedHostname(patterns, rand) {
    const pattern = patterns[Math.floor(rand() * patterns.length)];
    if (pattern.startsWith('*.')) {
      const base = pattern.slice(2);
      return `${randomLabel(rand)}.${base}`;
    }
    return pattern;
  }

  /**
   * Generate a hostname that is NOT in the allowlist.
   * Uses a domain from a separate namespace to avoid accidental matches.
   */
  function blockedHostname(rand) {
    // Use a prefix that won't appear in LABELS to ensure no accidental match
    return `blocked${Math.floor(rand() * 10000)}.blocked${Math.floor(rand() * 10000)}.example`;
  }

  // -------------------------------------------------------------------------
  // Property: permitted hostnames always succeed
  // -------------------------------------------------------------------------

  it('fetch always succeeds when hostname matches a declared permission', async () => {
    const rand = seededRand(42);
    const ITERATIONS = 200;

    for (let i = 0; i < ITERATIONS; i++) {
      const permissions = randomPermissions(rand);
      const hostname = permittedHostname(permissions, rand);
      const url = `https://${hostname}/path`;

      const mockFetch = makeMockFetch();
      const guardedFetch = createAllowlistedFetch(permissions, {
        extensionId: `ext-${i}`,
        fetchImpl: mockFetch,
        logger: silentLogger,
      });

      let threw = false;
      try {
        await guardedFetch(url);
      } catch {
        threw = true;
      }

      if (threw) {
        throw new Error(
          `Expected fetch to succeed for hostname "${hostname}" with permissions [${permissions.join(', ')}], but it threw.`
        );
      }

      if (mockFetch.calls.length !== 1) {
        throw new Error(
          `Expected underlying fetch to be called once for permitted hostname "${hostname}", got ${mockFetch.calls.length} calls.`
        );
      }
    }
  });

  // -------------------------------------------------------------------------
  // Property: non-permitted hostnames always throw PermissionDeniedError
  // -------------------------------------------------------------------------

  it('fetch always throws PermissionDeniedError when hostname is not in the allowlist', async () => {
    const rand = seededRand(99);
    const ITERATIONS = 200;

    for (let i = 0; i < ITERATIONS; i++) {
      const permissions = randomPermissions(rand);
      const hostname = blockedHostname(rand);
      const url = `https://${hostname}/path`;

      const mockFetch = makeMockFetch();
      const guardedFetch = createAllowlistedFetch(permissions, {
        extensionId: `ext-${i}`,
        fetchImpl: mockFetch,
        logger: silentLogger,
      });

      let caughtError = null;
      try {
        await guardedFetch(url);
      } catch (err) {
        caughtError = err;
      }

      if (!caughtError) {
        throw new Error(
          `Expected fetch to throw for hostname "${hostname}" with permissions [${permissions.join(', ')}], but it succeeded.`
        );
      }

      if (!caughtError.message.includes('PermissionDeniedError')) {
        throw new Error(
          `Expected PermissionDeniedError for hostname "${hostname}", got: ${caughtError.message}`
        );
      }

      if (mockFetch.calls.length !== 0) {
        throw new Error(
          `Expected underlying fetch NOT to be called for blocked hostname "${hostname}", got ${mockFetch.calls.length} calls.`
        );
      }
    }
  });

  // -------------------------------------------------------------------------
  // Property: fetch succeeds IFF hostname matches — bidirectional check
  // -------------------------------------------------------------------------

  it('fetch result (success/failure) matches matchDomain() result for any hostname and permissions', async () => {
    const rand = seededRand(7);
    const ITERATIONS = 300;

    for (let i = 0; i < ITERATIONS; i++) {
      const permissions = randomPermissions(rand);

      // Randomly pick either a permitted or blocked hostname
      let hostname;
      if (rand() < 0.5) {
        hostname = permittedHostname(permissions, rand);
      } else {
        hostname = blockedHostname(rand);
      }

      const url = `https://${hostname}/resource`;
      const expectedPermitted = permissions.some((p) => matchDomain(hostname, p));

      const mockFetch = makeMockFetch();
      const guardedFetch = createAllowlistedFetch(permissions, {
        extensionId: `ext-${i}`,
        fetchImpl: mockFetch,
        logger: silentLogger,
      });

      let succeeded = false;
      let errorMessage = '';
      try {
        await guardedFetch(url);
        succeeded = true;
      } catch (err) {
        errorMessage = err.message;
      }

      if (expectedPermitted !== succeeded) {
        throw new Error(
          `Mismatch for hostname "${hostname}" with permissions [${permissions.join(', ')}]: ` +
            `matchDomain says ${expectedPermitted ? 'permitted' : 'blocked'}, ` +
            `but fetch ${succeeded ? 'succeeded' : `threw: ${errorMessage}`}.`
        );
      }

      // If blocked, verify the error message contains PermissionDeniedError
      if (!succeeded && !errorMessage.includes('PermissionDeniedError')) {
        throw new Error(
          `Expected PermissionDeniedError for blocked hostname "${hostname}", got: ${errorMessage}`
        );
      }

      // If blocked, verify underlying fetch was never called
      if (!succeeded && mockFetch.calls.length !== 0) {
        throw new Error(
          `Underlying fetch was called despite block for hostname "${hostname}".`
        );
      }
    }
  });

  // -------------------------------------------------------------------------
  // Property: empty allowlist blocks everything
  // -------------------------------------------------------------------------

  it('empty allowlist always blocks all fetch attempts', async () => {
    const rand = seededRand(13);
    const ITERATIONS = 100;

    for (let i = 0; i < ITERATIONS; i++) {
      const hostname = randomBaseDomain(rand);
      const url = `https://${hostname}/path`;

      const mockFetch = makeMockFetch();
      const guardedFetch = createAllowlistedFetch([], {
        fetchImpl: mockFetch,
        logger: silentLogger,
      });

      let caughtError = null;
      try {
        await guardedFetch(url);
      } catch (err) {
        caughtError = err;
      }

      if (!caughtError) {
        throw new Error(`Expected empty allowlist to block fetch to "${hostname}", but it succeeded.`);
      }

      if (!caughtError.message.includes('PermissionDeniedError')) {
        throw new Error(`Expected PermissionDeniedError, got: ${caughtError.message}`);
      }
    }
  });

  // -------------------------------------------------------------------------
  // Property: wildcard pattern does NOT match the bare base domain
  // -------------------------------------------------------------------------

  it('wildcard pattern *.domain never permits the bare domain itself', async () => {
    const rand = seededRand(21);
    const ITERATIONS = 100;

    for (let i = 0; i < ITERATIONS; i++) {
      const base = randomBaseDomain(rand);
      const wildcardPattern = `*.${base}`;
      const url = `https://${base}/page`;

      const mockFetch = makeMockFetch();
      const guardedFetch = createAllowlistedFetch([wildcardPattern], {
        fetchImpl: mockFetch,
        logger: silentLogger,
      });

      let caughtError = null;
      try {
        await guardedFetch(url);
      } catch (err) {
        caughtError = err;
      }

      if (!caughtError) {
        throw new Error(
          `Wildcard pattern "${wildcardPattern}" should NOT permit bare domain "${base}", but fetch succeeded.`
        );
      }
    }
  });

  // -------------------------------------------------------------------------
  // Property: wildcard pattern always permits valid subdomains
  // -------------------------------------------------------------------------

  it('wildcard pattern *.domain always permits subdomains of that domain', async () => {
    const rand = seededRand(55);
    const ITERATIONS = 100;

    for (let i = 0; i < ITERATIONS; i++) {
      const base = randomBaseDomain(rand);
      const wildcardPattern = `*.${base}`;
      const subdomain = randomSubdomain(base, rand);
      const url = `https://${subdomain}/resource`;

      const mockFetch = makeMockFetch();
      const guardedFetch = createAllowlistedFetch([wildcardPattern], {
        fetchImpl: mockFetch,
        logger: silentLogger,
      });

      let threw = false;
      try {
        await guardedFetch(url);
      } catch {
        threw = true;
      }

      if (threw) {
        throw new Error(
          `Wildcard pattern "${wildcardPattern}" should permit subdomain "${subdomain}", but fetch threw.`
        );
      }
    }
  });

  // -------------------------------------------------------------------------
  // Property: underlying fetch is never called for blocked requests
  // -------------------------------------------------------------------------

  it('underlying fetch is never invoked when a request is blocked', async () => {
    const rand = seededRand(33);
    const ITERATIONS = 150;

    for (let i = 0; i < ITERATIONS; i++) {
      const permissions = randomPermissions(rand);
      const hostname = blockedHostname(rand);
      const url = `https://${hostname}/data`;

      const mockFetch = makeMockFetch();
      const guardedFetch = createAllowlistedFetch(permissions, {
        fetchImpl: mockFetch,
        logger: silentLogger,
      });

      try {
        await guardedFetch(url);
      } catch {
        // expected
      }

      if (mockFetch.calls.length !== 0) {
        throw new Error(
          `Underlying fetch was called ${mockFetch.calls.length} time(s) for blocked hostname "${hostname}".`
        );
      }
    }
  });
});
