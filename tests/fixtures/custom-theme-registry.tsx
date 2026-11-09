import { expect, mock } from 'bun:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';

mock.module('../../src/contexts/AuthContext', () => ({ useAuth: () => { throw new Error('Custom themes must remain local'); } }));
mock.module('../../src/hooks/ui/useUiTranslation', () => ({ useUiTranslation() {} }));
mock.module('../../src/lib/uiI18n', () => ({ default: { t: (key: string) => key } }));
mock.module('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
mock.module('../../src/core/extensions/ExtensionRegistry', () => ({ extensionRegistry: { getThemes: () => [], subscribe: () => () => {} } }));
mock.module('../../src/lib/appSettingsPersistence', () => ({ readGuestSettingsFromCookie: () => ({}), writeGuestSettingsCookie() {} }));
const dom = new JSDOM('<div id="root"></div>', { url: 'https://tatakai.test' });
dom.window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })) as any;
Object.assign(globalThis, { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
const { useTheme, resolveColors, resolveThemePalette, THEME_COLORS, resolveThemeId } = await import('../../src/hooks/ui/useTheme');
const { publishCustomThemes, getCustomThemeSnapshot, getCustomThemeDefinitions } = await import('../../src/lib/customThemeRegistry');
const { ThemeSelector } = await import('../../src/components/settings/ThemeSelector');
const definitions = { 'custom:fixture': { name: 'My Spring', baseTheme: 'light-minimal' } };
const overrides = { 'custom:fixture': { palette: { primary: '20 70% 60%', background: '30 20% 96%' } } };
const original = JSON.stringify(THEME_COLORS);
expect(resolveColors('custom:fixture', definitions).isLight).toBe(true);
expect(resolveThemePalette('custom:fixture', overrides['custom:fixture'].palette, definitions).primary).toBe('20 70% 60%');
expect(getCustomThemeDefinitions()['custom:fixture']).toBeUndefined();
const preview = renderToStaticMarkup(<ThemeSelector customThemes={definitions} draftOverrides={overrides} selectedTheme="custom:fixture" onSelectTheme={() => {}} />);
expect(preview).toContain('My Spring'); expect(preview).toContain('hsl(20 70% 60%)');
expect(getCustomThemeDefinitions()['custom:fixture']).toBeUndefined();
let api: ReturnType<typeof useTheme>;
function Consumer() { api = useTheme(); return <span>{api.theme}</span>; }
const root = createRoot(document.getElementById('root')!);
try {
  await act(async () => root.render(<Consumer />));
  await act(async () => { publishCustomThemes({ version: 1, customThemes: definitions, themes: overrides }, 'guest'); api.setSelection({ mode: 'manual', theme: 'custom:fixture' }); });
  expect(api.theme).toBe('custom:fixture'); expect(api.themes).toContain('custom:fixture'); expect(api.themeInfo['custom:fixture'].name).toBe('My Spring');
  expect(resolveColors('custom:fixture').primary).toBe('20 70% 60%');
  expect(JSON.stringify(THEME_COLORS)).toBe(original);
  const snapshot = getCustomThemeSnapshot();
  publishCustomThemes({ version: 1, customThemes: definitions, themes: overrides }, 'guest');
  expect(getCustomThemeSnapshot()).toBe(snapshot);
  const cyclic = { 'custom:a': { name: 'A', baseTheme: 'custom:b' }, 'custom:b': { name: 'B', baseTheme: 'custom:a' } };
  expect(resolveColors('custom:a', cyclic)).toEqual(THEME_COLORS['cherry-blossom']);
  await act(async () => publishCustomThemes({ version: 1, customThemes: { 'custom:fixture': null }, themes: {} }, 'guest'));
  expect(api.theme).toBe('cherry-blossom'); expect(resolveThemeId('custom:fixture')).toBe('cherry-blossom');
  expect(JSON.stringify(THEME_COLORS)).toBe(original);
} finally { await act(async () => root.unmount()); dom.window.close(); }
console.log('CUSTOM_THEME_REGISTRY_OK');
