'use strict';

/**
 * Tests for ExtensionSandbox — Property 11: Web Worker sandbox isolation.
 *
 * **Validates: Requirements 9.1**
 *
 * Property 11: For any extension code that attempts to access `document`,
 * `window`, `localStorage`, `indexedDB`, or `XMLHttpRequest` inside its Web
 * Worker, the access must result in `undefined` or a `ReferenceError` — the
 * extension must never successfully read or write these globals.
 */

import { describe, it, expect } from 'bun:test';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { wrapExtensionCode, extractAllowedDomains } = require('../desktop/runtime/extension-sandbox.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal valid manifest for testing. */
function makeManifest(permissions = []) {
  return {
    id: 'test-ext',
    name: 'Test Extension',
    version: '1.0.0',
    type: 'custom',
    description: 'Test extension',
    permissions,
  };
}

/**
 * Evaluate wrapped extension code in a sandboxed Function context that
 * simulates the Web Worker global scope.
 *
 * The `self` object is provided with the tatakai injected globals so the
 * wrapped code can reference them. The function returns the `captured` object
 * that the extension code writes its results into.
 *
 * @param {string} wrappedCode - Output of wrapExtensionCode().
 * @param {object} selfOverrides - Properties to add to the simulated `self`.
 * @returns {object} The `captured` object populated by the extension code.
 */
function evalInWorkerContext(wrappedCode, selfOverrides = {}) {
  const captured = {};

  // Simulate the Web Worker global `self` with injected tatakai APIs.
  const self = {
    __tatakai_fetch__: async () => {},
    __tatakai_anitomy__: () => ({}),
    __tatakai_parse_html__: () => ({}),
    ...selfOverrides,
  };

  // We use the Function constructor to create an isolated scope.
  // The `captured` and `self` variables are passed in explicitly.
  // eslint-disable-next-line no-new-func
  const fn = new Function('self', 'captured', wrappedCode);
  fn(self, captured);

  return captured;
}

// ---------------------------------------------------------------------------
// Unit tests — specific examples
// ---------------------------------------------------------------------------

describe('ExtensionSandbox — unit tests', () => {
  // --- wrapExtensionCode input validation ---
  describe('wrapExtensionCode() input validation', () => {
    it('throws TypeError when extensionCode is not a string', () => {
      expect(() => wrapExtensionCode(null, makeManifest())).toThrow(TypeError);
      expect(() => wrapExtensionCode(42, makeManifest())).toThrow(TypeError);
      expect(() => wrapExtensionCode(undefined, makeManifest())).toThrow(TypeError);
    });

    it('throws TypeError when manifest is not an object', () => {
      expect(() => wrapExtensionCode('', null)).toThrow(TypeError);
      expect(() => wrapExtensionCode('', 'bad')).toThrow(TypeError);
      expect(() => wrapExtensionCode('', undefined)).toThrow(TypeError);
    });

    it('returns a string for valid inputs', () => {
      const result = wrapExtensionCode('// noop', makeManifest());
      expect(typeof result).toBe('string');
    });

    it('includes the extension code in the output', () => {
      const code = 'captured.ran = true;';
      const wrapped = wrapExtensionCode(code, makeManifest());
      expect(wrapped).toContain(code);
    });

    it('includes "use strict" in the output', () => {
      const wrapped = wrapExtensionCode('', makeManifest());
      expect(wrapped).toContain("'use strict'");
    });
  });

  // --- Blocked globals ---
  describe('wrapExtensionCode() — blocked globals', () => {
    const BLOCKED_GLOBALS = ['document', 'window', 'localStorage', 'indexedDB', 'XMLHttpRequest'];

    for (const globalName of BLOCKED_GLOBALS) {
      it(`shadows ${globalName} to undefined`, () => {
        const code = `captured.value = typeof ${globalName} === 'undefined' ? 'undefined' : ${globalName};`;
        const wrapped = wrapExtensionCode(code, makeManifest());
        const captured = evalInWorkerContext(wrapped);
        expect(captured.value).toBe('undefined');
      });

      it(`assignment to ${globalName} does not throw and remains undefined`, () => {
        const code = `
          try {
            ${globalName} = 'hacked';
          } catch (e) {
            captured.threw = true;
          }
          captured.value = typeof ${globalName} === 'undefined' ? 'undefined' : ${globalName};
        `;
        const wrapped = wrapExtensionCode(code, makeManifest());
        const captured = evalInWorkerContext(wrapped);
        // Whether it throws or not, the global must remain undefined
        expect(captured.value).toBe('undefined');
      });
    }
  });

  // --- Injected runtime APIs ---
  describe('wrapExtensionCode() — injected runtime APIs', () => {
    it('aliases fetch to self.__tatakai_fetch__', () => {
      const sentinel = () => 'sentinel-fetch';
      const code = `captured.fetchRef = fetch;`;
      const wrapped = wrapExtensionCode(code, makeManifest());
      const captured = evalInWorkerContext(wrapped, { __tatakai_fetch__: sentinel });
      expect(captured.fetchRef).toBe(sentinel);
    });

    it('aliases anitomyscript to self.__tatakai_anitomy__', () => {
      const sentinel = () => 'sentinel-anitomy';
      const code = `captured.anitomyRef = anitomyscript;`;
      const wrapped = wrapExtensionCode(code, makeManifest());
      const captured = evalInWorkerContext(wrapped, { __tatakai_anitomy__: sentinel });
      expect(captured.anitomyRef).toBe(sentinel);
    });

    it('aliases parseHtml to self.__tatakai_parse_html__', () => {
      const sentinel = () => 'sentinel-parse';
      const code = `captured.parseRef = parseHtml;`;
      const wrapped = wrapExtensionCode(code, makeManifest());
      const captured = evalInWorkerContext(wrapped, { __tatakai_parse_html__: sentinel });
      expect(captured.parseRef).toBe(sentinel);
    });
  });

  // --- extractAllowedDomains ---
  describe('extractAllowedDomains()', () => {
    it('returns empty array for empty permissions', () => {
      expect(extractAllowedDomains([])).toEqual([]);
    });

    it('returns empty array for non-array input', () => {
      expect(extractAllowedDomains(null)).toEqual([]);
      expect(extractAllowedDomains(undefined)).toEqual([]);
      expect(extractAllowedDomains('network:domain:nyaa.si')).toEqual([]);
    });

    it('extracts a single domain from a network:domain permission', () => {
      expect(extractAllowedDomains(['network:domain:nyaa.si'])).toEqual(['nyaa.si']);
    });

    it('extracts multiple domains', () => {
      const permissions = [
        'network:domain:nyaa.si',
        'network:domain:subsplease.org',
        'parse:html',
      ];
      expect(extractAllowedDomains(permissions)).toEqual(['nyaa.si', 'subsplease.org']);
    });

    it('ignores non-network permission strings', () => {
      expect(extractAllowedDomains(['parse:html', 'storage:read'])).toEqual([]);
    });

    it('ignores malformed permission strings', () => {
      expect(extractAllowedDomains(['network:domain', 'network:', ':domain:nyaa.si'])).toEqual([]);
    });

    it('ignores non-string entries in the array', () => {
      expect(extractAllowedDomains([null, 42, 'network:domain:nyaa.si', undefined])).toEqual(['nyaa.si']);
    });

    it('trims whitespace from domain names', () => {
      expect(extractAllowedDomains(['network:domain: nyaa.si '])).toEqual(['nyaa.si']);
    });

    it('embeds allowed domains JSON in the wrapped code', () => {
      const permissions = ['network:domain:nyaa.si', 'network:domain:subsplease.org'];
      const wrapped = wrapExtensionCode('', makeManifest(permissions));
      expect(wrapped).toContain('"nyaa.si"');
      expect(wrapped).toContain('"subsplease.org"');
    });
  });
});

// ---------------------------------------------------------------------------
// Property-based tests — Property 11: Web Worker sandbox isolation
// ---------------------------------------------------------------------------

/**
 * Property 11: Web Worker sandbox isolation
 *
 * For any extension code that attempts to access `document`, `window`,
 * `localStorage`, `indexedDB`, or `XMLHttpRequest` inside its Web Worker,
 * the access must result in `undefined` or a `ReferenceError` — the extension
 * must never successfully read or write these globals.
 *
 * **Validates: Requirements 9.1**
 */
describe('ExtensionSandbox — Property 11: Web Worker sandbox isolation', () => {
  const BLOCKED_GLOBALS = ['document', 'window', 'localStorage', 'indexedDB', 'XMLHttpRequest'];

  /**
   * Generate a deterministic pseudo-random number generator.
   * Returns a function that produces floats in [0, 1).
   */
  function seededRand(seed) {
    let s = seed >>> 0;
    return function () {
      s = (Math.imul(1664525, s) + 1013904223) >>> 0;
      return s / 0x100000000;
    };
  }

  /**
   * Generate a random extension code snippet that attempts to access one or
   * more blocked globals in various ways.
   */
  function generateAccessAttempt(globalName, rand) {
    const patterns = [
      // Direct read
      `captured.value = typeof ${globalName} === 'undefined' ? 'undefined' : String(${globalName});`,
      // Property access
      `try { captured.value = ${globalName} === undefined ? 'undefined' : 'leaked'; } catch(e) { captured.value = 'undefined'; }`,
      // Typeof check (never throws)
      `captured.value = typeof ${globalName};`,
      // Assignment attempt
      `try { ${globalName} = 'pwned'; } catch(e) {} captured.value = typeof ${globalName} === 'undefined' ? 'undefined' : 'leaked';`,
      // Nested function access
      `(function() { captured.value = typeof ${globalName} === 'undefined' ? 'undefined' : 'leaked'; })();`,
      // Arrow function access
      `(() => { captured.value = typeof ${globalName} === 'undefined' ? 'undefined' : 'leaked'; })();`,
    ];
    const idx = Math.floor(rand() * patterns.length);
    return patterns[idx];
  }

  /**
   * Generate a random manifest with a random set of permissions.
   */
  function generateManifest(rand) {
    const domains = ['nyaa.si', 'subsplease.org', 'anidex.info', 'tokyotosho.info'];
    const permissions = [];
    for (const domain of domains) {
      if (rand() < 0.5) {
        permissions.push(`network:domain:${domain}`);
      }
    }
    if (rand() < 0.3) permissions.push('parse:html');
    return makeManifest(permissions);
  }

  it('blocked globals are always undefined regardless of access pattern (200 iterations)', () => {
    const rand = seededRand(42);
    const ITERATIONS = 200;

    for (let iter = 0; iter < ITERATIONS; iter++) {
      // Pick a random blocked global
      const globalName = BLOCKED_GLOBALS[Math.floor(rand() * BLOCKED_GLOBALS.length)];
      const manifest = generateManifest(rand);
      const accessCode = generateAccessAttempt(globalName, rand);

      const wrapped = wrapExtensionCode(accessCode, manifest);
      const captured = evalInWorkerContext(wrapped);

      // The value must be 'undefined' — never 'leaked' or any real object
      expect(captured.value).toBe('undefined');
    }
  });

  it('all five blocked globals are undefined in the same extension invocation', () => {
    const rand = seededRand(99);
    const ITERATIONS = 100;

    for (let iter = 0; iter < ITERATIONS; iter++) {
      const manifest = generateManifest(rand);

      // Build code that checks all five globals at once
      const checks = BLOCKED_GLOBALS.map(
        g => `captured.${g} = typeof ${g} === 'undefined' ? 'undefined' : 'leaked';`
      ).join('\n');

      const wrapped = wrapExtensionCode(checks, manifest);
      const captured = evalInWorkerContext(wrapped);

      for (const globalName of BLOCKED_GLOBALS) {
        expect(captured[globalName]).toBe('undefined');
      }
    }
  });

  it('blocked globals remain undefined even when extension code is complex (50 iterations)', () => {
    const rand = seededRand(7);
    const ITERATIONS = 50;

    for (let iter = 0; iter < ITERATIONS; iter++) {
      const manifest = generateManifest(rand);

      // Simulate a realistic extension that also does legitimate work
      const extensionCode = `
        // Legitimate work: use injected APIs
        const _fetch = fetch;
        const _anitomy = anitomyscript;
        const _parse = parseHtml;

        // Attempt to access blocked globals in various ways
        captured.doc = typeof document === 'undefined' ? 'undefined' : 'leaked';
        captured.win = typeof window === 'undefined' ? 'undefined' : 'leaked';
        captured.ls = typeof localStorage === 'undefined' ? 'undefined' : 'leaked';
        captured.idb = typeof indexedDB === 'undefined' ? 'undefined' : 'leaked';
        captured.xhr = typeof XMLHttpRequest === 'undefined' ? 'undefined' : 'leaked';

        // Verify injected APIs are accessible
        captured.hasFetch = typeof _fetch === 'function';
        captured.hasAnitomy = typeof _anitomy === 'function';
        captured.hasParse = typeof _parse === 'function';
      `;

      const wrapped = wrapExtensionCode(extensionCode, manifest);
      const captured = evalInWorkerContext(wrapped);

      // All blocked globals must be undefined
      expect(captured.doc).toBe('undefined');
      expect(captured.win).toBe('undefined');
      expect(captured.ls).toBe('undefined');
      expect(captured.idb).toBe('undefined');
      expect(captured.xhr).toBe('undefined');

      // Injected APIs must be accessible
      expect(captured.hasFetch).toBe(true);
      expect(captured.hasAnitomy).toBe(true);
      expect(captured.hasParse).toBe(true);
    }
  });

  it('blocked globals are undefined for any valid extension code string (100 iterations)', () => {
    const rand = seededRand(13);
    const ITERATIONS = 100;

    // Pool of code fragments that might appear in real extensions
    const codeFragments = [
      'captured.x = 1;',
      'const x = 42; captured.x = x;',
      'function helper() { return 1; } captured.x = helper();',
      'const arr = [1,2,3]; captured.x = arr.length;',
      'captured.x = JSON.stringify({ a: 1 });',
      'try { throw new Error("test"); } catch(e) { captured.x = e.message; }',
    ];

    for (let iter = 0; iter < ITERATIONS; iter++) {
      const manifest = generateManifest(rand);

      // Pick a random legitimate code fragment
      const legitCode = codeFragments[Math.floor(rand() * codeFragments.length)];

      // Append a check for a random blocked global
      const globalName = BLOCKED_GLOBALS[Math.floor(rand() * BLOCKED_GLOBALS.length)];
      const checkCode = `captured.blocked = typeof ${globalName} === 'undefined' ? 'undefined' : 'leaked';`;

      const wrapped = wrapExtensionCode(`${legitCode}\n${checkCode}`, manifest);
      const captured = evalInWorkerContext(wrapped);

      expect(captured.blocked).toBe('undefined');
    }
  });

  it('extractAllowedDomains is consistent with wrapExtensionCode for any permission set (100 iterations)', () => {
    const rand = seededRand(55);
    const ITERATIONS = 100;

    const allDomains = [
      'nyaa.si', 'subsplease.org', 'anidex.info', 'tokyotosho.info',
      'animebytes.tv', 'bakabt.me', 'example.com',
    ];
    const otherPerms = ['parse:html', 'storage:read', 'network:domain', 'bad:perm'];

    for (let iter = 0; iter < ITERATIONS; iter++) {
      const permissions = [];
      const expectedDomains = [];

      for (const domain of allDomains) {
        if (rand() < 0.4) {
          permissions.push(`network:domain:${domain}`);
          expectedDomains.push(domain);
        }
      }
      for (const perm of otherPerms) {
        if (rand() < 0.3) {
          permissions.push(perm);
        }
      }

      const extracted = extractAllowedDomains(permissions);

      // Must contain exactly the expected domains
      expect(extracted.sort()).toEqual(expectedDomains.sort());

      // The wrapped code must embed these domains
      const wrapped = wrapExtensionCode('', makeManifest(permissions));
      for (const domain of expectedDomains) {
        expect(wrapped).toContain(domain);
      }
    }
  });
});
