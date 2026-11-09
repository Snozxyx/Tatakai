import { expect, mock, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { indexedDB } from 'fake-indexeddb';

let auth: any = { user: null, profile: null };
let online = true;
const profiles = new Map<string, any>();
const uploads: { path: string; body: unknown }[] = [];
let profileReads = 0;
function clientFrom() {
  profileReads += 1;
  let userId = '';
  let update: any;
  let expected: string | null | undefined;
  const query: any = {
    select: () => query,
    update: (value: any) => { update = value; return query; },
    eq: (key: string, value: string) => { if (key === 'user_id') userId = value; if (key === 'app_settings') expected = value; return query; },
    is: (_key: string, value: null) => { expected = value; return query; },
    maybeSingle: async () => {
      const current = profiles.get(userId) ?? {};
      if (update) {
        const actual = current === null ? null : JSON.stringify(current);
        if (expected !== actual) return { data: null, error: null };
        profiles.set(userId, update.app_settings);
        return { data: update, error: null };
      }
      return { data: { app_settings: current }, error: null };
    },
  };
  return query;
}
mock.module('../src/contexts/AuthContext', () => ({ useAuth: () => auth }));
mock.module('../src/integrations/supabase/client', () => ({ supabase: {
  from: clientFrom,
  auth: { getUser: async () => ({ data: { user: auth.user } }) },
  storage: { from: () => ({
    upload: async (path: string, body: unknown) => { uploads.push({ path, body }); return { error: null }; },
    getPublicUrl: (path: string) => ({ data: { publicUrl: `https://images.test/${path}` } }),
  }) },
} }));
const { useCustomization } = await import('../src/hooks/ui/useCustomization');
const { mergeAppSettings, saveAccountSettingsRemote, writeGuestSettingsCookie } = await import('../src/lib/appSettingsPersistence');
const { stageAppearanceImage, discardStagedAppearanceOwner, commitAppearanceAssets, resolveAppearanceAsset, appearanceBackgroundStyle } = await import('../src/lib/appearanceAssets');

async function environment(run: (render: () => Promise<void>, handles: Map<string, ReturnType<typeof useCustomization>>) => Promise<void>) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://tatakai.test' });
  const keys = ['window', 'document', 'localStorage', 'CustomEvent', 'navigator', 'indexedDB', 'IS_REACT_ACT_ENVIRONMENT'];
  const previous = Object.fromEntries(keys.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage, CustomEvent: dom.window.CustomEvent, navigator: { get onLine() { return online; } }, indexedDB, IS_REACT_ACT_ENVIRONMENT: true })) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  const root = createRoot(document.getElementById('root')!);
  const handles = new Map<string, ReturnType<typeof useCustomization>>();
  function Consumer({ name }: { name: string }) { const value = useCustomization(); handles.set(name, value); return <span>{name}:{value.syncStatus}</span>; }
  const render = () => act(async () => root.render(<><Consumer name="main" /><Consumer name="editor" /></>));
  try { await run(render, handles); }
  finally {
    await act(async () => root.unmount()); dom.window.close();
    for (const key of keys) { if (previous[key]) Object.defineProperty(globalThis, key, previous[key]!); else delete (globalThis as any)[key]; }
  }
}
test('settings merge preserves unrelated data, reset tombstones, and short guest cookies', () => environment(async () => {
  const result = mergeAppSettings({ locale: 'ja', video: { volume: 0.4 }, customization: { version: 1, themes: { midnight: { logo: 'dark' } } } }, { customization: { version: 1, themes: { midnight: null } } });
  expect(result.locale).toBe('ja'); expect(result.video?.volume).toBe(0.4); expect(result.customization?.themes.midnight).toBeNull();
  writeGuestSettingsCookie({ theme: { theme: 'midnight' }, customization: { version: 1, themes: { midnight: { palette: { primary: '200 60% 40%' } } } } });
  expect(decodeURIComponent(document.cookie)).not.toContain('customization');
}));
test('compare-and-set rereads concurrent updates and preserves the other device edit', async () => {
  let current: any = { locale: 'en', customization: { version: 1, themes: { midnight: { logo: 'dark' } } } };
  let attempts = 0;
  const client = { from: () => {
    let patch: any;
    const query: any = { select: () => query, eq: () => query, is: () => query, update: (value: any) => { patch = value; return query; }, maybeSingle: async () => {
      if (!patch) return { data: { app_settings: structuredClone(current) }, error: null };
      attempts++;
      if (attempts === 1) { current.customization.themes.midnight.targets = { mobile: { activeDesign: 'phone' } }; return { data: null, error: null }; }
      current = patch.app_settings; return { data: patch, error: null };
    } }; return query;
  } };
  const result = await saveAccountSettingsRemote('race', { customization: { version: 1, themes: { midnight: { targets: { desktop: { activeDesign: 'desktop' } } } } } }, client);
  expect(attempts).toBe(2); expect(result.customization?.themes.midnight?.targets?.mobile?.activeDesign).toBe('phone'); expect(result.locale).toBe('en');
});
test('compare-and-set stops after three unresolved conflicts', async () => {
  let attempts = 0;
  const client = { from: () => { let update = false; const query: any = { select: () => query, eq: () => query, is: () => query, update: () => { update = true; return query; }, maybeSingle: async () => { if (update) attempts++; return { data: update ? null : { app_settings: {} }, error: null }; } }; return query; } };
  await expect(saveAccountSettingsRemote('conflict', { locale: 'ja' }, client)).rejects.toThrow('queued for retry'); expect(attempts).toBe(3);
});
test('appearance stays device-local through profile changes, auth changes, and reload', () => environment(async (render, handles) => {
  const readsBefore = profileReads;
  auth = { user: { id: 'alpha-custom' }, profile: { user_id: 'alpha-custom', app_settings: { customization: { version: 1, themes: { midnight: { logo: 'legacy' } } } } } };
  profiles.set('alpha-custom', auth.profile.app_settings);
  await render();
  expect(handles.get('main')!.settings.themes.midnight).toBeUndefined();
  await act(async () => handles.get('editor')!.savePatch({ themes: { midnight: { logo: 'legacy', targets: { desktop: { activeDesign: 'a' } } } } }));
  expect(handles.get('main')!.settings.themes.midnight?.targets?.desktop?.activeDesign).toBe('a');
  auth = { user: { id: 'beta-custom' }, profile: auth.profile };
  await render(); expect(handles.get('main')!.settings.themes.midnight).toBeUndefined();
  auth.profile = { user_id: 'beta-custom', app_settings: { customization: { version: 1, themes: { midnight: { logo: 'light' } } } } };
  profiles.set('beta-custom', auth.profile.app_settings); await render(); expect(handles.get('main')!.settings.themes.midnight).toBeUndefined();
  auth = { user: { id: 'alpha-custom' }, profile: { user_id: 'alpha-custom', get app_settings() { throw new Error('Appearance must not read account profile settings'); } } };
  await act(async () => { window.dispatchEvent(new window.StorageEvent('storage', { key: 'tatakai_customization_v1:account:alpha-custom' })); });
  await render(); expect(handles.get('main')!.settings.themes.midnight?.targets?.desktop?.activeDesign).toBe('a');
  await act(async () => { window.dispatchEvent(new window.Event('online')); await new Promise(resolve => setTimeout(resolve, 10)); });
  expect(profileReads).toBe(readsBefore);
}));
test('retiring appearance sync removes only appearance fields from an old account outbox', () => environment(async (render) => {
  auth = { user: { id: 'prune-custom' }, profile: null };
  const key = 'tatakai_account_settings_v1:pending:prune-custom';
  localStorage.setItem(key, JSON.stringify({ theme: { theme: 'midnight' }, customization: { version: 1, themes: {} }, sidebar: { order: ['home'] }, video: { volume: 0.5 }, reader: { direction: 'rtl' } }));
  await render();
  expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ video: { volume: 0.5 }, reader: { direction: 'rtl' } });
}));
test('staging and Cancel never upload, while guest Save preserves the image locally', () => environment(async () => {
  const initialUploads = uploads.length;
  const file = new File([new Uint8Array([1, 2, 3])], 'wallpaper.png', { type: 'image/png' });
  const canceled = stageAppearanceImage(file, null, 'cancel-owner');
  expect(await resolveAppearanceAsset(canceled)).toStartWith('blob:');
  discardStagedAppearanceOwner('cancel-owner');
  expect(await resolveAppearanceAsset(canceled)).toBeNull(); expect(uploads.length).toBe(initialUploads);
  const saved = stageAppearanceImage(file, null, 'save-owner');
  const result = await commitAppearanceAssets({ background: { type: 'image', asset: saved } }, null);
  discardStagedAppearanceOwner('save-owner');
  expect(result.pending).toBe(false); expect(await resolveAppearanceAsset(result.value.background.asset)).toStartWith('blob:'); expect(uploads.length).toBe(initialUploads);
}));
test('image bytes persist locally for guests and local profiles online or offline without uploads', () => environment(async () => {
  const uploadsBefore = uploads.length;
  for (const userId of [null, 'local-image-owner']) for (const connection of [true, false]) {
    online = connection;
    const file = new File([new Uint8Array([7, 8, 9])], 'local.png', { type: 'image/png' });
    const asset = stageAppearanceImage(file, userId, 'local-only');
    const saved = await commitAppearanceAssets({ background: { type: 'image', asset } }, userId);
    expect(saved.pending).toBe(false); expect(saved.value.background.asset.bucket).toBeUndefined(); expect(saved.value.background.asset.path).toBeUndefined();
    const stored: any = await new Promise((resolve, reject) => {
      const open = indexedDB.open('tatakai-appearance-assets', 1);
      open.onsuccess = () => { const database = open.result; const request = database.transaction('assets').objectStore('assets').get(`${asset.namespace}:${asset.id}`); request.onsuccess = () => { resolve(request.result); database.close(); }; request.onerror = () => reject(request.error); };
      open.onerror = () => reject(open.error);
    });
    expect([...new Uint8Array(await stored.blob.arrayBuffer())]).toEqual([7, 8, 9]);
  }
  expect(uploads.length).toBe(uploadsBefore); online = true;
}));
test('logged-in offline images stay local after reconnect and a preference reload', () => environment(async (render, handles) => {
  const readsBefore = profileReads;
  const uploadsBefore = uploads.length;
  online = false;
  auth = { user: { id: 'offline-custom' }, profile: { user_id: 'offline-custom', app_settings: {} } }; profiles.set('offline-custom', {});
  await render();
  const file = new File([new Uint8Array([4, 5, 6])], 'image.webp', { type: 'image/webp' });
  const asset = stageAppearanceImage(file, 'offline-custom', 'offline-owner');
  await act(async () => handles.get('editor')!.savePatch({ themes: { midnight: { background: { type: 'image', asset } } } }));
  expect(handles.get('main')!.syncStatus).toBe('saved'); expect(profiles.get('offline-custom').customization).toBeUndefined();
  online = true;
  await act(async () => { window.dispatchEvent(new window.Event('online')); await new Promise(resolve => setTimeout(resolve, 50)); });
  expect(handles.get('main')!.syncStatus).toBe('saved');
  const stored = handles.get('main')!.settings.themes.midnight?.background?.asset;
  expect(profiles.get('offline-custom').customization).toBeUndefined(); expect(profileReads).toBe(readsBefore);
  expect(stored.bucket).toBeUndefined(); expect(stored.path).toBeUndefined(); expect(uploads.length).toBe(uploadsBefore);
  await act(async () => { window.dispatchEvent(new window.StorageEvent('storage', { key: 'tatakai_customization_v1:account:offline-custom' })); });
  await render(); expect(handles.get('main')!.settings.themes.midnight?.background?.asset?.id).toBe(asset.id);
  expect(await resolveAppearanceAsset(stored)).toStartWith('blob:'); expect(uploads.length).toBe(uploadsBefore);
}));
test('background CSS accepts safe appearance values and rejects executable/image CSS input', () => {
  expect(appearanceBackgroundStyle({ type: 'gradient', gradient: 'linear-gradient(135deg, #123456, #abcdef)' }).backgroundImage).toContain('linear-gradient');
  expect(appearanceBackgroundStyle({ type: 'gradient', gradient: 'linear-gradient(red, blue);background:url(x)' }).backgroundImage).toBeUndefined();
  expect(appearanceBackgroundStyle({ type: 'image', asset: { id: 'x' } }, 'javascript:alert(1)').backgroundImage).toBeUndefined();
});
