/**
 * Property-based tests for CatalogMapper — Property 11.
 *
 * **Property 11: Catalog mapping confidence monotonicity**
 *
 * For any `ParsedRelease` with a non-null `title`, the `confidence` returned
 * by `mapParsedReleaseToAnime()` when using an exact AniList ID hint must be
 * ≥ the confidence returned for the same release without a hint.
 *
 * Rationale: An exact hint always returns `confidence: 100` (Requirement 11.1).
 * Without a hint the mapper runs a fuzzy/synonym search that returns 0–100.
 * Therefore the with-hint confidence (100) is always ≥ the without-hint
 * confidence (0–100).
 *
 * **Validates: Requirements 11.6**
 */

import { describe, it, expect } from 'bun:test';
import * as fc from 'fast-check';
import { mapParsedReleaseToAnime } from '../src/core/naming/catalog-mapper.ts';

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------

/**
 * Install a global fetch mock that returns the given AniList-shaped response
 * for every call. Pass `null` to simulate a network failure (ok: false).
 */
function mockFetch(response) {
  global.fetch = async () => {
    if (response === null) {
      return { ok: false, status: 503, json: async () => ({}) };
    }
    return { ok: true, status: 200, json: async () => response };
  };
}

/** Build a minimal AniList Page response for a single media entry. */
function makeAniListResponse(id, romaji) {
  return {
    data: {
      Page: {
        media: [
          {
            id,
            idMal: null,
            title: { romaji, english: null, native: null },
            synonyms: [],
            startDate: { year: 2020 },
          },
        ],
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/**
 * Generates non-empty, non-null title strings.
 * Constrained to printable ASCII to keep titles realistic and avoid
 * cache-key collisions from degenerate unicode strings.
 */
const titleArb = fc.string({ minLength: 1, maxLength: 80 }).filter(
  (s) => s.trim().length > 0
);

/**
 * Generates a valid positive AniList ID (1 – 999_999).
 */
const anilistIdArb = fc.integer({ min: 1, max: 999_999 });

/**
 * Generates a ParsedRelease with a non-null title.
 */
const parsedReleaseArb = fc.record({
  title: titleArb,
  season: fc.integer({ min: 1, max: 5 }),
  episodeNumber: fc.integer({ min: 1, max: 999 }),
  isSpecial: fc.boolean(),
  isBatch: fc.boolean(),
}).map((r) => ({
  ...r,
  searchTitle: r.title,
  confidence: 80,
}));

// ---------------------------------------------------------------------------
// Unit tests — specific examples (Requirement 11.6)
// ---------------------------------------------------------------------------

describe('mapParsedReleaseToAnime() — Property 11: confidence monotonicity (unit examples)', () => {
  it('confidence with hint (100) >= confidence without hint when AniList returns no match (0)', async () => {
    // Without hint: AniList returns empty → confidence 0
    mockFetch({ data: { Page: { media: [] } } });

    const parsed = {
      title: 'Attack on Titan MonotonicityTest1',
      searchTitle: 'Attack on Titan MonotonicityTest1',
      season: 1,
      episodeNumber: 1,
      isSpecial: false,
      isBatch: false,
      confidence: 80,
    };
    const withoutHint = await mapParsedReleaseToAnime(parsed);

    // With hint: always returns confidence 100
    const withHint = await mapParsedReleaseToAnime(parsed, { anilistId: 16498 });

    expect(withHint.confidence).toBeGreaterThanOrEqual(withoutHint.confidence);
    expect(withHint.confidence).toBe(100);
  });

  it('confidence with hint (100) >= confidence without hint when AniList returns partial match', async () => {
    // Without hint: AniList returns a low-confidence result (title won't match well)
    mockFetch(makeAniListResponse(16498, 'ZZZ_NoMatch_Shingeki'));

    const parsed = {
      title: 'Attack on Titan MonotonicityTest2',
      searchTitle: 'Attack on Titan MonotonicityTest2',
      season: 1,
      episodeNumber: 1,
      isSpecial: false,
      isBatch: false,
      confidence: 80,
    };
    const withoutHint = await mapParsedReleaseToAnime(parsed);

    const withHint = await mapParsedReleaseToAnime(parsed, { anilistId: 16498 });

    expect(withHint.confidence).toBeGreaterThanOrEqual(withoutHint.confidence);
    expect(withHint.confidence).toBe(100);
  });

  it('confidence with hint (100) >= confidence without hint when AniList returns high-confidence match', async () => {
    const title = 'ExactMatchTitle MonotonicityTest3';
    // Without hint: AniList returns an exact match → confidence 100
    mockFetch(makeAniListResponse(99999, title));

    const parsed = {
      title,
      searchTitle: title,
      season: 1,
      episodeNumber: 1,
      isSpecial: false,
      isBatch: false,
      confidence: 80,
    };
    const withoutHint = await mapParsedReleaseToAnime(parsed);

    const withHint = await mapParsedReleaseToAnime(parsed, { anilistId: 99999 });

    // Both should be 100 in this case; with-hint must still be >=
    expect(withHint.confidence).toBeGreaterThanOrEqual(withoutHint.confidence);
    expect(withHint.confidence).toBe(100);
  });

  it('confidence with hint (100) >= confidence without hint when network fails', async () => {
    // Without hint: network failure → confidence 0
    mockFetch(null);

    const parsed = {
      title: 'NetworkFailTitle MonotonicityTest4',
      searchTitle: 'NetworkFailTitle MonotonicityTest4',
      season: 1,
      episodeNumber: 1,
      isSpecial: false,
      isBatch: false,
      confidence: 80,
    };
    const withoutHint = await mapParsedReleaseToAnime(parsed);

    const withHint = await mapParsedReleaseToAnime(parsed, { anilistId: 42 });

    expect(withHint.confidence).toBeGreaterThanOrEqual(withoutHint.confidence);
    expect(withHint.confidence).toBe(100);
  });

  it('with-hint result always has method "exact"', async () => {
    mockFetch({ data: { Page: { media: [] } } });

    const parsed = {
      title: 'MethodCheckTitle',
      searchTitle: 'MethodCheckTitle',
      season: 1,
      episodeNumber: 1,
      isSpecial: false,
      isBatch: false,
      confidence: 80,
    };
    const result = await mapParsedReleaseToAnime(parsed, { anilistId: 12345 });

    expect(result.method).toBe('exact');
    expect(result.confidence).toBe(100);
  });

  it('without-hint confidence is in [0, 100]', async () => {
    mockFetch({ data: { Page: { media: [] } } });

    const parsed = {
      title: 'RangeCheckTitle MonotonicityTest5',
      searchTitle: 'RangeCheckTitle MonotonicityTest5',
      season: 1,
      episodeNumber: 1,
      isSpecial: false,
      isBatch: false,
      confidence: 80,
    };
    const result = await mapParsedReleaseToAnime(parsed);

    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// Property-based test — Property 11
// ---------------------------------------------------------------------------

/**
 * Property 11: Catalog mapping confidence monotonicity
 *
 * For any `ParsedRelease` with a non-null `title` and any valid AniList ID,
 * `confidence(with hint) >= confidence(without hint)`.
 *
 * The with-hint path always returns `confidence: 100` (Requirement 11.1).
 * The without-hint path returns a value in [0, 100] via fuzzy/synonym search.
 * Therefore the inequality always holds.
 *
 * **Validates: Requirements 11.6**
 */
describe('mapParsedReleaseToAnime() — Property 11: confidence monotonicity (property-based)', () => {
  it('confidence(with hint) >= confidence(without hint) for any ParsedRelease with non-null title', async () => {
    // Use a fixed seed for reproducibility; numRuns kept low because each
    // iteration makes two async calls through the mocked fetch.
    await fc.assert(
      fc.asyncProperty(parsedReleaseArb, anilistIdArb, async (parsed, anilistId) => {
        // Append the anilistId to the title to ensure each run uses a
        // unique cache key, preventing cross-run cache hits.
        const uniqueParsed = {
          ...parsed,
          title: `${parsed.title}_pbt_${anilistId}`,
          searchTitle: `${parsed.title}_pbt_${anilistId}`,
        };

        // Mock fetch to return an empty result so the without-hint path
        // always goes through the full lookup without cache interference.
        mockFetch({ data: { Page: { media: [] } } });
        const withoutHint = await mapParsedReleaseToAnime(uniqueParsed);

        const withHint = await mapParsedReleaseToAnime(uniqueParsed, { anilistId });

        // Core property: with-hint confidence must be >= without-hint confidence
        expect(withHint.confidence).toBeGreaterThanOrEqual(withoutHint.confidence);

        // Invariant: with-hint always returns exactly 100 (Requirement 11.1)
        expect(withHint.confidence).toBe(100);

        // Invariant: without-hint confidence is always in [0, 100]
        expect(withoutHint.confidence).toBeGreaterThanOrEqual(0);
        expect(withoutHint.confidence).toBeLessThanOrEqual(100);
      }),
      { numRuns: 200, seed: 42 }
    );
  });

  it('confidence(with hint) >= confidence(without hint) when AniList returns a partial match', async () => {
    await fc.assert(
      fc.asyncProperty(parsedReleaseArb, anilistIdArb, async (parsed, anilistId) => {
        const uniqueParsed = {
          ...parsed,
          title: `${parsed.title}_partial_${anilistId}`,
          searchTitle: `${parsed.title}_partial_${anilistId}`,
        };

        // Return a low-confidence AniList result for the without-hint path
        mockFetch(makeAniListResponse(anilistId, `ZZZ_NoMatch_${anilistId}`));
        const withoutHint = await mapParsedReleaseToAnime(uniqueParsed);

        const withHint = await mapParsedReleaseToAnime(uniqueParsed, { anilistId });

        expect(withHint.confidence).toBeGreaterThanOrEqual(withoutHint.confidence);
        expect(withHint.confidence).toBe(100);
      }),
      { numRuns: 100, seed: 99 }
    );
  });

  it('confidence(with hint) >= confidence(without hint) when network is unavailable', async () => {
    await fc.assert(
      fc.asyncProperty(parsedReleaseArb, anilistIdArb, async (parsed, anilistId) => {
        const uniqueParsed = {
          ...parsed,
          title: `${parsed.title}_netfail_${anilistId}`,
          searchTitle: `${parsed.title}_netfail_${anilistId}`,
        };

        // Simulate network failure for the without-hint path
        mockFetch(null);
        const withoutHint = await mapParsedReleaseToAnime(uniqueParsed);

        const withHint = await mapParsedReleaseToAnime(uniqueParsed, { anilistId });

        expect(withHint.confidence).toBeGreaterThanOrEqual(withoutHint.confidence);
        expect(withHint.confidence).toBe(100);
        // Network failure → without-hint confidence must be 0
        expect(withoutHint.confidence).toBe(0);
      }),
      { numRuns: 100, seed: 7 }
    );
  });
});
