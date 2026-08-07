// Feature: admin-dashboard-overhaul, Property 30: Ban templates alphabetical ordering
// Validates: Requirements 12.1, 12.4
import { describe, test } from 'bun:test';
import * as fc from 'fast-check';
import { sortTemplatesAlpha } from '../../src/utils/banUtils';
import type { BanTemplate } from '../../src/types/admin-dashboard';

const safeMs = fc.integer({ min: 0, max: 4102444800000 });

const templateArb = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 100 }),
  reason: fc.string({ minLength: 1 }),
  duration_hours: fc.option(fc.integer({ min: 1, max: 8760 }), { nil: null }),
  created_by: fc.uuid(),
  created_at: safeMs.map(ms => new Date(ms).toISOString()),
}) as fc.Arbitrary<BanTemplate>;

describe('Property 30: Ban templates alphabetical ordering', () => {
  test('result is sorted case-insensitively by name (ascending)', () => {
    fc.assert(
      fc.property(fc.array(templateArb), (templates) => {
        const sorted = sortTemplatesAlpha(templates);
        for (let i = 0; i < sorted.length - 1; i++) {
          if (sorted[i].name.toLowerCase().localeCompare(sorted[i + 1].name.toLowerCase()) > 0) {
            return false;
          }
        }
        return true;
      }),
      { numRuns: 100 }
    );
  });

  test('result length equals input length', () => {
    fc.assert(
      fc.property(fc.array(templateArb), (templates) =>
        sortTemplatesAlpha(templates).length === templates.length
      ),
      { numRuns: 100 }
    );
  });

  test('does not mutate the input array order', () => {
    fc.assert(
      fc.property(fc.array(templateArb), (templates) => {
        const originalIds = templates.map(t => t.id);
        sortTemplatesAlpha(templates);
        return templates.every((t, i) => t.id === originalIds[i]);
      }),
      { numRuns: 100 }
    );
  });
});
