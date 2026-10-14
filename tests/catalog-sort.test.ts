import {test,expect} from 'bun:test';
import {normalizeCatalogSort,preservesCatalogPageOrder} from '../src/core/content/catalog-sort';

test('chapter count and latest-update URLs select their canonical controls', () => {
  const sorts = ['chapterCount','latestUpdate','trending'] as const;
  expect(normalizeCatalogSort('chapterCount',sorts)).toBe('chapterCount');
  expect(normalizeCatalogSort('CHAPTERCOUNT',sorts)).toBe('chapterCount');
  expect(normalizeCatalogSort('latestUpdate',sorts)).toBe('latestUpdate');
  expect(normalizeCatalogSort('invalid',sorts)).toBe('default');
});
test('trending preserves page order even when a later page has higher popularity', () => {
  const pages = [[{id:1,popularity:10},{id:2,popularity:100}],[{id:3,popularity:1000}]];
  const results = preservesCatalogPageOrder('trending') ? pages.flat() : pages.flat().sort((a,b)=>b.popularity-a.popularity);
  expect(results.map(item=>item.id)).toEqual([1,2,3]);
});
