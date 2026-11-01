import { describe, expect, test } from 'bun:test';
import { filterLibrary, groupLibrary, type LibraryEntry } from '../src/lib/favoritesLibrary';

const entry = (key: string, values: Partial<LibraryEntry>): LibraryEntry => ({
  key, id: key, kind: 'manga', title: key, poster: null, status: 'reading', format: 'manga',
  updatedAt: '2026-10-30T12:00:00Z', href: `/manga/${key}`, source: {}, ...values,
});
const rows = [
  entry('a', { title: '  Blue Lock', format: 'manga' }),
  entry('b', { title: 'Solo Leveling', format: 'manhwa', updatedAt: '2026-10-25T12:00:00Z' }),
  entry('c', { title: 'Blue Period', status: 'completed', updatedAt: '2026-09-01T12:00:00Z' }),
  entry('d', { title: 'Spice and Wolf', kind: 'novel', format: 'novel' }),
];
describe('Favorites library filtering', () => {
  test('combines search, status, and format without mutating source rows', () => {
    expect(filterLibrary(rows, { search: ' BLUE ', status: 'reading', format: 'manga' }).map(row => row.key)).toEqual(['a']);
    expect(rows.map(row => row.key)).toEqual(['a', 'b', 'c', 'd']);
  });
  test('sorts all media history together by timestamp and filters by date/media', () => {
    const now = Date.parse('2026-10-31T12:00:00Z');
    expect(filterLibrary(rows, { days: 7, now }).map(row => row.key)).toEqual(['a', 'd', 'b']);
    expect(filterLibrary(rows, { days: 7, kind: 'novel', now }).map(row => row.key)).toEqual(['d']);
    expect(filterLibrary(rows, { days: 7, format: 'comic', now })).toEqual([]);
  });
  test('uses saved status rather than chapter numbers for categorization', () => {
    expect(groupLibrary(rows).map(group => [group.status, group.entries.length])).toEqual([['reading', 3], ['completed', 1]]);
    expect(filterLibrary(rows, { sort: 'title' }).map(row => row.key)).toEqual(['a', 'c', 'b', 'd']);
  });
});
