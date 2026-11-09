import { mock } from 'bun:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const calls: any[] = [];
mock.module('../../src/core/content/content-graph', () => ({ contentGraph: { search: async (filters: any) => { calls.push(['anime', filters]); return { media: [{ anilistId: 1, titleRomaji: 'Mature', isAdult: true }, { anilistId: 2, titleRomaji: 'Safe', isAdult: false }], pageInfo: { hasNextPage: true } }; } } }));
mock.module('../../src/core/content/types', () => ({ toAnimeCard: (item: any) => ({ id: String(item.anilistId), name: item.titleRomaji, poster: '', anilistId: item.anilistId, isAdult: item.isAdult }) }));
mock.module('../../src/core/content/manga-client', () => ({ searchManga: async (...args: any[]) => { calls.push(['manga', ...args]); return { results: [{ id: 'book-1', canonicalTitle: 'Safe book', mediaType: 'manga', adult: false }, { id: 'book-2', canonicalTitle: 'Mature book', mediaType: 'manga', adult: true }], hasNextPage: true }; } }));
mock.module('../../src/core/content/novel-client', () => ({ searchNovels: async (...args: any[]) => { calls.push(['novel', ...args]); return { results: [{ id: 'novel-1', canonicalTitle: 'Novel', mediaType: 'novel', adult: false }], hasNextPage: false }; } }));
mock.module('../../src/core/content/custom-source-runtime', () => ({
  fetchCustomSearch: async (...args: any[]) => { calls.push(['provider-search', ...args]); return { results: [{ id: 'same-id', title: 'Source title' }, { id: 'mature-id', title: 'Mature title', nsfw: true }], hasNextPage: true }; },
  fetchCustomCatalogPage: async (...args: any[]) => { calls.push(['provider-catalog', ...args]); return { items: [{ id: 'offset-id', title: 'Offset title' }], nextSkip: 80 }; },
  fetchCustomHome: async () => ({ sections: [{ id: 'browse', title: 'Browse', items: [{ id: 'home-title', title: 'Home title' }] }], hasNextPage: false }),
}));
mock.module('../../src/hooks/api/useCustomSource', () => ({ useCustomSources: () => ({ data: [], isLoading: false }), useCustomHome: () => ({ data: { sections: [] } }) }));
mock.module('../../src/hooks/api/useAniListGenres', () => ({ useAniListGenres: () => ({ genres: ['Action', 'Fantasy'] }) }));
mock.module('../../src/hooks/ui/useUiTranslation', () => ({ useUiTranslation: () => {} }));
mock.module('../../src/hooks/user/useContentSafetySettings', () => ({ useContentSafetySettings: () => ({ settings: { showAdultEverywhere: false } }) }));
mock.module('../../src/components/UnifiedMediaCard', () => ({ UnifiedMediaCard: () => null }));
mock.module('../../src/components/tv/TVContentCard', () => ({ TVContentCard: () => null }));
const { fetchSavedShelf } = await import('../../src/components/customization/CustomShelf');

const anime = await fetchSavedShelf({ kind: 'anime', filters: { sortBy: 'POPULARITY_DESC' } }, 1, false);
assert.deepEqual(anime.rawIds, ['1', '2']);
assert.equal(anime.items.length, 1);
assert.equal(anime.items[0].id, '2');
assert.equal(calls[0][1].format.length, 7);
assert.equal(calls[0][1].isAdult, false);
assert.equal(calls[0][1].perPage, 24);

const manga = await fetchSavedShelf({ kind: 'manga', filters: { query: 'Tower', genre: 'Action', origin: 'KR', sort: 'SCORE_DESC' } }, 3, false);
assert.equal(manga.page, 3);
assert.equal(manga.hasMore, true);
assert.deepEqual(manga.rawIds, ['book-1', 'book-2']);
assert.equal(manga.items.length, 1);
assert.equal(calls[1][1], 'Tower');
assert.equal(calls[1][2], 3);
assert.equal(calls[1][4].origin, 'KR');

const novel = await fetchSavedShelf({ kind: 'novel', filters: { genre: 'Fantasy', tags: ['Magic'] } }, 2, true);
assert.equal(novel.items[0].mediaType, 'novel');
assert.equal(novel.hasMore, false);

const provider = await fetchSavedShelf({ kind: 'provider-search', namespace: 'provider-A', sourceId: 'movie', query: 'Dune', filters: { quality: 'HD' } }, 2, false);
assert.deepEqual(provider.rawIds, ['same-id', 'mature-id']);
assert.equal(provider.items.length, 1);
assert.equal(provider.items[0].href, '/x/provider-A/movie/info/same-id');
assert.equal(calls[3][1], 'provider-A');
assert.equal(calls[3][5].quality, 'HD');

const catalog = await fetchSavedShelf({ kind: 'provider-catalog', namespace: 'provider-B', sourceId: 'anime', catalogId: 'curated' }, 2, false, undefined, 50);
assert.equal(calls[4][4], 50);
assert.equal(catalog.nextSkip, 80);
assert.equal(catalog.hasMore, true);
await assert.rejects(() => fetchSavedShelf({ kind: 'provider-catalog', namespace: 'provider-B', sourceId: 'anime', sectionId: 'removed' }, 1, false), /unavailable/);
const { CustomShelfEditor } = await import('../../src/components/customization/CustomShelfEditor');
const editor = renderToStaticMarkup(<CustomShelfEditor onSave={() => {}} onCancel={() => {}} />);
const sourceSelect = editor.match(/<select[^>]*>(.*?)<\/select>/)?.[1] || '';
assert.equal((sourceSelect.match(/<option /g) || []).length, 4);
assert(sourceSelect.includes('value="provider"'));
assert(!sourceSelect.includes('provider-search'));
assert(editor.indexOf('<details') > editor.indexOf('Genre'));
assert(editor.includes('Filters</summary>'));
assert(!editor.includes('<details open'));
assert(editor.includes('Create section'));
assert(editor.includes('role="combobox"'));
assert((editor.match(/<select[^>]*>/g) || []).every(tag => /hidden=""|aria-hidden="true"/.test(tag)));
console.log('customization source checks passed');
