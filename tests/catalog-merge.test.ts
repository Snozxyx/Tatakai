import { expect, test } from 'bun:test';
import { mergeCatalog } from '../src/lib/catalogMerge';

test('keeps AniList identity when MangaBaka carries a different title or MAL identity', () => {
  const primary = [{ id: '123', anilistId: 123, malId: 55, canonicalTitle: 'Original', mediaType: 'novel' }];
  expect(mergeCatalog(primary, [{ id: 'mal:55', malId: 55, canonicalTitle: 'Other title', mediaType: 'novel' }])).toEqual(primary);
});
test('deduplicates Unicode title variants while keeping manga adaptations and novels separate', () => {
  const result = mergeCatalog([{ id: '1', canonicalTitle: 'Ｓｈａｄｏｗ Slave!', mediaType: 'novel' }], [
    { id: 'mangabaka:2', canonicalTitle: 'Shadow Slave', mediaType: 'novel' },
    { id: 'mangabaka:3', canonicalTitle: 'Shadow Slave', mediaType: 'manhwa' },
    { id: 'mangabaka:4', canonicalTitle: 'A new web novel', mediaType: 'novel' },
  ]);
  expect(result.map(item => item.id)).toEqual(['1', 'mangabaka:3', 'mangabaka:4']);
});
