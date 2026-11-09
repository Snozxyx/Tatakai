import { expect, mock } from 'bun:test';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost:8090/' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
mock.module('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, options?: { item?: string }) => options?.item ? `${key}:${options.item}` : key }) }));
mock.module('../../src/hooks/ui/useIsNativeApp', () => ({ useIsDesktopApp: () => true }));
mock.module('../../src/components/branding/BrandLogo', () => ({ BrandLogo: (props: any) => <img {...props} src="logo.png" /> }));
mock.module('../../src/components/ui/themed-checkbox', () => ({ ThemedCheckbox: (props: React.ComponentProps<'input'>) => <input type="checkbox" {...props} /> }));
mock.module('../../src/components/ui/themed-select', () => ({ ThemedSelect: (props: React.ComponentProps<'select'>) => <select {...props} /> }));
mock.module('../../src/components/ui/button', () => ({ Button: ({ variant: _v, size: _s, ...props }: React.ComponentProps<'button'> & { variant?: string; size?: string }) => <button {...props} /> }));
const { createRoot } = await import('react-dom/client');
const { SidebarCustomizationEditor } = await import('../../src/components/settings/SidebarCustomizationEditor');
const { SIDEBAR_STORAGE_KEY } = await import('../../src/lib/sidebarCustomization');
const root = createRoot(document.getElementById('root')!);
const click = async (text: string) => { await act(async () => Array.from(document.querySelectorAll('button')).find(button => button.textContent === text)!.click()); };
const fill = async (label: string, value: string) => { await act(async () => { const input = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!; Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); }); };
async function create() {
  await click('customization.sidebar.addShortcut');
  await fill('customization.sidebar.shortcutName', 'My anime');
  await fill('customization.sidebar.shortcutRoute', 'https://tatakai.me/anime/anilist%3A21?q=mine#details');
  await act(async () => { const select = document.querySelector<HTMLSelectElement>('[aria-label="customization.sidebar.openMode"]')!; select.value = 'quick-view'; select.dispatchEvent(new dom.window.Event('change', { bubbles: true })); });
  await click('customization.sidebar.createShortcut');
}
const remove = async () => { await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="customization.sidebar.removeShortcut:My anime"]')!.click()); };
try {
  await act(async () => root.render(<SidebarCustomizationEditor />));
  await create();
  expect(document.querySelector('[data-sidebar-preview] [title="My anime"]')).not.toBeNull();
  expect(localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBeNull();
  await click('customization.cancel');
  expect(document.querySelector('[data-sidebar-preview] [title="My anime"]')).toBeNull();
  await create(); await click('customization.save');
  const saved = JSON.parse(localStorage.getItem(SIDEBAR_STORAGE_KEY)!);
  expect(Object.values(saved.links)[0]).toMatchObject({ path: '/anime/anilist%3A21?q=mine#details', mode: 'quick-view' });
  await remove(); expect(localStorage.getItem(SIDEBAR_STORAGE_KEY)).not.toBeNull();
  await click('customization.cancel'); expect(document.querySelector('[data-sidebar-preview] [title="My anime"]')).not.toBeNull();
  await remove(); await click('customization.save'); expect(localStorage.getItem(SIDEBAR_STORAGE_KEY)).toBeNull();
} finally { await act(async () => root.unmount()); dom.window.close(); }
console.log('SIDEBAR_LINK_DRAFT_OK');
