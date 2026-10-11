import { describe, expect, test } from 'bun:test';
import { mergeSkipSegments } from '../src/core/player/skip-segments';

describe('Skip source precedence', () => {
  const typeOf = (skip: { type: string; end: number }) => skip.type;
  test('a source intro preserves the fallback outro and recap', () => {
    expect(mergeSkipSegments([{ type: 'op', end: 90 }], [{ type: 'mixed-op', end: 100 }, { type: 'ed', end: 1400 }, { type: 'recap', end: 30 }], typeOf))
      .toEqual([{ type: 'op', end: 90 }, { type: 'ed', end: 1400 }, { type: 'recap', end: 30 }]);
  });
  test('complete source timing overrides fallback timing for both families', () => {
    const source = [{ type: 'op', end: 90 }, { type: 'ed', end: 1400 }];
    expect(mergeSkipSegments(source, [{ type: 'mixed-ed', end: 1500 }], typeOf)).toEqual(source);
  });
});
