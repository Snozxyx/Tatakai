/**
 * ani.zip mapping — renderer client.
 *
 * The actual ani.zip call, normalization and cache live in TatakaiAPI
 * (`TatakaiAPI/src/services/mapping/anizip.ts`) and are served from
 * `GET /api/v3/mapping/anime/:anilistId/anizip`. This file is the typed façade
 * over that endpoint; the shapes below mirror the service's output exactly.
 *
 * What ani.zip gives us, in one request:
 *
 *   1. Per-episode metadata — real episode titles in several languages, synopsis,
 *      a TheTVDB screencap, air date in both local and UTC form, and runtime.
 *      AniList's `streamingEpisodes` has a thumbnail and a title at best, and
 *      nothing at all for unaired episodes.
 *   2. Series title aliases across ~14 languages, which is what the search index
 *      needs in order to match "Ore dake Level Up na Ken" or "나 혼자만 레벨업"
 *      to Solo Leveling.
 *   3. Cross-site ids (MAL, Kitsu, AniDB, TVDB, TMDB, IMDb, AnimePlanet…).
 *
 * Episode keys are strings because specials are keyed `"S1"`, `"S2"`, … alongside
 * the numeric regular episodes — hence `key` plus a parsed `number`/`isSpecial`
 * rather than an array index.
 */

import { clearMappingCache, fetchMapping } from "./client";

/** Air dates change rarely but are read constantly. */
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// ── Normalized shapes ─────────────────────────────────────────────────────────

export interface AniZipEpisode {
  /** Raw key from the payload — `"1"` for regulars, `"S1"` for specials. */
  key: string;
  /** Parsed episode number. For specials this is the number *within* specials. */
  number: number;
  isSpecial: boolean;
  seasonNumber: number | null;
  absoluteNumber: number | null;
  /** Best available title: English → romaji (`x-jat`) → Japanese. */
  title: string | null;
  /** Every localized title, keyed by language tag. */
  titles: Record<string, string>;
  overview: string | null;
  image: string | null;
  /** Local broadcast date, `YYYY-MM-DD`. */
  airDate: string | null;
  /** UTC instant of broadcast, ISO 8601. Sorting and "next episode" use this. */
  airDateUtc: string | null;
  /** Minutes. */
  runtime: number | null;
  rating: number | null;
  tvdbId: number | null;
  anidbEid: number | null;
  /** True once `airDateUtc` is in the past. Unknown dates count as aired. */
  hasAired: boolean;
}

export interface AniZipArtwork {
  banner: string | null;
  poster: string | null;
  fanart: string | null;
  clearLogo: string | null;
}

export interface AniZipIds {
  anilistId: number | null;
  malId: number | null;
  kitsuId: number | null;
  anidbId: number | null;
  tvdbId: number | null;
  tmdbId: string | null;
  imdbId: string | null;
  animePlanetId: string | null;
  aniSearchId: number | null;
  liveChartId: number | null;
  notifyMoeId: string | null;
  type: string | null;
}

export interface AniZipMapping {
  anilistId: number;
  /** Localized series titles keyed by language tag. */
  titles: Record<string, string>;
  /**
   * Distinct series titles, best-first (English → romaji → Japanese → rest).
   * This is the alias list the search index matches against.
   */
  aliases: string[];
  preferredTitle: string | null;
  /** Regular episodes, ascending. */
  episodes: AniZipEpisode[];
  /** Specials (`S1`, `S2`, …), ascending. */
  specials: AniZipEpisode[];
  /** Regular episodes by number, for O(1) enrichment of an existing list. */
  byNumber: Map<number, AniZipEpisode>;
  episodeCount: number | null;
  specialCount: number | null;
  images: Array<{ coverType: string; url: string }>;
  artwork: AniZipArtwork;
  ids: AniZipIds;
  /** Earliest episode whose `airDateUtc` is still in the future. */
  nextEpisode: AniZipEpisode | null;
  /** Latest episode that has already aired. */
  lastAiredEpisode: AniZipEpisode | null;
}

/** What the endpoint actually sends: everything but the `Map`, which JSON can't carry. */
type AniZipMappingWire = Omit<AniZipMapping, "byNumber">;

// ── Fetching ──────────────────────────────────────────────────────────────────

/**
 * Fetch the ani.zip mapping for an AniList id.
 *
 * Resolves to `null` when the show is absent upstream — every consumer here is
 * enrichment on top of AniList data, so a miss must degrade to "no extra detail",
 * never to a failed page render.
 */
export async function fetchAniZipMapping(
  anilistId: number | string | null | undefined,
  options: { signal?: AbortSignal; force?: boolean } = {},
): Promise<AniZipMapping | null> {
  const id = Number(anilistId);
  if (!Number.isFinite(id) || id <= 0) return null;

  const wire = await fetchMapping<AniZipMappingWire>(`/mapping/anime/${id}/anizip`, {
    ttlMs: CACHE_TTL_MS,
    signal: options.signal,
    force: options.force,
  });
  if (!wire) return null;

  // Rebuilt per call rather than cached: it is an index over `episodes`, which the
  // cache already holds, and building it is a single pass over a few dozen rows.
  const byNumber = new Map<number, AniZipEpisode>();
  for (const episode of wire.episodes ?? []) byNumber.set(episode.number, episode);

  return { ...wire, byNumber };
}

/** Drop cached mappings — used by manual refresh paths. */
export function clearAniZipCache(anilistId?: number): void {
  clearMappingCache(
    typeof anilistId === "number" ? `/mapping/anime/${anilistId}/anizip` : "/mapping/anime/",
  );
}
