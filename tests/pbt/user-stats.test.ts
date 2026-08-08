// Feature: admin-dashboard-overhaul, Properties 9-12: User Stats
// Validates: Requirements 4.2, 4.3, 4.4, 4.6
import { describe, test } from 'bun:test';
import * as fc from 'fast-check';
import { groupSignupsByPeriod, computeDau, computeRetention, topCountries } from '../../src/utils/userStats';

const safeMs = fc.integer({ min: 0, max: 4102444800000 });
const isoArb = safeMs.map(ms => new Date(ms).toISOString());
const periodArb = fc.constantFrom('day' as const, 'week' as const, 'month' as const);

describe('Property 9: Signup time-series grouping invariant', () => {
  test('sum of group counts equals total timestamp count', () => {
    fc.assert(
      fc.property(
        fc.array(isoArb, { maxLength: 50 }),
        periodArb,
        (timestamps, period) => {
          const groups = groupSignupsByPeriod(timestamps, period);
          const total = groups.reduce((s, g) => s + g.count, 0);
          return total === timestamps.length;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 10: DAU count accuracy', () => {
  test('all DAU values are non-negative integers', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            user_id: fc.option(fc.uuid(), { nil: null }),
            created_at: isoArb,
          }),
          { maxLength: 50 }
        ),
        (pageVisits) => {
          const dauSeries = computeDau(pageVisits);
          return dauSeries.every(d => Number.isInteger(d.dau) && d.dau >= 0);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('null user_ids are excluded from DAU counts', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ user_id: fc.constant(null), created_at: isoArb }), { maxLength: 20 }),
        (nullVisits) => {
          const result = computeDau(nullVisits);
          return result.every(d => d.dau === 0);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 11: 7-day retention formula', () => {
  test('retention is in [0, 100]', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ user_id: fc.uuid(), created_at: isoArb }), { maxLength: 30 }),
        fc.array(fc.record({ user_id: fc.uuid(), created_at: isoArb }), { maxLength: 50 }),
        (cohort, activity) => {
          const pct = computeRetention(cohort, activity);
          return pct >= 0 && pct <= 100;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('returns 0 for empty cohort', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ user_id: fc.uuid(), created_at: isoArb })),
        (activity) => computeRetention([], activity) === 0
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 12: Top-N countries selection', () => {
  test('returns at most n countries', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ country: fc.option(fc.string({ minLength: 2, maxLength: 2 }), { nil: null }) }), { maxLength: 50 }),
        fc.integer({ min: 1, max: 10 }),
        (signups, n) => topCountries(signups, n).length <= n
      ),
      { numRuns: 100 }
    );
  });

  test('list is sorted by count descending', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ country: fc.option(fc.string({ minLength: 2, maxLength: 2 }), { nil: null }) }), { maxLength: 50 }),
        (signups) => {
          const result = topCountries(signups, 5);
          for (let i = 0; i < result.length - 1; i++) {
            if (result[i].count < result[i + 1].count) return false;
          }
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });
});
