import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_THEME, readThemeForSplash } from '../desktop/services/theme-bridge.cjs';
import { DEFAULT_THEME_SELECTION, normalizeThemeSelection } from '../src/lib/themeSelection';

test('fresh, reset and invalid startup fallbacks use Cherry Blossom while saved choices stay explicit', () => {
  expect(DEFAULT_THEME_SELECTION.theme).toBe('cherry-blossom');
  expect(DEFAULT_THEME_SELECTION.mode).toBe('manual');
  expect(DEFAULT_THEME_SELECTION.lightTheme).toBe('light-minimal');
  expect(normalizeThemeSelection(null).theme).toBe('cherry-blossom');
  expect(normalizeThemeSelection({ theme: 'midnight' }).theme).toBe('midnight');
  expect(DEFAULT_THEME).toBe('cherry-blossom');
  const app = { getPath: () => '/fixture' };
  const native = (value: unknown) => readThemeForSplash(app, { existsSync: () => true, readFileSync: () => JSON.stringify(value) }, path);
  expect(native({ theme: 'missing-theme', primary: '0 0% 0%' }).theme).toBe('cherry-blossom');
  expect(native({ theme: 'missing-theme', primary: '0 0% 0%' }).primary).toBe('340 82% 65%');
  expect(native({ theme: 'midnight', primary: '239 84% 67%' }).theme).toBe('midnight');
  expect(native({ theme: 'extension:custom', primary: '10 50% 60%' }).theme).toBe('extension:custom');
});
test('the pre-JavaScript palette and native splash match the Cherry Blossom startup palette', () => {
  const css = readFileSync('src/index.css', 'utf8').split('/* Desktop sidebar layout */')[0];
  expect(css).toContain('--background: 340 15% 5%');
  const allCss = readFileSync('src/index.css', 'utf8');
  expect(allCss).toContain('--primary: 340 82% 65%');
  expect(allCss).toContain('--secondary: 320 70% 55%');
  expect(readFileSync('desktop/splash.html', 'utf8')).toContain('--bg:          hsl(340 15% 5%)');
});
