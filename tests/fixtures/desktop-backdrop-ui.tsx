import { expect, mock } from 'bun:test';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<div id="root"></div>', { url: 'https://tatakai.test' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
const scenario = process.argv[2];
const palette = { background: '340 15% 5%', primary: '340 82% 65%', secondary: '320 70% 55%', accent: '350 90% 70%', foreground: '340 5% 95%', mutedForeground: '340 10% 60%', card: '340 12% 8%', border: '340 10% 20%' };
mock.module('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
mock.module('../../src/hooks/ui/useTheme', () => ({ useTheme: () => ({ theme: 'cherry-blossom', themeInfo: {}, reduceMotion: false, highContrast: false }), resolveThemePalette: () => palette, applyThemePalette() {} }));
mock.module('../../src/hooks/ui/use-mobile', () => ({ useIsMobile: () => false }));
mock.module('../../src/hooks/ui/useCustomization', () => ({ useCustomization: () => ({ settings: { version: 1, themes: {} } }), CustomizationScopeProvider: ({ children }: any) => children }));
mock.module('../../src/core/tv/device', () => ({ isTV: () => false }));
mock.module('../../src/core/tv/appearance', () => ({ useTVAppearance: () => ({ appearance: { theme: 'cherry-blossom' }, reduced: false }) }));
mock.module('../../src/lib/branding', () => ({ brandLogoSource: () => '/logo.png', resolveLogoVariant: () => 'dark', syncCommittedLauncher: async () => null }));
mock.module('../../src/components/settings/BackgroundEditor', () => ({ AppearanceBackground: () => <div /> }));
mock.module('../../src/components/layout/CanvasReadability', () => ({ CanvasReadability: () => null }));
mock.module('../../src/components/ui/themed-select', () => ({ ThemedSelect: (props: React.ComponentProps<'select'>) => <select {...props} /> }));
mock.module('../../src/components/ui/button', () => ({ Button: ({ variant: _variant, ...props }: React.ComponentProps<'button'> & { variant?: string }) => <button {...props} /> }));
const initialMode = scenario === 'saved-blur' ? 'system-blur' : scenario === 'saved-transparent' ? 'transparent' : 'solid';
let selection = { mode: initialMode, activeMode: initialMode, opacity: 0.82, supported: true, restartRequired: false };
const calls: unknown[] = [];
(window as any).electron = scenario === 'older-bridge' ? {} : { backdrop: {
  getCapabilities: async () => ({ supported: scenario !== 'saved-transparent', transparentSupported: true, platform: 'win32', material: 'acrylic' }),
  getSelection: async () => selection,
  setSelection: async (input: any) => { calls.push(input); const restartRequired = (input.mode === 'transparent') !== (selection.activeMode === 'transparent'); selection = { ...selection, ...input, activeMode: restartRequired ? selection.activeMode : input.mode, restartRequired }; return { ...selection, success: true }; },
} };
const { createRoot } = await import('react-dom/client');
const { BrandRuntimeProvider } = await import('../../src/components/layout/AppBranding');
const { DesktopBackdropSelector } = await import('../../src/components/settings/DesktopBackdropSelector');
const root = createRoot(document.getElementById('root')!);
const card = <div data-test-card style={{ opacity: 1, backgroundColor: '#ffffff' }}>Opaque text/card</div>;
  const render = (selector: boolean) => <BrandRuntimeProvider>{selector && <DesktopBackdropSelector />}{card}</BrandRuntimeProvider>;
try {
  await act(async () => root.render(render(scenario !== 'saved-blur')));
  expect(calls).toHaveLength(0);
  if (scenario === 'older-bridge') {
    expect(document.querySelector('[data-desktop-backdrop-settings]')!.textContent).toContain('customization.backdrop.unavailable');
    expect(document.documentElement.classList.contains('desktop-system-blur')).toBe(false);
  } else if (scenario === 'saved-blur' || scenario === 'saved-transparent') {
    expect(document.documentElement.classList.contains('desktop-system-blur')).toBe(true);
    expect(document.querySelector('[data-app-theme-background]')!.getAttribute('style')).toContain('--desktop-canvas-opacity');
    expect(document.querySelector('[data-desktop-background-portal]')).not.toBeNull();
    expect(document.documentElement.dataset.desktopBackdrop).toBe(initialMode);
  } else {
    expect(document.documentElement.classList.contains('desktop-system-blur')).toBe(false);
    const choose = async (mode: string) => { await act(async () => { const select = document.querySelector('select')!; select.value = mode; select.dispatchEvent(new dom.window.Event('change', { bubbles: true })); }); };
    const click = async (name: string) => { await act(async () => Array.from(document.querySelectorAll('button')).find(button => button.textContent === name)!.click()); };
    if (scenario === 'transparent-flow') {
      await choose('transparent');
      expect(document.querySelector<HTMLInputElement>('input[type="range"]')!.disabled).toBe(false);
      await click('customization.cancel'); expect(calls).toHaveLength(0);
      await choose('transparent'); await click('customization.backdrop.apply');
      expect(calls).toEqual([{ mode: 'transparent', opacity: 0.82 }]);
      expect(selection.activeMode).toBe('solid'); expect(selection.restartRequired).toBe(true);
      expect(document.documentElement.classList.contains('desktop-system-blur')).toBe(false);
      expect(document.querySelector('[data-desktop-backdrop-settings]')!.textContent).toContain('customization.backdrop.restartRequired');
    } else {
    await choose('system-blur');
    expect(calls).toHaveLength(0);
    await click('customization.cancel');
    expect(calls).toHaveLength(0);
    await choose('system-blur');
    await act(async () => { const input = document.querySelector<HTMLInputElement>('input[type="range"]')!; Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, '80'); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
    expect(calls).toHaveLength(0);
    await click('customization.backdrop.apply');
    expect(calls).toEqual([{ mode: 'system-blur', opacity: 0.2 }]);
    expect(document.documentElement.classList.contains('desktop-system-blur')).toBe(true);
    expect(document.documentElement.style.getPropertyValue('--desktop-canvas-opacity')).toBe('0.2');
    }
  }
  expect((document.querySelector('[data-test-card]') as HTMLElement).style.opacity).toBe('1');
} finally { await act(async () => root.unmount()); dom.window.close(); }
console.log('DESKTOP_BACKDROP_UI_OK');
