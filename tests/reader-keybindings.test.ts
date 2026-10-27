import { expect, test } from 'bun:test';
import { assignReaderKeybind, DEFAULT_READER_KEYBINDS, normalizeReaderKeybinds, resolveReaderAction } from '../src/lib/reader/keybindings';

test('existing reader preferences gain scroll bindings without losing custom keys', () => {
  const bindings = normalizeReaderKeybinds({ nextPage: 'j', prevPage: 'k' });
  expect(resolveReaderAction(bindings, 'arrowdown')).toBe('scrollDown');
  expect(resolveReaderAction(bindings, 'arrowup')).toBe('scrollUp');
  expect(resolveReaderAction(bindings, 'j')).toBe('nextPage');
});

test('reassigned scroll keys stay cleared after saving and loading', () => {
  const reassigned = assignReaderKeybind(DEFAULT_READER_KEYBINDS, 'nextPage', 'arrowdown');
  const restored = normalizeReaderKeybinds(JSON.parse(JSON.stringify(reassigned)));
  expect(restored.scrollDown).toBe('');
  expect(resolveReaderAction(restored, 'arrowdown')).toBe('nextPage');
});
