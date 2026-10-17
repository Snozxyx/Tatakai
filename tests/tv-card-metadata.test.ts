import { expect, test } from 'bun:test';
import { tvCardMetadata } from '../src/core/tv/cardMetadata';
test('keeps scores separate from content ratings and preserves unified episode counts', () => {
  expect(tvCardMetadata({ rating: 'PG-13', episodes: { sub: 25, dub: 12 } })).toMatchObject({ score: undefined, contentRating: 'PG-13', sub: 25, dub: 12 });
  expect(tvCardMetadata({ rating: '8.5', chapters: 80 })).toMatchObject({ score: '8.5', chapters: 80 });
});
test('deduplicates factual genres and tags and hides spoilers and adult tags', () => {
  const result = tvCardMetadata({ genres: ['Action'], tags: ['Action', 'Adventure', { id: 1, name: 'Final twist', isMediaSpoiler: true }, { id: 2, name: 'Adult theme', isAdult: true }] });
  expect(result.tags).toEqual(['Action', 'Adventure']);
});
test('omits unavailable metadata instead of inventing counts or scores', () => {
  expect(tvCardMetadata({})).toMatchObject({ score: undefined, sub: undefined, dub: undefined, chapters: undefined, tags: [] });
});
test('reads the TV metadata snapshot without mutating existing card data', () => {
  const item = { type: 'TV', tvMetadata: { genres: ['Fantasy'], status: 'RELEASING', rating: '8.9' } };
  expect(tvCardMetadata(item)).toMatchObject({ type: 'TV', score: '8.9', status: 'RELEASING', tags: ['Fantasy'] });
  expect(item).toEqual({ type: 'TV', tvMetadata: { genres: ['Fantasy'], status: 'RELEASING', rating: '8.9' } });
});
