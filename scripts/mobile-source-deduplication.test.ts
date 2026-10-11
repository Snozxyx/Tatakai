import { expect, mock, test } from 'bun:test';
mock.module('../src/core/extensions/mobile/nativeHttp', () => ({ createNativeFetch: () => fetch }));
mock.module('../src/core/extensions/mobile/parseHtml', () => ({ parseHtml: () => ({}) }));
mock.module('../src/core/extensions/mobile/requireShim', () => ({ createMobileRequire: () => () => ({}), createMobileNodeGlobals: () => ({ Buffer, process, global: globalThis, setImmediate, clearImmediate }) }));
mock.module('../src/core/extensions/mobile/anilistTitles', () => ({ enrichOptionsWithTitles: async (options: unknown) => options }));
mock.module('../src/core/extensions/mobile/mobileExtensionInstaller', () => ({ initMobileExtensions: async () => {} }));
mock.module('../src/lib/platform/platform', () => ({ isCapacitor: () => true }));
mock.module('../src/core/extensions/mobile/mobileProxy', () => ({ applyMobileProxyToSource: (source: unknown) => source, applyMobileProxyToPages: (pages: unknown) => pages }));
const host = await import('../src/core/extensions/mobile/mobileExtensionHost');

test('concurrent watch/download callers share a batch and replay progressive sources', async () => {
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const source = { url: 'https://cdn.example/ep.m3u8', sourceType: 'hls' };
  (globalThis as any).__sourceFixture = async (_options: unknown, callback: (chunk: unknown) => void) => {
    calls++;
    callback({ results: [source] });
    await gate;
    return [source];
  };
  await host.registerMobileExtension({ id: 'test', apiServer: { namespace: 'test' }, permissions: [] } as any,
    'module.exports = { sourcesAll: globalThis.__sourceFixture };');
  const firstChunks: unknown[] = [], secondChunks: unknown[] = [];
  const options = { titles: ['Anime'], episode: 1 };
  const first = host.mobileExtensionDispatch.resolveSources('test', 'sources', options, (chunk) => firstChunks.push(chunk));
  await new Promise((resolve) => setTimeout(resolve, 0));
  const second = host.mobileExtensionDispatch.resolveSources('test', 'sources', options, (chunk) => secondChunks.push(chunk));
  expect(calls).toBe(1);
  expect(secondChunks).toHaveLength(1);
  release();
  expect(await first).toEqual([source]);
  expect(await second).toEqual([source]);
  expect(firstChunks).toHaveLength(1);
  await host.mobileExtensionDispatch.resolveSources('test', 'sources', options);
  expect(calls).toBe(1);
  await host.mobileExtensionDispatch.resolveSources('test', 'sources', { ...options, refresh: true });
  expect(calls).toBe(2);
  delete (globalThis as any).__sourceFixture;
});
