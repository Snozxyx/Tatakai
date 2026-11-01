import { describe, expect, test } from 'bun:test';
import { mergeEpisodeLists } from '../src/lib/mergeEpisodeLists';
import { applyEpisodeAvailability } from '../src/lib/episodeAvailability';
import type { EpisodeData } from '../src/types/anime';

const episode = (number: number, fields: Partial<EpisodeData> = {}): EpisodeData => ({
  number, episodeId: `anime?ep=${number}`, title: `Episode ${number}`, isFiller: false, ...fields,
});

describe('API and tracker episode lists', () => {
  test('a partial tracker index does not hide newer provider episodes', () => {
    const tracker = [episode(1, { title: 'Tracker title' }), episode(2)];
    const api = [1, 2, 3, 4, 5].map(number => episode(number, { title: `Provider title ${number}` }));
    const result = mergeEpisodeLists(tracker, api);
    expect(result.map(row => row.number)).toEqual([1, 2, 3, 4, 5]);
    expect(result[0].title).toBe('Tracker title');
    expect(result[1].title).toBe('Provider title 2');
    expect(tracker[1].title).toBe('Episode 2');
  });

  test('overlap preserves playback identity and fills API metadata', () => {
    const result = mergeEpisodeLists([episode(1, { episodeId: 'stable?ep=1', overview: 'Tracker synopsis' })], [
      episode(1, { episodeId: 'provider?ep=1', title: 'A real title', image: 'https://image/1.jpg',
        overview: 'Provider synopsis', airDateUtc: '2026-10-29T12:00:00Z', runtime: 24, isFiller: true }),
    ]);
    expect(result[0]).toMatchObject({ episodeId: 'stable?ep=1', title: 'A real title', overview: 'Tracker synopsis',
      image: 'https://image/1.jpg', airDateUtc: '2026-10-29T12:00:00Z', runtime: 24, isFiller: true });
  });

  test('provider-only lists are sorted and deduplicated without specials or invalid numbers', () => {
    const result = mergeEpisodeLists([], [episode(3), episode(1), episode(1), episode(2),
      episode(0), episode(NaN), episode(1.5), episode(4, { isSpecial: true })]);
    expect(result.map(row => row.number)).toEqual([1, 2, 3]);
    expect(mergeEpisodeLists([episode(1)], [])).toEqual([episode(1)]);
  });

  test('merging an API row does not unlock a future tracker episode', () => {
    const now = Date.parse('2026-10-30T12:00:00Z');
    const result = applyEpisodeAvailability(mergeEpisodeLists([
      episode(3, { hasAired: false, airDateUtc: '2026-11-01T12:00:00Z' }),
    ], [episode(3), episode(4)]), undefined, now);
    expect(result.map(row => row.hasAired)).toEqual([false, false]);
  });
});
