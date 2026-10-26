import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createServer } from 'node:http';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { serveStaticMedia } from '../scripts/media-cache.mjs';

const directory = mkdtempSync(path.join(tmpdir(), 'tatakai-media-test-'));
const filename = path.join(directory, 'video.mp4');
writeFileSync(filename, '0123456789');
const server = createServer((req, res) => { serveStaticMedia(req, res, filename); });
let origin: string;
beforeAll(async () => {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
afterAll(() => { server.close(); rmSync(directory, { recursive: true, force: true }); });

test('static videos have cache validators, correct MIME and HEAD support', async () => {
  const response = await fetch(origin);
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('video/mp4');
  expect(response.headers.get('cache-control')).toContain('max-age=86400');
  expect(await response.text()).toBe('0123456789');
  const conditional = await fetch(origin, { headers: { 'if-none-match': response.headers.get('etag')! } });
  expect(conditional.status).toBe(304);
  const head = await fetch(origin, { method: 'HEAD' });
  expect(head.headers.get('content-length')).toBe('10');
  expect(await head.text()).toBe('');
});

test('video seeking supports bounded, suffix, open and unsatisfiable byte ranges', async () => {
  for (const [range, content, contentRange] of [
    ['bytes=2-5', '2345', 'bytes 2-5/10'], ['bytes=-3', '789', 'bytes 7-9/10'],
    ['bytes=8-', '89', 'bytes 8-9/10'],
  ]) {
    const response = await fetch(origin, { headers: { range } });
    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe(contentRange);
    expect(await response.text()).toBe(content);
  }
  expect((await fetch(origin, { headers: { range: 'bytes=20-' } })).status).toBe(416);
  const stale = await fetch(origin, { headers: { range: 'bytes=2-5', 'if-range': '"stale"' } });
  expect(stale.status).toBe(200);
  expect(await stale.text()).toBe('0123456789');
});
