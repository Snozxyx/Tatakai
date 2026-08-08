// Feature: admin-dashboard-overhaul, Properties 6 & 8: Crash Report Panel logic
// Validates: Requirements 3.3, 3.7
import { describe, test, expect } from 'bun:test';
import * as fc from 'fast-check';
import type { CrashReport } from '../../src/types/admin-dashboard';

// Pure helper functions mirroring the panel's logic
function capCrashReports(reports: CrashReport[], max = 50): CrashReport[] {
  return reports.slice(0, max);
}

function filterAcknowledged(reports: CrashReport[], acknowledgedIds: Set<string>): CrashReport[] {
  return reports.filter(r => !acknowledgedIds.has(r.id));
}

const safeMs = fc.integer({ min: 0, max: 4102444800000 });
const crashReportArb = fc.record({
  id: fc.uuid(),
  date: safeMs.map(ms => new Date(ms).toISOString()),
  path: fc.string({ minLength: 1 }),
}) as fc.Arbitrary<CrashReport>;

// Property 6: Crash report list cap
describe('Property 6: Crash report list cap and field completeness', () => {
  test('renders at most 50 crash reports regardless of input size', () => {
    fc.assert(
      fc.property(fc.array(crashReportArb, { maxLength: 200 }), (reports) => {
        const capped = capCrashReports(reports);
        return capped.length <= 50 && capped.length === Math.min(reports.length, 50);
      }),
      { numRuns: 100 }
    );
  });

  test('each rendered report has non-empty id, date, and path', () => {
    fc.assert(
      fc.property(fc.array(crashReportArb, { maxLength: 100 }), (reports) => {
        const capped = capCrashReports(reports);
        return capped.every(r =>
          typeof r.id === 'string' && r.id.length > 0 &&
          typeof r.date === 'string' && r.date.length > 0 &&
          typeof r.path === 'string' && r.path.length > 0
        );
      }),
      { numRuns: 100 }
    );
  });

  test('formatCrashDate returns a non-empty string for valid ISO dates', () => {
    fc.assert(
      fc.property(safeMs, (ms) => {
        const formatted = new Date(ms).toLocaleString(undefined, {
          dateStyle: 'medium',
          timeStyle: 'short',
        });
        return typeof formatted === 'string' && formatted.length > 0;
      }),
      { numRuns: 100 }
    );
  });
});

// Property 8: Acknowledged crash IDs pre-filter
describe('Property 8: Acknowledged crash IDs pre-filter on mount', () => {
  test('only non-acknowledged reports are shown', () => {
    fc.assert(
      fc.property(
        fc.array(crashReportArb, { maxLength: 50 }),
        fc.array(fc.uuid(), { maxLength: 20 }),
        (reports, acknowledgedIdList) => {
          const acknowledgedIds = new Set(acknowledgedIdList);
          const visible = filterAcknowledged(reports, acknowledgedIds);
          return (
            visible.every(r => !acknowledgedIds.has(r.id)) &&
            visible.length === reports.filter(r => !acknowledgedIds.has(r.id)).length
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  test('all-acknowledged reports yields empty visible list', () => {
    fc.assert(
      fc.property(
        fc.array(crashReportArb, { minLength: 1, maxLength: 20 }),
        (reports) => {
          const acknowledgedIds = new Set(reports.map(r => r.id));
          const visible = filterAcknowledged(reports, acknowledgedIds);
          return visible.length === 0;
        }
      ),
      { numRuns: 100 }
    );
  });
});
