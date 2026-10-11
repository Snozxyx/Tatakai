import { afterAll, expect, test } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { prepareHlsCheckpoint } = require('../desktop/runtime/download/hls-checkpoint.cjs');
const { prepareFileCheckpoint } = require('../desktop/runtime/download/file-checkpoint.cjs');
const { resolveMediaInput } = require('../desktop/runtime/download/resolve-media-input.cjs');
const { DownloadRecoveryStore } = require('../desktop/runtime/download/recovery-store.cjs');
const resourceIdentity = require('../desktop/runtime/download/resource-identity.cjs');
const artifacts = path.resolve('.artifacts');
fs.mkdirSync(artifacts, { recursive: true });
const root = fs.mkdtempSync(path.join(artifacts, 'download-recovery-fixture-'));
const requests = new Map<string, number>();
const ranges: string[] = [];
const bytes = Buffer.alloc(512 * 1024, 7);
let imageAvailable = false;
const server = http.createServer((request, response) => {
  const pathname = new URL(request.url!, 'http://fixture').pathname;
  requests.set(pathname, (requests.get(pathname) || 0) + 1);
  if (pathname === '/proxy') {
    response.writeHead(302, { Location: '/playlist/master' }); response.end();
  } else if (pathname === '/playlist/master') {
    response.end('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100,RESOLUTION=640x360\nlow\n#EXT-X-STREAM-INF:BANDWIDTH=1000,RESOLUTION=1920x1080\nhigh\n');
  } else if (pathname === '/playlist/high') {
    response.writeHead(302, { Location: '/episode.m3u8' }); response.end();
  } else if (pathname === '/episode.m3u8') {
    response.end('#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:2,\nfast.ts\n#EXTINF:2,\nslow.ts\n#EXT-X-ENDLIST\n');
  } else if (pathname === '/fast.ts') response.end('complete segment one');
  else if (pathname === '/slow.ts') {
    const timer = setTimeout(() => response.end('complete segment two'), 100);
    response.on('close', () => clearTimeout(timer));
  } else if (pathname === '/file.mp4') {
    response.setHeader('ETag', '"fixture-v1"');
    const range = request.headers.range;
    const offset = range ? Number(range.match(/bytes=(\d+)-/)![1]) : 0;
    response.setHeader('Content-Length', bytes.length - offset);
    if (request.method === 'HEAD') return response.end();
    if (range) { ranges.push(range); response.statusCode = 206; response.setHeader('Content-Range', `bytes ${offset}-${bytes.length - 1}/${bytes.length}`); }
    let position = offset;
    const timer = setInterval(() => {
      if (position >= bytes.length) { clearInterval(timer); response.end(); return; }
      response.write(bytes.subarray(position, position + 65536)); position += 65536;
    }, 15);
    response.on('close', () => clearInterval(timer));
  } else if (pathname === '/page1.jpg') response.end('complete image one');
  else if (pathname === '/api/v3/toko/sources') response.end(JSON.stringify({ sources: [
    { sourceType: 'embed', url: 'https://fixture/embed', providerPriority: 0 },
    { sourceType: 'hls', url: `${base}/episode.m3u8`, headers: { Referer: 'https://fixture' }, providerPriority: 1 },
  ] }));
  else if (pathname === '/page2.jpg') { if (imageAvailable) response.end('complete image two'); else { response.statusCode = 404; response.end(); } }
  else { response.statusCode = 404; response.end(); }
});
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${(server.address() as any).port}`;
afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  if (!path.resolve(root).startsWith(artifacts + path.sep)) throw new Error('Unsafe fixture cleanup');
  fs.rmSync(root, { recursive: true, force: true });
});

test('HLS retries preserve finished segments and ignore incomplete resources', async () => {
  expect(resourceIdentity('https://fixture/segment?id=1&token=old')).toBe(resourceIdentity('https://fixture/segment?id=1&token=new'));
  expect(resourceIdentity('https://fixture/segment?id=1&token=old')).not.toBe(resourceIdentity('https://fixture/segment?id=2&token=new'));
  const output = path.join(root, 'episode.mp4');
  const controller = new AbortController();
  await expect(prepareHlsCheckpoint(`${base}/episode.m3u8?token=old`, output, {}, controller.signal, (value: any) => {
    if (value.percent > 0) controller.abort();
  })).rejects.toThrow();
  const progress: number[] = [];
  const playlist = await prepareHlsCheckpoint(`${base}/episode.m3u8?token=new`, output, {}, new AbortController().signal, (value: any) => progress.push(value.percent));
  expect(requests.get('/fast.ts')).toBe(1);
  expect(progress[0]).toBeGreaterThan(0);
  expect(fs.readFileSync(playlist, 'utf8')).toContain('#EXT-X-ENDLIST');
  const checkpoint = JSON.parse(fs.readFileSync(path.join(path.dirname(playlist), 'checkpoint.json'), 'utf8'));
  expect(Object.keys(checkpoint.completed).length).toBe(2);
});

test('extensionless redirected HLS uses the best variant and checkpoints relative segments', async () => {
  const input = await resolveMediaInput(`${base}/proxy`);
  expect(input).toEqual({ url: `${base}/playlist/high`, isHls: true });
  const playlist = await prepareHlsCheckpoint(input.url, path.join(root, 'proxy.mp4'), {}, new AbortController().signal);
  expect(fs.readFileSync(playlist, 'utf8')).toContain('#EXT-X-ENDLIST');
  const direct = await resolveMediaInput(`${base}/file.mp4`);
  expect(direct.isHls).toBe(false);
});

test('direct-file retry requests only remaining bytes and preserves the complete result', async () => {
  const output = path.join(root, 'direct.mp4');
  const controller = new AbortController();
  await expect(prepareFileCheckpoint(`${base}/file.mp4?token=old`, output, {}, controller.signal, (value: any) => {
    if (value.percent >= 30) controller.abort();
  })).rejects.toThrow();
  const partial = path.join(`${output}.resume`, 'media.partial');
  const savedBytes = fs.statSync(partial).size;
  expect(savedBytes).toBeGreaterThan(0);
  expect(savedBytes).toBeLessThan(bytes.length);
  const result = await prepareFileCheckpoint(`${base}/file.mp4?token=new`, output, {}, new AbortController().signal);
  expect(ranges).toContain(`bytes=${savedBytes}-`);
  expect(fs.readFileSync(result).equals(bytes)).toBe(true);
});

test('restart preserves settings and jobs; active jobs cannot be resumed twice', async () => {
  const directory = path.join(root, 'journal');
  const first = new DownloadRecoveryStore(directory);
  expect(first.autoResume).toBe(true);
  first.autoResume = true;
  first.save('anime-job', 'anime', { animeName: 'Fixture Anime' });
  first.save('manga-job', 'manga', { series: { title: 'Fixture Manga' }, chapter: { chapterKey: 'c4' } });
  const restarted = new DownloadRecoveryStore(directory);
  expect(restarted.summary().autoResume).toBe(true);
  expect(restarted.summary().jobs.map((job: any) => job.status)).toEqual(['interrupted', 'interrupted']);
  let calls = 0;
  restarted.register('anime', async () => { calls++; return { success: true }; });
  restarted.register('manga', async () => { calls++; return { success: true }; });
  await restarted.resume(); await restarted.resume();
  expect(calls).toBe(2);
  restarted.finish('anime-job'); restarted.fail('manga-job', 'offline');
  expect(restarted.summary().jobs).toMatchObject([{ id: 'manga-job', status: 'failed', error: 'offline' }]);
  restarted.autoResume = false; restarted.persist();
  expect(new DownloadRecoveryStore(directory).autoResume).toBe(false);
});

test('native auto-download resolves installed sources through the watch host and retains headers', async () => {
  const resolveSource = require('../desktop/services/auto-download-sources.cjs');
  const result = await resolveSource({ getBaseUrl: () => base, listNamespaces: () => [{ namespace: 'toko', routes: ['sources'] }] }, 123, 'Fixture Anime', 2);
  expect(result).toMatchObject({ sourceType: 'hls', url: `${base}/episode.m3u8`, headers: { Referer: 'https://fixture' } });
  expect(await resolveSource({ getBaseUrl: () => null }, 123, 'Fixture', 2)).toBeNull();
});

test('manga retry skips complete pages, replaces partial files, and never completes a partial chapter', async () => {
  const register = require('../desktop/ipc/ipc-manga-download-manager.cjs');
  const handlers = new Map<string, any>();
  const events: { name: string; data: any }[] = [];
  let terminal: ((value: any) => void) | undefined;
  const bundle = path.join(root, 'fixture-bundle.js'); fs.writeFileSync(bundle, '// fixture');
  register({ handle: (name: string, handler: any) => handlers.set(name, handler) }, { getPath: () => root }, fs, path,
    { info() {}, warn() {}, error() {} }, () => ({ isDestroyed: () => false, webContents: { send: (name: string, data: any) => {
      events.push({ name, data }); if (name === 'manga-download-completed' || name === 'manga-download-error') terminal?.({ name, data });
    } } }), {
      registry: { listLoaded: () => ['fixture'], isKillSwitched: () => false, lookup: () => ({ bundlePath: bundle, manifest: { capabilities: ['manga'] } }) },
      workerPool: { getOrSpawn: async () => {}, invoke: async () => [{ imageUrl: `${base}/page1.jpg` }, { imageUrl: `${base}/page2.jpg` }] },
    });
  const payload = { anilistId: 123, title: 'Fixture Manga', downloadPath: root, chapter: { chapterKey: 'c4', chapterNumber: 4, provider: 'fixture' } };
  const start = async () => {
    const completed = new Promise<any>(resolve => { terminal = resolve; });
    expect(await handlers.get('manga-download:enqueue-chapter')(null, payload)).toMatchObject({ success: true });
    return completed;
  };
  expect((await start()).name).toBe('manga-download-error');
  const chapterDirectory = path.join(root, 'Manga', 'Fixture Manga', 'Chapter_4');
  expect(fs.existsSync(path.join(chapterDirectory, 'manifest.json'))).toBe(false);
  fs.writeFileSync(path.join(chapterDirectory, '002.jpg.part'), 'truncated');
  imageAvailable = true;
  const result = await start();
  expect(result.name).toBe('manga-download-completed');
  expect(result.data.pageCount).toBe(2);
  expect(requests.get('/page1.jpg')).toBe(1);
  expect(fs.readFileSync(path.join(chapterDirectory, '002.jpg'), 'utf8')).toBe('complete image two');
}, 15_000);
