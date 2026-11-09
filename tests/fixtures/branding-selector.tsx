import { expect, mock } from 'bun:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';

mock.module('../../src/hooks/ui/useTheme', () => ({ resolveColors: (theme: string) => ({ isLight: theme === 'light-minimal' }) }));
mock.module('../../src/hooks/ui/useCustomization', () => ({ useCustomization: () => ({ settings: { version: 1, themes: {} } }), useCustomizationScope: () => ({ themeId: 'midnight', target: 'desktop' }) }));
mock.module('../../src/hooks/ui/useUiTranslation', () => ({ useUiTranslation() {} }));
mock.module('../../src/lib/uiI18n', () => ({ default: { t: (key: string) => key } }));
mock.module('../../src/components/ui/themed-select', () => ({ ThemedSelect: (props: React.ComponentProps<'select'>) => <select {...props} /> }));
mock.module('../../src/components/ui/button', () => ({ Button: ({ variant: _variant, ...props }: React.ComponentProps<'button'> & { variant?: string }) => <button {...props} /> }));

const dom = new JSDOM('<div id="root"></div>', { url: 'https://tatakai.test' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, CustomEvent: dom.window.CustomEvent, IS_REACT_ACT_ENVIRONMENT: true });
let selection = { success: true, mode: 'auto', variant: 'dark' };
const writes: unknown[] = [];
(dom.window as any).electron = { branding: {
  getCapabilities: async () => ({ success: true, supported: true, platform: 'win32', automatic: true, limitations: [] }),
  getSelection: async () => selection,
  setSelection: async (input: any) => { writes.push(input); selection = { success: true, mode: input.mode, variant: input.mode === 'auto' ? input.resolvedVariant : input.mode }; return selection; },
} };
const { LauncherIconSelector } = await import('../../src/components/settings/LauncherIconSelector');
const { syncCommittedLauncher } = await import('../../src/lib/branding');
const root = createRoot(document.getElementById('root')!);
const choose = async (value: string) => { await act(async () => { const select = document.querySelector('select')!; select.value = value; select.dispatchEvent(new dom.window.Event('change', { bubbles: true })); }); };
const click = async (key: string) => { await act(async () => { Array.from(document.querySelectorAll('button')).find(button => button.textContent === key)!.click(); }); };
try {
  await act(async () => root.render(<LauncherIconSelector />));
  await choose('legacy');
  expect(writes).toHaveLength(0);
  await click('common.cancel');
  expect(writes).toHaveLength(0);
  expect(document.querySelector('select')!.value).toBe('auto');
  await choose('legacy');
  await click('common.save');
  expect(writes).toEqual([{ mode: 'legacy', resolvedVariant: 'legacy' }]);
  await syncCommittedLauncher('light');
  expect(writes).toHaveLength(1);
  await choose('auto'); await click('common.save');
  await syncCommittedLauncher('light');
  expect(writes.at(-1)).toEqual({ mode: 'auto', resolvedVariant: 'light' });
} finally { await act(async () => root.unmount()); dom.window.close(); }
console.log('BRANDING_PREVIEW_SAVE_CANCEL_OK');
