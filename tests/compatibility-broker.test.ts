import { describe, it, expect } from 'bun:test';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CompatibilityBroker, sourceKey, httpsUrl } from '../desktop/runtime/compatibility/broker.cjs';
import { runtimeFor } from '../desktop/runtime/compatibility/suwayomi.cjs';
import { LocalProxyServer } from '../desktop/runtime/proxy/local-proxy-server.cjs';

describe('local compatibility boundaries', () => {
  it('keeps installed source identity and enabled state when repository metadata changes to a raw endpoint', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'tatakai-origin-'));
    const original = 'https://github.com/owner/repo/raw/branch/index.pb';
    let repository = original;
    const host = { ready: async () => true, start: async () => {}, stop() {}, graphql: async (query: string) => {
      if (query.includes('extensions {')) return { extensions: { nodes: [{ pkgName: 'pkg', name: 'Reader', isInstalled: true, storeIndexUrl: repository, source: { nodes: [{ id: '9223372036854775807', name: 'Source', lang: 'en' }] } }] } };
      if (query.includes('addExtensionStore')) { repository = 'https://raw.githubusercontent.com/owner/repo/branch/index.pb'; return {}; }
      throw Error('Unexpected query');
    } };
    const broker = new CompatibilityBroker({ root, host, proxy: () => '' });
    const request = (p: any) => broker.request({ ...p, requestId: crypto.randomUUID() });
    try {
      const [before] = await request({ op: 'sources', ecosystem: 'mihon' });
      await request({ op: 'setEnabled', sourceId: before.id, enabled: true });
      await request({ op: 'addRepository', ecosystem: 'mihon', url: original });
      expect(await request({ op: 'sources', ecosystem: 'mihon' })).toMatchObject([{ id: before.id, repository: original, enabled: true }]);
      const persisted = JSON.parse(await readFile(path.join(root, 'state.json'), 'utf8'));
      expect(persisted.enabled[before.id]).toBe(true);
      expect(Object.values(persisted.sourceOrigins)).toEqual([original]);
    } finally { broker.stop(); await rm(root, { recursive: true, force: true }); }
  });
  it('reads installed Mihon metadata without refreshing repositories or including uninstalled packages', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'tatakai-inventory-'));
    const queries: string[] = [];
    const broker = new CompatibilityBroker({ root, proxy: () => '', host: { ready: async () => true, start: async () => {}, stop() {}, graphql: async (query: string) => {
      queries.push(query); return { extensions: { nodes: [{ pkgName: 'installed.pkg', name: 'Installed', versionName: '1.6', isInstalled: true, storeIndexUrl: 'https://removed.test/index.pb' }, { pkgName: 'other.pkg', isInstalled: false }] } };
    } } });
    try {
      expect(await broker.request({ op: 'installedPackages', ecosystem: 'mihon', requestId: 'inventory' })).toMatchObject([{ id: 'installed.pkg', version: '1.6', installed: true, repository: 'https://removed.test/index.pb', ecosystem: 'mihon' }]);
      expect(queries.length).toBe(1); expect(queries[0]).not.toContain('fetchExtensions');
    } finally { broker.stop(); await rm(root, { recursive: true, force: true }); }
  });
  it('shares one local proxy listener across concurrent cover requests', async () => {
    const proxy = new LocalProxyServer({ info() {}, warn() {}, error() {} });
    try {
      const endpoints = await Promise.all(Array.from({ length: 12 }, () => proxy.ensureStarted()));
      expect(new Set(endpoints).size).toBe(1);
      const response = await fetch(endpoints[0] + '/missing');
      await response.text();
      expect(response.status).toBe(404);
    } finally { await proxy.stop(); }
  });
  it('selects each desktop runtime rather than falling back to Windows', () => {
    expect(runtimeFor('win32', 'x64').name).toBe('windows-x64');
    expect(runtimeFor('linux', 'x64').name).toBe('linux-x64');
    expect(runtimeFor('darwin', 'x64').name).toBe('macOS-x64');
    expect(runtimeFor('darwin', 'arm64').name).toBe('macOS-arm64');
    expect(runtimeFor('linux', 'arm64')).toBeNull();
    expect(runtimeFor('ios', 'arm64')).toBeNull();
  });
  it('dispatches playback through the main bridge and isolates failed source hosts', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'tatakai-compat-test-'));
    const broker = new CompatibilityBroker({ root, host: { stop() {}, ready: async () => { throw Error('Mihon failed'); } }, proxy: () => '' });
    broker.cloudstream = { request: async (p: any) => ({ sources: [{ url: 'https://source.test/video.mp4' }] }), sources: async () => [{ id: 'compat-cloudstream-fixture', enabled: true }], stop() {} };
    try {
      expect(await broker.request({ requestId: 'play', op: 'resolve', sourceId: 'compat-cloudstream-fixture', id: 'title', episodeId: 'episode' })).toMatchObject({ sources: [{ url: 'https://source.test/video.mp4' }] });
      expect(await broker.request({ requestId: 'list', op: 'sources' })).toMatchObject([{ id: 'compat-cloudstream-fixture' }]);
    } finally { broker.stop(); await rm(root, { recursive: true, force: true }); }
  });
  it('keeps 64-bit source IDs and repository ownership distinct', () => {
    const id = '9223372036854775807';
    expect(sourceKey('https://a.test/repo', 'pkg', id)).not.toBe(sourceKey('https://b.test/repo', 'pkg', id));
    expect(sourceKey('https://a.test/repo', 'pkg', id)).not.toBe(sourceKey('https://a.test/repo', 'pkg', '9223372036854775806'));
    for (const u of ['file:///etc/passwd', 'http://repo.test', 'https://user:pass@repo.test']) expect(() => httpsUrl(u)).toThrow();
  });
  it('enforces disabled sources and source ownership in the host, not the UI', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'tatakai-compat-test-'));
    const calls: string[] = [];
    const host = { ready: async () => true, start: async () => {}, stop() {}, base: 'http://127.0.0.1:1234', authorization: 'Basic secret',
      graphql: async (q: string) => {
        calls.push(q);
        if (q.includes('extensions {')) return { extensions: { nodes: [{ pkgName: 'pkg', name: 'Reader', isInstalled: true, storeIndexUrl: 'https://repo.test', source: { nodes: [{ id: '9223372036854775807', name: 'Source', lang: 'en' }] } }] } };
        if (q.includes('manga(id:')) return { manga: { sourceId: '123' } };
        throw Error('Unexpected query');
      } };
    const broker = new CompatibilityBroker({ root, host, proxy: async (url: string) => url });
    const request = (p: any) => broker.request({ requestId: crypto.randomUUID(), ...p });
    try {
      const [source] = await request({ op: 'sources' });
      expect(source.upstreamId).toBe('9223372036854775807');
      expect(source.enabled).toBe(false);
      await expect(request({ op: 'search', sourceId: source.id, query: 'Naruto' })).rejects.toThrow('disabled');
      expect(calls.some(q => q.includes('fetchSourceManga'))).toBe(false);
      await request({ op: 'setEnabled', sourceId: source.id, enabled: true });
      await expect(request({ op: 'info', sourceId: source.id, id: '42' })).rejects.toThrow('belong');
      expect(calls.some(q => q.includes('fetchMangaAndChapters'))).toBe(false);
      const stored = JSON.parse(await readFile(path.join(root, 'state.json'), 'utf8'));
      expect(stored.enabled[source.id]).toBe(true);
      const proxied: any[] = [];
      broker.proxy = async (url: string, headers: any) => { proxied.push({ url, headers }); return 'opaque-token'; };
      expect(await broker.mediaUrl('/api/v1/page')).toBe('opaque-token');
      expect(proxied[0].headers.Authorization).toBe('Basic secret');
      await broker.mediaUrl('https://cdn.test/page.jpg');
      expect(proxied[1].headers.Authorization).toBeUndefined();
      expect(await broker.mediaUrl('javascript:alert(1)')).toBeUndefined();
    } finally { broker.stop(); await rm(root, { recursive: true, force: true }); }
  });
  it('preserves malformed persisted state instead of silently overwriting it', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'tatakai-compat-test-'));
    await writeFile(path.join(root, 'state.json'), '{bad');
    const broker = new CompatibilityBroker({ root, host: { stop() {} }, proxy: () => '' });
    try {
      await expect(broker.request({ op: 'sources', requestId: 'test' })).rejects.toThrow('preserved');
      expect(await readFile(path.join(root, 'state.json'), 'utf8')).toBe('{bad');
    } finally { broker.stop(); await rm(root, { recursive: true, force: true }); }
  });
  it('keeps rejecting invalid state on repeated requests', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'tatakai-compat-test-'));
    const original = JSON.stringify({ version: 999, enabled: {} });
    await writeFile(path.join(root, 'state.json'), original);
    const broker = new CompatibilityBroker({ root, host: { stop() {} }, proxy: () => '' });
    try {
      for (let i = 0; i < 2; i++) await expect(broker.request({ op: 'sources', requestId: `invalid-${i}` })).rejects.toThrow('preserved');
      expect(await readFile(path.join(root, 'state.json'), 'utf8')).toBe(original);
    } finally { broker.stop(); await rm(root, { recursive: true, force: true }); }
  });
  it('propagates cancellation into runtime preparation', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'tatakai-compat-test-'));
    let began!: () => void;
    const started = new Promise<void>(resolve => { began = resolve; });
    let observed: AbortSignal | undefined;
    const host = { stop() {}, prepare: async (signal: AbortSignal) => {
      observed = signal; began();
      await new Promise((_, reject) => signal.addEventListener('abort', () => reject(Error('download cancelled')), { once: true }));
    } };
    const broker = new CompatibilityBroker({ root, host, proxy: () => '' });
    try {
      const preparation = broker.request({ op: 'prepare', requestId: 'download' }).then(() => null, (error: Error) => error);
      await started;
      await broker.request({ op: 'cancel', requestId: 'cancel', target: 'download' });
      expect((await preparation)?.message).toContain('cancelled');
      expect(observed?.aborted).toBe(true);
    } finally { broker.stop(); await rm(root, { recursive: true, force: true }); }
  });
});
