import { expect, test } from 'bun:test';
import { defaultEmpressConfig, readEmpressConfig } from '../src/components/profile/themes/gothic-empress/config';
import { resolveProfileTheme } from '../src/components/profile/themes/registry';

test('Gothic Empress requires a validated configuration and verified owner entitlement', () => {
  const p = { version: 1 as const, selected: 'gothic-empress', configurations: { 'gothic-empress': defaultEmpressConfig() }, presets: [] };
  expect(resolveProfileTheme(p, {}, [{ key: 'premium-pro' }], true).id).toBe('gothic-empress');
  expect(resolveProfileTheme(p, { role: 'admin' }, [], true).id).toBe('gothic-empress');
  expect(resolveProfileTheme(p, {}, [], true).id).toBe('default');
  expect(resolveProfileTheme(p, { is_admin: true }, [], false).id).toBe('default');
  expect(resolveProfileTheme({ ...p, configurations: {} }, { is_admin: true }, [], true).id).toBe('default');
  expect(resolveProfileTheme({ ...p, configurations: { 'gothic-empress': { version: 2 } } }, { is_admin: true }, [], true).id).toBe('default');
});
test('invalid atmosphere values cannot generate unbounded GPU effects', () => {
  expect(readEmpressConfig(defaultEmpressConfig())).toEqual(defaultEmpressConfig());
  expect(readEmpressConfig({ version: 1, embers: Infinity })?.embers).toBe(.6);
  expect(readEmpressConfig({ version: 1, embers: -10 })?.embers).toBe(0);
  expect(readEmpressConfig({ version: 1, embers: 100 })?.embers).toBe(1);
  expect(readEmpressConfig({ version: 1, motion: false })?.motion).toBe(false);
  expect(readEmpressConfig({ version: '1' })).toBeNull();
  expect(readEmpressConfig([])).toBeNull();
});
