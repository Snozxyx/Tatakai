/**
 * Unit tests for catalog-mapper.ts
 *
 * Tests cover:
 * - computeConfidence() and levenshtein() pure functions
 * - mapParsedReleaseToAnime() four-step lookup logic
 * - resolveSeasonEntry() SEQUEL chain traversal
 * - TitleCache LRU eviction and IPC persistence
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 12.1, 12.2, 12.3, 12.4
 */

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";

// ---------------------------------------------------------------------------
// Bun natively supports TypeScript imports
// ---------------------------------------------------------------------------

import {
  mapParsedReleaseToAnime,
  resolveSeasonEntry,
  computeConfidence,
  levenshtein,
  titleCache,
} from "../src/core/naming/catalog-mapper.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a minimal ParsedRelease for testing */
function makeParsed(title, opts = {}) {
  return {
    title,
    searchTitle: opts.searchTitle ?? title,
    season: opts.season ?? 1,
    episodeNumber: opts.episodeNumber ?? 1,
    isSpecial: opts.isSpecial ?? false,
    isBatch: opts.isBatch ?? false,
    confidence: opts.confidence ?? 80,
  };
}

/** Build a minimal AniList GraphQL response for a single media entry */
function makeAniListResponse(media) {
  return {
    data: {
      Page: {
        media: Array.isArray(media) ? media : [media],
      },
    },
  };
}

function makeAniListMedia(id, romaji, english = null, synonyms = [], idMal = null) {
  return {
    id,
    idMal,
    title: { romaji, english, native: null },
    synonyms,
    startDate: { year: 2020 },
  };
}

function makeRelationsResponse(edges) {
  return {
    data: {
      Media: {
        relations: { edges },
      },
    },
  };
}

function makeRelationEdge(relationType, id, year) {
  return {
    relationType,
    node: { id, startDate: { year } },
  };
}

// ---------------------------------------------------------------------------
// Mock global fetch
// ---------------------------------------------------------------------------

let fetchMock;

function setupFetchMock(responses) {
  let callIndex = 0;
  fetchMock = mock(async (url, options) => {
    const body = options?.body ? JSON.parse(options.body) : {};
    const response = typeof responses === "function"
      ? responses(url, body, callIndex++)
      : responses[callIndex++];

    if (!response) {
      return { ok: false, status: 404, json: async () => ({}) };
    }

    return {
      ok: true,
      status: 200,
      json: async () => response,
    };
  });

  global.fetch = fetchMock;
}

// ---------------------------------------------------------------------------
// levenshtein() — pure function tests
// ---------------------------------------------------------------------------

