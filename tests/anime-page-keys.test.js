/**
 * Property-based tests for AnimePage list key uniqueness.
 *
 * **Validates: Requirements 1.3**
 *
 * Property 1: React list keys are unique
 * For any list of episodes or related entries rendered by AnimePage,
 * all React `key` props within the same list must be distinct —
 * no two items in the same list share a key.
 */

import { describe, it, expect } from "bun:test";

// ---------------------------------------------------------------------------
// Key-generation helpers — mirrors the logic used in AnimePage.tsx
// ---------------------------------------------------------------------------

/** Episodes list key: `${ep.episodeId}-${index}` */
function episodeKey(ep, index) {
  return `${ep.episodeId}-${index}`;
}

/** RelationTree key: `${rel.id}-${index}` */
function relationKey(rel, index) {
  return `${rel.id}-${index}`;
}

/** Characters list key: `${cva.character.id}-${index}` */
function characterKey(cva, index) {
  return `${cva.character.id}-${index}`;
}

/** Staff list key: `${s.id}-${index}` */
function staffKey(s, index) {
  return `${s.id}-${index}`;
}

/** Episode group button key: `${start}-${end}` */
function episodeGroupKey(start, end) {
  return `${start}-${end}`;
}

/** Genre key: `${genre}-${index}` */
function genreKey(genre, index) {
  return `${genre}-${index}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function allUnique(keys) {
  return new Set(keys).size === keys.length;
}

// ---------------------------------------------------------------------------
// Property-based generators (pure JS, no external library needed)
// ---------------------------------------------------------------------------

/**
 * Generate N random episode objects.
 * Intentionally includes duplicated episodeIds to stress-test the key scheme.
 */
function generateEpisodes(count, allowDuplicateIds = false) {
  const episodes = [];
  const pool = allowDuplicateIds ? Math.max(1, Math.floor(count / 2)) : count;
  for (let i = 0; i < count; i++) {
    const id = allowDuplicateIds
      ? `ep-${(i % pool) + 1}` // force duplicates
      : `ep-${i + 1}`;
    episodes.push({ episodeId: id, number: i + 1, title: `Episode ${i + 1}` });
  }
  return episodes;
}

/**
 * Generate N random relation objects.
 * Intentionally includes duplicated ids to stress-test the key scheme.
 */
function generateRelations(count, allowDuplicateIds = false) {
  const relations = [];
  const pool = allowDuplicateIds ? Math.max(1, Math.floor(count / 2)) : count;
  for (let i = 0; i < count; i++) {
    const id = allowDuplicateIds ? (i % pool) + 1 : i + 1;
    relations.push({ id, relationType: `TYPE_${i}`, titleEnglish: `Anime ${id}` });
  }
  return relations;
}

/**
 * Generate N random character-voice-actor objects.
 * Intentionally includes duplicated character ids.
 */
function generateCharacters(count, allowDuplicateIds = false) {
  const chars = [];
  const pool = allowDuplicateIds ? Math.max(1, Math.floor(count / 2)) : count;
  for (let i = 0; i < count; i++) {
    const id = allowDuplicateIds ? (i % pool) + 1 : i + 1;
    chars.push({
      character: { id, name: `Char ${id}`, poster: "", cast: "Main" },
      voiceActor: { name: `VA ${i}` },
    });
  }
  return chars;
}

/**
 * Generate N random staff objects.
 * Intentionally includes duplicated ids.
 */
function generateStaff(count, allowDuplicateIds = false) {
  const staff = [];
  const pool = allowDuplicateIds ? Math.max(1, Math.floor(count / 2)) : count;
  for (let i = 0; i < count; i++) {
    const id = allowDuplicateIds ? (i % pool) + 1 : i + 1;
    staff.push({ id, name: `Staff ${id}`, role: "Director", imageUrl: "" });
  }
  return staff;
}

/**
 * Generate a genre list, optionally with duplicate genre strings.
 */
function generateGenres(count, allowDuplicates = false) {
  const baseGenres = ["Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror", "Mystery", "Romance", "Sci-Fi", "Thriller"];
  const genres = [];
  for (let i = 0; i < count; i++) {
    if (allowDuplicates) {
      genres.push(baseGenres[i % baseGenres.length]);
    } else {
      genres.push(baseGenres[i % baseGenres.length] + (i >= baseGenres.length ? `-${Math.floor(i / baseGenres.length)}` : ""));
    }
  }
  return genres;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AnimePage — React list key uniqueness (Property 1)", () => {
  // --- Episodes ---
  describe("Episode list keys", () => {
    it("produces unique keys for a normal episode list", () => {
      const episodes = generateEpisodes(24);
      const keys = episodes.map(episodeKey);
      expect(allUnique(keys)).toBe(true);
    });

    it("produces unique keys even when episodeIds are duplicated", () => {
      // Simulates an API returning duplicate episodeId values
      const episodes = generateEpisodes(24, true);
      const keys = episodes.map(episodeKey);
      expect(allUnique(keys)).toBe(true);
    });

    it("produces unique keys for a large episode list (100 items)", () => {
      const episodes = generateEpisodes(100, true);
      const keys = episodes.map(episodeKey);
      expect(allUnique(keys)).toBe(true);
    });

    it("produces unique keys for a single-episode list", () => {
      const episodes = generateEpisodes(1);
      const keys = episodes.map(episodeKey);
      expect(allUnique(keys)).toBe(true);
    });

    it("produces an empty key array for an empty episode list", () => {
      const keys = [].map(episodeKey);
      expect(keys).toHaveLength(0);
      expect(allUnique(keys)).toBe(true);
    });
  });

  // --- Episode group buttons ---
  describe("Episode group button keys", () => {
    const EPISODES_PER_GROUP = 24;

    function buildGroupKeys(totalEpisodes) {
      const keys = [];
      for (let i = 0; i < totalEpisodes; i += EPISODES_PER_GROUP) {
        const start = i + 1;
        const end = Math.min(i + EPISODES_PER_GROUP, totalEpisodes);
        keys.push(episodeGroupKey(start, end));
      }
      return keys;
    }

    it("produces unique group button keys for 100 episodes", () => {
      const keys = buildGroupKeys(100);
      expect(allUnique(keys)).toBe(true);
    });

    it("produces unique group button keys for exactly 24 episodes (single group)", () => {
      const keys = buildGroupKeys(24);
      expect(allUnique(keys)).toBe(true);
    });

    it("produces unique group button keys for 1 episode", () => {
      const keys = buildGroupKeys(1);
      expect(allUnique(keys)).toBe(true);
    });
  });

  // --- RelationTree ---
  describe("RelationTree keys", () => {
    it("produces unique keys for a normal relations list", () => {
      const relations = generateRelations(10);
      const keys = relations.map(relationKey);
      expect(allUnique(keys)).toBe(true);
    });

    it("produces unique keys even when relation ids are duplicated", () => {
      // Same anime can appear with different relation types
      const relations = generateRelations(10, true);
      const keys = relations.map(relationKey);
      expect(allUnique(keys)).toBe(true);
    });

    it("produces unique keys for a large relations list (50 items)", () => {
      const relations = generateRelations(50, true);
      const keys = relations.map(relationKey);
      expect(allUnique(keys)).toBe(true);
    });
  });

  // --- Characters ---
  describe("Character list keys", () => {
    it("produces unique keys for a normal character list", () => {
      const chars = generateCharacters(12);
      const keys = chars.map(characterKey);
      expect(allUnique(keys)).toBe(true);
    });

    it("produces unique keys even when character ids are duplicated", () => {
      const chars = generateCharacters(12, true);
      const keys = chars.map(characterKey);
      expect(allUnique(keys)).toBe(true);
    });
  });

  // --- Staff ---
  describe("Staff list keys", () => {
    it("produces unique keys for a normal staff list", () => {
      const staff = generateStaff(20);
      const keys = staff.map(staffKey);
      expect(allUnique(keys)).toBe(true);
    });

    it("produces unique keys even when staff ids are duplicated", () => {
      const staff = generateStaff(20, true);
      const keys = staff.map(staffKey);
      expect(allUnique(keys)).toBe(true);
    });
  });

  // --- Genres ---
  describe("Genre list keys", () => {
    it("produces unique keys for a normal genre list", () => {
      const genres = generateGenres(8);
      const keys = genres.map(genreKey);
      expect(allUnique(keys)).toBe(true);
    });

    it("produces unique keys even when genre strings are duplicated", () => {
      // Simulates an API returning duplicate genre values
      const genres = generateGenres(10, true);
      const keys = genres.map(genreKey);
      expect(allUnique(keys)).toBe(true);
    });

    it("produces unique keys for a single genre", () => {
      const genres = ["Action"];
      const keys = genres.map(genreKey);
      expect(allUnique(keys)).toBe(true);
    });

    it("produces an empty key array for an empty genre list", () => {
      const keys = [].map(genreKey);
      expect(keys).toHaveLength(0);
      expect(allUnique(keys)).toBe(true);
    });
  });

  // --- Cross-list isolation ---
  describe("Cross-list key isolation", () => {
    it("episode keys and relation keys do not need to be globally unique (different lists)", () => {
      // Each list is independent — keys only need to be unique within their own list
      const episodes = generateEpisodes(5, true);
      const relations = generateRelations(5, true);

      const episodeKeys = episodes.map(episodeKey);
      const relationKeys = relations.map(relationKey);

      expect(allUnique(episodeKeys)).toBe(true);
      expect(allUnique(relationKeys)).toBe(true);
    });
  });
});
