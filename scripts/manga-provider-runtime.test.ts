import { expect, mock, test } from 'bun:test';

let mobile = false;
let ipc = false;
let requestedUrl = '';
let requestedParams: any;
const source = {
  provider: 'atsu@group-a', providerName: 'Atsu · MangaK',
  chapterKey: 'atsu@group-a:series|chapter', providerChapterId: 'chapter',
  language: 'en', scanlator: 'MangaK',
};
mock.module('../src/hooks/media/useExtensionSourceStream', () => ({
  MOBILE_EXT_BASE: 'mobile://extensions',
  resolveExtensionApiBase: async () => ({ baseUrl: ipc ? '' : mobile ? 'mobile://extensions' : 'http://fixture.test', namespaces: [{ namespace: 'toko', capabilities: ['manga'] }] }),
}));
const empty = async () => ({ chapters: [], providersAvailable: [], failedProviders: [] });
mock.module('../src/core/extensions/remote/manga', () => ({ remoteMangaChapters: empty, remoteMangaPages: empty }));
mock.module('../src/core/extensions/compatibility/content', () => ({ compatibilityMappedChapters: empty, compatibilityMappedPages: empty }));
mock.module('../src/core/extensions/server/client', () => ({ serverMappedChapters: empty, serverMappedPages: empty }));
(globalThis as any).window = {
  addEventListener() {}, dispatchEvent() {},
  electron: {
    listInstalledExtensions: async () => [{ id: 'toko', capabilities: ['manga'] }],
    invokeExtension: async () => [{ number: 1, sources: [source] }],
  },
  tatakaiMobileExtensions: { mangaChapters: async (_namespace: string, params: any) => {
    requestedParams = params;
    return [{ number: 1, sources: [source] }];
  } },
};
globalThis.fetch = (async input => {
  requestedUrl = String(input);
  return Response.json({ chapters: [{ number: 1, ...source }], providerStatus: [{ provider: 'atsu', status: 'ok', resultCount: 1 }] });
}) as typeof fetch;
const { fetchExtensionMangaChapters, mergeChaptersWithExtensions } = await import('../src/core/content/manga-extension-runtime');
const { recordSourceReport, sourceReports } = await import('../src/core/extensions/remote/diagnostics');

test('HTTP and mobile preserve upstream names, routing keys and title aliases; cached diagnostics belong to the current title', async () => {
  recordSourceReport({ provider: 'atsu@old-title', name: 'Old title source', ecosystem: 'tatakai', kind: 'manga', status: 'ok', count: 400, durationMs: 0 });
  recordSourceReport({ provider: 'anime-fixture', name: 'Anime', ecosystem: 'tatakai', kind: 'anime', status: 'ok', count: 1, durationMs: 0 });
  const params = { title: 'Infinity Mailman', titles: ['Infinity Mailman', 'Wuxian Youchai'] };
  const http = await fetchExtensionMangaChapters(params);
  expect(http.chapters[0].sources[0]).toMatchObject(source);
  expect(new URL(requestedUrl).searchParams.getAll('titles[]')).toEqual(params.titles);
  expect(sourceReports().some(row => row.provider === 'atsu@old-title')).toBe(false);
  expect(sourceReports().find(row => row.provider === source.provider)?.name).toBe('Atsu · MangaK');
  expect(sourceReports().find(row => row.provider === 'atsu')).toMatchObject({ name: 'Atsu', count: 1, status: 'ok' });
  expect(sourceReports().some(row => row.provider === 'anime-fixture')).toBe(true);
  recordSourceReport({ provider: 'atsu@another-title', name: 'Another', ecosystem: 'tatakai', kind: 'manga', status: 'ok', count: 300, durationMs: 0 });
  await fetchExtensionMangaChapters(params);
  expect(sourceReports().some(row => row.provider === 'atsu@another-title')).toBe(false);
  mobile = true;
  const payload = await fetchExtensionMangaChapters({ ...params, anilistId: 133564 });
  expect(requestedParams.titles).toEqual(params.titles);
  expect(payload.chapters[0].sources[0]).toMatchObject(source);
  const merged = mergeChaptersWithExtensions({ anilistId: 133564, partial: false, failedProviders: [], chapters: [], mappedChapters: [] }, payload);
  expect(merged.mappedChapters[0].sources[0]).toMatchObject(source);
  ipc = true;
  const fallback = await fetchExtensionMangaChapters({ title: 'IPC fixture' });
  expect(fallback.chapters[0].sources[0]).toMatchObject(source);
});
