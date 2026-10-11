import { describe, expect, test } from 'bun:test';
import {
  classifyTier,
  computeAccuracy,
  computeAffinity,
  cosineSimilarity,
  formatGroup,
  rankCandidates,
  scoreCandidate,
  toRelevanceVector,
} from '../src/core/recommendations/scoring';
import { buildTasteProfile } from '../src/core/recommendations/tasteProfile';
import {
  buildRatingProfile,
  dedupeFranchiseSignals,
  fitTrend,
  prunePreferences,
} from '../src/core/recommendations/ratingProfile';
import {
  mangabakaTagGroup,
  mangabakaTagWeight,
  mergeMangaBakaMeta,
} from '../src/core/recommendations/mangaBakaEnrich';
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

  test('rankCandidates assigns strong/possible/weak tiers', () => {
    const candidates = [
      meta('c1', { genres: ['Action'], year: 2021, averageScore: 85, popularity: 4000 }),
      meta('c2', { genres: ['Action'], year: 2021, averageScore: 40, popularity: 10 }),
    ];
    const ranked = rankCandidates(candidates, profile, {
      excludeIds: new Set(),
      limit: 5,
      userScoredMean: 8.5,
    });
    expect(ranked[0].tier).toBeDefined();
    expect(['strong', 'possible', 'weak']).toContain(ranked[1].tier);
    // The on-taste, highly-rated candidate should tier at least as well.
    const order = { strong: 0, possible: 1, weak: 2 } as const;
    expect(order[ranked[0].tier!]).toBeLessThanOrEqual(order[ranked[1].tier!]);
  });

  test('obscure titles are penalized proportionally (Step 6)', () => {
    const mk = (pop: number) => meta(`p${pop}`, { genres: ['Action'], year: 2021, averageScore: 80, popularity: pop });
    const cands = [mk(10000), mk(8000), mk(9000), mk(50)];
    const ranked = rankCandidates(cands, profile, { excludeIds: new Set() });
    const obscure = ranked.find((r) => r.animeId === 'p50')!;
    const popular = ranked.find((r) => r.animeId === 'p10000')!;
    expect(obscure.score).toBeLessThan(popular.score);
  });

  test('below-format-average community scores are penalized (Step 6)', () => {
    const good = meta('good', { genres: ['Action'], year: 2021, averageScore: 85, popularity: 5000, format: 'TV' });
    const bad = meta('bad', { genres: ['Action'], year: 2021, averageScore: 40, popularity: 5000, format: 'TV' });
    const mid = meta('mid', { genres: ['Action'], year: 2021, averageScore: 70, popularity: 5000, format: 'TV' });
    const ranked = rankCandidates([good, bad, mid], profile, { excludeIds: new Set() });
    const badRank = ranked.find((r) => r.animeId === 'bad')!;
    const goodRank = ranked.find((r) => r.animeId === 'good')!;
    expect(badRank.score).toBeLessThan(goodRank.score);
  });
});

describe('ratingProfile (Steps 2–4)', () => {
  test('tags accumulate rating × relevance: 95% tag beats 40% tag', () => {
    const metaById = new Map<string, AnimeMeta>([
      ['1', meta('1', {
        genres: ['Action'],
        tags: ['Time Skip', 'Harem'],
        tagsDetailed: [
          { name: 'Time Skip', relevance: 0.95, group: 'Story' },
          { name: 'Harem', relevance: 0.4, group: 'Cast' },
        ],
        year: 2020,
      })],
    ]);
    const profile = buildRatingProfile(
      [{ animeId: '1', userRating: 9 }],
      metaById,
    );
    expect(profile.tags['Time Skip']).toBeGreaterThan(profile.tags['Harem'] ?? 0);
    expect(profile.tagGroups['Story']).toBeGreaterThan(profile.tagGroups['Cast'] ?? 0);
  });

  test('uncertain preferences are pruned (Step 3)', () => {
    // 'Mecha' appears once with a low rating; 'Action' appears often and high.
    const metaById = new Map<string, AnimeMeta>([
      ['1', meta('1', { genres: ['Action'] })],
      ['2', meta('2', { genres: ['Action'] })],
      ['3', meta('3', { genres: ['Action'] })],
      ['4', meta('4', { genres: ['Mecha'] })],
    ]);
    const profile = buildRatingProfile(
      [
        { animeId: '1', userRating: 9 },
        { animeId: '2', userRating: 9 },
        { animeId: '3', userRating: 8 },
        { animeId: '4', userRating: 3 },
      ],
      metaById,
    );
    expect(profile.genres['Action']).toBeGreaterThan(0);
    expect(profile.genres['Mecha'] ?? 0).toBeLessThan(profile.genres['Action']);
  });

  test('prunePreferences keeps both-threshold winners, drops the rest', () => {
    const out = prunePreferences(
      { Action: 27, Mecha: 3 },
      { Action: 3, Mecha: 1 },
    );
    expect(out['Action']).toBeGreaterThan(0);
    expect(out['Mecha']).toBeUndefined();
  });

  test('fitTrend needs 8 samples and captures direction', () => {
    expect(fitTrend([2020, 2021], [8, 9])).toBeNull();
    const years = [2000, 2002, 2005, 2008, 2012, 2016, 2020, 2023];
    const rising = [4, 5, 5, 6, 7, 7, 8, 9];
    const line = fitTrend(years, rising);
    expect(line).not.toBeNull();
    expect(line!.slope).toBeGreaterThan(0);
    expect(line!.samples).toBe(8);
  });

  test('userScoredMean reflects personal ratings', () => {
    const metaById = new Map<string, AnimeMeta>([
      ['1', meta('1', { genres: ['Action'] })],
      ['2', meta('2', { genres: ['Drama'] })],
    ]);
    const profile = buildRatingProfile(
      [
        { animeId: '1', userRating: 8 },
        { animeId: '2', userRating: 6 },
      ],
      metaById,
    );
    expect(profile.userScoredMean).toBeCloseTo(7, 5);
  });
});

