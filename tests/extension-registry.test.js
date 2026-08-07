'use strict';

/**
 * Tests for ExtensionRegistry — Property 15: Extension registry health report.
 *
 * **Validates: Requirements 10.1, 10.5**
 *
 * Property 15: For any set of loaded extensions, `runtime:health` must return
 * a `loadedExtensions` array that contains exactly the IDs of all currently
 * registered (non-suspended, non-kill-switched) extensions — no more, no fewer.
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { ExtensionRegistry } = require('../desktop/runtime/extension-registry.cjs');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal valid manifest for testing. */
function makeManifest(id) {
  return {
    id,
    name: `Extension ${id}`,
    version: '1.0.0',
    type: 'custom',
    description: `Test extension ${id}`,
    permissions: [],
  };
}

/** Register N extensions with IDs ext-1 … ext-N. */
function registerN(registry, n) {
  const ids = [];
  for (let i = 1; i <= n; i++) {
    const id = `ext-${i}`;
    registry.register(id, makeManifest(id), `/extensions/${id}/bundle.js`);
    ids.push(id);
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Unit tests — specific examples
// ---------------------------------------------------------------------------

describe('ExtensionRegistry — unit tests', () => {
  let registry;

  beforeEach(() => {
    registry = new ExtensionRegistry();
  });

  // --- register ---
  describe('register()', () => {
    it('registers an extension and returns the entry', () => {
      const entry = registry.register('ext-1', makeManifest('ext-1'), '/path/bundle.js');
      expect(entry).toBeDefined();
      expect(entry.manifest.id).toBe('ext-1');
      expect(entry.bundlePath).toBe('/path/bundle.js');
      expect(entry.workerRef).toBeNull();
      expect(entry.cumulativeMs).toBe(0);
      expect(entry.suspendedAt).toBeNull();
      expect(typeof entry.loadedAt).toBe('number');
    });

    it('overwrites an existing entry on re-register', () => {
      registry.register('ext-1', makeManifest('ext-1'), '/old/bundle.js');
      const entry = registry.register('ext-1', makeManifest('ext-1'), '/new/bundle.js');
      expect(entry.bundlePath).toBe('/new/bundle.js');
      expect(registry.listLoaded()).toEqual(['ext-1']);
    });

    it('throws TypeError for invalid extensionId', () => {
      expect(() => registry.register('', makeManifest('x'), '/path')).toThrow(TypeError);
      expect(() => registry.register(null, makeManifest('x'), '/path')).toThrow(TypeError);
    });

    it('throws TypeError for invalid manifest', () => {
      expect(() => registry.register('ext-1', null, '/path')).toThrow(TypeError);
      expect(() => registry.register('ext-1', 'bad', '/path')).toThrow(TypeError);
    });

    it('throws TypeError for invalid bundlePath', () => {
      expect(() => registry.register('ext-1', makeManifest('ext-1'), '')).toThrow(TypeError);
      expect(() => registry.register('ext-1', makeManifest('ext-1'), null)).toThrow(TypeError);
    });
  });

  // --- unregister ---
  describe('unregister()', () => {
    it('removes a registered extension and returns true', () => {
      registry.register('ext-1', makeManifest('ext-1'), '/path/bundle.js');
      expect(registry.unregister('ext-1')).toBe(true);
      expect(registry.lookup('ext-1')).toBeUndefined();
    });

    it('returns false when the extension was not registered', () => {
      expect(registry.unregister('nonexistent')).toBe(false);
    });

    it('removes the extension from listLoaded()', () => {
      registry.register('ext-1', makeManifest('ext-1'), '/path/bundle.js');
      registry.register('ext-2', makeManifest('ext-2'), '/path/bundle2.js');
      registry.unregister('ext-1');
      expect(registry.listLoaded()).toEqual(['ext-2']);
    });
  });

  // --- lookup ---
  describe('lookup()', () => {
    it('returns the entry for a registered extension', () => {
      registry.register('ext-1', makeManifest('ext-1'), '/path/bundle.js');
      const entry = registry.lookup('ext-1');
      expect(entry).toBeDefined();
      expect(entry.manifest.id).toBe('ext-1');
    });

    it('returns undefined for an unregistered extension', () => {
      expect(registry.lookup('nonexistent')).toBeUndefined();
    });
  });

  // --- kill-switch ---
  describe('isKillSwitched() / setKillSwitch()', () => {
    it('returns false by default', () => {
      expect(registry.isKillSwitched('ext-1')).toBe(false);
    });

    it('returns true after setKillSwitch(id, true)', () => {
      registry.setKillSwitch('ext-1', true);
      expect(registry.isKillSwitched('ext-1')).toBe(true);
    });

    it('returns false after setKillSwitch(id, false) clears the flag', () => {
      registry.setKillSwitch('ext-1', true);
      registry.setKillSwitch('ext-1', false);
      expect(registry.isKillSwitched('ext-1')).toBe(false);
    });

    it('kill-switched extension is excluded from listLoaded()', () => {
      registry.register('ext-1', makeManifest('ext-1'), '/path/bundle.js');
      registry.setKillSwitch('ext-1', true);
      expect(registry.listLoaded()).toEqual([]);
    });

    it('kill-switch can be set before the extension is registered', () => {
      registry.setKillSwitch('ext-future', true);
      registry.register('ext-future', makeManifest('ext-future'), '/path/bundle.js');
      expect(registry.listLoaded()).toEqual([]);
    });

    it('clearing kill-switch makes extension appear in listLoaded()', () => {
      registry.register('ext-1', makeManifest('ext-1'), '/path/bundle.js');
      registry.setKillSwitch('ext-1', true);
      registry.setKillSwitch('ext-1', false);
      expect(registry.listLoaded()).toEqual(['ext-1']);
    });
  });

  // --- listLoaded ---
  describe('listLoaded()', () => {
    it('returns empty array when no extensions are registered', () => {
      expect(registry.listLoaded()).toEqual([]);
    });

    it('returns all registered extension IDs when none are suspended or kill-switched', () => {
      registerN(registry, 3);
      expect(registry.listLoaded()).toEqual(['ext-1', 'ext-2', 'ext-3']);
    });

    it('excludes suspended extensions', () => {
      registerN(registry, 3);
      const entry = registry.lookup('ext-2');
      entry.suspendedAt = Date.now();
      expect(registry.listLoaded()).toEqual(['ext-1', 'ext-3']);
    });

    it('excludes kill-switched extensions', () => {
      registerN(registry, 3);
      registry.setKillSwitch('ext-2', true);
      expect(registry.listLoaded()).toEqual(['ext-1', 'ext-3']);
    });

    it('excludes both suspended and kill-switched extensions', () => {
      registerN(registry, 4);
      const entry = registry.lookup('ext-1');
      entry.suspendedAt = Date.now();
      registry.setKillSwitch('ext-3', true);
      expect(registry.listLoaded()).toEqual(['ext-2', 'ext-4']);
    });

    it('returns sorted IDs', () => {
      registry.register('zebra', makeManifest('zebra'), '/path/z.js');
      registry.register('alpha', makeManifest('alpha'), '/path/a.js');
      registry.register('mango', makeManifest('mango'), '/path/m.js');
      expect(registry.listLoaded()).toEqual(['alpha', 'mango', 'zebra']);
    });
  });
});

// ---------------------------------------------------------------------------
// Property-based tests — Property 15
// ---------------------------------------------------------------------------

/**
 * Property 15: Extension registry health report
 *
 * For any set of loaded extensions, `listLoaded()` must return exactly the IDs
 * of all currently registered (non-suspended, non-kill-switched) extensions —
 * no more, no fewer.
 *
 * **Validates: Requirements 10.5**
 */
describe('ExtensionRegistry — Property 15: health report correctness', () => {
  /**
   * Generate a random integer in [min, max].
   * Uses a simple deterministic seed-based PRNG so tests are reproducible.
   */
  function seededRand(seed) {
    let s = seed;
    return function () {
      s = (s * 1664525 + 1013904223) & 0xffffffff;
      return (s >>> 0) / 0xffffffff;
    };
  }

  /**
   * Build a scenario with `total` extensions, `suspendedCount` suspended, and
   * `killSwitchedCount` kill-switched (with possible overlap).
   *
   * Returns { registry, expectedActive } where `expectedActive` is the sorted
   * array of IDs that should appear in listLoaded().
   */
  function buildScenario(total, suspendedCount, killSwitchedCount, rand) {
    const registry = new ExtensionRegistry();
    const ids = [];

    for (let i = 0; i < total; i++) {
      const id = `ext-${i}`;
      registry.register(id, makeManifest(id), `/extensions/${id}/bundle.js`);
      ids.push(id);
    }

    // Suspend the first `suspendedCount` extensions
    const suspendedIds = new Set();
    for (let i = 0; i < suspendedCount && i < total; i++) {
      const entry = registry.lookup(ids[i]);
      entry.suspendedAt = Date.now();
      suspendedIds.add(ids[i]);
    }

    // Kill-switch the last `killSwitchedCount` extensions (may overlap with suspended)
    const killSwitchedIds = new Set();
    for (let i = Math.max(0, total - killSwitchedCount); i < total; i++) {
      registry.setKillSwitch(ids[i], true);
      killSwitchedIds.add(ids[i]);
    }

    const expectedActive = ids
      .filter(id => !suspendedIds.has(id) && !killSwitchedIds.has(id))
      .sort();

    return { registry, expectedActive };
  }

  it('listLoaded() matches expected active set across many configurations', () => {
    const rand = seededRand(42);
    const ITERATIONS = 200;

    for (let iter = 0; iter < ITERATIONS; iter++) {
      const total = Math.floor(rand() * 20);           // 0–19 extensions
      const suspended = Math.floor(rand() * (total + 1));
      const killed = Math.floor(rand() * (total + 1));

      const { registry, expectedActive } = buildScenario(total, suspended, killed, rand);
      const actual = registry.listLoaded();

      expect(actual).toEqual(expectedActive);
    }
  });

  it('listLoaded() never includes a suspended extension', () => {
    const rand = seededRand(99);

    for (let iter = 0; iter < 100; iter++) {
      const total = Math.floor(rand() * 15) + 1;
      const suspendedCount = Math.floor(rand() * total) + 1;

      const registry = new ExtensionRegistry();
      const ids = [];
      for (let i = 0; i < total; i++) {
        const id = `ext-${i}`;
        registry.register(id, makeManifest(id), `/extensions/${id}/bundle.js`);
        ids.push(id);
      }

      const suspendedIds = new Set();
      for (let i = 0; i < suspendedCount; i++) {
        const entry = registry.lookup(ids[i]);
        entry.suspendedAt = Date.now();
        suspendedIds.add(ids[i]);
      }

      const loaded = registry.listLoaded();
      for (const id of suspendedIds) {
        expect(loaded).not.toContain(id);
      }
    }
  });

  it('listLoaded() never includes a kill-switched extension', () => {
    const rand = seededRand(7);

    for (let iter = 0; iter < 100; iter++) {
      const total = Math.floor(rand() * 15) + 1;
      const killCount = Math.floor(rand() * total) + 1;

      const registry = new ExtensionRegistry();
      const ids = [];
      for (let i = 0; i < total; i++) {
        const id = `ext-${i}`;
        registry.register(id, makeManifest(id), `/extensions/${id}/bundle.js`);
        ids.push(id);
      }

      const killedIds = new Set();
      for (let i = 0; i < killCount; i++) {
        registry.setKillSwitch(ids[i], true);
        killedIds.add(ids[i]);
      }

      const loaded = registry.listLoaded();
      for (const id of killedIds) {
        expect(loaded).not.toContain(id);
      }
    }
  });

  it('listLoaded() always includes every registered, active extension', () => {
    const rand = seededRand(13);

    for (let iter = 0; iter < 100; iter++) {
      const total = Math.floor(rand() * 15) + 1;

      const registry = new ExtensionRegistry();
      const ids = [];
      for (let i = 0; i < total; i++) {
        const id = `ext-${i}`;
        registry.register(id, makeManifest(id), `/extensions/${id}/bundle.js`);
        ids.push(id);
      }

      // Suspend and kill-switch a random subset
      const suspendedIds = new Set();
      const killedIds = new Set();
      for (const id of ids) {
        const r = rand();
        if (r < 0.2) {
          const entry = registry.lookup(id);
          entry.suspendedAt = Date.now();
          suspendedIds.add(id);
        } else if (r < 0.4) {
          registry.setKillSwitch(id, true);
          killedIds.add(id);
        }
      }

      const loaded = new Set(registry.listLoaded());
      for (const id of ids) {
        if (!suspendedIds.has(id) && !killedIds.has(id)) {
          expect(loaded.has(id)).toBe(true);
        }
      }
    }
  });

  it('listLoaded() count equals total minus suspended minus kill-switched (no overlap)', () => {
    const rand = seededRand(55);

    for (let iter = 0; iter < 100; iter++) {
      const total = Math.floor(rand() * 20) + 2;
      // Ensure no overlap: suspend first half, kill-switch second half
      const half = Math.floor(total / 2);

      const registry = new ExtensionRegistry();
      const ids = [];
      for (let i = 0; i < total; i++) {
        const id = `ext-${i}`;
        registry.register(id, makeManifest(id), `/extensions/${id}/bundle.js`);
        ids.push(id);
      }

      let suspendedCount = 0;
      let killedCount = 0;

      for (let i = 0; i < half; i++) {
        const entry = registry.lookup(ids[i]);
        entry.suspendedAt = Date.now();
        suspendedCount++;
      }
      for (let i = half; i < half + Math.floor(rand() * (total - half)); i++) {
        registry.setKillSwitch(ids[i], true);
        killedCount++;
      }

      const expectedCount = total - suspendedCount - killedCount;
      expect(registry.listLoaded()).toHaveLength(expectedCount);
    }
  });

  it('listLoaded() returns empty array when all extensions are suspended or kill-switched', () => {
    const registry = new ExtensionRegistry();
    registerN(registry, 5);

    // Suspend first 3
    for (let i = 1; i <= 3; i++) {
      const entry = registry.lookup(`ext-${i}`);
      entry.suspendedAt = Date.now();
    }
    // Kill-switch last 2
    registry.setKillSwitch('ext-4', true);
    registry.setKillSwitch('ext-5', true);

    expect(registry.listLoaded()).toEqual([]);
  });

  it('listLoaded() returns all IDs when no extensions are suspended or kill-switched', () => {
    const rand = seededRand(21);

    for (let iter = 0; iter < 50; iter++) {
      const total = Math.floor(rand() * 15) + 1;
      const registry = new ExtensionRegistry();
      const ids = registerN(registry, total);

      const loaded = registry.listLoaded();
      expect(loaded).toHaveLength(total);
      expect(loaded).toEqual(ids.sort());
    }
  });
});
