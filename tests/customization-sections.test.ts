import { describe, expect, test } from 'bun:test';
import { arrangeSectionIds, moveSection, retainUnavailableSectionIds, nextShelfPage, shelfSourceKey, customShelves } from '../src/lib/customizationSections';

describe('home customization identities and paging', () => {
  test('the absent override preserves original order and custom shelves start before the infinite group', () => {
    const original = ['spotlight', 'continue', 'trending', 'genre-feed'];
    expect(arrangeSectionIds(original)).toEqual(original);
    expect(arrangeSectionIds(original, undefined, ['custom-1'], 'genre-feed')).toEqual(['spotlight', 'continue', 'trending', 'custom-1', 'genre-feed']);
    expect(original).toEqual(['spotlight', 'continue', 'trending', 'genre-feed']);
  });
  test('a saved arrangement appends new built-in sections and does not duplicate identifiers', () => {
    expect(arrangeSectionIds(['hero', 'updates', 'new-section'], ['updates', 'hero', 'updates', 'removed'])).toEqual(['updates', 'hero', 'removed', 'new-section']);
    expect(retainUnavailableSectionIds(['updates', 'hero'], ['future-shelf', 'hero'])).toEqual(['updates', 'hero', 'future-shelf']);
  });
  test('a new custom section starts before an already saved feed position', () => {
    expect(arrangeSectionIds(['hero', 'updates', 'feed'], ['updates', 'feed', 'hero'], ['new'], 'feed')).toEqual(['updates', 'new', 'feed', 'hero']);
  });
  test('keyboard moves have the same boundaries as dragging and retain unloaded shelves', () => {
    expect(moveSection(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c']);
    expect(moveSection(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
    expect(retainUnavailableSectionIds(moveSection(['a', 'b'], 'a', 1), ['c', 'a', 'b'])).toEqual(['b', 'a', 'c']);
  });
  test('empty displayed pages do not stop paging; repeated raw pages do', () => {
    expect(nextShelfPage(['adult-filtered-title'], [], true, 1)).toBe(2);
    expect(nextShelfPage(['adult-filtered-title'], ['adult-filtered-title'], true, 2)).toBeUndefined();
    expect(nextShelfPage(['new-title'], [], false, 1)).toBeUndefined();
    expect(nextShelfPage([], [], true, 1)).toBeUndefined();
  });
  test('query identity preserves provider boundaries and canonical filter order', () => {
    expect(shelfSourceKey({ kind: 'anime', filters: { sortBy: 'SCORE_DESC', genres: ['Action'] } })).toBe(shelfSourceKey({ kind: 'anime', filters: { genres: ['Action'], sortBy: 'SCORE_DESC' } }));
    expect(shelfSourceKey({ kind: 'provider-search', namespace: 'a', sourceId: 'same', query: 'One Piece' })).not.toBe(shelfSourceKey({ kind: 'provider-search', namespace: 'b', sourceId: 'same', query: 'One Piece' }));
  });
  test('reset tombstones suppress custom sections and the map key remains authoritative', () => {
    expect(customShelves({ customSections: { old: null, saved: { id: 'stale', title: 'Action', source: { kind: 'anime', filters: { genres: ['Action'] } } } } })).toEqual([{ id: 'saved', title: 'Action', source: { kind: 'anime', filters: { genres: ['Action'] } } }]);
  });
});
