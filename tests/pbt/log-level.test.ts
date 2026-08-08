// Feature: admin-dashboard-overhaul, Properties 4 & 5: Log level utilities
// Validates: Requirements 2.3, 2.4
import { describe, test, expect } from 'bun:test';
import * as fc from 'fast-check';
import { levelColour, filterByLevels } from '../../src/utils/logLevel';
import type { LogEntry } from '../../src/utils/logLevel';

const KNOWN_LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'] as const;

// Property 4: Log level colour distinctness
describe('Property 4: Log level colour distinctness', () => {
  test('all 5 known levels return non-empty CSS colour strings', () => {
    for (const level of KNOWN_LEVELS) {
      const colour = levelColour(level);
      expect(colour.length).toBeGreaterThan(0);
    }
  });

  test('all 5 known levels return pairwise-distinct colours', () => {
    const colours = KNOWN_LEVELS.map(l => levelColour(l));
    const unique = new Set(colours);
    expect(unique.size).toBe(KNOWN_LEVELS.length);
  });

  test('levelColour is deterministic (same input always same output)', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...KNOWN_LEVELS),
        (level) => levelColour(level) === levelColour(level)
      ),
      { numRuns: 100 }
    );
  });
});

// Property 5: Log level filter — OR semantics
describe('Property 5: Log level filter — OR semantics', () => {
  const logEntryArb = fc.record({
    level: fc.constantFrom(...KNOWN_LEVELS),
    message: fc.string({ minLength: 1 }),
  }) as fc.Arbitrary<LogEntry>;

  test('filtered result contains exactly entries whose level is in selectedLevels', () => {
    fc.assert(
      fc.property(
        fc.array(logEntryArb, { maxLength: 50 }),
        fc.subarray([...KNOWN_LEVELS], { minLength: 1 }),
        (entries, selectedLevels) => {
          const levelSet = new Set(selectedLevels);
          const result = filterByLevels(entries, levelSet);
          const expected = entries.filter(e => levelSet.has(e.level as typeof KNOWN_LEVELS[number]));
          return (
            result.length === expected.length &&
            result.every(e => levelSet.has(e.level as typeof KNOWN_LEVELS[number]))
          );
        }
      ),
      { numRuns: 100 }
    );
  });

  test('empty selectedLevels returns empty array', () => {
    fc.assert(
      fc.property(
        fc.array(logEntryArb, { maxLength: 20 }),
        (entries) => filterByLevels(entries, new Set()).length === 0
      ),
      { numRuns: 100 }
    );
  });

  test('all levels selected returns all entries', () => {
    fc.assert(
      fc.property(
        fc.array(logEntryArb, { maxLength: 20 }),
        (entries) => filterByLevels(entries, new Set(KNOWN_LEVELS)).length === entries.length
      ),
      { numRuns: 100 }
    );
  });
});
