/**
 * Catalog Mapper
 *
 * Maps a ParsedRelease to an AniList entry using a four-step lookup:
 *   1. Exact hint (anilistId provided by caller)
 *   2. Title cache (in-memory LRU backed by cache:write / cache:read IPC)
 *   3. AniList variant search (fuzzy title matching)
 *   4. AniList synonym search (alternate title matching)
 *
 * Also provides resolveSeasonEntry() to walk SEQUEL relations for multi-season
 * anime where each season is a separate AniList entry.
 *
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 12.1, 12.2, 12.3, 12.4
 */

import { buildSearchVariants } from "./title-normalizer";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CatalogMappingResult {
  anilistId: number | null;
  malId: number | null;
  tatakaiId: string | null;
  matchedTitle: string;
  confidence: number;
  /** Episode number offset for multi-season series */
  seasonOffset: number;
  method: "exact" | "fuzzy" | "alternate" | "cache";
}

/**
 * Minimal subset of ParsedRelease fields consumed by the catalog mapper.
 * The full ParsedRelease lives in the main-process CJS module; this interface
 * covers only what the renderer-side mapper needs.
 */
export interface ParsedRelease {
  raw?: string;
  title?: string;
  searchTitle?: string;
  season?: number;
  episodeNumber?: number;
  isSpecial?: boolean;
  isBatch?: boolean;
  confidence?: number;
}

// ─── AniList GraphQL helpers ──────────────────────────────────────────────────

const ANILIST_GRAPHQL_URL = "https://graphql.anilist.co";

interface AniListMedia {
  id: number;
  idMal: number | null;
  title: {
    romaji: string | null;
    english: string | null;
    native: string | null;
  };
  synonyms: string[];
  startDate: { year: number | null } | null;
  relations?: {
    edges: Array<{
      relationType: string;
      node: {
        id: number;
        startDate: { year: number | null } | null;
      };
    }>;
  };
}

interface AniListSearchResult {
  anilistId: number;
  malId: number | null;
  matchedTitle: string;
  confidence: number;
}

/**
 * Compute a fuzzy confidence score (0–100) between a search query and a
 * candidate title. Uses a simple normalised Levenshtein-based approach:
 * exact match → 100, prefix match → 90, contains → 80, otherwise proportional.
 */
function computeConfidence(query: string, candidate: string): number {
  const q = query.toLowerCase().trim();
  const c = candidate.toLowerCase().trim();

  if (q === c) return 100;
  if (c.startsWith(q) || q.startsWith(c)) return 90;
  if (c.includes(q) || q.includes(c)) return 80;

  // Levenshtein distance-based score
  const dist = levenshtein(q, c);
  const maxLen = Math.max(q.length, c.length);
  if (maxLen === 0) return 100;
  const score = Math.round((1 - dist / maxLen) * 100);
  return Math.max(0, Math.min(100, score));
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Pick the best-matching title from an AniList media entry against a query.
 * Returns the highest confidence score across romaji, english, native, and synonyms.
 */
function bestTitleMatch(
  query: string,
  media: AniListMedia
): { title: string; confidence: number } {
  const candidates: string[] = [
    media.title.romaji,
    media.title.english,
    media.title.native,
    ...media.synonyms,
  ].filter((t): t is string => Boolean(t));

  let best = { title: media.title.romaji ?? query, confidence: 0 };
  for (const candidate of candidates) {
    const score = computeConfidence(query, candidate);
    if (score > best.confidence) {
      best = { title: candidate, confidence: score };
    }
  }
  return best;
}

/**
 * Search AniList for an anime by title variant.
 * Returns the best match if confidence >= threshold, otherwise null.
 */
async function searchAniList(
  query: string,
  _season?: number
): Promise<AniListSearchResult | null> {
  const gql = `
    query ($search: String) {
      Page(page: 1, perPage: 5) {
        media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
          id
          idMal
          title { romaji english native }
          synonyms
          startDate { year }
        }
      }
    }
  `;

  try {
    const res = await fetch(ANILIST_GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query: gql, variables: { search: query } }),
    });

    if (!res.ok) return null;

    const json = (await res.json()) as {
      data?: { Page?: { media?: AniListMedia[] } };
    };
    const mediaList = json.data?.Page?.media ?? [];
    if (mediaList.length === 0) return null;

    // Find the best match across all returned results
    let best: AniListSearchResult | null = null;
    for (const media of mediaList) {
      const { title, confidence } = bestTitleMatch(query, media);
      if (!best || confidence > best.confidence) {
        best = {
          anilistId: media.id,
          malId: media.idMal ?? null,
          matchedTitle: title,
          confidence,
        };
      }
    }
    return best;
  } catch {
    return null;
  }
}

