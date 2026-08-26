/**
 * Kitsu chapter hierarchy — renderer client.
 *
 * The Kitsu walk, normalization and cache live in TatakaiAPI
 * (`TatakaiAPI/src/services/mapping/kitsu.ts`) and are served from
 * `GET /api/v3/mapping/manga/:anilistId/chapters`. That endpoint does both hops:
 *
 *   AniList id → MangaBaka → source.kitsu.id → Kitsu `/chapters` → volumes
 *
 * so the renderer needs only one call. A caller that already has the Kitsu id can
 * pass it and skip the MangaBaka lookup.
 *
 * Kitsu is the only free source in the stack that publishes a **volume number per
 * chapter**, which is what makes the volume tree on the manga page possible at
 * all: scanlation providers give a number and, with luck, a title; MangaBaka gives
 * a final volume count but no chapter→volume assignment.
 *
 * Two upstream quirks the service already absorbs, worth knowing when reading the
 * data here: `meta.count` is not the chapter count (Kitsu reports a flat 5000 for
 * Berserk, which has 401), so `totalChapters` is derived from the rows actually
 * fetched; and rows are frequently sparse — Berserk's chapters have
 * `canonicalTitle`, `published`, `length` and `thumbnail` all null.
 */

import { clearMappingCache, fetchMapping } from "./client";

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// ── Normalized shapes ─────────────────────────────────────────────────────────

export interface KitsuChapter {
  /** Kitsu's own chapter id — stable, useful as a React key. */
  kitsuId: string;
  /** Chapter number. `null` on rows Kitsu never numbered. */
  number: number | null;
  /** Volume this chapter belongs to, or `null` when unassigned. */
  volumeNumber: number | null;
  /** `canonicalTitle` when present, else `Chapter {number}`. */
  title: string;
  /** True when the title is the generated fallback rather than a real one. */
  isGeneratedTitle: boolean;
  titles: Record<string, string>;
  synopsis: string | null;
  /** `YYYY-MM-DD`. */
  published: string | null;
  /** Page count. */
  pageCount: number | null;
  thumbnail: string | null;
  thumbnailWidth: number | null;
  thumbnailHeight: number | null;
}

export interface KitsuVolume {
  /** `null` groups every chapter Kitsu left unassigned. */
  volumeNumber: number | null;
  label: string;
  chapters: KitsuChapter[];
  firstChapter: number | null;
  lastChapter: number | null;
  /** Earliest and latest `published` among this volume's chapters. */
  publishedStart: string | null;
  publishedEnd: string | null;
}

export interface KitsuChapterHierarchy {
  kitsuMangaId: number;
  /** Flat list, ascending by number. */
  chapters: KitsuChapter[];
  /** Volumes ascending; the unassigned bucket, if any, sorts last. */
  volumes: KitsuVolume[];
  /** Real chapter count — derived from the rows fetched, never from `meta.count`. */
  totalChapters: number;
  /** Volume count, excluding the unassigned bucket. */
  totalVolumes: number;
  /** True when the service's chapter guard cut the list short. */
  truncated: boolean;
}

// ── Fetching ──────────────────────────────────────────────────────────────────

/**
 * Fetch the volume → chapter hierarchy for a manga.
 *
 * Pass an AniList id (the usual case) and the server resolves the Kitsu id via
 * MangaBaka. Pass `kitsuId` to skip that hop when it is already known.
 *
 * Returns `null` when the manga maps to no Kitsu record or Kitsu lists no
 * chapters, so callers fall back to their provider-derived list.
 */
export async function fetchKitsuChapterHierarchy(
  anilistId: number | string | null | undefined,
  options: {
    signal?: AbortSignal;
    force?: boolean;
    maxChapters?: number;
    /** Skip the MangaBaka hop when the Kitsu manga id is already known. */
    kitsuId?: number | string | null;
  } = {},
): Promise<KitsuChapterHierarchy | null> {
  const id = Number(anilistId);
  const kitsuId = Number(options.kitsuId);
  const hasKitsuId = Number.isFinite(kitsuId) && kitsuId > 0;

  // The route needs a usable id in the path even when `kitsuId` supersedes it.
  if ((!Number.isFinite(id) || id <= 0) && !hasKitsuId) return null;

  const params = new URLSearchParams();
  if (hasKitsuId) params.set("kitsuId", String(kitsuId));
  if (options.maxChapters) params.set("maxChapters", String(options.maxChapters));
  const query = params.toString();

  const pathId = Number.isFinite(id) && id > 0 ? id : 0;

  return fetchMapping<KitsuChapterHierarchy>(
    `/mapping/manga/${pathId}/chapters${query ? `?${query}` : ""}`,
    { ttlMs: CACHE_TTL_MS, signal: options.signal, force: options.force },
  );
}

/** Drop cached hierarchies — used by manual refresh paths. */
export function clearKitsuChapterCache(anilistId?: number): void {
  clearMappingCache(
    typeof anilistId === "number" ? `/mapping/manga/${anilistId}/chapters` : "/chapters",
  );
}
