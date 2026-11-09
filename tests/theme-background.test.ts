import { expect, test } from 'bun:test';
import { appThemeBackground } from '../src/lib/themeBackground';
test('dedicated theme backgrounds win and explicit palette canvas colors apply globally', () => {
  expect(appThemeBackground({}, '340 15% 5%')).toBeUndefined();
  expect(appThemeBackground({ palette: { primary: '20 70% 50%' } }, '340 15% 5%')).toBeUndefined();
  expect(appThemeBackground({ palette: { background: '120 35% 14%' } }, '120 35% 14%')).toEqual({ type: 'solid', color: 'hsl(120 35% 14%)' });
  const gradient = { type: 'gradient' as const, gradient: 'linear-gradient(90deg,#123,#456)' };
  expect(appThemeBackground({ background: gradient, palette: { background: '120 35% 14%' } }, '120 35% 14%')).toBe(gradient);
  expect(appThemeBackground({ palette: { background: 'invalid' } }, '340 15% 5%')).toBeUndefined();
});
