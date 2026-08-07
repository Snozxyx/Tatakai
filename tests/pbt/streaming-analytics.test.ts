// Feature: admin-dashboard-overhaul, Properties 16-19: Streaming Analytics
// Validates: Requirements 6.2, 6.3, 6.5, 6.6, 6.7
import { describe, test, expect } from 'bun:test';
import * as fc from 'fast-check';
import {
  peakConcurrentViewers,
  durationHistogram,
  topNContent,
  downloadCompletionRate,
} from '../../src/utils/streamingAnalytics';

// ---- Property 16: Peak concurrent viewer calculation ----
describe('Property 16: Peak concurrent viewer calculation', () => {
  test('returns 0 for empty array', () => {
    expect(peakConcurrentViewers([])).toBe(0);
  });

  test('max count in any 1-hour bucket equals the result', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 4102444800000 }), { maxLength: 100 }),
        (timestamps) => {
          const result = peakConcurrentViewers(timestamps);
          // Compute expected via same bucketing logic
          const buckets = new Map<number, number>();
          for (const ts of timestamps) {
            const b = Math.floor(ts / 3_600_000);
            buckets.set(b, (buckets.get(b) ?? 0) + 1);
          }
          const expected = timestamps.length === 0 ? 0 : Math.max(...buckets.values());
          return result === expected;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---- Property 17: Stream duration histogram completeness ----
describe('Property 17: Stream duration histogram completeness', () => {
  test('always returns exactly 4 buckets', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ watch_duration_seconds: fc.integer({ min: 0, max: 10000 }) })),
        (sessions) => durationHistogram(sessions).length === 4
      ),
      { numRuns: 100 }
    );
  });

  test('sum of bucket counts equals total session count', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ watch_duration_seconds: fc.integer({ min: 0, max: 10000 }) })),
        (sessions) => {
          const buckets = durationHistogram(sessions);
          const total = buckets.reduce((s, b) => s + b.count, 0);
          return total === sessions.length;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('each session falls into exactly one bucket', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10000 }),
        (seconds) => {
          const buckets = durationHistogram([{ watch_duration_seconds: seconds }]);
          const nonZero = buckets.filter(b => b.count > 0);
          return nonZero.length === 1 && nonZero[0].count === 1;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---- Property 18: Top-10 content by download count ----
describe('Property 18: Top-10 content by download count', () => {
  const downloadItemArb = fc.record({
    content_id: fc.uuid(),
    title: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
    completedCount: fc.integer({ min: 0, max: 100000 }),
  });

  test('returns min(dataset.length, 10) items', () => {
    fc.assert(
      fc.property(fc.array(downloadItemArb), (downloads) => {
        return topNContent(downloads, 10).length === Math.min(downloads.length, 10);
      }),
      { numRuns: 100 }
    );
  });

  test('result is ordered by completedCount descending', () => {
    fc.assert(
      fc.property(fc.array(downloadItemArb), (downloads) => {
        const result = topNContent(downloads, 10);
        for (let i = 0; i < result.length - 1; i++) {
          if (result[i].completedCount < result[i + 1].completedCount) return false;
        }
        return true;
      }),
      { numRuns: 100 }
    );
  });
});

// ---- Property 19: Download completion rate formula ----
describe('Property 19: Download completion rate formula', () => {
  const recordArb = fc.record({
    completed: fc.boolean(),
    watch_duration_seconds: fc.integer({ min: 0, max: 7200 }),
  });

  test('returns null when all records have watch_duration_seconds === 0', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ completed: fc.boolean(), watch_duration_seconds: fc.constant(0) })),
        (records) => downloadCompletionRate(records) === null
      ),
      { numRuns: 100 }
    );
  });

  test('formula: Math.round(completed/total * 1000) / 10 when denominator > 0', () => {
    fc.assert(
      fc.property(
        fc.array(recordArb).filter(rs => rs.some(r => r.watch_duration_seconds > 0)),
        (records) => {
          const result = downloadCompletionRate(records);
          const withDuration = records.filter(r => r.watch_duration_seconds > 0);
          const completed = withDuration.filter(r => r.completed).length;
          const expected = Math.round((completed / withDuration.length) * 1000) / 10;
          return result === expected;
        }
      ),
      { numRuns: 100 }
    );
  });
});
