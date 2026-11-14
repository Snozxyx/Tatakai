import { expect, mock } from 'bun:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import i18n from '../../src/lib/i18n';
import type { ContentSafetySettings } from '../../src/hooks/user/useContentSafetySettings';

type AppSettings = { contentSafety?: Partial<ContentSafetySettings> };
type Auth = { user: { id: string } | null; profile: { app_settings: AppSettings } | null; refreshProfile: () => Promise<void> };
let auth: Auth = { user: null, profile: null, refreshProfile: async () => {} };
let guestSettings: AppSettings = {};
const writes: AppSettings[] = [];
mock.module('../../src/contexts/AuthContext', () => ({ useAuth: () => auth }));
mock.module('../../src/lib/appSettingsPersistence', () => ({
  readGuestSettingsFromCookie: () => guestSettings,
  readProfileAppSettings: (profile: { app_settings?: AppSettings }) => profile.app_settings || {},
  writeGuestSettingsCookie: (patch: AppSettings) => { guestSettings = structuredClone(patch); },
  saveAccountSettingsPatch: (_userId: string, patch: AppSettings) => {
    writes.push(structuredClone(patch));
    // Keep the save pending while a newer profile and session mode arrive.
    return new Promise<void>(() => {});
  },
}));
const { useContentSafetySettings } = await import('../../src/hooks/user/useContentSafetySettings');
const { NsfwPanel } = await import('../../src/components/settings/panels/NsfwPanel');
const { confirmAdultMode, dismissAdultMode, disableAdultMode, getAdultMode, getAdultModeRevision, isAdultConfirmationPending } = await import('../../src/lib/adultMode');
type SettingsHandle = ReturnType<typeof useContentSafetySettings>;

async function withSettings(run: (handles: Map<string, SettingsHandle>, render: () => Promise<void>, click: (label: string) => Promise<void>) => Promise<void>) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://tatakai.test' });
  const names = ['window', 'document', 'localStorage', 'CustomEvent', 'HTMLElement', 'HTMLFormElement', 'IS_REACT_ACT_ENVIRONMENT'] as const;
  const previous = Object.fromEntries(names.map(name => [name, Reflect.get(globalThis, name)]));
  Object.assign(globalThis, {
    window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage,
    CustomEvent: dom.window.CustomEvent, HTMLElement: dom.window.HTMLElement, HTMLFormElement: dom.window.HTMLFormElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });
  disableAdultMode();
  auth = { user: null, profile: null, refreshProfile: async () => {} };
  guestSettings = {};
  writes.length = 0;
  const root = createRoot(dom.window.document.getElementById('root')!);
  const handles = new Map<string, SettingsHandle>();
  function Consumer({ name }: { name: string }) {
    handles.set(name, useContentSafetySettings());
    return null;
  }
  const render = async () => {
    await act(async () => root.render(<><Consumer name="catalog" /><Consumer name="search" /><NsfwPanel /></>));
  };
  const click = async (label: string) => {
    const control = dom.window.document.querySelector<HTMLButtonElement>(`[role="switch"][aria-label="${label}"]`);
    expect(control).not.toBeNull();
    await act(async () => control!.click());
  };
  try {
    await i18n.changeLanguage('en');
    await run(handles, render, click);
  } finally {
    await act(async () => root.unmount());
    disableAdultMode();
    Object.assign(globalThis, previous);
    dom.window.close();
  }
}

await withSettings(async (handles, render, click) => {
  await render();
  await click('Adult Mode');
  expect(isAdultConfirmationPending()).toBe(true);
  expect(getAdultMode()).toBe('sfw');
  expect(document.querySelector('[aria-label="Adult Mode"]')?.getAttribute('aria-checked')).toBe('false');
  await act(async () => dismissAdultMode());
  expect(isAdultConfirmationPending()).toBe(false);
  expect(getAdultMode()).toBe('sfw');
  await click('Adult Mode');
  await act(async () => confirmAdultMode());
  expect(getAdultMode()).toBe('adult');
  expect(document.querySelector('[aria-label="Adult Mode"]')?.getAttribute('aria-checked')).toBe('true');
  for (const handle of handles.values()) expect(handle.settings.showAdultEverywhere).toBe(true);
  await click('Adult Mode');
  expect(getAdultMode()).toBe('sfw');
  expect(isAdultConfirmationPending()).toBe(false);
  for (const handle of handles.values()) expect(handle.settings.showAdultEverywhere).toBe(false);
});

await withSettings(async (handles, render, click) => {
  // Previously persisted mode flags must never enable a new session.
  localStorage.setItem('tatakai_content_safety', JSON.stringify({ showAdultEverywhere: true }));
  await render();
  expect(getAdultMode()).toBe('sfw');
  const revision = getAdultModeRevision();
  await click('Hentai / explicit');
  expect(getAdultModeRevision()).toBe(revision + 1);
  for (const handle of handles.values()) expect(handle.settings.adultCategories?.explicit).toBe(false);
  await click('Adult Mode');
  await act(async () => confirmAdultMode());
  await act(async () => handles.get('catalog')!.updateSettings({ warnBeforeAdultOpen: false }));
  const saved = JSON.parse(localStorage.getItem('tatakai_content_safety')!);
  expect(saved.showAdultEverywhere).toBe(false);
  expect(saved.adultCategories.explicit).toBe(false);
  expect(saved.warnBeforeAdultOpen).toBe(false);
  expect(guestSettings.contentSafety?.showAdultEverywhere).toBe(false);
  const unchangedRevision = getAdultModeRevision();
  await act(async () => handles.get('catalog')!.updateSettings({ adultCategories: saved.adultCategories }));
  expect(getAdultModeRevision()).toBe(unchangedRevision);
});

await withSettings(async (handles, render, click) => {
  auth.user = { id: 'session-viewer' };
  auth.profile = { app_settings: { contentSafety: { showAdultEverywhere: false, warnBeforeAdultOpen: true, blurAdultInSearch: true } } };
  await render();
  await act(async () => handles.get('catalog')!.updateSettings({ blurAdultInSearch: false }));
  expect(writes).toHaveLength(1);
  await click('Adult Mode');
  await act(async () => confirmAdultMode());
  expect(writes).toHaveLength(1);
  auth.profile = { app_settings: { contentSafety: { showAdultEverywhere: false, warnBeforeAdultOpen: false, blurAdultInSearch: true } } };
  await render();
  for (const handle of handles.values()) {
    expect(handle.settings.showAdultEverywhere).toBe(true);
    expect(handle.settings.blurAdultInSearch).toBe(false);
  }
  expect(document.querySelector('[aria-label="Adult Mode"]')?.getAttribute('aria-checked')).toBe('true');
  await click('Adult Mode');
  await render();
  expect(getAdultMode()).toBe('sfw');
  for (const handle of handles.values()) expect(handle.settings.showAdultEverywhere).toBe(false);
  expect(writes).toHaveLength(1);
  expect(writes[0].contentSafety?.showAdultEverywhere).toBe(false);
});

console.log('ADULT_MODE_TOGGLE_CONFIRM_CANCEL_OFF_FILTERS_HYDRATION_OK');
