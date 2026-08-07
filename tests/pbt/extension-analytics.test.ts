// Feature: admin-dashboard-overhaul, Properties 13 & 14: Extension analytics
// Validates: Requirements 5.2, 5.4
import { describe, test } from 'bun:test';
import * as fc from 'fast-check';
import { topNExtensions, computeUninstallRate } from '../../src/utils/extensionAnalytics';
import type { ExtensionMetrics } from '../../src/types/admin-dashboard';

const extensionArb = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  totalInstalls: fc.integer({ min: 0, max: 100000 }),
  activeUsers: fc.integer({ min: 0, max: 100000 }),
  recentInstalls: fc.integer({ min: 0, max: 10000 }),
  healthScore: fc.float({ min: 0, max: 1, noNaN: true }),
  uninstallRate: fc.option(fc.float({ min: 0, max: 100, noNaN: true }), { nil: null }),
}) as fc.Arbitrary<ExtensionMetrics>;

describe('Property 13: Extension top-10 ordering', () => {
  test('returns min(dataset.length, 10) extensions', () => {
    fc.assert(
      fc.property(fc.array(extensionArb), (extensions) => {
        const result = topNExtensions(extensions, 10);
        return result.length === Math.min(extensions.length, 10);
      }),
      { numRuns: 100 }
    );
  });

  test('result is ordered by totalInstalls descending', () => {
    fc.assert(
      fc.property(fc.array(extensionArb), (extensions) => {
        const result = topNExtensions(extensions, 10);
        for (let i = 0; i < result.length - 1; i++) {
          if (result[i].totalInstalls < result[i + 1].totalInstalls) return false;
        }
        return true;
      }),
      { numRuns: 100 }
    );
  });

  test('does not mutate the input array', () => {
    fc.assert(
      fc.property(fc.array(extensionArb), (extensions) => {
        const originalOrder = extensions.map(e => e.id);
        topNExtensions(extensions, 10);
        return extensions.every((e, i) => e.id === originalOrder[i]);
      }),
      { numRuns: 100 }
    );
  });
});

describe('Property 14: Uninstall rate formula', () => {
  test('returns null when totalInstalls === 0', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10000 }),
        (activeUsers) => computeUninstallRate(0, activeUsers) === null
      ),
      { numRuns: 100 }
    );
  });

  test('formula: Math.round((totalInstalls - activeUsers) / totalInstalls * 1000) / 10', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100000 }),
        fc.integer({ min: 0, max: 100000 }),
        (totalInstalls, activeUsers) => {
          const result = computeUninstallRate(totalInstalls, activeUsers);
          const expected = Math.round((totalInstalls - activeUsers) / totalInstalls * 1000) / 10;
          return result === expected;
        }
      ),
      { numRuns: 100 }
    );
  });
});
