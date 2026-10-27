import { describe, test, expect } from 'bun:test';
import { CloudDebridClient } from '../src/core/providers/cloud-debrid-client';
import { DebridOrchestrator, extractMagnetHash } from '../src/core/providers/debrid-orchestrator';
import type { DebridHttpRequest } from '../src/core/providers/debrid-http';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { normalizeRequest } = require('../desktop/ipc/ipc-debrid.cjs');
const magnet = 'magnet:?xt=urn:btih:' + 'a'.repeat(40);
function response(body: unknown, status = 200): any { return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) }; }

describe('four-provider abstraction', () => {
  test('base32 and hex magnets share a canonical cache identity', () => {
    expect(extractMagnetHash('magnet:?xt=urn:btih:' + 'A'.repeat(32))).toBe('0'.repeat(40));
  });
  test('AllDebrid verifies account, reports unknown availability without mutation, resolves selected file', async () => {
    const calls: string[] = [];
    const request: DebridHttpRequest = async (url, init) => {
      calls.push(new URL(url).pathname);
      expect(init?.headers?.Authorization).toBe('Bearer key');
      const bodies: Record<string, unknown> = {
        '/v4/user': { user: { isPremium: true } }, '/v4/magnet/upload': { magnets: [{ id: 7 }] },
        '/v4.1/magnet/status': { magnets: { id: 7, statusCode: 4, status: 'Ready' } },
        '/v4/magnet/files': { magnets: [{ id: 7, files: [{ n: 'Pack', e: [{ n: 'Fixture - 01.mkv', s: 50, l: 'first' }, { n: 'Fixture - 02.mkv', s: 50, l: 'second' }] }] }] },
        '/v4/link/unlock': { link: 'https://cdn.test/episode2.mkv' },
      };
      if (url.endsWith('/link/unlock')) expect(init?.body).toBe('link=second');
      if (!bodies[new URL(url).pathname]) return response({ status: 'error', error: { code: 'DISCONTINUED', message: 'This API endpoint has been discontinued' } });
      return response({ status: 'success', data: bodies[new URL(url).pathname] });
    };
    const client = new CloudDebridClient('alldebrid', 'key', request);
    await client.verifyToken(); const before = calls.length;
    expect(await client.checkAvailability(['a'])).toEqual({ a: 'unknown' }); expect(calls.length).toBe(before);
    expect(await client.resolve(magnet, { episodeNumber: 2, maxPollAttempts: 1 })).toBe('https://cdn.test/episode2.mkv');
  });
  test('Premiumize cache checks never create transfers; cached pack resolution selects the episode', async () => {
    const calls: string[] = [];
    const request: DebridHttpRequest = async (url, init) => {
      calls.push(new URL(url).pathname);
      if (url.includes('/cache/check')) {
        expect(init?.body).toContain('items%5B%5D=');
        return response({ status: 'success', response: [true, false] });
      }
      return response({ status: 'success', content: [{ path: 'Fixture - 01.mkv', size: 50, link: 'https://cdn.test/1' }, { path: 'Fixture - 02.mkv', size: 50, link: 'https://cdn.test/2' }] });
    };
    const client = new CloudDebridClient('premiumize', 'key', request);
    expect(await client.checkAvailability(['a', 'b'])).toEqual({ a: 'cached', b: 'uncached' });
    expect(calls).toEqual(['/api/cache/check']);
    expect(await client.resolve(magnet, { episodeNumber: 2 })).toBe('https://cdn.test/2');
    expect(calls).not.toContain('/api/transfer/create');
  });
  test('authentication/rate limits and pre-cancelled operations fail without further requests', async () => {
    for (const provider of ['alldebrid', 'premiumize'] as const) {
      const client = new CloudDebridClient(provider, 'bad', async () => response({ status: 'error', message: 'rate limit', error: { message: 'rate limit' } }, 429));
      await expect(client.verifyToken()).rejects.toThrow('rate limit');
      const controller = new AbortController(); controller.abort(); let requests = 0;
      const cancelled = new CloudDebridClient(provider, 'key', async () => { requests++; return response({}); });
      await expect(cancelled.resolve(magnet, { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
      expect(requests).toBe(0);
    }
  });
  test('desktop API transport permits only the four providers', () => {
    for (const hostname of ['api.real-debrid.com', 'api.torbox.app', 'api.alldebrid.com', 'www.premiumize.me']) expect(normalizeRequest({ url: `https://${hostname}/api` }).method).toBe('GET');
    for (const url of ['https://evil.test/api', 'http://www.premiumize.me/api', 'https://www.premiumize.me:123/api']) expect(() => normalizeRequest({ url })).toThrow();
  });
});

describe('debrid cache isolation and concurrent resolution', () => {
  function orchestrator(key: string, url: string) {
    const values = new Map<string, string>();
    values.set('tatakai_debrid_accounts', JSON.stringify([{ provider: 'realdebrid', apiKey: key, isActive: true }]));
    const instance = new DebridOrchestrator({ getItem: key => values.get(key) || null, setItem: (key, value) => { values.set(key, value); } });
    let adds = 0;
    const client = {
      addMagnet: async () => { adds++; await new Promise(resolve => setTimeout(resolve, 2)); return '1'; },
      getTorrentInfo: async () => ({ status: 'downloaded', files: [{ id: 1, path: 'Fixture - 01.mp4', bytes: 99 }], links: ['host'] }),
      selectFiles: async () => {}, unrestrictLink: async () => ({ url, filename: 'Fixture', mimeType: 'video/mp4', filesize: 99 }),
    };
    (instance as any).rdClient = client;
    return { instance, client, count: () => adds };
  }
  test('concurrent calls dedupe; accounts never reuse one another’s URL', async () => {
    const first = orchestrator('first', 'https://cdn.test/first'), second = orchestrator('second', 'https://cdn.test/second');
    expect(await Promise.all([first.instance.resolveMagnetToStream(magnet), first.instance.resolveMagnetToStream(magnet)])).toEqual(['https://cdn.test/first', 'https://cdn.test/first']);
    expect(first.count()).toBe(1);
    expect(await second.instance.resolveMagnetToStream(magnet)).toBe('https://cdn.test/second');
    first.instance.invalidateResolvedUrls(); await first.instance.resolveMagnetToStream(magnet); expect(first.count()).toBe(2);
  });
  test('expired signed URLs are resolved again rather than cached', async () => {
    const { instance, count } = orchestrator('first', 'https://cdn.test/file?expires=1600000000');
    await instance.resolveMagnetToStream(magnet); await instance.resolveMagnetToStream(magnet);
    expect(count()).toBe(2);
  });
  test('cancelling one subscriber leaves the other request usable', async () => {
    const { instance, count } = orchestrator('first', 'https://cdn.test/first'); const controller = new AbortController();
    const abandoned = instance.resolveMagnetToStream(magnet, { signal: controller.signal });
    const active = instance.resolveMagnetToStream(magnet); controller.abort();
    await expect(abandoned).rejects.toMatchObject({ name: 'AbortError' }); expect(await active).toBe('https://cdn.test/first'); expect(count()).toBe(1);
  });
});
