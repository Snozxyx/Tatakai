import { strict as assert } from 'node:assert';
import { mock } from 'bun:test';
import 'fake-indexeddb/auto';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('', { url: 'https://tatakai.me' });
Object.assign(globalThis, { window: dom.window, localStorage: dom.window.localStorage, CustomEvent: dom.window.CustomEvent });
mock.module('../../src/core/extensions/mobile/mobileExtensionHost', () => ({ unregisterMobileExtension() {} }));
const { installRemoteExtension, listRemoteExtensions, updateRemoteExtension, removeRemoteExtension } = await import('../../src/core/extensions/remote/installed');
const manifest = { id: 'fixture.stremio', name: 'Fixture', version: '1.0', types: ['series'], resources: ['catalog', 'meta', 'stream'], behaviorHints: { configurable: true } };
let notices = 0;
dom.window.addEventListener('tatakai:extension-installed', () => { notices += 1; });
try {
  const first = await installRemoteExtension(manifest, 'https://fixture.test/first/manifest.json');
  await updateRemoteExtension({ ...first, enabled: false, preferences: { language: 'id' }, matches: { show: 'mapped-title' } });
  const reconfigured = await installRemoteExtension({ ...manifest, version: '2.0' }, 'https://fixture.test/second/manifest.json', first.id);
  assert.equal(reconfigured.id, first.id);
  assert.equal(reconfigured.enabled, false);
  assert.deepEqual(reconfigured.preferences, { language: 'id' });
  assert.deepEqual(reconfigured.matches, { show: 'mapped-title' });
  const records = JSON.parse(localStorage.getItem('tatakai_extension_manifests')!);
  assert.equal(records.length, 1);
  assert.equal(records[0].manifestUrl, 'https://fixture.test/second/manifest.json');
  assert.equal(records[0].version, '2.0');
  assert.equal(records[0].enabled, false);
  assert.equal(records[0].type, 'onlinestream');
  assert.equal((await installRemoteExtension(manifest, reconfigured.manifestUrl)).id, first.id);
  const other = await installRemoteExtension(manifest, 'https://fixture.test/other/manifest.json');
  assert.notEqual(other.id, first.id);
  await assert.rejects(installRemoteExtension({ ...manifest, id: 'different' }, reconfigured.manifestUrl, first.id));
  assert.equal((await listRemoteExtensions()).find(row => row.id === first.id)?.manifest.id, manifest.id);
  await removeRemoteExtension(first.id);
  assert.equal((await listRemoteExtensions()).length, 1);
  assert.deepEqual(JSON.parse(localStorage.getItem('tatakai_installed_extensions')!), [other.id]);
  assert.equal(JSON.parse(localStorage.getItem('tatakai_extension_manifests')!)[0].id, other.id);
  assert.ok(notices >= 5);
  await removeRemoteExtension(other.id);
} finally { dom.window.close(); }
