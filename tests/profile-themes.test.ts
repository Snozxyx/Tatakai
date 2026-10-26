import { describe, expect, test } from 'bun:test';
import { defaultSekaiConfig, hasCustomProfileAccess, mobileWidgets, moveMobileWidget, readSekaiConfig, readThemePreferences, safeThemeImage } from '../src/lib/profileThemes';
import { PROFILE_THEMES, resolveProfileTheme } from '../src/components/profile/themes/registry';

describe('custom profile eligibility and resolution', () => {
  test('only Booster, Pro, Ultra and both admin representations qualify', () => {
    for (const key of ['booster', 'premium-pro', 'premium-ultra']) expect(hasCustomProfileAccess({}, [{ key }])).toBe(true);
    for (const key of ['premium-go', 'moderator', 'developer', 'premium-forged']) expect(hasCustomProfileAccess({}, [{ key }])).toBe(false);
    expect(hasCustomProfileAccess({ is_admin: true })).toBe(true);
    expect(hasCustomProfileAccess({ role: 'admin' })).toBe(true);
    expect(hasCustomProfileAccess({ is_moderator: true, role: 'moderator' })).toBe(false);
    expect(hasCustomProfileAccess({ is_premium: true } as never)).toBe(false);
  });
  test('missing settings, unknown themes and unsupported versions preserve Default', () => {
    expect(readThemePreferences(null).selected).toBe('default');
    const p = { version: 1 as const, selected: 'sekaipop', configurations: { sekaipop: defaultSekaiConfig() }, presets: [] };
    expect(resolveProfileTheme(p, {}, [{ key: 'booster' }], true).id).toBe('sekaipop');
    expect(resolveProfileTheme(p, { is_admin: true }, [], false).id).toBe('default');
    expect(resolveProfileTheme(p, {}, [], true).id).toBe('default');
    expect(resolveProfileTheme({ ...p, selected: 'future-unknown' }, { is_admin: true }, [], true).id).toBe('default');
    expect(resolveProfileTheme({ ...p, configurations: { sekaipop: { version: 2 } } }, { is_admin: true }, [], true).id).toBe('default');
  });
  test('new registry entries resolve without theme-specific resolver branches', () => {
    const themes = PROFILE_THEMES as unknown as { id: string }[];
    themes.push({ id: 'test-future', label: 'Future', entitled: () => true, parse: (v: unknown) => v, version: 1, defaults: () => ({ version: 1 }) } as never);
    try { expect(resolveProfileTheme({ version: 1, selected: 'test-future', configurations: { 'test-future': { version: 1 } }, presets: [] }, {}, [], true).id).toBe('test-future'); }
    finally { themes.pop(); }
  });
});
describe('scrapbook configuration', () => {
  test('Uchiha resolves with valid settings and verified custom-profile access', () => {
    const p = { version: 1 as const, selected: 'uchiha', configurations: { uchiha: { version: 1 } }, presets: [] };
    expect(resolveProfileTheme(p, {}, [{ key: 'premium-pro' }], true).id).toBe('uchiha');
    expect(resolveProfileTheme(p, { is_admin: true }, [], true).id).toBe('uchiha');
    expect(resolveProfileTheme(p, {}, [], true).id).toBe('default');
    expect(resolveProfileTheme(p, { is_admin: true }, [], false).id).toBe('default');
    expect(resolveProfileTheme({ ...p, configurations: { uchiha: { version: 2 } } }, { is_admin: true }, [], true).id).toBe('default');
    expect(resolveProfileTheme({ ...p, configurations: {} }, { is_admin: true }, [], true).id).toBe('default');
  });
  test('defaults round-trip and every widget fits the canvas', () => {
    const config = defaultSekaiConfig();
    expect(readSekaiConfig(config)).toEqual(config);
    for (const w of config.widgets) { expect(w.x + w.w).toBeLessThanOrEqual(1144); expect(w.y + w.h).toBeLessThanOrEqual(4000); }
  });
  test('malformed, duplicated and oversized layouts fail safely', () => {
    const config = defaultSekaiConfig();
    expect(readSekaiConfig({ ...config, version: 2 })).toBeNull();
    expect(readSekaiConfig({ ...config, widgets: [] })).toBeNull();
    expect(readSekaiConfig({ ...config, widgets: [...config.widgets, config.widgets[0]] })).toBeNull();
    expect(readSekaiConfig({ ...config, widgets: Array(33).fill(config.widgets[0]) })).toBeNull();
    const parsed = readSekaiConfig({ ...config, widgets: config.widgets.map(w => ({ ...w, x: 9000, y: -1, rotation: 500, visible: false })) })!;
    expect(parsed.widgets[0].visible).toBe(true);
    for (const w of parsed.widgets) { expect(w.x + w.w).toBeLessThanOrEqual(1144); expect(w.y).toBe(0); expect(w.rotation).toBe(12); }
  });
  test('unsafe image schemes, credentials and malformed colors never reach styles', () => {
    for (const url of ['javascript:alert(1)', 'data:image/svg+xml,script', 'https://name:password@example.com/x', 'file:///x', '//evil.test']) expect(safeThemeImage(url)).toBe('');
    expect(safeThemeImage('https://example.com/art.jpg')).toBe('https://example.com/art.jpg');
    const config = defaultSekaiConfig();
    const parsed = readSekaiConfig({ ...config, colors: { ink: 'red;display:none' }, wallpaper: { url: 'javascript:alert(1)', x: Infinity } })!;
    expect(parsed.colors.ink).toBe(config.colors.ink); expect(parsed.wallpaper.url).toBe(''); expect(parsed.wallpaper.x).toBe(50);
  });
  test('mobile order persists independently and missing ids recover in desktop order', () => {
    const config = defaultSekaiConfig(); const order = mobileWidgets(config);
    const changed = moveMobileWidget(config, order[1].id, -1);
    expect(mobileWidgets(changed)[0].id).toBe(order[1].id);
    expect(changed.widgets).toEqual(config.widgets);
    expect(readSekaiConfig({ ...changed, mobile: [...changed.mobile, changed.mobile[0], { id: 'missing', width: 'half' }] })!.mobile).toHaveLength(config.widgets.length);
  });
  test('other app settings and saved theme payloads are read without mutation', () => {
    const settings = { profile: { ambientColor: '#123456' }, player: { quality: 'best' }, profileThemes: { version: 1, selected: 'default', configurations: { sekaipop: defaultSekaiConfig() }, presets: [] } };
    const before = JSON.stringify(settings); const parsed = readThemePreferences(settings);
    expect(parsed.configurations.sekaipop).toEqual(defaultSekaiConfig()); expect(JSON.stringify(settings)).toBe(before);
  });
});
