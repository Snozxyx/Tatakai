import { it, expect } from 'bun:test';
import { episodeVideoId, searchStremioTargets } from '../src/core/extensions/remote/stremio-search';
const row: any = { manifestUrl: 'https://addon.test/manifest.json', manifest: { resources: ['stream', 'subtitles'], types: ['series'], idPrefixes: ['tt'] } };
it('searches Cinemeta and preserves advertised IDs across upstream seasons', async () => {
  const urls: string[] = [];
  const targets = await searchStremioTargets(row, { title: 'Naruto', episode: 3 }, null, async url => {
    urls.push(url);
    if (url.includes('/catalog/movie/')) return { metas: [] };
    if (url.includes('/catalog/')) return { metas: [{ id: 'tt0409591', name: 'Naruto', type: 'series' }, { id: 'tt999', name: 'Naruto Shippuden', type: 'series' }] };
    return { meta: { id: 'tt0409591', name: 'Naruto', type: 'series', videos: [{ id: 'tt0409591:1:1', season: 1, episode: 1 }, { id: 'tt0409591:1:2', season: 1, episode: 2 }, { id: 'tt0409591:2:1', season: 2, episode: 1 }] } };
  });
  expect(targets).toEqual([{ type: 'series', id: 'tt0409591:2:1' }]);
  expect(urls.some(url => url.includes('search=Naruto.json'))).toBe(true);
});
it('searches addon-specific catalogs without fabricating IMDb IDs', async () => {
  const custom = { manifestUrl: 'https://addon.test/personal/manifest.json?key=value', manifest: { resources: ['catalog', 'meta', 'stream'], types: ['anime'], idPrefixes: ['pahe:'], catalogs: [{ id: 'anime', type: 'anime', extra: [{ name: 'search', isRequired: true }] }] } } as any;
  const result = await searchStremioTargets(custom, { title: 'Naruto', episode: 1 }, null, async url => {
    if (!url.startsWith('https://addon.test/')) return { metas: [] };
    expect(url).toContain('key=value');
    return url.includes('/catalog/') ? { metas: [{ id: 'pahe:naruto', name: 'Naruto', type: 'anime' }] } : { meta: { id: 'pahe:naruto', name: 'Naruto', type: 'anime', videos: [{ id: 'pahe:ep-one', episode: 1 }] } };
  });
  expect(result).toEqual([{ type: 'anime', id: 'pahe:ep-one' }]);
});
it('rejects missing episodes, season gaps, duplicate titles and unsupported ID prefixes', async () => {
  expect(episodeVideoId({ videos: [{ id: 'one', season: 1, episode: 1 }, { id: 'three', season: 1, episode: 3 }] }, 2)).toBeNull();
  expect(episodeVideoId({ videos: [{ id: 'two', season: 2, episode: 1 }] }, 1)).toBeNull();
  await expect(searchStremioTargets(row, { title: 'Naruto' }, null, async () => ({ metas: [{ id: 'tt1', name: 'Naruto' }, { id: 'tt2', name: 'Naruto' }] }))).rejects.toThrow('no supported title');
});
it('honors cancellation during fallback requests', async () => {
  const controller = new AbortController(); controller.abort();
  await expect(searchStremioTargets(row, { title: 'Naruto' }, null, async () => ({}), controller.signal)).rejects.toThrow();
});
