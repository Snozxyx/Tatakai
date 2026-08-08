// Feature: admin-dashboard-overhaul, Property 23: Ban duration display format
// Validates: Requirements 8.6
import { describe, test, expect } from 'bun:test';
import * as fc from 'fast-check';
import { formatBanDuration } from '../../src/utils/banUtils';

describe('Property 23: Ban duration display format', () => {
  const NOW = new Date('2024-06-15T12:00:00.000Z');

  test('returns "Banned · permanent" for null expiresAt', () => {
    expect(formatBanDuration(null, NOW)).toBe('Banned · permanent');
  });

  test('future expiry returns string starting with "Banned · expires in"', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8760 }), // hours in the future
        (hoursAhead) => {
          const expiresAt = new Date(NOW.getTime() + hoursAhead * 3_600_000).toISOString();
          const result = formatBanDuration(expiresAt, NOW);
          return result.startsWith('Banned · expires in ');
        }
      ),
      { numRuns: 100 }
    );
  });

  test('does not include "0 days" in output (zero days omitted)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 23 }), // less than 1 day ahead
        (hoursAhead) => {
          const expiresAt = new Date(NOW.getTime() + hoursAhead * 3_600_000).toISOString();
          const result = formatBanDuration(expiresAt, NOW);
          // Use word-boundary match to avoid false positives (e.g. "30 days" containing "0 days")
          return !/\b0 days?\b/.test(result);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('does not include "0 hours" when hours remainder is non-zero', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 23 }), // 1-23 hours added on top of full days
        fc.integer({ min: 1, max: 30 }), // number of full days
        (extraHours, days) => {
          const totalHours = days * 24 + extraHours;
          const expiresAt = new Date(NOW.getTime() + totalHours * 3_600_000).toISOString();
          const result = formatBanDuration(expiresAt, NOW);
          // Use word-boundary match: "0 hours" or "0 hour" as a standalone token
          // (avoids false positives like "20 hours" matching the substring "0 hours")
          return !/\b0 hours?\b/.test(result);
        }
      ),
      { numRuns: 100 }
    );
  });
});