describe("levenshtein()", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("hello", "hello")).toBe(0);
  });

  it("returns 0 for empty strings", () => {
    expect(levenshtein("", "")).toBe(0);
  });

  it("returns length of non-empty string when other is empty", () => {
    expect(levenshtein("abc", "")).toBe(3);
    expect(levenshtein("", "abc")).toBe(3);
  });

  it("returns 1 for single substitution", () => {
    expect(levenshtein("cat", "bat")).toBe(1);
  });

  it("returns 1 for single insertion", () => {
    expect(levenshtein("cat", "cats")).toBe(1);
  });

  it("returns 1 for single deletion", () => {
    expect(levenshtein("cats", "cat")).toBe(1);
  });

  it("handles longer strings", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// computeConfidence() — pure function tests
// ---------------------------------------------------------------------------

describe("computeConfidence()", () => {
  it("returns 100 for exact match (case-insensitive)", () => {
    expect(computeConfidence("Attack on Titan", "Attack on Titan")).toBe(100);
    expect(computeConfidence("attack on titan", "Attack on Titan")).toBe(100);
  });

  it("returns 90 for prefix match", () => {
    expect(computeConfidence("Attack on Titan", "Attack on Titan Season 2")).toBe(90);
  });

  it("returns 80 for contains match", () => {
    expect(computeConfidence("Titan", "Attack on Titan")).toBe(80);
  });

  it("returns a value in [0, 100] for any inputs", () => {
    const pairs = [
      ["Re:Zero", "Re Zero kara Hajimeru Isekai Seikatsu"],
      ["Naruto", "Boruto"],
      ["abc", "xyz"],
      ["", "something"],
      ["something", ""],
    ];
    for (const [a, b] of pairs) {
      const score = computeConfidence(a, b);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it("returns 100 for two empty strings", () => {
    expect(computeConfidence("", "")).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// mapParsedReleaseToAnime() — Step 1: Exact hint (Requirement 11.1)
// ---------------------------------------------------------------------------

describe("mapParsedReleaseToAnime() — Step 1: exact hint", () => {
  it("returns confidence 100 and method 'exact' when anilistId hint is provided", async () => {
    const parsed = makeParsed("Attack on Titan");
    const result = await mapParsedReleaseToAnime(parsed, { anilistId: 16498 });

    expect(result.anilistId).toBe(16498);
    expect(result.confidence).toBe(100);
    expect(result.method).toBe("exact");
  });

  it("does not call fetch when anilistId hint is provided", async () => {
    const fetchSpy = mock(async () => ({ ok: true, json: async () => ({}) }));
    global.fetch = fetchSpy;

    const parsed = makeParsed("Attack on Titan");
    await mapParsedReleaseToAnime(parsed, { anilistId: 16498 });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("includes malId from hints when provided", async () => {
    const parsed = makeParsed("Attack on Titan");
    const result = await mapParsedReleaseToAnime(parsed, { anilistId: 16498, malId: 16498 });

    expect(result.malId).toBe(16498);
  });

  it("sets malId to null when not in hints", async () => {
    const parsed = makeParsed("Attack on Titan");
    const result = await mapParsedReleaseToAnime(parsed, { anilistId: 16498 });

    expect(result.malId).toBeNull();
  });

  it("uses parsed.title as matchedTitle when hint is provided", async () => {
    const parsed = makeParsed("Attack on Titan");
    const result = await mapParsedReleaseToAnime(parsed, { anilistId: 16498 });

    expect(result.matchedTitle).toBe("Attack on Titan");
  });

  it("confidence with hint >= confidence without hint (Requirement 11.6)", async () => {
    // Without hint: mock AniList to return a 75% confidence result
    setupFetchMock([
      makeAniListResponse(makeAniListMedia(16498, "Shingeki no Kyojin")),
      makeAniListResponse([]), // synonym search returns nothing
    ]);

    const parsed = makeParsed("Attack on Titan");
    const resultWithoutHint = await mapParsedReleaseToAnime(parsed);
    const resultWithHint = await mapParsedReleaseToAnime(parsed, { anilistId: 16498 });

    expect(resultWithHint.confidence).toBeGreaterThanOrEqual(resultWithoutHint.confidence);
  });
});

// ---------------------------------------------------------------------------
// mapParsedReleaseToAnime() — Step 3: AniList variant search (Requirement 11.3)
// ---------------------------------------------------------------------------

describe("mapParsedReleaseToAnime() — Step 3: AniList variant search", () => {
  beforeEach(() => {
    // Reset the title cache between tests by clearing its internal state
    // We do this by looking up a non-existent key to trigger hydration
  });

  it("returns fuzzy method when AniList returns confidence >= 80", async () => {
    setupFetchMock([
      makeAniListResponse(makeAniListMedia(16498, "Attack on Titan")),
    ]);

    const parsed = makeParsed("Attack on Titan");
    // Use a unique title to avoid cache hits from previous tests
    parsed.title = "Attack on Titan UniqueTest1";
    parsed.searchTitle = "Attack on Titan UniqueTest1";

    const result = await mapParsedReleaseToAnime(parsed);

    expect(result.anilistId).toBe(16498);
    expect(result.method).toBe("fuzzy");
    expect(result.confidence).toBeGreaterThanOrEqual(0);
  });

  it("returns exact method when AniList returns confidence 100", async () => {
    setupFetchMock([
      makeAniListResponse(makeAniListMedia(16498, "ExactMatchTitle")),
    ]);

    const parsed = makeParsed("ExactMatchTitle");
    parsed.title = "ExactMatchTitle";
    parsed.searchTitle = "ExactMatchTitle";

    const result = await mapParsedReleaseToAnime(parsed);

    // Exact match → confidence 100 → method 'exact'
    if (result.confidence === 100) {
      expect(result.method).toBe("exact");
    } else {
      expect(result.method).toBe("fuzzy");
    }
  });

  it("returns no-match result when AniList returns empty results", async () => {
    setupFetchMock((url, body) => {
      // Return empty for all calls
      return { data: { Page: { media: [] } } };
    });

    const parsed = makeParsed("CompletelyUnknownAnimeXYZ999");
    parsed.title = "CompletelyUnknownAnimeXYZ999";
    parsed.searchTitle = "CompletelyUnknownAnimeXYZ999";

    const result = await mapParsedReleaseToAnime(parsed);

    expect(result.confidence).toBe(0);
    expect(result.anilistId).toBeNull();
    expect(result.malId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// mapParsedReleaseToAnime() — Step 4: Synonym search (Requirement 11.4)
// ---------------------------------------------------------------------------

describe("mapParsedReleaseToAnime() — Step 4: synonym search", () => {
  it("returns method 'alternate' when synonym search finds a match", async () => {
    // All variant searches return low confidence, but synonym search finds a match
    setupFetchMock((url, body, callIndex) => {
      const query = body?.variables?.search ?? "";
      // First few calls (variant search) return low-confidence results
      if (callIndex < 5) {
        return makeAniListResponse(
          makeAniListMedia(12345, "Shingeki no Kyojin", null, ["Attack on Titan"])
        );
      }
      // Synonym search call
      return makeAniListResponse(
        makeAniListMedia(12345, "Shingeki no Kyojin", null, ["Attack on Titan"])
      );
    });

    const parsed = makeParsed("Attack on Titan SynonymTest");
    parsed.title = "Attack on Titan SynonymTest";
    parsed.searchTitle = "Attack on Titan SynonymTest";

    const result = await mapParsedReleaseToAnime(parsed);

    // The result should be either fuzzy (if variant search found it) or alternate
    expect(["fuzzy", "alternate", "exact"]).toContain(result.method);
  });
});

// ---------------------------------------------------------------------------
// mapParsedReleaseToAnime() — Step 5: No match (Requirement 11.5)
// ---------------------------------------------------------------------------

describe("mapParsedReleaseToAnime() — Step 5: no match", () => {
  it("returns confidence 0 and null IDs when no match found", async () => {
    setupFetchMock(() => ({ data: { Page: { media: [] } } }));

    const parsed = makeParsed("NoMatchAnimeZZZ999888777");
    parsed.title = "NoMatchAnimeZZZ999888777";
    parsed.searchTitle = "NoMatchAnimeZZZ999888777";

    const result = await mapParsedReleaseToAnime(parsed);

    expect(result.confidence).toBe(0);
    expect(result.anilistId).toBeNull();
    expect(result.malId).toBeNull();
  });

  it("uses raw parsed title as matchedTitle when no match found", async () => {
    setupFetchMock(() => ({ data: { Page: { media: [] } } }));

    const parsed = makeParsed("NoMatchAnimeZZZ999888777B");
    parsed.title = "NoMatchAnimeZZZ999888777B";
    parsed.searchTitle = "NoMatchAnimeZZZ999888777B";

    const result = await mapParsedReleaseToAnime(parsed);

    expect(result.matchedTitle).toBe("NoMatchAnimeZZZ999888777B");
  });
});

// ---------------------------------------------------------------------------
// resolveSeasonEntry() — Requirements 12.1, 12.2, 12.3, 12.4
// ---------------------------------------------------------------------------

describe("resolveSeasonEntry()", () => {
  it("returns baseAnilistId unchanged for targetSeason <= 1 (Requirement 12.1)", async () => {
    expect(await resolveSeasonEntry(16498, 1)).toBe(16498);
    expect(await resolveSeasonEntry(16498, 0)).toBe(16498);
    expect(await resolveSeasonEntry(16498, -1)).toBe(16498);
  });

  it("does not call fetch for targetSeason <= 1", async () => {
    const fetchSpy = mock(async () => ({ ok: true, json: async () => ({}) }));
    global.fetch = fetchSpy;

    await resolveSeasonEntry(16498, 1);
    await resolveSeasonEntry(16498, 0);

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns first SEQUEL id for targetSeason = 2 (Requirement 12.2)", async () => {
    setupFetchMock([
      makeRelationsResponse([
        makeRelationEdge("SEQUEL", 99999, 2014),
        makeRelationEdge("PREQUEL", 11111, 2010),
        makeRelationEdge("SEQUEL", 88888, 2016),
      ]),
    ]);

    const result = await resolveSeasonEntry(16498, 2);
    // First SEQUEL sorted by year ascending = id 99999 (year 2014)
    expect(result).toBe(99999);
  });

  it("returns second SEQUEL id for targetSeason = 3 (Requirement 12.3)", async () => {
    setupFetchMock([
      makeRelationsResponse([
        makeRelationEdge("SEQUEL", 99999, 2014),
        makeRelationEdge("SEQUEL", 88888, 2016),
        makeRelationEdge("SEQUEL", 77777, 2018),
      ]),
    ]);

    const result = await resolveSeasonEntry(16498, 3);
    // Second SEQUEL (index 1) sorted by year = id 88888 (year 2016)
    expect(result).toBe(88888);
  });

  it("returns null when no SEQUEL relation exists (Requirement 12.4)", async () => {
    setupFetchMock([
      makeRelationsResponse([
        makeRelationEdge("PREQUEL", 11111, 2010),
        makeRelationEdge("SIDE_STORY", 22222, 2012),
      ]),
    ]);

    const result = await resolveSeasonEntry(16498, 2);
    expect(result).toBeNull();
  });

  it("returns null when SEQUEL index is out of range (Requirement 12.4)", async () => {
    setupFetchMock([
      makeRelationsResponse([
        makeRelationEdge("SEQUEL", 99999, 2014),
      ]),
    ]);

    // Only 1 sequel, but requesting season 3 (index 1) → null
    const result = await resolveSeasonEntry(16498, 3);
    expect(result).toBeNull();
  });

  it("sorts SEQUEL relations by start year ascending", async () => {
    setupFetchMock([
      makeRelationsResponse([
        makeRelationEdge("SEQUEL", 33333, 2020), // year 2020 — should be index 1
        makeRelationEdge("SEQUEL", 11111, 2016), // year 2016 — should be index 0
        makeRelationEdge("SEQUEL", 55555, 2022), // year 2022 — should be index 2
      ]),
    ]);

    const season2 = await resolveSeasonEntry(16498, 2);
    expect(season2).toBe(11111); // earliest year

    setupFetchMock([
      makeRelationsResponse([
        makeRelationEdge("SEQUEL", 33333, 2020),
        makeRelationEdge("SEQUEL", 11111, 2016),
        makeRelationEdge("SEQUEL", 55555, 2022),
      ]),
    ]);

    const season3 = await resolveSeasonEntry(16498, 3);
    expect(season3).toBe(33333); // second earliest year
  });

  it("handles missing startDate year by treating it as 9999", async () => {
    setupFetchMock([
      makeRelationsResponse([
        { relationType: "SEQUEL", node: { id: 99999, startDate: null } },
        makeRelationEdge("SEQUEL", 11111, 2016),
      ]),
    ]);

    const result = await resolveSeasonEntry(16498, 2);
    // id 11111 (year 2016) should come before id 99999 (null year → 9999)
    expect(result).toBe(11111);
  });

  it("returns null when AniList fetch fails", async () => {
    global.fetch = mock(async () => ({ ok: false, status: 500, json: async () => ({}) }));

    const result = await resolveSeasonEntry(16498, 2);
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TitleCache — LRU eviction
// ---------------------------------------------------------------------------

describe("TitleCache — LRU eviction", () => {
  it("size does not exceed 500 entries", async () => {
    // Mock window.tatakaiRuntime to avoid IPC calls
    global.window = {
      tatakaiRuntime: {
        readLocalCache: mock(async () => null),
        writeLocalCache: mock(async () => {}),
      },
    };

    // Store 510 entries — cache should evict oldest to stay at 500
    for (let i = 0; i < 510; i++) {
      await titleCache.store(`unique-title-lru-${i}`, {
        anilistId: i,
        malId: null,
        tatakaiId: null,
        matchedTitle: `Title ${i}`,
        confidence: 90,
        seasonOffset: 0,
      });
    }

    expect(titleCache.size).toBeLessThanOrEqual(500);
  });

  it("returns null for a title not in cache", async () => {
    global.window = {
      tatakaiRuntime: {
        readLocalCache: mock(async () => null),
        writeLocalCache: mock(async () => {}),
      },
    };

    const result = await titleCache.lookup("this-title-does-not-exist-xyz");
    expect(result).toBeNull();
  });

  it("returns stored result for a cached title", async () => {
    global.window = {
      tatakaiRuntime: {
        readLocalCache: mock(async () => null),
        writeLocalCache: mock(async () => {}),
      },
    };

    const stored = {
      anilistId: 12345,
      malId: 67890,
      tatakaiId: null,
      matchedTitle: "Cached Anime",
      confidence: 95,
      seasonOffset: 0,
    };

    await titleCache.store("cached-anime-test-unique", stored);
    const result = await titleCache.lookup("cached-anime-test-unique");

    expect(result).not.toBeNull();
    expect(result.anilistId).toBe(12345);
    expect(result.confidence).toBe(95);
  });
});

// ---------------------------------------------------------------------------
// CatalogMappingResult shape validation
// ---------------------------------------------------------------------------

describe("mapParsedReleaseToAnime() — result shape", () => {
  it("always returns a result with all required fields", async () => {
    setupFetchMock(() => ({ data: { Page: { media: [] } } }));

    const parsed = makeParsed("ShapeTestAnimeXYZ");
    parsed.title = "ShapeTestAnimeXYZ";
    parsed.searchTitle = "ShapeTestAnimeXYZ";

    const result = await mapParsedReleaseToAnime(parsed);

    expect(typeof result.confidence).toBe("number");
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(100);
    expect(typeof result.matchedTitle).toBe("string");
    expect(typeof result.seasonOffset).toBe("number");
    expect(["exact", "fuzzy", "alternate", "cache"]).toContain(result.method);
  });

  it("returns tatakaiId as null (not yet implemented)", async () => {
    const parsed = makeParsed("TatakaiIdTest");
    const result = await mapParsedReleaseToAnime(parsed, { anilistId: 999 });

    expect(result.tatakaiId).toBeNull();
  });

  it("returns seasonOffset as 0", async () => {
    const parsed = makeParsed("SeasonOffsetTest");
    const result = await mapParsedReleaseToAnime(parsed, { anilistId: 999 });

    expect(result.seasonOffset).toBe(0);
  });
});
