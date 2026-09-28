import { describe, expect, test } from 'bun:test';
import {
  computeAffinity,
  cosineSimilarity,
  rankCandidates,
  scoreCandidate,
} from '../src/core/recommendations/scoring';
import { buildTasteProfile } from '../src/core/recommendations/tasteProfile';
import type { AnimeMeta, UserAnimeSignal } from '../src/core/recommendations/types';

function meta(id: string, partial: Partial<AnimeMeta>): AnimeMeta {
  return {
    id,
    title: id,
    genres: [],
    tags: [],
    studios: [],
    ...partial,
  };
}

describe('computeAffinity', () => {
  test('dislike is a hard negative', () => {
    expect(computeAffinity({ animeId: 'a', disliked: true })).toBe(-1);
  });
  test('completed + high rating is strongly positive', () => {
    const a = computeAffinity({ animeId: 'a', status: 'completed', userRating: 9, completed: true });
    expect(a).toBeGreaterThan(0.6);
  });
  test('dropped is negative', () => {
    expect(computeAffinity({ animeId: 'a', status: 'dropped' })).toBeLessThan(0);
  });
  test('unknown signal is mildly positive', () => {
    expect(computeAffinity({ animeId: 'a' })).toBeCloseTo(0.4, 5);
  });
});

describe('cosineSimilarity', () => {
  test('identical vectors -> 1', () => {
    expect(cosineSimilarity({ a: 1, b: 1 }, { a: 1, b: 1 })).toBeCloseTo(1, 5);
  });
  test('disjoint vectors -> 0', () => {
    expect(cosineSimilarity({ a: 1 }, { b: 1 })).toBe(0);
  });
});

describe('buildTasteProfile', () => {
  const metaById = new Map<string, AnimeMeta>([
    ['1', meta('1', { genres: ['Action', 'Adventure'], studios: ['MAPPA'], format: 'TV', year: 2021 })],
    ['2', meta('2', { genres: ['Action', 'Drama'], studios: ['MAPPA'], format: 'TV', year: 2019 })],
    ['3', meta('3', { genres: ['Romance'], studios: ['KyoAni'], format: 'TV', year: 2007, })],
  ]);

  test('positively-signaled anime shape the profile; dislikes do not', () => {
    const signals: UserAnimeSignal[] = [
      { animeId: '1', status: 'completed', userRating: 9, completed: true },
      { animeId: '2', status: 'completed', userRating: 8, completed: true },
      { animeId: '3', disliked: true },
    ];
    const profile = buildTasteProfile(signals, metaById);
    expect(profile.sampleSize).toBe(2);
    // Action appears in both liked shows -> should be the top genre.
    expect(profile.topGenres[0].genre).toBe('Action');
    // Romance was only on the disliked show -> absent.
    expect(profile.genres['Romance']).toBeUndefined();
    // MAPPA liked twice -> top studio.
    expect(profile.topStudios[0].studio).toBe('MAPPA');
  });

  test('empty signals yield a usable default profile', () => {
    const profile = buildTasteProfile([], new Map());
    expect(profile.sampleSize).toBe(0);
    expect(profile.ratingRange.average).toBe(7);
  });
});

describe('scoreCandidate + rankCandidates', () => {
  const metaById = new Map<string, AnimeMeta>([
    ['1', meta('1', { genres: ['Action', 'Adventure'], studios: ['MAPPA'], format: 'TV', year: 2021 })],
    ['2', meta('2', { genres: ['Action', 'Drama'], studios: ['MAPPA'], format: 'TV', year: 2019 })],
  ]);
  const profile = buildTasteProfile(
    [
      { animeId: '1', status: 'completed', userRating: 9, completed: true },
      { animeId: '2', status: 'completed', userRating: 8, completed: true },
    ],
    metaById,
  );

  test('on-taste candidate scores higher than off-taste', () => {
    const onTaste = meta('c1', { genres: ['Action', 'Adventure'], studios: ['MAPPA'], format: 'TV', year: 2022, averageScore: 82, popularity: 5000 });
    const offTaste = meta('c2', { genres: ['Slice of Life'], studios: ['Unknown'], format: 'ONA', year: 1998, averageScore: 55, popularity: 100 });
    const on = scoreCandidate(onTaste, profile, { maxPopularity: 5000 });
    const off = scoreCandidate(offTaste, profile, { maxPopularity: 5000 });
    expect(on.score).toBeGreaterThan(off.score);
    expect(on.factors.genreMatch).toBeGreaterThan(off.factors.genreMatch);
    expect(on.reasons.length).toBeGreaterThan(0);
  });

  test('collaborative signal lifts an otherwise weak candidate', () => {
    const weak = meta('c3', { genres: ['Horror'], studios: ['X'], format: 'TV', year: 2020, averageScore: 60, popularity: 200 });
    const base = scoreCandidate(weak, profile, { maxPopularity: 5000 });
    const lifted = scoreCandidate(weak, profile, { maxPopularity: 5000, collaborative: 0.9, collaborativeWeight: 0.5 });
    expect(lifted.score).toBeGreaterThan(base.score);
  });

  test('rankCandidates excludes seen ids and respects limit', () => {
    const candidates = [
      meta('c1', { genres: ['Action'], year: 2021, averageScore: 80, popularity: 4000 }),
      meta('seen', { genres: ['Action'], year: 2021, averageScore: 80, popularity: 4000 }),
      meta('c2', { genres: ['Drama'], year: 2019, averageScore: 70, popularity: 2000 }),
    ];
    const ranked = rankCandidates(candidates, profile, { excludeIds: new Set(['seen']), limit: 5 });
    expect(ranked.find((r) => r.animeId === 'seen')).toBeUndefined();
    expect(ranked.length).toBe(2);
  });

  test('niche boost reorders popularity contribution', () => {
    const popular = meta('pop', { genres: ['Action'], year: 2021, averageScore: 75, popularity: 5000 });
    const mainstream = scoreCandidate(popular, profile, { maxPopularity: 5000, nicheBoost: 0 });
    const niche = scoreCandidate(popular, profile, { maxPopularity: 5000, nicheBoost: 1 });
    expect(mainstream.factors.popularityBoost).toBeGreaterThan(niche.factors.popularityBoost);
  });
});
