import { expect, mock, test } from 'bun:test';

const cached = new Map<string, any[]>();
mock.module('../src/lib/cache/extensionResultCache', () => ({
  readCachedItemsSync: (key: string) => cached.get(key) || null,
  hydrateCachedItems: async (key: string) => cached.get(key) || null,
  writeCachedItems: (key: string, value: any[]) => cached.set(key, value), STREAM_TTL_MS: 86400_000,
}));
mock.module('../src/core/extensions/mobile/mobileProxy', () => ({ applyMobileProxyToSource: (source: any) => source }));
const connections: FakeEventSource[] = [];
class FakeEventSource {
  static CLOSED = 2;
  readyState = 1;
  listeners = new Map<string, (event: any) => void>();
  constructor(public url: string) { connections.push(this); }
  addEventListener(name: string, listener: (event: any) => void) { this.listeners.set(name, listener); }
  close() { this.readyState = 2; }
  emit(name: string, value?: any) { this.listeners.get(name)?.({ data: value === undefined ? undefined : JSON.stringify(value) }); }
}
(globalThis as any).EventSource = FakeEventSource;
(globalThis as any).window = { tatakaiRuntime: { getExtensionApiBase: async () => ({ baseUrl: 'http://fixture', namespaces: [{ namespace: 'toko' }] }) } };
const { streamExtensionSources, extensionStreamCacheKey } = await import('../src/hooks/media/useExtensionSourceStream');

test('one-shot download stream shares the watch cache and publishes before slow providers finish', async () => {
  const params = { anilistId: 123, titles: ['Fixture'], episode: 1, preferredLanguage: 'sub' };
  const key = extensionStreamCacheKey('toko', params);
  expect(JSON.parse(key).resolution).toBe('1080p');
  cached.set(key, [{ url: 'cached.m3u8', providerKey: 'cached' }]);
  const chunks: any[][] = [];
  const request = streamExtensionSources('toko', params, 1000, value => chunks.push(value));
  expect(chunks[0][0].url).toBe('cached.m3u8');
  await Bun.sleep(0);
  const connection = connections.at(-1)!;
  connection.emit('source', { url: 'first.m3u8', providerKey: 'fast' });
  expect(chunks.at(-1)![0].url).toBe('first.m3u8');
  expect(connection.readyState).toBe(1);
  connection.emit('source', { url: 'first.m3u8', providerKey: 'fast' });
  connection.emit('source', { url: 'second.m3u8', providerKey: 'slow' });
  connection.emit('done');
  expect((await request).length).toBe(2);
  expect(cached.get(key)!.length).toBe(2);
  expect(connection.readyState).toBe(2);
});

test('timeout returns arrivals and closes the stream', async () => {
  const request = streamExtensionSources('toko', { anilistId: 123, episode: 2 }, 10);
  await Bun.sleep(0);
  const connection = connections.at(-1)!;
  connection.emit('source', { url: 'partial.m3u8', providerKey: 'fast' });
  expect(await request).toEqual([{ url: 'partial.m3u8', providerKey: 'fast' }]);
  expect(connection.readyState).toBe(2);
});
