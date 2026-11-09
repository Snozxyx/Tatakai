import { expect, mock, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { JSDOM } from 'jsdom';

let auth: any = { user: null, profile: null };
const writes: any[] = [];
mock.module('../src/contexts/AuthContext', () => ({ useAuth: () => auth }));
mock.module('../src/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { app_settings: {} }, error: null }) }) }),
      update: (value: any) => ({ eq: async () => { writes.push(value.app_settings); return { error: null }; } }),
    }),
  },
}));
const { useVideoSettings } = await import('../src/hooks/media/useVideoSettings');
const { VideoEnhancementSettings } = await import('../src/components/settings/VideoEnhancementSettings');
type SettingsHandle = ReturnType<typeof useVideoSettings>;

async function withSettings(run: (root: Root, handles: Map<string, SettingsHandle>, render: (names: string[]) => Promise<void>) => Promise<void>) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://tatakai.test' });
  const names = ['window', 'document', 'localStorage', 'CustomEvent', 'HTMLElement', 'HTMLFormElement', 'DocumentFragment', 'IS_REACT_ACT_ENVIRONMENT'];
  const previous = Object.fromEntries(names.map(name => [name, (globalThis as any)[name]]));
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, localStorage: dom.window.localStorage,
    CustomEvent: dom.window.CustomEvent, HTMLElement: dom.window.HTMLElement, HTMLFormElement: dom.window.HTMLFormElement,
    DocumentFragment: dom.window.DocumentFragment, IS_REACT_ACT_ENVIRONMENT: true });
  auth = { user: null, profile: null };
  writes.length = 0;
  const root = createRoot(document.getElementById('root')!);
  const handles = new Map<string, SettingsHandle>();
  function Consumer({ name }: { name: string }) {
    const value = useVideoSettings();
    handles.set(name, value);
    return <span>{name}:{value.settings.videoEnhancementEngine}:{value.settings.videoEnhancementQuality}</span>;
  }
  const render = async (consumers: string[]) => { await act(async () => root.render(<>{consumers.map(name => <Consumer key={name} name={name} />)}</>)); };
  try { await run(root, handles, render); }
  finally {
    await act(async () => root.unmount());
    Object.assign(globalThis, previous);
    dom.window.close();
  }
}

test('reopening the drawer preserves local Anime4K choices over a stale account profile', () => withSettings(async (_root, handles, render) => {
  auth = { user: { id: 'viewer' }, profile: { user_id: 'viewer', app_settings: { video: { videoEnhancementEngine: 'off', videoEnhancementQuality: 'balanced', anime4kPreset: 'off' } } } };
  await render(['player', 'drawer']);
  await act(async () => {
    handles.get('drawer')!.updateSetting('videoEnhancementEngine', 'anime4k');
    handles.get('drawer')!.updateSetting('videoEnhancementQuality', 'high');
  });
  await render(['player']);
  await render(['player', 'drawer']);
  for (const name of ['player', 'drawer']) {
    expect(handles.get(name)!.settings.videoEnhancementEngine).toBe('anime4k');
    expect(handles.get(name)!.settings.videoEnhancementQuality).toBe('high');
    expect(handles.get(name)!.settings.anime4kPreset).toBe('high');
  }
  expect(JSON.parse(localStorage.getItem('video-player-settings')!).videoEnhancementQuality).toBe('high');
}));

test('batched edits from separate settings consumers preserve both choices and survive remount', () => withSettings(async (_root, handles, render) => {
  await render(['player', 'drawer']);
  await act(async () => {
    handles.get('drawer')!.updateSetting('videoEnhancementEngine', 'anime4k');
    handles.get('drawer')!.updateSetting('videoEnhancementQuality', 'high');
    handles.get('player')!.updateSetting('volume', 0.4);
  });
  await render([]);
  await render(['player', 'drawer']);
  for (const name of ['player', 'drawer']) {
    expect(handles.get(name)!.settings.videoEnhancementQuality).toBe('high');
    expect(handles.get(name)!.settings.volume).toBe(0.4);
  }
}));

test('Anime4K processing and quality selectors stay in sync', () => withSettings(async (_root, handles, render) => {
  await render(['drawer']);
  await act(async () => handles.get('drawer')!.updateSetting('anime4kPreset', 'high'));
  expect(handles.get('drawer')!.settings.videoEnhancementQuality).toBe('high');
  await act(async () => handles.get('drawer')!.updateSetting('anime4kPreset', 'light'));
  expect(handles.get('drawer')!.settings.videoEnhancementQuality).toBe('light');
  await act(async () => handles.get('drawer')!.updateSetting('anime4kPreset', 'restore'));
  expect(handles.get('drawer')!.settings.videoEnhancementQuality).toBe('balanced');
}));

test('an enabled engine restores its quality preset when the saved Anime4K preset is absent', () => withSettings(async (_root, handles, render) => {
  localStorage.setItem('video-player-settings', JSON.stringify({ videoEnhancementEngine: 'anime4k', videoEnhancementQuality: 'high' }));
  await render(['player']);
  expect(handles.get('player')!.settings.anime4kPreset).toBe('high');
}));

test('legacy processing-selector saves display the quality of the active Anime4K preset', () => withSettings(async (_root, handles, render) => {
  localStorage.setItem('video-player-settings', JSON.stringify({ videoEnhancementEngine: 'anime4k', videoEnhancementQuality: 'balanced', anime4kPreset: 'high' }));
  await render(['player']);
  expect(handles.get('player')!.settings.videoEnhancementQuality).toBe('high');
  expect(handles.get('player')!.settings.anime4kPreset).toBe('high');
}));

