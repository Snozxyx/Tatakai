import { expect, mock } from 'bun:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
let cloudWrites = 0;
mock.module('../../src/contexts/AuthContext', () => ({ useAuth: () => { throw new Error('Theme preferences must not read account state'); } }));
mock.module('../../src/hooks/ui/useUiTranslation', () => ({ useUiTranslation() {} }));
mock.module('../../src/lib/uiI18n', () => ({ default: { t: (key: string) => key } }));
mock.module('../../src/core/extensions/ExtensionRegistry', () => ({ extensionRegistry: { getThemes: () => [], subscribe: () => () => {} } }));
mock.module('../../src/lib/appSettingsPersistence', () => ({ readGuestSettingsFromCookie: () => ({}), writeGuestSettingsCookie() {}, readProfileAppSettings: () => { throw new Error('No profile hydration'); }, saveAccountSettingsPatch: () => { cloudWrites++; return Promise.resolve({}); } }));
const dom = new JSDOM('<div id="root"></div>', { url: 'https://tatakai.test' });
const media = { matches: false, addEventListener() {}, removeEventListener() {} };
dom.window.matchMedia = (() => media) as any;
Object.assign(globalThis, { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
const { useTheme, resolveThemeId, resolveColors } = await import('../../src/hooks/ui/useTheme');
let api: ReturnType<typeof useTheme>;
function Consumer() { api = useTheme(); return <span>{api.theme}:{String(api.reduceMotion)}:{String(api.highContrast)}</span>; }
const root = createRoot(document.getElementById('root')!);
try {
  await act(async () => root.render(<Consumer />));
  expect(api.theme).toBe('cherry-blossom');
  expect(api.selection.mode).toBe('manual');
  expect(resolveThemeId('missing-theme')).toBe('cherry-blossom');
  expect(resolveThemeId('__proto__')).toBe('cherry-blossom');
  expect(resolveColors('missing-theme')).toEqual(resolveColors('cherry-blossom'));
  await act(async () => { api.setSelection({ mode: 'system', theme: 'midnight', lightTheme: 'light-sakura', darkTheme: 'blood-moon' }); api.setReduceMotion(true); api.setHighContrast(true); });
  expect(document.querySelector('span')!.textContent).toBe('light-sakura:true:true');
  expect(JSON.parse(localStorage.getItem('tatakai-theme-selection')!).mode).toBe('system');
  await act(async () => root.render(<Consumer key="auth-change" />));
  expect(document.querySelector('span')!.textContent).toBe('light-sakura:true:true');
  expect(cloudWrites).toBe(0);
} finally { await act(async () => root.unmount()); dom.window.close(); }
console.log('LOCAL_THEME_STORE_OK');
