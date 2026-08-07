// Feature: admin-dashboard-overhaul, Properties 20-21: Performance Insights
// Validates: Requirements 7.1, 7.2
import { describe, test } from 'bun:test';
import * as fc from 'fast-check';
import { versionDistribution, adoptionRate } from '../../src/utils/performanceInsights';

const profileArb = fc.record({
  app_version: fc.option(
    fc.constantFrom('1.0.0', '1.1.0', '1.2.0', '2.0.0', '2.1.0'),
    { nil: null }
  ),
});

describe('Property 20: Version distribution sums to 100%', () => {
  test('percentages sum to ~100% when there are non-null versions', () => {
    fc.assert(
      fc.property(
        fc.array(profileArb, { minLength: 1, maxLength: 100 }).filter(
          ps => ps.some(p => p.app_version !== null)
        ),
        (profiles) => {
          const dist = versionDistribution(profiles);
          if (dist.length === 0) return true;
          const sum = dist.reduce((s, v) => s + v.percent, 0);
          return Math.abs(sum - 100) < 0.15; // floating-point tolerance
        }
      ),
      { numRuns: 100 }
    );
  });

  test('each version count matches actual count in profiles', () => {
    fc.assert(
      fc.property(fc.array(profileArb, { maxLength: 50 }), (profiles) => {
        const dist = versionDistribution(profiles);
        return dist.every(v => {
          const actual = profiles.filter(p => p.app_version === v.version).length;
          return v.count === actual;
        });
      }),
      { numRuns: 100 }
    );
  });
});

describe('Property 21: Update adoption rate formula', () => {
  test('adoption rate = (matching / total) * 100', () => {
    fc.assert(
      fc.property(
        fc.array(profileArb, { minLength: 1, maxLength: 100 }),
        fc.constantFrom('1.0.0', '1.1.0', '2.0.0'),
        (profiles, targetVersion) => {
          const rate = adoptionRate(profiles, { target_version: targetVersion });
          const matched = profiles.filter(p => p.app_version === targetVersion).length;
          const expected = (matched / profiles.length) * 100;
          return Math.abs(rate - expected) < 0.001;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('returns 0 for empty profiles array', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('1.0.0', '2.0.0'),
        (targetVersion) => adoptionRate([], { target_version: targetVersion }) === 0
      ),
      { numRuns: 100 }
    );
  });
});
