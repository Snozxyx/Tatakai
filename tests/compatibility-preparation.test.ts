import { describe, it, expect } from 'bun:test';
import { mkdtemp, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { SuwayomiHost } from '../desktop/runtime/compatibility/suwayomi.cjs';
const sha = (value: Buffer) => createHash('sha256').update(value).digest('hex');

describe('observable runtime preparation', () => {
  it('reports received bytes and cancels without activating an incomplete archive', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'tatakai-prepare-'));
    let seen!: () => void;
    const received = new Promise<void>(resolve => { seen = resolve; });
    const controller = new AbortController();
    const host = new SuwayomiHost(root, { fetcher: async (_url: string, { signal }: { signal: AbortSignal }) => new Response(new ReadableStream({
      start(stream) { stream.enqueue(new Uint8Array([1, 2, 3])); signal.addEventListener('abort', () => stream.error(signal.reason), { once: true }); },
    }), { headers: { 'Content-Length': '20' } }) });
    Object.defineProperty(host, 'runtime', { value: { name: 'fixture', extension: 'zip', bytes: 20, sha256: '0'.repeat(64) } });
    let progress: any;
    Object.defineProperty(host, 'preparation', { get: () => progress, set: value => { progress = value; if (value.receivedBytes > 0) seen(); } });
    const pending = host.prepare(controller.signal).catch((error: Error) => error);
    try {
      await received;
      expect(host.preparation).toMatchObject({ stage: 'downloading', receivedBytes: 3, totalBytes: 20 });
      controller.abort(); await pending;
      expect(host.preparation.stage).toBe('cancelled');
      expect(await host.ready()).toBe(false);
      expect(await stat(path.join(root, 'runtime-fixture.zip.partial')).catch(() => null)).toBeNull();
    } finally { controller.abort(); host.stop(); await rm(root, { recursive: true, force: true }); }
  });
  it.skipIf(process.platform !== 'win32')('extracts a verified archive and reports extraction bytes before activation', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'tatakai-extract-'));
    const zip = new JSZip();
    zip.file('Suwayomi-Server-v2.4.2366-fixture/jre/bin/java.exe', 'fixture-java');
    zip.file('Suwayomi-Server-v2.4.2366-fixture/bin/Suwayomi-Server.jar', 'fixture-jar');
    const bytes = await zip.generateAsync({ type: 'nodebuffer' });
    const host = new SuwayomiHost(root);
    Object.defineProperty(host, 'runtime', { value: { name: 'fixture', extension: 'zip', bytes: bytes.length, sha256: sha(bytes) } });
    const history: any[] = []; let progress: any;
    Object.defineProperty(host, 'preparation', { get: () => progress, set: value => { progress = value; history.push(value); } });
    try {
      await writeFile(path.join(root, 'runtime-fixture.zip'), bytes);
      await host.prepare();
      expect(history.some(p => p.stage === 'extracting' && p.receivedBytes > 0 && p.receivedBytes === p.totalBytes)).toBe(true);
      expect(host.preparation.stage).toBe('ready'); expect(await host.ready()).toBe(true);
      expect(await readFile(host.java, 'utf8')).toBe('fixture-java');
    } finally { host.stop(); await rm(root, { recursive: true, force: true }); }
  });
});
