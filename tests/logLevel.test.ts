/**
 * Unit tests for log level colour utility and filter logic.
 *
 * Requirements: 2.3, 2.4
 */

import { describe, it, expect } from 'bun:test';
import { levelColour, filterByLevels } from '../src/utils/logLevel.ts';
import type { LogEntry } from '../src/utils/logLevel.ts';

// ---------------------------------------------------------------------------
// levelColour — Requirements 2.3
// ---------------------------------------------------------------------------

describe('levelColour()', () => {
  it('returns correct colour for DEBUG', () => {
    expect(levelColour('DEBUG')).toBe('#9ca3af');
  });

  it('returns correct colour for INFO', () => {
    expect(levelColour('INFO')).toBe('#f3f4f6');
  });

  it('returns correct colour for WARN', () => {
    expect(levelColour('WARN')).toBe('#f59e0b');
  });

  it('returns correct colour for ERROR', () => {
    expect(levelColour('ERROR')).toBe('#ef4444');
  });

  it('returns correct colour for FATAL', () => {
    expect(levelColour('FATAL')).toBe('#ff2222');
  });

  it('is case-insensitive — lowercase inputs', () => {
    expect(levelColour('debug')).toBe('#9ca3af');
    expect(levelColour('info')).toBe('#f3f4f6');
    expect(levelColour('warn')).toBe('#f59e0b');
    expect(levelColour('error')).toBe('#ef4444');
    expect(levelColour('fatal')).toBe('#ff2222');
  });

  it('is case-insensitive — mixed case inputs', () => {
    expect(levelColour('Debug')).toBe('#9ca3af');
    expect(levelColour('Info')).toBe('#f3f4f6');
    expect(levelColour('Warn')).toBe('#f59e0b');
    expect(levelColour('Error')).toBe('#ef4444');
    expect(levelColour('Fatal')).toBe('#ff2222');
  });

  it('returns a non-empty fallback for unknown levels', () => {
    const colour = levelColour('UNKNOWN');
    expect(typeof colour).toBe('string');
    expect(colour.length).toBeGreaterThan(0);
  });

  it('ERROR and FATAL have distinct colours', () => {
    expect(levelColour('ERROR')).not.toBe(levelColour('FATAL'));
  });

  it('all five known levels have pairwise-distinct colours', () => {
    const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];
    const colours = levels.map(levelColour);
    const unique = new Set(colours);
    expect(unique.size).toBe(levels.length);
  });
});

// ---------------------------------------------------------------------------
// filterByLevels — Requirements 2.4
// ---------------------------------------------------------------------------

const sampleEntries: LogEntry[] = [
  { level: 'DEBUG', message: 'debug msg' },
  { level: 'INFO',  message: 'info msg' },
  { level: 'WARN',  message: 'warn msg' },
  { level: 'ERROR', message: 'error msg' },
  { level: 'FATAL', message: 'fatal msg' },
];

describe('filterByLevels()', () => {
  it('returns only entries matching the selected level — single level (Set)', () => {
    const result = filterByLevels(sampleEntries, new Set(['ERROR']));
    expect(result).toHaveLength(1);
    expect(result[0].level).toBe('ERROR');
  });

  it('returns only entries matching the selected level — single level (array)', () => {
    const result = filterByLevels(sampleEntries, ['WARN']);
    expect(result).toHaveLength(1);
    expect(result[0].level).toBe('WARN');
  });

  it('returns entries for multiple selected levels (OR semantics)', () => {
    const result = filterByLevels(sampleEntries, new Set(['ERROR', 'FATAL']));
    expect(result).toHaveLength(2);
    const levels = result.map((e) => e.level);
    expect(levels).toContain('ERROR');
    expect(levels).toContain('FATAL');
  });

  it('returns all entries when all levels are selected', () => {
    const allLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];
    const result = filterByLevels(sampleEntries, allLevels);
    expect(result).toHaveLength(sampleEntries.length);
  });

  it('returns empty array when no levels are selected', () => {
    const result = filterByLevels(sampleEntries, new Set());
    expect(result).toHaveLength(0);
  });

  it('returns empty array when entries array is empty', () => {
    const result = filterByLevels([], new Set(['ERROR']));
    expect(result).toHaveLength(0);
  });

  it('does not mutate the original entries array', () => {
    const original = [...sampleEntries];
    filterByLevels(sampleEntries, new Set(['ERROR']));
    expect(sampleEntries).toEqual(original);
  });

  it('is a pure function — same inputs produce same outputs', () => {
    const a = filterByLevels(sampleEntries, ['DEBUG', 'INFO']);
    const b = filterByLevels(sampleEntries, ['DEBUG', 'INFO']);
    expect(a).toEqual(b);
  });

  it('accepts string array as selectedLevels', () => {
    const result = filterByLevels(sampleEntries, ['DEBUG', 'FATAL']);
    expect(result).toHaveLength(2);
  });

  it('accepts Set<string> as selectedLevels', () => {
    const result = filterByLevels(sampleEntries, new Set(['DEBUG', 'FATAL']));
    expect(result).toHaveLength(2);
  });

  it('handles entries with extra fields (LogEntry index signature)', () => {
    const entries: LogEntry[] = [
      { level: 'INFO', message: 'hello', timestamp: 12345, source: 'app' },
    ];
    const result = filterByLevels(entries, ['INFO']);
    expect(result).toHaveLength(1);
    expect(result[0].timestamp).toBe(12345);
  });
});
