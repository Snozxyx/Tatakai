import { describe, expect, it } from 'bun:test';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { CloudStreamBroker, packageKey, sourceKey } from '../desktop/runtime/compatibility/cloudstream.cjs';
const hash = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

describe('CloudStream native broker lifecycle', () => {
  it('discards runtime state after failed candidate cleanup while preserving the installed pointer', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'tatakai-cs3-recovery-'));
    const repository = 'https://repo.test/repo.json', id = packageKey(repository, 'Plugin');
    const previousBytes = Buffer.from('old'), candidateBytes = Buffer.from('new');
    const previous = { id, repository, digest: hash(previousBytes), version: 1, url: 'https://repo.test/old.cs3' };
    await mkdir(path.join(root, 'packages'));
    await writeFile(path.join(root, 'packages', `${id}.${previous.digest}.cs3`), previousBytes);
    await writeFile(path.join(root, 'state.json'), JSON.stringify({ version: 1, repositories: [], packages: { [id]: previous }, enabled: {} }));
    let reset = 0;
    const host = { stop() {}, reset() { reset++; }, call: async (method: string) => { throw Error(method === 'loadPlugin' ? 'candidate failed' : 'cleanup failed'); } };
    const broker = new CloudStreamBroker({ root, host });
    broker.catalog = async () => [{ ...previous, fileHash: hash(candidateBytes), url: 'https://repo.test/new.cs3' }];
    broker.fetchBytes = async () => candidateBytes;
    try {
      await expect(broker.request({ op: 'install', requestId: 'replace', packageId: id })).rejects.toThrow('process reset');
      expect(reset).toBe(1);
      expect(JSON.parse(await readFile(path.join(root, 'state.json'), 'utf8')).packages[id].digest).toBe(previous.digest);
      expect(broker.sourcesById.size).toBe(0);
    } finally { broker.stop(); await rm(root, { recursive: true, force: true }); }
  });
  it('preserves an installed package and flags when candidate loading fails', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'tatakai-cs3-'));
    const repository = 'https://repo.test/repo.json', id = packageKey(repository, 'Plugin');
    const previousBytes = Buffer.from('installed-fixture'), candidateBytes = Buffer.from('failing-fixture');
    const previous = { id, repository, name: 'Plugin', digest: hash(previousBytes), version: 1, url: 'https://repo.test/old.cs3' };
    const sid = sourceKey(repository, id, 'Source', 'en');
    await mkdir(path.join(root, 'packages'));
    await writeFile(path.join(root, 'packages', `${id}.${previous.digest}.cs3`), previousBytes);
    await writeFile(path.join(root, 'state.json'), JSON.stringify({ version: 1, repositories: [], packages: { [id]: previous }, enabled: { [sid]: true } }));
    const loaded: string[] = [];
    const host = { stop() {}, call: async (method: string, params: any) => {
      if (method === 'loadPlugin') { loaded.push(params.path); if (params.path.includes(hash(candidateBytes))) throw Error('Candidate API dependency missing'); }
      return { providers: [] };
    } };
    const broker = new CloudStreamBroker({ root, host, proxy: (url: string) => url });
    broker.catalog = async () => [{ ...previous, version: 2, fileHash: 'sha256-' + hash(candidateBytes), url: 'https://repo.test/new.cs3' }];
    broker.fetchBytes = async () => candidateBytes;
    try {
      await expect(broker.request({ op: 'install', requestId: 'update', packageId: id })).rejects.toThrow('dependency');
      const persisted = JSON.parse(await readFile(path.join(root, 'state.json'), 'utf8'));
      expect(persisted.packages[id].digest).toBe(previous.digest);
      expect(persisted.enabled[sid]).toBe(true);
      expect(await readFile(path.join(root, 'packages', `${id}.${previous.digest}.cs3`))).toEqual(previousBytes);
      expect(loaded.at(-1)).toContain(previous.digest);
    } finally { broker.stop(); await rm(root, { recursive: true, force: true }); }
  });
  it('binds content IDs to their source and keeps removed-repository packages manageable', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'tatakai-cs3-'));
    const broker = new CloudStreamBroker({ root, host: { stop() {} }, proxy: (url: string) => url });
    try {
      await broker.load();
      const encoded = broker.titleId('source-a', 'https://source.test/title');
      expect(broker.titleUrl('source-a', encoded)).toBe('https://source.test/title');
      expect(() => broker.titleUrl('source-b', encoded)).toThrow('belong');
      expect(() => broker.titleId('source-a', 'file:///private')).toThrow();
      broker.state.packages.pkg = { id: 'pkg', name: 'Installed', repository: 'https://removed.test/repo.json' };
      expect((await broker.catalog())[0]).toMatchObject({ id: 'pkg', installed: true, hasUpdate: false });
      broker.json = async () => { throw Error('Offline repository'); };
      broker.state.repositories = [{ url: 'https://offline.test/repo.json' }];
      expect(await broker.request({ op: 'installedPackages', requestId: 'offline-inventory' })).toMatchObject([{ id: 'pkg', name: 'Installed', installed: true }]);
    } finally { broker.stop(); await rm(root, { recursive: true, force: true }); }
  });
  it('adapts stream headers and subtitle language, and reports empty/unsupported resolution', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'tatakai-cs3-'));
    let links: any = { completed: true, links: [{ url: 'https://cdn.test/video.m3u8', type: 'M3U8', quality: 720, name: 'Server', headers: { Cookie: 'source-cookie' }, referer: 'https://source.test/' }],
      subtitles: [{ url: 'https://cdn.test/en.vtt', lang: 'English', headers: { Cookie: 'subtitle-cookie' } }] };
    const broker = new CloudStreamBroker({ root, host: { stop() {}, call: async (method: string) => method === 'load' ? { dataUrl: 'episode-data' } : links }, proxy: (url: string) => url });
    try {
      await broker.load();
      broker.sources = async () => [];
      broker.state.enabled['source-a'] = true;
      broker.sourcesById.set('source-a', { id: 'source-a', name: 'Source', extensionName: 'Extension', filename: 'plugin.cs3' });
      const payload = { op: 'resolve', sourceId: 'source-a', id: broker.titleId('source-a', 'https://source.test/title'), episodeId: hash('source-a\0episode-data') };
      const result = await broker.request({ ...payload, requestId: 'resolve' });
      expect(result.sources[0]).toMatchObject({ source: 'Server', sourceType: 'hls', headers: { Cookie: 'source-cookie', Referer: 'https://source.test/' },
        subtitles: [{ language: 'English', label: 'English', headers: { Cookie: 'subtitle-cookie' } }] });
      links = { links: [], completed: false };
      await expect(broker.request({ ...payload, requestId: 'timeout' })).rejects.toThrow('timed out');
      links = { links: [], completed: true };
      await expect(broker.request({ ...payload, requestId: 'empty' })).rejects.toThrow('no supported');
      links = { links: [{ url: 'https://cdn.test/manifest.mpd', type: 'DASH', drm: {} }], completed: true };
      await expect(broker.request({ ...payload, requestId: 'drm' })).rejects.toThrow('DRM');
    } finally { broker.stop(); await rm(root, { recursive: true, force: true }); }
  });
});
