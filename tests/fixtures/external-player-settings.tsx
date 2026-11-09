import { expect, mock } from 'bun:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import i18n from '../../src/lib/i18n';

mock.module('../../src/hooks/media/useVideoSettings', () => ({
  useVideoSettings: () => ({ settings: { alwaysUseExternalPlayer: false }, updateSetting() {} }),
}));
const { ExternalPlayerSettings } = await import('../../src/components/settings/ExternalPlayerSettings');

async function run() {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://tatakai.test' });
  const previous = {
    window: globalThis.window, document: globalThis.document, HTMLElement: globalThis.HTMLElement, HTMLFormElement: globalThis.HTMLFormElement,
    act: (globalThis as any).IS_REACT_ACT_ENVIRONMENT,
  };
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, HTMLFormElement: dom.window.HTMLFormElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  const saved: Array<string | null> = [];
  const executable = 'E:\\Portable Apps\\MPC-HC\\mpc-hc64.exe';
  (dom.window as any).tatakaiRuntime = {
    detectExternalPlayers: async () => ({ success: true, players: [] }),
    getExternalPlayerPref: async () => null,
    saveExternalPlayerPref: async (value: string | null) => { saved.push(value); return { success: true }; },
  };
  (dom.window as any).electron = { selectFile: async () => executable };
  const root = createRoot(dom.window.document.getElementById('root')!);
  const button = (key: string) => Array.from(dom.window.document.querySelectorAll('button'))
    .find(element => element.textContent?.includes(i18n.t(key)))!;
  try {
    await act(async () => { await i18n.changeLanguage('en'); root.render(<ExternalPlayerSettings />); });
    expect(dom.window.document.body.textContent).toContain(i18n.t('app.no_supported_external_players_detected_on_your_s_00eecad0'));
    expect(button('app.built_in_player_62eea64f')).toBeDefined();
    await act(async () => button('app.add_custom_player_path_c71f1711').click());
    await act(async () => button('app.browse_2f3b5c55').click());
    expect(saved).toEqual([executable]);
    expect(dom.window.document.querySelector('input')?.value).toBe(executable);
    expect(button('app.currently_selected_ca576636')).toBeDefined();
    await act(async () => button('app.built_in_player_62eea64f').click());
    expect(saved).toEqual([executable, null]);
  } finally {
    await act(async () => root.unmount());
    Object.assign(globalThis, { window: previous.window, document: previous.document, HTMLElement: previous.HTMLElement, HTMLFormElement: previous.HTMLFormElement, IS_REACT_ACT_ENVIRONMENT: previous.act });
    dom.window.close();
  }
}

await run();
console.log('CUSTOM_PLAYER_BROWSE_SAVE_CLEAR_OK');