describe('dedupeFranchiseSignals (Step 1)', () => {
  test('keeps the highest-rated entry per franchise component', () => {
    const metaById = new Map<string, AnimeMeta>([
      ['series', meta('series', { genres: ['Action'], relationIds: ['spinoff'] })],
      ['spinoff', meta('spinoff', { genres: ['Action'], relationIds: ['series'] })],
      ['other', meta('other', { genres: ['Drama'] })],
    ]);
    const signals: UserAnimeSignal[] = [
      { animeId: 'series', userRating: 6 },
      { animeId: 'spinoff', userRating: 9 },
      { animeId: 'other', userRating: 7 },
    ];
    const out = dedupeFranchiseSignals(signals, metaById);
    expect(out.map((s) => s.animeId).sort()).toEqual(['other', 'spinoff']);
  });

  test('unrelated titles all survive', () => {
    const metaById = new Map<string, AnimeMeta>([
      ['a', meta('a', { genres: ['Action'] })],
      ['b', meta('b', { genres: ['Drama'] })],
    ]);
    const out = dedupeFranchiseSignals(
      [{ animeId: 'a', userRating: 8 }, { animeId: 'b', userRating: 7 }],
      metaById,
    );
    expect(out).toHaveLength(2);
  });
});

describe('tiers + accuracy (Steps 7–8)', () => {
  test('classifyTier thresholds', () => {
    expect(classifyTier(90, 8, 50, 7)).toBe('strong');
    expect(classifyTier(60, 8, 50, 7)).toBe('possible');
    expect(classifyTier(30, 8, 50, 7)).toBe('weak');
  });

  test('computeAccuracy is MAE as % of the 10-point scale', () => {
    // Off by 1.0 on average on a 10-point scale -> 10%.
    expect(computeAccuracy([80, 60], [9, 5])).toBeCloseTo(10, 5);
    expect(computeAccuracy([80, 60], [8, 6])).toBeCloseTo(0, 5);
    expect(computeAccuracy([80], [8, 6])).toBeNull();
  });
});

describe('tag helpers + format groups', () => {
  test('toRelevanceVector prefers detailed relevance', () => {
    const vec = toRelevanceVector(
      [{ name: 'Time Skip', relevance: 0.95 }],
      ['Time Skip'],
    );
    expect(vec['Time Skip']).toBeCloseTo(0.95, 5);
    expect(toRelevanceVector(undefined, ['Action'])['Action']).toBe(1);
  });

  test('formatGroup splits manga from anime', () => {
    expect(formatGroup('MANHWA')).toBe('manga');
    expect(formatGroup('NOVEL')).toBe('manga');
    expect(formatGroup('TV')).toBe('anime');
    expect(formatGroup('manhua')).toBe('manga');
  });
});

describe('mangaBakaEnrich', () => {
  test('weight mapping core > defining > incidental', () => {
    expect(mangabakaTagWeight('core')).toBe(1);
    expect(mangabakaTagWeight('defining')).toBeGreaterThan(mangabakaTagWeight('incidental'));
    expect(mangabakaTagGroup('Activities > Conflict > Duels')).toBe('Activities');
    expect(mangabakaTagGroup(null)).toBeNull();
  });

  test('merge layers MangaBaka tags/groups/creators over AniList meta', () => {
    const base = meta('m1', {
      genres: ['Action'],
      tags: ['Rescue'],
      tagsDetailed: [{ name: 'Rescue', relevance: 1, group: null }],
      studios: ['Existing Author'],
      averageScore: null,
      year: null,
    });
    const merged = mergeMangaBakaMeta(base, {
      mangaBakaId: 1,
      title: 'T',
      nativeTitle: null,
      romanizedTitle: null,
      aliases: [],
      localizedTitles: [],
      description: null,
      cover: { original: null, small: null, medium: null, large: null, width: null, height: null, blurhash: null },
      authors: ['Existing Author', 'New Writer'],
      artists: [],
      publishers: [{ name: 'Shueisha', type: 'Original', note: null }],
      genres: ['Adventure'],
      tags: [
        { id: 1, name: 'Duels', path: 'Activities > Conflict > Duels', weight: 'core', isSpoiler: false },
        { id: 2, name: 'Rescue', path: null, weight: 'core', isSpoiler: false },
        { id: 3, name: 'Spoiler Tag', path: null, weight: 'core', isSpoiler: true },
      ],
      status: 'ongoing',
      contentRating: null,
      type: 'manga',
      year: 2019,
      publishedStart: null,
      publishedEnd: null,
      rating: 82,
      popularityRank: 5,
      totalChapters: 100,
      totalVolumes: 12,
      isLicensed: false,
      hasAnime: false,
      animeCoverage: null,
      links: [],
      sources: {},
      kitsuId: null,
      malId: null,
      anilistId: 1,
      lastUpdatedAt: null,
    });
    expect(merged.tags).toContain('Duels');
    expect(merged.tags).not.toContain('Spoiler Tag');
    // No duplicate for the tag present in both catalogs.
    expect(merged.tags.filter((t) => t === 'Rescue')).toHaveLength(1);
    expect(merged.tagGroups).toContain('Activities');
    expect(merged.studios).toContain('New Writer');
    expect(merged.genres).toContain('Adventure');
    expect(merged.averageScore).toBe(82);
    expect(merged.year).toBe(2019);
    expect(merged.status).toBe('RELEASING');
    expect(merged.totalChapters).toBe(100);
  });
});
