import { expect, test } from 'bun:test';
import { normalizeThemeSelection, resolveThemeSelection } from '../src/lib/themeSelection';

test('Follow System resolves independently selected palettes without changing the saved manual theme', () => {
  const selection = normalizeThemeSelection({ mode: 'system', theme: 'blood-moon', lightTheme: 'light-sakura', darkTheme: 'midnight' });
  expect(resolveThemeSelection(selection, false)).toBe('light-sakura');
  expect(resolveThemeSelection(selection, true)).toBe('midnight');
  expect(selection.theme).toBe('blood-moon');
  expect(resolveThemeSelection({ ...selection, mode: 'manual' }, false)).toBe('blood-moon');
});
test('legacy manual and extension theme IDs survive normalization', () => {
  expect(normalizeThemeSelection({ theme: 'extension:custom' }).theme).toBe('extension:custom');
  expect(normalizeThemeSelection({ theme: 'midnight' }).mode).toBe('manual');
  expect(resolveThemeSelection({ mode: 'system', theme: 'midnight' }, false)).toBe('light-minimal');
});
