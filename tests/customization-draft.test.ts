import { expect, test } from 'bun:test';
import { diffCustomizationValue } from '../src/lib/customizationDraft';
import { mergeCustomizationValue } from '../src/lib/customization';

test('a section draft patches only the changed section and leaves concurrent section edits intact', () => {
  const before = { sections: { a: { visible: true }, b: { layout: 'grid' } } };
  const after = { sections: { a: { visible: false }, b: { layout: 'grid' } } };
  const patch = diffCustomizationValue(before, after);
  expect(patch).toEqual({ sections: { a: { visible: false } } });
  expect(mergeCustomizationValue({ sections: { a: { visible: true }, b: { layout: 'shelf' }, c: { density: 'compact' } } }, patch)).toEqual({ sections: { a: { visible: false }, b: { layout: 'shelf' }, c: { density: 'compact' } } });
});
test('draft reset and removal persist tombstones while unchanged arrays produce no patch', () => {
  expect(diffCustomizationValue({ order: ['a'], sections: { a: { visible: false } } }, { order: ['a'], sections: { a: null } })).toEqual({ sections: { a: null } });
  expect(diffCustomizationValue({ a: 1 }, {})).toEqual({ a: null });
  expect(diffCustomizationValue({ order: ['a', 'b'] }, { order: ['a', 'b'] })).toBeUndefined();
});
