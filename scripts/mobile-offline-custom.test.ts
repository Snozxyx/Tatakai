import { expect, mock, test } from 'bun:test';

const rows = [1, 2].map(number => ({
  id: `123:chapter-${number}`, anilistId: 123, novelId: 'provider:book', title: 'Saved Novel',
  chapterKey: `chapter-${number}`, chapterNumber: number, chapterTitle: `Chapter ${number}`,
  provider: 'books', paragraphs: [{ index: 0, text: `Saved text ${number}` }],
}));
mock.module('../src/core/db/tatakai-db', () => ({ db: { offlineNovels: {
  get: async (id: string) => rows.find(row => row.id === id),
  filter: (predicate: (row: any) => boolean) => ({
    first: async () => rows.find(predicate), toArray: async () => rows.filter(predicate),
  }),
} } }));
let networkCalls = 0;
mock.module('../src/core/content/novel-extension-runtime', () => ({
  fetchExtensionNovelContent: async () => { networkCalls++; throw Error('Offline'); },
}));
const { getNovelContentByKey } = await import('../src/core/content/novel-client');
const { getOfflineNovelChapters } = await import('../src/core/download/novelOffline');
test('saved provider novel IDs open and navigate without a backend or AniList ID in the route', async () => {
  const chapters = await getOfflineNovelChapters('provider:book');
  expect(chapters.map(chapter => chapter.chapterNumber)).toEqual([1, 2]);
  const result = await getNovelContentByKey('provider:book', chapters[1].sources[0].chapterKey, { offlineOnly: true });
  expect(result.data?.paragraphs[0].text).toBe('Saved text 2');
  expect(result.data?.chapter.anilistId).toBe(123);
  await expect(getNovelContentByKey('provider:book', 'not-downloaded', { offlineOnly: true })).rejects.toThrow('not downloaded');
  expect(networkCalls).toBe(0);
});

let hydrated = false;
const calls: string[] = [];
(globalThis as any).window = {};
mock.module('../src/lib/platform/platform', () => ({ isCapacitor: () => true }));
mock.module('../src/core/extensions/remote/custom', () => ({
  listRemoteCustomSources: async () => [], remoteCustomRow: async () => null,
  remoteCustomHome: async () => null, remoteCustomSearch: async () => null,
  remoteCustomInfo: async () => null, remoteCustomWatch: async () => null, remoteCustomRead: async () => null,
}));
mock.module('../src/core/extensions/remote/media', () => ({ proxyCustomSources: async (sources: any) => sources }));
mock.module('../src/hooks/media/useExtensionSourceStream', () => ({
  MOBILE_EXT_BASE: 'mobile://extensions', resolveExtensionApiBase: async () => ({
    baseUrl: 'mobile://extensions', namespaces: hydrated ? [{ namespace: 'custom', customSources: [{ id: 'books', name: 'Books' }] }] : [],
  }),
}));
mock.module('../src/core/extensions/mobile/mobileExtensionInstaller', () => ({ initMobileExtensions: async () => { hydrated = true; } }));
mock.module('../src/core/extensions/mobile/mobileExtensionHost', () => ({ installMobileExtensionHost: () => {
  (globalThis as any).window.tatakaiMobileExtensions = { custom: async (_namespace: string, op: string) => {
    if (!hydrated) throw Error('namespace not mounted'); calls.push(op);
    return { sections: [{ title: 'Books' }], results: [{ id: 'book' }], id: 'book', entries: [], sources: [], pages: [] };
  } };
} }));
const custom = await import('../src/core/content/custom-source-runtime');
test('a mobile custom deep link hydrates installed bundles before dispatch with no global Capacitor object', async () => {
  delete (globalThis as any).Capacitor;
  expect((globalThis as any).Capacitor).toBeUndefined();
  expect((await custom.fetchCustomHome('custom', 'books')).sections).toHaveLength(1);
  expect((await custom.listAllCustomSources())[0].namespace).toBe('custom');
  await custom.fetchCustomSearch('custom', 'books', 'title');
  expect((await custom.fetchCustomInfo('custom', 'books', 'book'))?.id).toBe('book');
  await custom.fetchCustomWatch('custom', 'books', 'book', 'episode');
  await custom.fetchCustomRead('custom', 'books', 'book', 'chapter');
  expect(calls).toEqual(['Home', 'Search', 'Info', 'Watch', 'Read']);
});