/**
 * Search AniList using synonym/alternate title matching.
 * Tries each variant and returns the first result with confidence >= 60.
 */
async function searchAniListBySynonyms(
  variants: string[]
): Promise<AniListSearchResult | null> {
  const gql = `
    query ($search: String) {
      Page(page: 1, perPage: 10) {
        media(search: $search, type: ANIME, sort: SEARCH_MATCH) {
          id
          idMal
          title { romaji english native }
          synonyms
          startDate { year }
        }
      }
    }
  `;

  for (const variant of variants) {
    try {
      const res = await fetch(ANILIST_GRAPHQL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ query: gql, variables: { search: variant } }),
      });

      if (!res.ok) continue;

      const json = (await res.json()) as {
        data?: { Page?: { media?: AniListMedia[] } };
      };
      const mediaList = json.data?.Page?.media ?? [];

      for (const media of mediaList) {
        // Check synonyms specifically for alternate title matching
        for (const synonym of media.synonyms) {
          const score = computeConfidence(variant, synonym);
          if (score >= 60) {
            return {
              anilistId: media.id,
              malId: media.idMal ?? null,
              matchedTitle: synonym,
              confidence: score,
            };
          }
        }
        // Also check main titles
        const { title, confidence } = bestTitleMatch(variant, media);
        if (confidence >= 60) {
          return {
            anilistId: media.id,
            malId: media.idMal ?? null,
            matchedTitle: title,
            confidence,
          };
        }
      }
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Fetch SEQUEL relations for a given AniList entry.
 */
