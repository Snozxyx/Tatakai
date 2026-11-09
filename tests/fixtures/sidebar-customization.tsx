import { expect, mock } from 'bun:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';

mock.module('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, options?: { item?: string }) => options?.item ? `${key}:${options.item}` : key }) }));
mock.module('../../src/hooks/ui/useIsNativeApp', () => ({ useIsDesktopApp: () => true }));
mock.module('../../src/components/branding/BrandLogo', () => ({ BrandLogo: (props: any) => <img {...props} src="logo.png" /> }));
mock.module('../../src/components/ui/themed-checkbox', () => ({ ThemedCheckbox: (props: React.ComponentProps<'input'>) => <input type="checkbox" {...props} /> }));
mock.module('../../src/components/ui/button', () => ({ Button: ({ variant: _v, size: _s, ...props }: React.ComponentProps<'button'> & { variant?: string; size?: string }) => <button {...props} /> }));
const dom = new JSDOM('<div id="root"></div>', { url: 'https://tatakai.test' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
const { SidebarCustomizationEditor } = await import('../../src/components/settings/SidebarCustomizationEditor');
const { SIDEBAR_STORAGE_KEY } = await import('../../src/lib/sidebarCustomization');
const root = createRoot(document.getElementById('root')!);
const button = (text: string) => Array.from(document.querySelectorAll('button')).find(element => element.textContent === text)!;
const down = () => document.querySelector<HTMLButtonElement>('[aria-label="customization.sidebar.down:nav.home"]')!;
try {
  await act(async () => root.render(<SidebarCustomizationEditor />));
  await act(async () => down().click());
  expect(localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBeNull();
  expect(document.querySelector('[data-sidebar-preview] div[title]')!.getAttribute('title')).toBe('nav.search');
  await act(async () => button('customization.cancel').click());
  expect(document.querySelector('[data-sidebar-preview] div[title]')!.getAttribute('title')).toBe('nav.home');
  expect(localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBeNull();
  await act(async () => down().click());
  await act(async () => button('customization.save').click());
  expect(JSON.parse(localStorage.getItem(SIDEBAR_STORAGE_KEY)!).order[0]).toBe('search');
  await act(async () => button('customization.sidebar.reset').click());
  expect(localStorage.getItem(SIDEBAR_STORAGE_KEY)).not.toBeNull();
  await act(async () => button('customization.save').click());
  expect(localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBeNull();
  expect(document.querySelector('[data-sidebar-preview] [title="nav.settings"]')).not.toBeNull();
} finally { await act(async () => root.unmount()); dom.window.close(); }
console.log('SIDEBAR_PREVIEW_SAVE_CANCEL_OK');
