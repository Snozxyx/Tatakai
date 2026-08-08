// Feature: admin-dashboard-overhaul, Property 22: Custom ban duration validation range
// **Validates: Requirements 8.2, 8.7**
import { describe, test } from 'bun:test';
import * as fc from 'fast-check';
import { validateCustomDuration } from '../../src/utils/banUtils';

describe('Property 22: Custom ban duration validation range', () => {
  test('accepts all integers in [1, 8760]', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8760 }),
        (hours) => validateCustomDuration(hours) === true
      ),
      { numRuns: 100 }
    );
  });

  test('rejects zero and negative integers', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100000, max: 0 }),
        (hours) => validateCustomDuration(hours) === false
      ),
      { numRuns: 100 }
    );
  });

  test('rejects integers above 8760', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 8761, max: 200000 }),
        (hours) => validateCustomDuration(hours) === false
      ),
      { numRuns: 100 }
    );
  });

  test('rejects non-integer numbers', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.001), max: Math.fround(8759.999), noNaN: true }).filter(n => !Number.isInteger(n)),
        (hours) => validateCustomDuration(hours) === false
      ),
      { numRuns: 100 }
    );
  });
});
