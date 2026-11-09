// Isolated process: adapter mocks must never replace real providers in other tests.
import { mock } from 'bun:test';
import assert from 'node:assert/strict';

const calls: string[] = [];
const row: any = { id: 'stremio-test', ecosystem: 'stremio', enabled: true,
  manifestUrl: 'https://fixture.test/config%2Ftoken/manifest.json?key=keep',
  manifest: { id: 'community.dubb.indo', name: 'Dubbing Indonesia', version: '0.0.5', resources: ['catalog', 'meta', 'stream'], types: ['movie', 'series'], idPrefixes: ['dubbindo_'],
    catalogs: [{ id: 'anime_movies', name: 'Anime Movies', type: 'movie', extra: [{ name: 'skip' }] }, { id: 'other_movies', name: 'Other Movies', type: 'movie', extra: [{ name: 'skip' }] }, { id: 'anime_series', name: 'Anime Series', type: 'series', extra: [{ name: 'skip' }] }] } };
const meta = (id: number) => ({ id: `dubbindo_${id}`, name: `Upload ${id}`, type: 'movie' });
mock.module('../../src/core/extensions/remote/installed', () => ({ listRemoteExtensions: async () => [row], invokeRemote: () => { throw Error('No executable provider expected'); } }));
mock.module('../../src/core/extensions/remote/transport', () => ({ fetchExtensionJson: async (raw: string, signal?: AbortSignal) => {
  signal?.throwIfAborted(); calls.push(raw);
  const url = new URL(raw);
  assert.equal(url.search, '?key=keep'); assert.ok(url.pathname.startsWith('/config%2Ftoken/'));
  if (url.pathname.includes('/catalog/movie/anime_movies')) {
    const skip = Number(url.pathname.match(/skip=(\d+)/)?.[1] || 0);
    if (skip === 0) return { metas: [...Array.from({ length: 19 }, (_, i) => meta(i)), {}] };
    if (skip === 20) return { metas: [meta(18), meta(19), meta(20), meta(21), {}] };
    return { metas: [] };
  }
  if (url.pathname.includes('/catalog/movie/other_movies')) return { metas: [meta(100), meta(101), meta(102)] };
  if (url.pathname.includes('/meta/movie/')) return { meta: { id: 'dubbindo_19', name: 'Selected Upload', type: 'movie' } };
  if (url.pathname.includes('/stream/movie/')) return { streams: [{ url: 'https://media.test/video.mp4', title: 'Stream 480p', proxyHeaders: { request: { Referer: 'https://dubbindo.site/', 'User-Agent': 'Provider Agent' } } }] };
  throw Error(`Unexpected fixture request: ${raw}`);
} }));
mock.module('../../src/core/extensions/remote/media', () => ({ proxyRemoteSources: async (sources: any[]) => sources, proxyRemoteUrl: async (url: string) => url }));
mock.module('../../src/core/extensions/remote/resolve', () => ({ matchRemoteTitle: () => { throw Error('Custom IDs must never run title matching'); } }));
mock.module('../../src/core/extensions/remote/diagnostics', () => ({ recordSourceReport() {} }));
mock.module('../../src/lib/contentSafety', () => ({ isExplicitExtensionContent: () => false }));

const { customDescriptors, remoteCustomHome, remoteCustomCatalogPage, remoteCustomInfo, remoteCustomWatch, remoteCustomSearch } = await import('../../src/core/extensions/remote/custom');
const { mergeCustomCatalogPage } = await import('../../src/core/content/custom-catalog-pagination');
const { normalizeStremioStream } = await import('../../src/core/extensions/remote/stremio');
assert.deepEqual(customDescriptors(row).map(s => [s.id, s.supportsSearch]), [['movie', false], ['series', false]]);
const home = await remoteCustomHome(row, 'movie');
assert.equal(home.sections.length, 2);
assert.equal(home.sections[0].items.length, 19);
assert.equal(home.sections[0].pagination?.nextSkip, 20);
assert.equal(home.sections[1].pagination?.nextSkip, 3);
const next = await remoteCustomCatalogPage(row, 'movie', 'anime_movies', 20);
assert.equal(next.nextSkip, 25);
const merged = mergeCustomCatalogPage(home.sections[0].items, next);
assert.equal(merged.items.length, 22);
assert.equal(merged.nextSkip, 25);
assert.equal(mergeCustomCatalogPage(merged.items, next).nextSkip, null);
assert.equal((await remoteCustomCatalogPage(row, 'movie', 'anime_movies', 25)).nextSkip, null);
const count = calls.length;
assert.deepEqual(await remoteCustomSearch(row, 'movie', 'Naruto', 1), { results: [], hasNextPage: false });
assert.equal(calls.length, count);
await assert.rejects(() => remoteCustomCatalogPage(row, 'movie', 'missing', 0));
await assert.rejects(() => remoteCustomCatalogPage(row, 'movie', 'anime_movies', -1));
const controller = new AbortController(); controller.abort();
await assert.rejects(() => remoteCustomCatalogPage(row, 'movie', 'anime_movies', 20, controller.signal));
const info = await remoteCustomInfo(row, 'movie', 'dubbindo_19');
assert.deepEqual(info?.entries, [{ id: 'dubbindo_19', label: 'Watch' }]);
const watch = await remoteCustomWatch(row, 'movie', info!.entries[0].id);
assert.equal(watch.sources[0].headers?.Referer, 'https://dubbindo.site/');
assert.equal(watch.sources[0].headers?.['User-Agent'], 'Provider Agent');
assert.ok(calls.some(url => url.includes('/stream/movie/dubbindo_19.json')));
const normalized = normalizeStremioStream({ url: 'https://media.test/video.mp4', proxyHeaders: { request: { referer: 'fallback', 'User-Agent': 'Agent', invalid: 1 } }, behaviorHints: { proxyHeaders: { request: { Referer: 'primary' } } } }, 'id', 'name');
assert.deepEqual(normalized.headers, { Referer: 'primary', 'User-Agent': 'Agent' });
console.log('Stremio custom catalog: pagination, explicit IDs, capabilities and headers passed');