test('reenabling a saved Anime4K preset immediately displays its active quality', () => withSettings(async (_root, handles, render) => {
  localStorage.setItem('video-player-settings', JSON.stringify({ videoEnhancementEngine: 'off', videoEnhancementQuality: 'balanced', anime4kPreset: 'high' }));
  await render(['player', 'drawer']);
  await act(async () => handles.get('drawer')!.updateSetting('videoEnhancementEngine', 'anime4k'));
  expect(handles.get('player')!.settings.videoEnhancementQuality).toBe('high');
}));

test('a delayed account profile does not overwrite edits made while it loaded', () => withSettings(async (_root, handles, render) => {
  auth = { user: { id: 'viewer' }, profile: null };
  await render(['player']);
  expect(writes).toHaveLength(0);
  await act(async () => handles.get('player')!.updateSetting('anime4kPreset', 'high'));
  auth.profile = { user_id: 'viewer', app_settings: { video: { videoEnhancementEngine: 'off' } } };
  await render(['player', 'drawer']);
  expect(handles.get('player')!.settings.videoEnhancementEngine).toBe('anime4k');
  expect(handles.get('drawer')!.settings.videoEnhancementQuality).toBe('high');
}));

test('switching accounts waits for the matching profile and applies its preferences', () => withSettings(async (_root, handles, render) => {
  auth = { user: { id: 'first' }, profile: { user_id: 'first', app_settings: { video: { anime4kPreset: 'high' } } } };
  await render(['player']);
  await act(async () => handles.get('player')!.updateSetting('videoEnhancementQuality', 'light'));
  auth.user = { id: 'second' };
  await render(['player', 'drawer']);
  expect(handles.get('player')!.settings.videoEnhancementQuality).toBe('light');
  auth.profile = { user_id: 'second', app_settings: { video: { videoEnhancementEngine: 'off', videoEnhancementQuality: 'balanced' } } };
  await render(['player', 'drawer']);
  expect(handles.get('player')!.settings.videoEnhancementEngine).toBe('off');
  expect(handles.get('drawer')!.settings.videoEnhancementQuality).toBe('balanced');
}));

test('returning to an account retains its saved choices over its stale profile', () => withSettings(async (_root, handles, render) => {
  const firstProfile = { user_id: 'first', app_settings: { video: { videoEnhancementEngine: 'off', videoEnhancementQuality: 'balanced' } } };
  auth = { user: { id: 'first' }, profile: firstProfile };
  await render(['player']);
  await act(async () => handles.get('player')!.updateSetting('anime4kPreset', 'high'));
  auth = { user: { id: 'second' }, profile: { user_id: 'second', app_settings: { video: { videoEnhancementEngine: 'off' } } } };
  await render(['player']);
  auth = { user: { id: 'first' }, profile: firstProfile };
  await render(['player', 'drawer']);
  expect(handles.get('drawer')!.settings.videoEnhancementEngine).toBe('anime4k');
  expect(handles.get('drawer')!.settings.videoEnhancementQuality).toBe('high');
}));

test('returning to an account also restores edits when its profile had no video preferences', () => withSettings(async (_root, handles, render) => {
  const firstProfile = { user_id: 'first', app_settings: {} };
  auth = { user: { id: 'first' }, profile: firstProfile };
  await render(['player']);
  await act(async () => handles.get('player')!.updateSetting('anime4kPreset', 'high'));
  auth = { user: { id: 'second' }, profile: { user_id: 'second', app_settings: { video: { videoEnhancementEngine: 'off' } } } };
  await render(['player']);
  auth = { user: { id: 'first' }, profile: firstProfile };
  await render(['player', 'drawer']);
  expect(handles.get('drawer')!.settings.videoEnhancementEngine).toBe('anime4k');
  expect(handles.get('drawer')!.settings.videoEnhancementQuality).toBe('high');
}));

test('newer account preferences and explicit reset propagate to every consumer', () => withSettings(async (_root, handles, render) => {
  auth = { user: { id: 'viewer' }, profile: { user_id: 'viewer', app_settings: { video: { videoEnhancementEngine: 'off' } } } };
  await render(['player', 'drawer']);
  await act(async () => handles.get('drawer')!.updateSetting('anime4kPreset', 'light'));
  auth.profile = { user_id: 'viewer', app_settings: { video: { anime4kPreset: 'high', __updatedAt: Date.now() + 1000 } } };
  await render(['player', 'drawer']);
  expect(handles.get('player')!.settings.videoEnhancementQuality).toBe('high');
  await act(async () => handles.get('drawer')!.resetSettings());
  await render(['player']);
  await render(['player', 'drawer']);
  expect(handles.get('drawer')!.settings.videoEnhancementEngine).toBe('off');
  expect(handles.get('player')!.settings.videoEnhancementQuality).toBe('balanced');
}));

test('RTX compatibility failures are displayed and the button can retry successfully', () => withSettings(async (root) => {
  let attempts = 0;
  (window as any).electron = { rtxVideo: { capability: async () => {
    attempts++;
    if (attempts === 1) throw new Error('IPC unavailable');
    return { available: true, reason: '', adapter: 'NVIDIA RTX', maxOutputHeight: 1080 };
  } } };
  await act(async () => root.render(<VideoEnhancementSettings />));
  expect(document.querySelector('[role="status"]')?.textContent).toContain('Could not check RTX Video');
  const button = [...document.querySelectorAll('button')].find(element => element.textContent === 'Check compatibility')!;
  expect(button.disabled).toBe(false);
  await act(async () => button.click());
  expect(attempts).toBe(2);
  expect(document.querySelector('[role="status"]')?.textContent).toContain('RTX Video ready on NVIDIA RTX');
}));
