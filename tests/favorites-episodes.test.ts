import { expect, test } from 'bun:test';
import { latestAnimeActivity, watchEpisodeHref, groupHistoryByTitle } from '../src/lib/favoritesEpisodes';
import type { LibraryEntry } from '../src/lib/favoritesLibrary';

const row = (number: number, watched_at: string, anime_id = 'anilist:42') => ({
  anime_id, episode_number: number, episode_id: `${anime_id}?ep=${number}`, watched_at,
  progress_seconds: 120, duration_seconds: 1400, completed: false,
});
function entry(activity: ReturnType<typeof row>, title = 'A series'): LibraryEntry {
  return { key: activity.episode_id, id: activity.anime_id, kind: 'anime', title, poster: null,
    status: 'watching', format: 'anime', updatedAt: activity.watched_at,
    href: watchEpisodeHref(activity.episode_id), progress: `Episode ${activity.episode_number}`, source: activity };
}

test('continue watching follows the most recently watched episode, including rewatches', () => {
  const older = row(10, '2026-10-29T12:00:00Z');
  const rewatch = row(2, '2026-10-31T12:00:00Z');
  expect(latestAnimeActivity([older, rewatch], { anime_id: '42' })).toBe(rewatch);
  expect(latestAnimeActivity([older, rewatch], { anime_id: 'mal:42' })).toBeUndefined();
  expect(latestAnimeActivity([], { anime_id: 'anilist:42' })).toBeUndefined();
  expect(watchEpisodeHref(rewatch.episode_id)).toBe('/watch/anilist%3A42%3Fep%3D2');
});

test('history has one title group with numerically ordered real episode links', () => {
  const rows = [entry(row(10, '2026-10-30T12:00:00Z')), entry(row(2, '2026-10-31T12:00:00Z'))];
  const groups = groupHistoryByTitle(rows);
  expect(groups).toHaveLength(1);
  expect(groups[0].entries.map(entry => entry.source.episode_number)).toEqual([2, 10]);
  expect(groups[0].entries[0].href).toBe('/watch/anilist%3A42%3Fep%3D2');
  expect(rows[0].source.episode_number).toBe(10);
});

test('matching names do not merge remakes, while verified ID aliases group together', () => {
  const first = entry(row(1, '2026-10-30T12:00:00Z'));
  const alias = entry(row(2, '2026-10-31T12:00:00Z', 'anilist-42'));
  const remake = entry(row(1, '2026-10-29T12:00:00Z', 'anilist:99'));
  const groups = groupHistoryByTitle([first, alias, remake]);
  expect(groups).toHaveLength(2);
  expect(groups[0].entries).toHaveLength(2);
  expect(groups[1].entries).toHaveLength(1);
  expect(groupHistoryByTitle([])).toEqual([]);
});

test('an explicit MAL/AniList crosswalk matches saved watchlist activity', () => {
  const activity = { ...row(3, '2026-10-31T12:00:00Z', 'provider-slug'), anilist_id: 42, mal_id: 123 };
  expect(latestAnimeActivity([activity], { anime_id: 'mal:123' })).toBe(activity);
});

test('duplicate episode activity keeps the newest progress even when input is unsorted', () => {
  const older = entry(row(2, '2026-10-29T12:00:00Z'));
  const newer = entry({ ...row(2, '2026-10-31T12:00:00Z'), completed: true });
  const groups = groupHistoryByTitle([older, newer]);
  expect(groups[0].entries).toEqual([newer]);
  expect(groups[0].updatedAt).toBe(newer.updatedAt);
});
