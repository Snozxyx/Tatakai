import { expect, test } from 'bun:test';
import { addonConfigurationUrl, configuredManifestUrl, createConfigurationCoordinator, CONFIGURATION_DRAFT_KEY, validateConfiguredAddon, type ConfigurationResult } from '../src/core/extensions/remote/configuration';

const manifest = { id: 'fixture.addon', name: 'Fixture', version: '1', types: ['series'], resources: ['catalog', 'meta', 'stream'] };
const initial = { manifestUrl: 'https://fixture.test/manifest.json', expectedAddonId: manifest.id };
function memory() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}

test('configuration URLs retain encoded configuration and query credentials', () => {
  const encoded = 'stremio://fixture.test/YWJj==/%2Ftoken/manifest.json?token=a+b%2Fc#discard';
  expect(configuredManifestUrl(encoded)).toBe('https://fixture.test/YWJj==/%2Ftoken/manifest.json?token=a+b%2Fc');
  expect(addonConfigurationUrl(encoded)).toBe('https://fixture.test/YWJj==/%2Ftoken/configure?token=a+b%2Fc');
  for (const url of ['file:///manifest.json', 'javascript:alert(1)', 'https://user:password@fixture.test/manifest.json', 'https://fixture.test/configure']) {
    expect(() => configuredManifestUrl(url)).toThrow();
  }
});

test('configured manifests must match the selected add-on and be installable', () => {
  expect(() => validateConfiguredAddon(manifest, manifest.id)).not.toThrow();
  for (const value of [{ ...manifest, id: 'other' }, { ...manifest, behaviorHints: { configurationRequired: true } }, { ...manifest, resources: ['catalog'] }]) {
    expect(() => validateConfiguredAddon(value, manifest.id)).toThrow();
  }
});

test('successful configuration validates the returned URL and preserves existing ID', async () => {
  const storage = memory();
  const calls: string[] = [];
  const coordinator = createConfigurationCoordinator({ storage, requestId: () => 'request-1',
    open: async input => { expect(input.url).toBe('https://fixture.test/configure'); expect(storage.getItem(CONFIGURATION_DRAFT_KEY)).not.toBeNull(); return { requestId: input.requestId, success: true, manifestUrl: 'stremio://api.fixture.test/configured/manifest.json' }; },
    fetchManifest: async url => { calls.push(url); return manifest; } });
  const configured = await coordinator.start({ ...initial, existingId: 'stremio-installed' });
  expect(configured?.existingId).toBe('stremio-installed');
  expect(configured?.manifest).toEqual(manifest);
  expect(calls).toEqual(['https://api.fixture.test/configured/manifest.json']);
  expect(coordinator.pending()).toBeNull();
});

test('cancellation fetches nothing and leaves no pending draft', async () => {
  const coordinator = createConfigurationCoordinator({ storage: memory(), requestId: () => 'cancel',
    open: async input => ({ requestId: input.requestId, success: false }), fetchManifest: async () => { throw new Error('must not fetch'); } });
  expect(await coordinator.start(initial)).toBeNull();
  expect(coordinator.pending()).toBeNull();
});

test('startup and validation failures clear busy state and permit retry', async () => {
  let attempt = 0;
  const coordinator = createConfigurationCoordinator({ storage: memory(), requestId: () => 'retry',
    open: async input => { if (++attempt === 1) throw new Error('could not open'); return { requestId: input.requestId, success: true, manifestUrl: initial.manifestUrl }; },
    fetchManifest: async () => attempt === 2 ? { ...manifest, id: 'wrong' } : manifest });
  await expect(coordinator.start(initial)).rejects.toThrow('could not open');
  await expect(coordinator.start(initial)).rejects.toThrow();
  expect(await coordinator.start(initial)).not.toBeNull();
});

test('a restored native result is consumed once and stale callbacks are ignored', async () => {
  const storage = memory();
  storage.setItem(CONFIGURATION_DRAFT_KEY, JSON.stringify({ ...initial, requestId: 'restored' }));
  let fetches = 0;
  const coordinator = createConfigurationCoordinator({ storage, requestId: () => 'unused', open: async () => { throw new Error('must not open'); }, fetchManifest: async () => { fetches += 1; return manifest; } });
  expect(await coordinator.restore({ requestId: 'stale', success: true, manifestUrl: initial.manifestUrl })).toBeNull();
  const result: ConfigurationResult = { requestId: 'restored', success: true, manifestUrl: initial.manifestUrl };
  const completions = await Promise.all([coordinator.restore(result), coordinator.restore(result)]);
  expect(completions.filter(Boolean)).toHaveLength(1);
  expect(fetches).toBe(1);
});

test('the live request owns its callback and a second window is rejected', async () => {
  let resolve!: (value: ConfigurationResult) => void;
  const coordinator = createConfigurationCoordinator({ storage: memory(), requestId: () => 'live', open: () => new Promise(done => { resolve = done; }), fetchManifest: async () => manifest });
  const live = coordinator.start(initial);
  await expect(coordinator.start(initial)).rejects.toThrow();
  const result: ConfigurationResult = { requestId: 'live', success: true, manifestUrl: initial.manifestUrl };
  expect(await coordinator.restore(result)).toBeNull();
  resolve(result);
  expect(await live).not.toBeNull();
});

test('cancelled drafts cannot later accept a callback', async () => {
  const storage = memory();
  storage.setItem(CONFIGURATION_DRAFT_KEY, JSON.stringify({ ...initial, requestId: 'old' }));
  const coordinator = createConfigurationCoordinator({ storage, requestId: () => 'unused', open: async () => { throw new Error('must not open'); }, fetchManifest: async () => { throw new Error('must not fetch'); } });
  coordinator.cancel();
  expect(await coordinator.restore({ requestId: 'old', success: true, manifestUrl: initial.manifestUrl })).toBeNull();
});

test('cancelling during manifest validation cannot deliver or reopen a preview', async () => {
  let release!: (value: Record<string, any>) => void;
  const coordinator = createConfigurationCoordinator({ storage: memory(), requestId: () => 'in-flight',
    open: async input => ({ requestId: input.requestId, success: true, manifestUrl: initial.manifestUrl }),
    fetchManifest: () => new Promise(done => { release = done; }) });
  const result = coordinator.start(initial);
  await Promise.resolve();
  coordinator.cancel();
  release(manifest);
  expect(await result).toBeNull();
});
