import { expect, test } from 'bun:test';
import { defaultMidnightLofiConfig, readMidnightLofiConfig } from '../src/components/profile/themes/midnight-lofi/config';
import { resolveProfileTheme } from '../src/components/profile/themes/registry';

test('Midnight Lo-Fi requires a validated configuration and verified owner entitlement', () => {
  const p = {
    version: 1 as const,
    selected: 'midnight-lofi',
    configurations: { 'midnight-lofi': defaultMidnightLofiConfig() },
    presets: [],
  };

  expect(resolveProfileTheme(p, {}, [{ key: 'premium-pro' }], true).id).toBe('midnight-lofi');
  expect(resolveProfileTheme(p, {}, [{ key: 'booster' }], true).id).toBe('midnight-lofi');
  expect(resolveProfileTheme(p, {}, [{ key: 'premium-ultra' }], true).id).toBe('midnight-lofi');
  expect(resolveProfileTheme(p, { role: 'admin' }, [], true).id).toBe('midnight-lofi');
  expect(resolveProfileTheme(p, { is_admin: true }, [], true).id).toBe('midnight-lofi');

  // Unverified or missing entitlement returns default
  expect(resolveProfileTheme(p, {}, [], true).id).toBe('default');
  expect(resolveProfileTheme(p, { is_admin: true }, [], false).id).toBe('default');
  expect(resolveProfileTheme({ ...p, configurations: {} }, { is_admin: true }, [], true).id).toBe('default');
  expect(
    resolveProfileTheme(
      { ...p, configurations: { 'midnight-lofi': { version: 2 } } },
      { is_admin: true },
      [],
      true
    ).id
  ).toBe('default');
});

test('Midnight Lo-Fi config clamps atmosphere and rejects invalid payloads', () => {
  const defaults = defaultMidnightLofiConfig();
  expect(readMidnightLofiConfig(defaults)).toEqual(defaults);

  // Clamping glowIntensity
  expect(readMidnightLofiConfig({ version: 1, glowIntensity: Infinity })?.glowIntensity).toBe(0.7);
  expect(readMidnightLofiConfig({ version: 1, glowIntensity: -5 })?.glowIntensity).toBe(0);
  expect(readMidnightLofiConfig({ version: 1, glowIntensity: 100 })?.glowIntensity).toBe(1);
  expect(readMidnightLofiConfig({ version: 1, glowIntensity: 0.35 })?.glowIntensity).toBe(0.35);

  // Accents fallback
  expect(readMidnightLofiConfig({ version: 1, accent: 'amber' })?.accent).toBe('amber');
  expect(readMidnightLofiConfig({ version: 1, accent: 'violet' })?.accent).toBe('violet');
  expect(readMidnightLofiConfig({ version: 1, accent: 'neon-green' })?.accent).toBe('cyan');

  // Motion and toggles
  expect(readMidnightLofiConfig({ version: 1, motion: false })?.motion).toBe(false);
  expect(readMidnightLofiConfig({ version: 1, scanlines: false })?.scanlines).toBe(false);
  expect(readMidnightLofiConfig({ version: 1, japaneseAccents: false })?.japaneseAccents).toBe(false);

  // Invalid root inputs
  expect(readMidnightLofiConfig({ version: '1' })).toBeNull();
  expect(readMidnightLofiConfig([])).toBeNull();
  expect(readMidnightLofiConfig(null)).toBeNull();
  expect(readMidnightLofiConfig(undefined)).toBeNull();
});
