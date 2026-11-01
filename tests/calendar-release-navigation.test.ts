import { expect, test } from 'bun:test';
import { releaseMangaHref, isReleaseChapter } from '../src/lib/releaseNavigation';
import { calendarDateKey, calendarDay, parseCalendarDate, groupDailyAirings } from '../src/lib/calendarDates';
import { cachedCalendarFeed } from '../src/lib/calendarFeedCache';

test('mapped and unmapped MangaUpdates releases always open internal manga details', () => {
  const item = { href: 'https://www.mangaupdates.com/series/abc', provider: 'mangaupdates', seriesId: '123', title: 'A manga', chapter: '12–14' };
  const unknown = new URL(releaseMangaHref(item), 'https://tatakai.invalid');
  expect(unknown.pathname).toBe('/manga/mangaupdates%3A123');
  expect(unknown.searchParams.get('highlightChapter')).toBe('12–14');
  expect(releaseMangaHref({ ...item, href: '/manga/42', chapter: '12.5' })).toBe('/manga/42?highlightChapter=12.5');
  expect(isReleaseChapter(13, '12–14')).toBe(true);
  expect(isReleaseChapter(12.5, '12.5')).toBe(true);
  expect(isReleaseChapter(15, '12–14')).toBe(false);
  expect(isReleaseChapter(12, '1-9999')).toBe(false);
});

test('calendar dates cross month and week boundaries without UTC conversion', () => {
  const date = parseCalendarDate('2026-10-31')!;
  expect(calendarDateKey(calendarDay(date, 1))).toBe('2026-11-01');
  expect(calendarDateKey(calendarDay(date, -7))).toBe('2026-10-24');
  expect(parseCalendarDate('2026-02-31')).toBeNull();
  expect(parseCalendarDate('invalid')).toBeNull();
});

test('today groups episodes by local time period and exact airing time', () => {
  const airing = (hour: number, minute: number, id: string) => ({ id, airingAt: new Date(2026, 9, 31, hour, minute).getTime() / 1000 });
  const groups = groupDailyAirings([airing(19, 30, 'evening'), airing(9, 0, 'morning'), airing(12, 15, 'a'), airing(12, 15, 'b'), airing(1, 0, 'overnight')]);
  expect(groups.map(group => group.id)).toEqual(['overnight', 'morning', 'afternoon', 'evening']);
  expect(groups[2].slots).toHaveLength(1);
  expect(groups[2].slots[0].entries.map(entry => entry.id)).toEqual(['a', 'b']);
  expect(groupDailyAirings([])).toEqual([]);
});

test('release cache survives reloads, refreshes expired pages, and separates adult preferences', async () => {
  const saved = new Map<string, string>();
  const storage = { getItem: (key: string) => saved.get(key) || null, setItem: (key: string, value: string) => { saved.set(key, value); } };
  let requests = 0;
  const load = async () => ({ results: [{ id: ++requests }] });
  const now = Date.now();
  expect((await cachedCalendarFeed('adult=0', load, storage, now)).results[0].id).toBe(1);
  expect((await cachedCalendarFeed('adult=0', load, storage, now + 60000)).results[0].id).toBe(1);
  expect((await cachedCalendarFeed('adult=1', load, storage, now + 60000)).results[0].id).toBe(2);
  expect((await cachedCalendarFeed('adult=0', load, storage, now + 360000)).results[0].id).toBe(3);
  expect((await cachedCalendarFeed('adult=0', load, storage, now + 370000)).results[0].id).toBe(3);
  const fallback = await cachedCalendarFeed('adult=0', async () => { throw new Error('offline'); }, storage, now + 720000);
  expect(fallback.stale).toBe(true);
  expect(fallback.results).toEqual([{ id: 3 }]);
  await expect(cachedCalendarFeed('adult=0', async () => { throw new Error('offline'); }, storage, now + 25 * 3600000)).rejects.toThrow('offline');
});
