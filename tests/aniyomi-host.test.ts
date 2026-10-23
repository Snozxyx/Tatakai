import { describe, expect, it } from 'bun:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { AniyomiHost, pins } from '../desktop/runtime/compatibility/aniyomi.cjs';
import { isAniyomiRepositoryMetadata } from '../src/core/extensions/compatibility/repository-metadata';

describe('Aniyomi native host boundary', () => {
  it('cancels a timed-out request without killing the host or unrelated pending work', async () => {
    const writes: any[] = []; let killed = 0;
    const host = new AniyomiHost({ root: '/unused', javaHost: {}, requestTimeoutMs: 30 });
    host.start = async () => {};
    host.child = { stdin: { destroyed: false, write(value: string) { writes.push(JSON.parse(value)); } }, kill() { killed++; } };
    try {
      const slow = host.call({ op: 'search', requestId: 'slow' });
      await expect(slow).rejects.toThrow('timed out');
      expect(killed).toBe(0); expect(writes.some(row => row.op === 'cancel' && row.target === 'slow')).toBe(true);
      const next = host.call({ op: 'search', requestId: 'next' }); await Promise.resolve(); await Promise.resolve();
      host.pending.get('next').resolve({ results: [] }); expect(await next).toEqual({ results: [] });
    } finally { host.stop(); }
  });
  it('recovers a poisoned HttpUrl initializer once for reads without repeating installation', async () => {
    const host = new AniyomiHost({ root: '/unused', javaHost: {} }); let requests = 0, restarts = 0;
    host.call = async () => { if (++requests === 1) throw Error('Could not initialize class okhttp3.HttpUrl'); return { results: [] }; };
    host.restartRuntime = async () => { restarts++; };
    expect(await host.request({ op: 'search', requestId: 'read' })).toEqual({ results: [] }); expect(restarts).toBe(1);
    host.call = async () => { throw Error('Could not initialize class okhttp3.HttpUrl'); };
    await expect(host.request({ op: 'install', requestId: 'write' })).rejects.toThrow('HttpUrl'); expect(restarts).toBe(1);
    await expect(host.request({ op: 'search', requestId: 'still-broken' })).rejects.toThrow('HttpUrl'); expect(restarts).toBe(2);
    host.stop();
  });
  it('honors cancellation while a poisoned runtime is restarting', async () => {
    const host = new AniyomiHost({ root: '/unused', javaHost: {} }); let release!: () => void, entered!: () => void;
    const restarting = new Promise<void>(resolve => { entered = resolve; });
    host.restartRuntime = async () => { entered(); await new Promise<void>(resolve => { release = resolve; }); };
    host.call = async (_payload, signal?: AbortSignal) => { if (signal) { signal.throwIfAborted(); return {}; } throw Error('Could not initialize class okhttp3.HttpUrl'); };
    const pending = host.request({ op: 'search', requestId: 'cancel-recovery' }); await restarting;
    await host.request({ op: 'cancel', target: 'cancel-recovery' }); release();
    await expect(pending).rejects.toThrow('cancelled'); host.stop();
  });
  it('verifies bundled bytes and fails clearly when an installed runtime is missing or corrupt', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tatakai-aniyomi-bundle-'));
    const host = new AniyomiHost({ root, javaHost: {}, bundledRoot: root, bundledRequired: true });
    const folder = path.join(root, 'aniyomi', pins.desktop.sha256), bytes = Buffer.from('original fixture');
    const expected = createHash('sha256').update(bytes).digest('hex');
    try {
      await expect(host.bundled('fixture.bin', expected, bytes.length)).rejects.toThrow('missing');
      await fs.mkdir(folder, { recursive: true }); await fs.writeFile(path.join(folder, 'fixture.bin'), bytes);
      expect(await host.bundled('fixture.bin', expected, bytes.length)).toEqual(bytes);
      await expect(host.bundled('fixture.bin', expected, bytes.length + 1)).rejects.toThrow('checksum');
      await fs.writeFile(path.join(folder, 'fixture.bin'), 'tampered');
      await expect(host.bundled('fixture.bin', expected, bytes.length)).rejects.toThrow('checksum');
    } finally { host.stop(); if (!path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep)) throw Error('Invalid test cleanup path'); await fs.rm(root, { recursive: true, force: true }); }
  });
  it('reads installed metadata without starting or downloading a JVM', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tatakai-aniyomi-'));
    let started = 0;
    const host = new AniyomiHost({ root, javaHost: { ready: async () => false, prepare: async () => { throw Error('Unexpected runtime download'); } } });
    host.start = async () => { started++; throw Error('Unexpected execution'); };
    try {
      expect(await host.request({ op: 'installedPackages' })).toEqual([]);
      const pkg = { id: 'a'.repeat(64), repository: 'https://repo.test/index.pb', pkgName: 'eu.kanade.tachiyomi.animeextension.test', ecosystem: 'aniyomi', kind: 'watch', name: 'Fixture', sources: [{ id: '9223372036854775807', name: 'Original source', lang: 'en' }] };
      const expected = 'compat-aniyomi-' + createHash('sha256').update(JSON.stringify([pkg.repository, pkg.pkgName, pkg.sources[0].id])).digest('hex').slice(0, 32);
      await fs.writeFile(path.join(root, 'state.json'), JSON.stringify({ version: 1, repositories: [{ url: pkg.repository }], packages: { [pkg.id]: pkg }, enabled: { [expected]: true } }));
      const sources = await host.request({ op: 'sources' });
      expect(sources[0]).toMatchObject({ id: expected, upstreamId: '9223372036854775807', ecosystem: 'aniyomi', enabled: true });
      expect((await host.request({ op: 'installedPackages' }))[0].installed).toBe(true);
      expect(started).toBe(0);
      await fs.writeFile(path.join(root, 'state.json'), 'invalid-json');
      await expect(host.request({ op: 'installedPackages' })).rejects.toThrow('preserved');
      expect(await fs.readFile(path.join(root, 'state.json'), 'utf8')).toBe('invalid-json');
    } finally { host.stop(); if (!path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep)) throw Error('Invalid test cleanup path'); await fs.rm(root, { recursive: true, force: true }); }
  });
  it('cancels preparation without executing a package or exposing arbitrary host operations', async () => {
    const host = new AniyomiHost({ root: '/unused', javaHost: {} });
    let entered!: () => void;
    const ready = new Promise<void>(resolve => { entered = resolve; });
    host.prepare = async (signal: AbortSignal) => { entered(); await new Promise((_, reject) => signal.addEventListener('abort', () => reject(Error('cancelled')), { once: true })); };
    const pending = host.request({ op: 'prepare', requestId: 'preparation' }); await ready;
    await host.request({ op: 'cancel', target: 'preparation' }); await expect(pending).rejects.toThrow('cancelled');
    await expect(host.request({ op: 'arbitraryJavaMethod' })).rejects.toThrow('Unsupported');
    expect(isAniyomiRepositoryMetadata([{ name: 'Aniyomi: Fixture', pkg: 'eu.test', apk: 'fixture.apk' }])).toBe(true);
    expect(isAniyomiRepositoryMetadata([{ name: 'Sora module', scriptURL: 'https://repo.test/original.js' }])).toBe(false);
    host.stop();
  });
});
