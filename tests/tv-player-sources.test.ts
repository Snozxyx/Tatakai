import { expect, test } from 'bun:test';
import { resolveNativeSourceSelection } from '../src/core/tv/playerSources';

test('native server selection follows identity when discovery reorders the list', () => {
  expect(resolveNativeSourceSelection([{ id: 'new' }, { id: 'chosen' }, { id: 'old' }], { sourceId: 'chosen', sourceIndex: 0 })).toBe(1);
});
test('removed servers and invalid selections return to source discovery instead of playing another server', () => {
  const sources = [{ id: 'available' }];
  for (const event of [{ sourceId: 'removed', sourceIndex: 0 }, { sourceIndex: -1 }, { sourceIndex: 1 }, { sourceIndex: .5 }, { sourceIndex: NaN }, {}])
    expect(resolveNativeSourceSelection(sources, event)).toBeUndefined();
  expect(resolveNativeSourceSelection(sources, { sourceIndex: 0 })).toBe(0);
});
