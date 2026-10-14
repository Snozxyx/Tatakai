import { describe, it, expect } from 'bun:test';
import { automaticTitleMatch, titleSearchQueries } from '../src/core/extensions/remote/title-match';

describe('automatic Seanime source mapping', () => {
  it('matches Naruto without choosing the first search result or its sequel', () => {
    expect(automaticTitleMatch([{ id: 'sequel', title: 'Naruto Shippuden' }, { id: 'original', title: 'Naruto' }], { query: 'Naruto' })).toBe('original');
    expect(automaticTitleMatch([{ id: 'sequel', title: 'Naruto Shippuden' }], { query: 'Naruto' })).toBeNull();
  });
  it('matches English, romanized and native aliases for anime and manga', () => {
    const opts = { query: 'Attack on Titan', media: { romajiTitle: 'Shingeki no Kyojin', nativeTitle: '進撃の巨人' } };
    expect(titleSearchQueries(opts)).toEqual(['Attack on Titan', 'Shingeki no Kyojin', '進撃の巨人']);
    expect(automaticTitleMatch([{ id: 'manga', title: '進撃の巨人' }], opts)).toBe('manga');
    expect(automaticTitleMatch([{ id: 'anime', title: 'Shingeki no Kyojin' }], opts)).toBe('anime');
  });
  it('prefers explicit AniList/MAL IDs over title similarity', () => {
    expect(automaticTitleMatch([{ id: 'wrong', title: 'Naruto' }, { id: 'right', title: 'Localized title', malId: 1735 }], { query: 'Naruto', media: { idMal: 1735 } })).toBe('right');
  });
  it('prefers the selected audio variant and ignores search ordering', () => {
    const candidates = [{ id: 'dub', title: 'Naruto (Dub)' }, { id: 'sub', title: 'NARUTO [Sub]' }];
    expect(automaticTitleMatch(candidates, { query: 'Naruto', dub: false })).toBe('sub');
    expect(automaticTitleMatch(candidates.reverse(), { query: 'Naruto', dub: true })).toBe('dub');
  });
  it('preserves season numbers and tolerates punctuation and small spelling differences', () => {
    expect(automaticTitleMatch([{ id: 's1', title: 'Title Season 1' }, { id: 's2', title: 'Title Season 2' }], { query: 'Title Season 2' })).toBe('s2');
    expect(automaticTitleMatch([{ id: 's1', title: 'Title Season 1' }], { query: 'Title Season 2' })).toBeNull();
    expect(automaticTitleMatch([{ id: 'x', title: 'Fullmetal Alchemist: Brotherhood' }], { query: 'Fullmetal Alchemist Brotherhood' })).toBe('x');
    expect(automaticTitleMatch([{ id: 'x', title: 'Fullmetal Alchemis Brotherhood' }], { query: 'Fullmetal Alchemist Brotherhood' })).toBe('x');
  });
  it('reports unrelated or malformed results as unmatched', () => {
    expect(automaticTitleMatch([null, { title: 'Naruto' }, { id: 'x', title: 'Boruto' }], { query: 'Naruto' })).toBeNull();
    expect(automaticTitleMatch([{ id: 'x', title: 'Naruto' }], {})).toBeNull();
  });
});
