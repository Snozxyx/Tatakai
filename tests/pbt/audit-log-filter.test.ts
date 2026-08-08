// Feature: admin-dashboard-overhaul, Property 34 & 35: Audit log filters
// Validates: Requirements 13.4, 13.5
import { describe, test } from 'bun:test';
import * as fc from 'fast-check';
import { filterAuditLog } from '../../src/utils/banUtils';
import type { BanAuditRecord } from '../../src/types/admin-dashboard';

// Generate ISO timestamps from a safe integer range (epoch ms 0 to year 2100)
const isoTimestampArb = fc
  .integer({ min: 0, max: 4102444800000 })
  .map(ms => new Date(ms).toISOString());

const auditRecordArb = fc.record({
  id: fc.uuid(),
  user_id: fc.uuid(),
  username: fc.string({ minLength: 1, maxLength: 30 }),
  display_name: fc.string({ minLength: 1, maxLength: 50 }),
  action: fc.constantFrom('banned' as const, 'unbanned' as const),
  reason: fc.string({ minLength: 1 }),
  duration_hours: fc.option(fc.integer({ min: 1, max: 8760 }), { nil: null }),
  expires_at: fc.option(isoTimestampArb, { nil: null }),
  performed_by_display_name: fc.string({ minLength: 1 }),
  timestamp: isoTimestampArb,
}) as fc.Arbitrary<BanAuditRecord>;

describe('Property 34: Audit log search filter — case-insensitive containment', () => {
  test('filters by display_name or username containment (case-insensitive)', () => {
    fc.assert(
      fc.property(
        fc.array(auditRecordArb, { maxLength: 20 }),
        fc.string({ minLength: 1, maxLength: 10 }),
        (records, searchText) => {
          const result = filterAuditLog(records, searchText, 'all');
          const needle = searchText.toLowerCase();
          const expected = records.filter(r =>
            r.display_name.toLowerCase().includes(needle) ||
            r.username.toLowerCase().includes(needle)
          );
          return result.length === expected.length &&
            result.every(r =>
              r.display_name.toLowerCase().includes(needle) ||
              r.username.toLowerCase().includes(needle)
            );
        }
      ),
      { numRuns: 100 }
    );
  });

  test('empty search returns all records', () => {
    fc.assert(
      fc.property(
        fc.array(auditRecordArb, { maxLength: 20 }),
        (records) => filterAuditLog(records, '', 'all').length === records.length
      ),
      { numRuns: 100 }
    );
  });
});

describe('Property 35: Audit log action type filter', () => {
  test('filter "banned" returns only banned records', () => {
    fc.assert(
      fc.property(fc.array(auditRecordArb, { maxLength: 20 }), (records) => {
        const result = filterAuditLog(records, '', 'banned');
        return result.every(r => r.action === 'banned') &&
          result.length === records.filter(r => r.action === 'banned').length;
      }),
      { numRuns: 100 }
    );
  });

  test('filter "unbanned" returns only unbanned records', () => {
    fc.assert(
      fc.property(fc.array(auditRecordArb, { maxLength: 20 }), (records) => {
        const result = filterAuditLog(records, '', 'unbanned');
        return result.every(r => r.action === 'unbanned') &&
          result.length === records.filter(r => r.action === 'unbanned').length;
      }),
      { numRuns: 100 }
    );
  });

  test('filter "all" returns all records', () => {
    fc.assert(
      fc.property(fc.array(auditRecordArb, { maxLength: 20 }), (records) =>
        filterAuditLog(records, '', 'all').length === records.length
      ),
      { numRuns: 100 }
    );
  });
});
