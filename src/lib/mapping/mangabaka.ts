/**
 * MangaBaka mapping — renderer client.
 *
 * The actual MangaBaka call, normalization and cache live in TatakaiAPI
 * (`TatakaiAPI/src/services/mapping/mangabaka.ts`) and are served from
 * `GET /api/v3/mapping/manga/:anilistId/mangabaka`. This file is the typed façade
 * over that endpoint; the shapes below mirror the service's output exactly.
 *
 * MangaBaka is to manga what ani.zip is to anime: one request returning cross-site
 * ids plus much richer metadata than AniList carries — publisher lists split by
 * territory, a volume count, a weighted tag tree, localized titles with
 * provenance, and a rating aggregated across seven trackers.
 *
 * The Kitsu id in `sources.kitsu.id` is what the chapter hierarchy is built from —
 * see `./kitsu.ts`.
 */

import { clearMappingCache, fetchMapping } from "./client";

/** Series metadata is near-static. */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// ── Normalized shapes ─────────────────────────────────────────────────────────

export interface MangaBakaTag {
  id: number | null;
  name: string;
  /** `"Activities > Conflict > Duels"` — the tag's place in MangaBaka's tree. */
  path: string | null;
  /** `core` | `defining` | `incidental` — how central the tag is to the series. */
  weight: string | null;
  isSpoiler: boolean;
}

export interface MangaBakaPublisher {
  name: string;
  /** `Original` | `English` | `Other` — the territory this publisher covers. */
  type: string | null;
  note: string | null;
}

export interface MangaBakaLink {
  url: string;
  label: string;
  type: string | null;
  language: string | null;
}

export interface MangaBakaSourceId {
  id: string;
  rating: number | null;
  /** Rating rescaled to 0–100 so sources with different scales are comparable. */
  ratingNormalized: number | null;
}

export interface MangaBakaCover {
  /** Full-resolution original. Extensionless — do not append a file suffix. */
  original: string | null;
  small: string | null;
  medium: string | null;
  large: string | null;
  width: number | null;
  height: number | null;
  blurhash: string | null;
}

export interface MangaBakaSeries {
  mangaBakaId: number | null;
  title: string;
  nativeTitle: string | null;
  romanizedTitle: string | null;
  /** Distinct titles across languages, best-first. Feeds alias search. */
  aliases: string[];
  /** Localized titles with provenance, as MangaBaka records them. */
  localizedTitles: Array<{ language: string; title: string; traits: string[]; isPrimary: boolean }>;
  description: string | null;
  cover: MangaBakaCover;
  authors: string[];
  artists: string[];
  publishers: MangaBakaPublisher[];
  /** Human-readable genre labels, from `genres_v2` or the v1 slug list. */
  genres: string[];
  tags: MangaBakaTag[];
  status: string | null;
  contentRating: string | null;
  type: string | null;
  year: number | null;
  publishedStart: string | null;
  publishedEnd: string | null;
  /** 0–100. */
  rating: number | null;
  popularityRank: number | null;
  totalChapters: number | null;
  totalVolumes: number | null;
  isLicensed: boolean;
  hasAnime: boolean;
  /** Where an anime adaptation starts and stops in the manga, in prose. */
  animeCoverage: { start: string | null; end: string | null } | null;
  links: MangaBakaLink[];
  /** Per-tracker ids and ratings, keyed `anilist`, `kitsu`, `my_anime_list`, … */
  sources: Record<string, MangaBakaSourceId>;
  /** Convenience accessor — the id the chapter hierarchy is built from. */
  kitsuId: number | null;
  malId: number | null;
  anilistId: number | null;
  lastUpdatedAt: string | null;
}

// ── Fetching ──────────────────────────────────────────────────────────────────

/**
 * Sources MangaBaka can be queried by.
 *
 * The endpoint only exposes `anilist`, which is what this app has on hand; the
 * type is kept for call sites that pass it explicitly.
 */
export type MangaBakaSource =
  | "anilist"
  | "my_anime_list"
  | "kitsu"
  | "manga_updates"
  | "anime_planet";

/**
 * Resolve an AniList manga id to a MangaBaka series.
 *
 * Resolves to `null` on any failure or miss: this is enrichment layered on top of
 * AniList data, so a manga MangaBaka has never heard of must still render its page.
 */
export async function fetchMangaBakaSeries(
  sourceId: number | string | null | undefined,
  options: { source?: MangaBakaSource; signal?: AbortSignal; force?: boolean } = {},
): Promise<MangaBakaSeries | null> {
  const id = Number(sourceId);
  if (!Number.isFinite(id) || id <= 0) return null;

  return fetchMapping<MangaBakaSeries>(`/mapping/manga/${id}/mangabaka`, {
    ttlMs: CACHE_TTL_MS,
    signal: options.signal,
    force: options.force,
  });
}

/** Drop cached series — used by manual refresh paths. */
export function clearMangaBakaCache(anilistId?: number): void {
  clearMappingCache(
    typeof anilistId === "number" ? `/mapping/manga/${anilistId}/mangabaka` : "/mangabaka",
  );
}