async function fetchAniListRelations(
  anilistId: number
): Promise<Array<{ id: number; relationType: string; startDate: { year: number | null } | null }>> {
  const gql = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        relations {
          edges {
            relationType
            node {
              id
              startDate { year }
            }
          }
        }
      }
    }
  `;

  try {
    const res = await fetch(ANILIST_GRAPHQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query: gql, variables: { id: anilistId } }),
    });

    if (!res.ok) return [];

    const json = (await res.json()) as {
      data?: {
        Media?: {
          relations?: {
            edges: Array<{
              relationType: string;
              node: { id: number; startDate: { year: number | null } | null };
            }>;
          };
        };
      };
    };

    return (json.data?.Media?.relations?.edges ?? []).map((e) => ({
      id: e.node.id,
      relationType: e.relationType,
      startDate: e.node.startDate,
    }));
  } catch {
    return [];
  }
}

// ─── LRU Title Cache ──────────────────────────────────────────────────────────

const LRU_MAX_SIZE = 500;
const CACHE_IPC_KEY = "catalog-mapper:title-cache";

interface TitleCacheEntry {
  result: Omit<CatalogMappingResult, "method">;
  storedAt: number;
}

class TitleCache {
  /** In-memory LRU map: key = normalized title, value = cache entry */
  private readonly _map = new Map<string, TitleCacheEntry>();
  private _hydrated = false;

  /**
   * Normalise a title to a cache key (lowercase, trimmed, whitespace collapsed).
   */
  private _key(title: string): string {
    return title.toLowerCase().replace(/\s+/g, " ").trim();
  }

  /**
   * Evict the oldest entry when the cache exceeds LRU_MAX_SIZE.
   */
  private _evictIfNeeded(): void {
    if (this._map.size >= LRU_MAX_SIZE) {
      // Map preserves insertion order; delete the first (oldest) entry
      const firstKey = this._map.keys().next().value;
      if (firstKey !== undefined) {
        this._map.delete(firstKey);
      }
    }
  }

  /**
   * Hydrate the in-memory cache from IPC persistence on first access.
   * Silently ignores errors (IPC may not be available in non-Electron contexts).
   */
  private async _hydrate(): Promise<void> {
    if (this._hydrated) return;
    this._hydrated = true;

    try {
      const runtime = (window as any).tatakaiRuntime;
      if (!runtime?.readLocalCache) return;

      const stored = await runtime.readLocalCache(CACHE_IPC_KEY);
      if (stored && typeof stored === "object") {
        const entries = stored as Record<string, TitleCacheEntry>;
        // Restore up to LRU_MAX_SIZE entries, oldest first
        const sorted = Object.entries(entries).sort(
          ([, a], [, b]) => a.storedAt - b.storedAt
        );
        for (const [key, entry] of sorted.slice(-LRU_MAX_SIZE)) {
          this._map.set(key, entry);
        }
      }
    } catch {
      // Non-Electron environment or IPC unavailable — in-memory only
    }
  }

  /**
   * Persist the current in-memory cache to IPC storage.
   * Fire-and-forget; errors are silently ignored.
   */
  private _persist(): void {
    try {
      const runtime = (window as any).tatakaiRuntime;
      if (!runtime?.writeLocalCache) return;

      const obj: Record<string, TitleCacheEntry> = {};
      for (const [k, v] of this._map.entries()) {
        obj[k] = v;
      }
      void runtime.writeLocalCache(CACHE_IPC_KEY, obj);
    } catch {
      // Silently ignore
    }
  }

  /**
   * Look up a title in the cache.
   * Moves the accessed entry to the end (most-recently-used position).
   */
  async lookup(
    title: string
  ): Promise<Omit<CatalogMappingResult, "method"> | null> {
    await this._hydrate();
    const key = this._key(title);
    const entry = this._map.get(key);
    if (!entry) return null;

    // Refresh LRU position
    this._map.delete(key);
    this._map.set(key, entry);

    return entry.result;
  }

  /**
   * Store a mapping result in the cache and persist to IPC.
   */
  async store(
    title: string,
    result: Omit<CatalogMappingResult, "method">
  ): Promise<void> {
    await this._hydrate();
    const key = this._key(title);

    // Remove existing entry to refresh LRU position
    this._map.delete(key);
    this._evictIfNeeded();

    this._map.set(key, { result, storedAt: Date.now() });
    this._persist();
  }

  /** Exposed for testing */
  get size(): number {
    return this._map.size;
  }
}

/** Module-level singleton title cache (max 500 entries, LRU) */
const titleCache = new TitleCache();

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Map a ParsedRelease to an AniList catalog entry using a four-step lookup:
 *
 * 1. **Exact hint** — if `hints.anilistId` is provided, return immediately with
 *    `confidence: 100` and `method: 'exact'` (Requirement 11.1).
 * 2. **Title cache** — check the in-memory LRU cache; return with `method: 'cache'`
 *    if found (Requirement 11.2).
 * 3. **AniList variant search** — build title variants and query AniList; store
 *    results with `confidence >= 80` in the cache (Requirement 11.3).
 * 4. **AniList synonym search** — try alternate/synonym titles via AniList;
 *    return with `method: 'alternate'` if found (Requirement 11.4).
 *
 * Returns `{ confidence: 0, anilistId: null, malId: null }` when no match is
 * found by any method (Requirement 11.5).
 */
export async function mapParsedReleaseToAnime(
  parsed: ParsedRelease,
  hints?: { anilistId?: number; malId?: number }
): Promise<CatalogMappingResult> {
  // Step 1: Exact hint — highest confidence, no AniList query needed (Req 11.1)
  if (hints?.anilistId) {
    return {
      anilistId: hints.anilistId,
      malId: hints.malId ?? null,
      tatakaiId: null,
      matchedTitle: parsed.title ?? parsed.searchTitle ?? "",
      confidence: 100,
      seasonOffset: 0,
      method: "exact",
    };
  }

  const lookupTitle = parsed.searchTitle ?? parsed.title ?? "";

  // Step 2: Title cache lookup (Req 11.2)
  const cached = await titleCache.lookup(lookupTitle);
  if (cached) {
    return { ...cached, method: "cache" };
  }

  // Step 3: AniList variant search (Req 11.3)
  const variants = buildSearchVariants(parsed.title ?? lookupTitle);
  for (const variant of variants) {
    const result = await searchAniList(variant, parsed.season);
    if (result && result.confidence >= 80) {
      const mappingResult: Omit<CatalogMappingResult, "method"> = {
        anilistId: result.anilistId,
        malId: result.malId,
        tatakaiId: null,
        matchedTitle: result.matchedTitle,
        confidence: result.confidence,
        seasonOffset: 0,
      };
      // Store in cache (Req 11.3)
      await titleCache.store(lookupTitle, mappingResult);
      return {
        ...mappingResult,
        method: result.confidence === 100 ? "exact" : "fuzzy",
      };
    }
  }

  // Step 4: AniList synonym search (Req 11.4)
  const altResult = await searchAniListBySynonyms(variants);
  if (altResult) {
    const mappingResult: Omit<CatalogMappingResult, "method"> = {
      anilistId: altResult.anilistId,
      malId: altResult.malId,
      tatakaiId: null,
      matchedTitle: altResult.matchedTitle,
      confidence: altResult.confidence,
      seasonOffset: 0,
    };
    return { ...mappingResult, method: "alternate" };
  }

  // No match found (Req 11.5)
  return {
    anilistId: null,
    malId: null,
    tatakaiId: null,
    matchedTitle: parsed.title ?? lookupTitle,
    confidence: 0,
    seasonOffset: 0,
    method: "fuzzy",
  };
}

/**
 * Resolve the AniList entry ID for a specific season of a multi-season anime.
 *
 * AniList models each season as a separate entry connected via SEQUEL relations.
 * This function walks the SEQUEL chain sorted by start year ascending:
 *
 * - `targetSeason <= 1` → return `baseAnilistId` unchanged (Req 12.1)
 * - `targetSeason = 2`  → return the 1st SEQUEL (index 0) (Req 12.2)
 * - `targetSeason = N`  → return the (N-1)th SEQUEL (zero-indexed) (Req 12.3)
 * - No SEQUEL at index  → return `null` (Req 12.4)
 */
export async function resolveSeasonEntry(
  baseAnilistId: number,
  targetSeason: number
): Promise<number | null> {
  // Requirement 12.1: season <= 1 returns base unchanged
  if (targetSeason <= 1) return baseAnilistId;

  const relations = await fetchAniListRelations(baseAnilistId);

  // Filter to SEQUEL relations and sort by start year ascending (Req 12.2, 12.3)
  const sequels = relations
    .filter((r) => r.relationType === "SEQUEL")
    .sort(
      (a, b) =>
        (a.startDate?.year ?? 9999) - (b.startDate?.year ?? 9999)
    );

  // Season 2 = index 0, Season 3 = index 1, Season N = index N-2
  const idx = targetSeason - 2;

  // Requirement 12.4: return null if no sequel at the requested index
  return sequels[idx]?.id ?? null;
}

// ─── Exports for testing ──────────────────────────────────────────────────────

export { titleCache, computeConfidence, levenshtein };
