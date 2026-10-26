import { describe, expect, test } from 'bun:test';
import { createNativeWatchPartyMediaBridge, parseNativeMediaRange, rewriteNativePlaylist,
  type NativePeerMediaPlugin, type NativeRequest } from '../src/core/watch-party/media-native';
import type { WatchPartyMediaTransport } from '../src/core/watch-party/media';

describe('native watchroom HTTP ranges', () => {
  test('supports whole, open, suffix and bounded requests without fetching the entire MP4', () => {
    expect(parseNativeMediaRange(undefined, 50_000_000)).toEqual({ start: 0, end: 49_999_999, partial: false });
    expect(parseNativeMediaRange('bytes=5000000-', 50_000_000)).toEqual({ start: 5_000_000, end: 49_999_999, partial: true });
    expect(parseNativeMediaRange('bytes=-4096', 50_000_000)).toEqual({ start: 49_995_904, end: 49_999_999, partial: true });
    expect(parseNativeMediaRange('bytes=8-100', 10)).toEqual({ start: 8, end: 9, partial: true });
  });
  test('rejects malformed, unavailable and multi-range requests', () => {
    for (const range of ['bytes=-', 'bytes=-0', 'bytes=10-', 'bytes=8-2', 'bytes=0-2,4-6', 'bytes=x-y']) {
      expect(() => parseNativeMediaRange(range, 10)).toThrow();
    }
    expect(() => parseNativeMediaRange(undefined, Infinity)).toThrow();
    expect(() => parseNativeMediaRange(undefined, 0)).toThrow();
  });
});

function mockPlugin() {
  const listeners = new Map<string, (event: NativeRequest) => void>();
  const responses: Array<Parameters<NativePeerMediaPlugin['peerMediaResponse']>[0]> = [];
  let resolveFinal!: () => void;
  const final = new Promise<void>(resolve => { resolveFinal = resolve; });
  let unregistered = false;
  const plugin: NativePeerMediaPlugin = {
    async registerPeerSource() { return { token: 'token', proxyUrl: 'http://127.0.0.1:1234/peer/token/root' }; },
    async unregisterPeerSource() { unregistered = true; },
    async addListener(name, listener) { listeners.set(name, listener); return { async remove() { listeners.delete(name); } }; },
    async peerMediaResponse(response) { responses.push(response); if (response.final) resolveFinal(); },
  };
  return { plugin, responses, final, listeners, get unregistered() { return unregistered; } };
}

describe('native watchroom streaming bridge', () => {
  test('streams a multi-megabyte MP4 as bounded blocks with acknowledged writes', async () => {
    const size = 5 * 1024 * 1024 + 127;
    const ranges: Array<{ start: number; end?: number }> = [];
    const transport: WatchPartyMediaTransport = {
      rootUrl: 'https://media.example/movie.mp4', format: 'mp4', cancelPending() {},
      async fetch(_url, options) {
        if (!options?.range) throw new Error('Whole MP4 downloads are forbidden');
        const range = options.range;
        ranges.push(range);
        const end = Math.min(size - 1, range.end ?? size - 1);
        return new Response(new Uint8Array(end - range.start + 1), { status: 206,
          headers: { 'content-type': 'video/mp4', 'content-range': `bytes ${range.start}-${end}/${size}` } });
      },
    };
    const native = mockPlugin();
    const bridge = await createNativeWatchPartyMediaBridge(transport, native.plugin);
    native.listeners.get('peerMediaRequest')!({ id: 'request-1', token: 'token', resourceId: 'root', method: 'GET' });
    await native.final;
    expect(native.responses).toHaveLength(6);
    expect(native.responses.every(response => atob(response.body).length <= 1024 * 1024)).toBe(true);
    expect(native.responses.reduce((sum, response) => sum + atob(response.body).length, 0)).toBe(size);
    expect(native.responses[0].headers['Content-Length']).toBe(String(size));
    expect(ranges.every(range => range.end! - range.start + 1 <= 1024 * 1024)).toBe(true);
    await bridge.close();
    expect(native.unregistered).toBe(true);
    expect(native.listeners.size).toBe(0);
  });

  test('serves MP4 tail metadata using suffix ranges', async () => {
    const size = 50_000_000;
    const ranges: Array<{ start: number; end?: number }> = [];
    const native = mockPlugin();
    const transport: WatchPartyMediaTransport = {
      rootUrl: 'https://media.example/movie.mp4', format: 'mp4', cancelPending() {},
      async fetch(_url, options) {
        const range = options!.range!;
        ranges.push(range);
        const end = Math.min(size - 1, range.end!);
        return new Response(new Uint8Array(end - range.start + 1), { status: 206,
          headers: { 'content-type': 'video/mp4', 'content-range': `bytes ${range.start}-${end}/${size}` } });
      },
    };
    const bridge = await createNativeWatchPartyMediaBridge(transport, native.plugin);
    native.listeners.get('peerMediaRequest')!({ id: 'request-tail', token: 'token', resourceId: 'root', method: 'GET', range: 'bytes=-4096' });
    await native.final;
    expect(ranges[1]).toEqual({ start: size - 4096, end: size - 1 });
    expect(native.responses[0].status).toBe(206);
    expect(native.responses[0].headers['Content-Range']).toBe(`bytes ${size - 4096}-${size - 1}/${size}`);
    await bridge.close();
  });

  test('native cancellation aborts the outstanding transport fetch', async () => {
    const native = mockPlugin();
    let signal: AbortSignal | undefined;
    let markStarted!: () => void;
    const started = new Promise<void>(resolve => { markStarted = resolve; });
    const transport: WatchPartyMediaTransport = {
      rootUrl: 'https://media.example/a.mp4', format: 'mp4', cancelPending() {},
      async fetch(_url, options) {
        signal = options?.signal;
        markStarted();
        return new Promise((_resolve, reject) => signal?.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true }));
      },
    };
    const bridge = await createNativeWatchPartyMediaBridge(transport, native.plugin);
    const event: NativeRequest = { id: 'cancelled', token: 'token', resourceId: 'root', method: 'GET' };
    native.listeners.get('peerMediaRequest')!(event);
    await started;
    native.listeners.get('peerMediaCancel')!(event);
    expect(signal?.aborted).toBe(true);
    await bridge.close();
    expect(native.responses).toHaveLength(0);
  });
});

describe('native watchroom HLS routes', () => {
  test('rewrites nested playlists, key/map URI attributes, segments and query strings', () => {
    const references: string[] = [];
    const text = '#EXTM3U\r\n#EXT-X-MAP:URI="../init.mp4?token=x"\r\n#EXT-X-KEY:METHOD=AES-128,URI="key"\r\nvariant/720.m3u8\r\nsegment.ts?x=1\r\n';
    const output = rewriteNativePlaylist(text, 'https://media.example/episode/master.m3u8', url => {
      references.push(url); return `http://127.0.0.1:1234/peer/token/${references.length}`;
    });
    expect(references).toEqual(['https://media.example/init.mp4?token=x', 'https://media.example/episode/key',
      'https://media.example/episode/variant/720.m3u8', 'https://media.example/episode/segment.ts?x=1']);
    expect(output).toContain('#EXT-X-MAP:URI="http://127.0.0.1:1234/peer/token/1"');
    expect(output).not.toContain('https://media.example');
    expect(() => rewriteNativePlaylist('#EXTM3U\nfile:///private.mp4', 'https://media.example/a.m3u8', url => url)).toThrow();
    expect(() => rewriteNativePlaylist('#EXTM3U\nhttps://user:password@example.com/a.ts', 'https://media.example/a.m3u8', url => url)).toThrow();
  });
});
