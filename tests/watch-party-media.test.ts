import { describe, expect, test } from 'bun:test';
import {
  MediaPeer, MediaResourceServer, createWatchPartyTransport, findWatchPartyMedia,
  isLocalMediaUrl, registerWatchPartyMedia,
} from '../src/core/watch-party/media';
import { createWatchPartyHlsLoader } from '../src/core/watch-party/media-hls';

class TestChannel extends EventTarget {
  readyState = 'open'; binaryType = 'arraybuffer'; bufferedAmount = 0; bufferedAmountLowThreshold = 0;
  peer!: TestChannel;
  send(data: string | ArrayBuffer) { queueMicrotask(() => this.peer.dispatchEvent(new MessageEvent('message', { data }))); }
}

function pair(server: MediaResourceServer) {
  const a = new TestChannel(); const b = new TestChannel(); a.peer = b; b.peer = a;
  return { host: new MediaPeer(a as unknown as RTCDataChannel, server), viewer: new MediaPeer(b as unknown as RTCDataChannel) };
}

describe('watch party resource authorization', () => {
  test('derives upload admission bitrate from HLS declarations and MP4 length', async () => {
    const hls = new MediaResourceServer({ rootUrl: 'https://cdn.example/master.m3u8', format: 'hls', fetcher: (async () =>
      new Response('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=10000000\nvariant.m3u8')) as typeof fetch });
    await hls.prepare(); expect(hls.estimatedBitrate(100)).toBe(10_000_000); hls.close();
    const mp4 = new MediaResourceServer({ rootUrl: 'https://cdn.example/movie.mp4', format: 'mp4', fetcher: (async () =>
      new Response(new Uint8Array(10), { status: 206, headers: { 'content-range': 'bytes 0-9/1000000' } })) as typeof fetch });
    await mp4.fetch(mp4.rootUrl, { range: { start: 0, end: 9 } });
    expect(mp4.estimatedBitrate(100)).toBe(80_000); mp4.close();
  });
  test('serves only selected root and resources discovered through nested manifests', async () => {
    const calls: string[] = [];
    const server = new MediaResourceServer({ rootUrl: 'https://cdn.example/master.m3u8', fetcher: (async url => {
      calls.push(String(url));
      const text = String(url).endsWith('master.m3u8') ? '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100000\nvariant.m3u8'
        : String(url).endsWith('variant.m3u8') ? '#EXTM3U\n#EXTINF:4,\nsegment.ts\n#EXT-X-ENDLIST' : 'segment bytes';
      return new Response(text, { headers: { 'content-type': String(url).endsWith('m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t' } });
    }) as typeof fetch });
    expect(await (await server.fetch('https://cdn.example/segment.ts')).text()).toBe('segment bytes');
    await expect(server.fetch('https://secret.example/private')).rejects.toThrow('not authorized');
    expect(calls).not.toContain('https://secret.example/private'); server.close();
  });

  test('maps the canonical root to a host-only proxy without exposing source headers', async () => {
    let fetched = '';
    const server = new MediaResourceServer({ rootUrl: 'https://cdn.example/movie.mp4', sourceUrl: 'http://127.0.0.1:8900/stream/token', format: 'mp4',
      fetcher: (async (url, init) => {
        fetched = String(url); expect(new Headers(init?.headers).get('range')).toBe('bytes=10-19');
        return new Response(new Uint8Array(10), { status: 206, headers: { 'content-range': 'bytes 10-19/100', 'set-cookie': 'never-forward' } });
      }) as typeof fetch });
    const response = await server.fetch('https://cdn.example/movie.mp4', { range: { start: 10, end: 19 } });
    expect(fetched).toBe('http://127.0.0.1:8900/stream/token'); expect(response.headers.has('set-cookie')).toBe(false); server.close();
  });

  test('rejects invalid ranges and oversized resource bodies', async () => {
    const server = new MediaResourceServer({ rootUrl: 'https://cdn.example/movie.mp4', fetcher: (async () => new Response('x', { headers: { 'content-length': String(40 * 1024 * 1024) } })) as typeof fetch });
    await expect(server.fetch(server.rootUrl, { range: { start: -1 } })).rejects.toThrow('Invalid');
    await expect(server.fetch(server.rootUrl)).rejects.toThrow('transfer limit'); server.close();
  });

  test('does not fetch private manifest targets on another local origin', async () => {
    const calls: string[] = [];
    const server = new MediaResourceServer({ rootUrl: 'https://cdn.example/master.m3u8', fetcher: (async url => {
      calls.push(String(url)); return new Response('#EXTM3U\nhttp://127.0.0.1:1234/private.ts');
    }) as typeof fetch });
    await server.prepare();
    await expect(server.fetch('http://127.0.0.1:1234/private.ts')).rejects.toThrow('not authorized');
    expect(calls).toEqual(['https://cdn.example/master.m3u8']); server.close();
  });
});

describe('watch party media channel', () => {
  test('waits for an existing data channel to open before requesting fallback media', async () => {
    const server = new MediaResourceServer({ rootUrl: 'http://127.0.0.1/video.mp4', format: 'mp4', fetcher: (async () => new Response('media bytes')) as typeof fetch });
    const a = new TestChannel(); const b = new TestChannel(); a.peer = b; b.peer = a; b.readyState = 'connecting';
    const host = new MediaPeer(a as unknown as RTCDataChannel, server); const viewer = new MediaPeer(b as unknown as RTCDataChannel);
    const transport = createWatchPartyTransport({ rootUrl: server.rootUrl, peer: () => viewer });
    setTimeout(() => { b.readyState = 'open'; }, 10);
    try { expect(await (await transport.fetch(server.rootUrl)).text()).toBe('media bytes'); }
    finally { viewer.close(); host.close(); server.close(); }
  });
  test('HLS zero byte-range sentinel is a whole request and destroying a completed loader is silent', async () => {
    let aborted = 0;
    const Loader = createWatchPartyHlsLoader({ rootUrl: 'https://cdn.example/master.m3u8', cancelPending() {},
      async fetch(_url, options) { expect(options?.range).toBeUndefined(); return new Response('#EXTM3U\n#EXT-X-ENDLIST'); } });
    const loader = new Loader();
    await new Promise<void>((resolve, reject) => loader.load({ url: 'https://cdn.example/master.m3u8', responseType: 'text', rangeStart: 0, rangeEnd: 0 },
      { timeout: 1000 } as any, { onSuccess: () => resolve(), onError: error => reject(Error(error.text)), onTimeout: () => reject(Error('timeout')), onAbort: () => { aborted++; } }));
    loader.destroy(); expect(aborted).toBe(0);
  });
  test('HLS byte ranges translate exclusive ends into HTTP inclusive ends', async () => {
    const Loader = createWatchPartyHlsLoader({ rootUrl: 'https://cdn.example/segment', cancelPending() {},
      async fetch(_url, options) { expect(options?.range).toEqual({ start: 10, end: 19 }); return new Response(new Uint8Array(10)); } });
    const loader = new Loader();
    await new Promise<void>((resolve, reject) => loader.load({ url: 'https://cdn.example/segment', responseType: 'arraybuffer', rangeStart: 10, rangeEnd: 20 },
      { timeout: 1000 } as any, { onSuccess: () => resolve(), onError: error => reject(Error(error.text)), onTimeout: () => reject(Error('timeout')) }));
    loader.destroy();
  });
  test('limits active host transfers globally and aborts a waiting viewer', async () => {
    const server = new MediaResourceServer({ rootUrl: 'https://cdn.example/movie.mp4' });
    const signal = new AbortController();
    const releases = await Promise.all(Array.from({ length: 4 }, () => server.acquire(signal.signal)));
    const waiting = new AbortController(); const request = server.acquire(waiting.signal);
    waiting.abort(); await expect(request).rejects.toThrow('cancelled');
    releases[0](); const release = await server.acquire(signal.signal); release();
    for (const release of releases) release(); server.close();
  });

  test('HLS loader recovers the failed viewer source through the media peer', async () => {
    const originalFetch = globalThis.fetch;
    const server = new MediaResourceServer({ rootUrl: 'https://cdn.example/episode.m3u8', fetcher: (async () => new Response('#EXTM3U\n#EXTINF:4,\nsegment.ts\n#EXT-X-ENDLIST')) as typeof fetch });
    const { host, viewer } = pair(server);
    globalThis.fetch = (async () => new Response('forbidden', { status: 403 })) as typeof fetch;
    try {
      const transport = createWatchPartyTransport({ rootUrl: server.rootUrl, peer: () => viewer });
      const Loader = createWatchPartyHlsLoader(transport); const loader = new Loader();
      const data = await new Promise<string>((resolve, reject) => loader.load({ url: server.rootUrl, responseType: 'text', type: 'manifest' as any },
        { timeout: 2000 } as any, { onSuccess: response => resolve(response.data as string), onError: error => reject(new Error(error.text)), onTimeout: () => reject(new Error('timed out')) }));
      expect(data).toContain('#EXTM3U'); expect(loader.stats.loaded).toBeGreaterThan(0); loader.destroy();
    } finally { globalThis.fetch = originalFetch; viewer.close(); host.close(); server.close(); }
  });

  test('reassembles bounded binary chunks and preserves HTTP range metadata', async () => {
    const data = Uint8Array.from({ length: 150000 }, (_, i) => i % 251);
    const server = new MediaResourceServer({ rootUrl: 'https://cdn.example/movie.mp4', fetcher: (async () => new Response(data, {
      status: 206, headers: { 'content-type': 'video/mp4', 'content-range': 'bytes 0-149999/1000000', 'content-length': '150000' },
    })) as typeof fetch });
    const { host, viewer } = pair(server);
    const response = await viewer.request(server.rootUrl, { range: { start: 0, end: data.length - 1 } });
    expect(response.status).toBe(206); expect(new Uint8Array(await response.arrayBuffer())).toEqual(data);
    viewer.close(); host.close(); server.close();
  });

  test('cancels an in-flight host request', async () => {
    let cancelled = false;
    const server = new MediaResourceServer({ rootUrl: 'https://cdn.example/movie.mp4', fetcher: ((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => { cancelled = true; reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
    })) as typeof fetch });
    const { host, viewer } = pair(server); const controller = new AbortController();
    const request = viewer.request(server.rootUrl, { signal: controller.signal });
    await new Promise(resolve => setTimeout(resolve, 5)); controller.abort();
    await expect(request).rejects.toThrow('cancelled');
    await new Promise(resolve => setTimeout(resolve, 5)); expect(cancelled).toBe(true);
    viewer.close(); host.close(); server.close();
  });

  test('falls back to host bytes when a viewer cannot reach the host-only source', async () => {
    const server = new MediaResourceServer({ rootUrl: 'http://127.0.0.1:8900/movie.mp4', fetcher: (async () => new Response('host bytes')) as typeof fetch });
    const { host, viewer } = pair(server);
    const modes: string[] = [];
    const transport = createWatchPartyTransport({ rootUrl: server.rootUrl, peer: () => viewer, onMode: mode => modes.push(mode) });
    expect(await (await transport.fetch(server.rootUrl)).text()).toBe('host bytes'); expect(modes).toEqual(['peer']);
    viewer.close(); host.close(); server.close();
  });

  test('registration cleanup cannot remove a newer source transport', () => {
    const a = createWatchPartyTransport({ rootUrl: 'https://cdn.example/movie.mp4', peer: () => undefined });
    const b = createWatchPartyTransport({ rootUrl: a.rootUrl, peer: () => undefined });
    const first = registerWatchPartyMedia(a.rootUrl, a); const second = registerWatchPartyMedia(b.rootUrl, b);
    first(); expect(findWatchPartyMedia(a.rootUrl)).toBe(b); second(); expect(findWatchPartyMedia(a.rootUrl)).toBeUndefined();
    expect(isLocalMediaUrl('http://172.20.1.1/video')).toBe(true);
  });
});
