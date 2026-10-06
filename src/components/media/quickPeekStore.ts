/**
 * External store behind the long-press quick peek (see `MediaQuickPeek`).
 * Cards call `openMediaQuickPeek(media)`; the single `MediaQuickPeekHost`
 * mounted in `MainLayout` renders the sheet. A module store (instead of
 * context) keeps every card wire-up to one import with no provider plumbing.
 */

export interface QuickPeekMedia {
  kind: "anime" | "manga";
  /** Route id (`/anime/:id` / `/manga/:id`) — also the detail-query key. */
  id: string;
  name: string;
  poster: string;
  /** Wide banner art. Rendered on top of the sheet when present; cards that
   *  don't carry one fall back to the blurred poster, and anime rows with a
   *  numeric AniList id enrich it lazily (see `useMediaBanner`). */
  banner?: string | null;
  /** Numeric AniList id for lazy banner enrichment. Manga rows leave it unset
   *  only when the source never carried one. */
  anilistId?: number | null;
  /** False for rows that must not offer save (e.g. unreleased upcoming titles
   *  or local-only resume rows) — the sheet then shows View only. */
  canSave?: boolean;
  type?: string;
  status?: string;
  year?: number;
  rating?: string | number;
  episodesSub?: number;
  episodesDub?: number;
  chapters?: number;
  /** Where "Watch/Read now" and "View" navigate. Defaults to the info page. */
  routeTo: string;
}

let current: QuickPeekMedia | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function openMediaQuickPeek(media: QuickPeekMedia) {
  current = media;
  emit();
}

export function closeMediaQuickPeek() {
  current = null;
  emit();
}

export function subscribeMediaQuickPeek(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function getMediaQuickPeekSnapshot(): QuickPeekMedia | null {
  return current;
}

const toPositiveIntOrNull = (value: unknown): number | null => {
  const n = typeof value === "string" ? Number(value.trim()) : Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Route ids like `anilist:123` / `anilist-123` carry the AniList id inline. */
function anilistIdFromRouteId(id: unknown): number | null {
  const raw = String(id ?? "").trim();
  const m = raw.match(/^anilist[:_-]?(\d+)$/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export interface AnimePeekSource {
  id?: string | number | null;
  name?: string | null;
  poster?: string | null;
  banner?: string | null;
  anilistId?: string | number | null;
  type?: string | null;
  status?: string | null;
  year?: number | null;
  rating?: string | number | null;
  episodes?: { sub?: number | null; dub?: number | null } | null;
  episodesSub?: number | null;
  episodesDub?: number | null;
}

/** Normalize the app's `AnimeCard`-shaped rows (home, search, trending…). */
export function peekFromAnime(
  src: AnimePeekSource | null | undefined,
  routeTo: string | null | undefined,
): QuickPeekMedia | null {
  const name = String(src?.name ?? "").trim();
  if (!src || !name || !routeTo) return null;
  return {
    kind: "anime",
    id: String(src.id ?? name),
    name,
    poster: String(src.poster ?? ""),
    banner: src.banner ?? null,
    anilistId: toPositiveIntOrNull(src.anilistId) ?? anilistIdFromRouteId(src.id),
    type: src.type ?? undefined,
    status: src.status ?? undefined,
    year: typeof src.year === "number" ? src.year : undefined,
    rating: src.rating ?? undefined,
    episodesSub: src.episodes?.sub ?? src.episodesSub ?? undefined,
    episodesDub: src.episodes?.dub ?? src.episodesDub ?? undefined,
    routeTo,
  };
}

export interface MangaPeekSource {
  id?: string | number | null;
  name?: string | null;
  poster?: string | null;
  banner?: string | null;
  anilistId?: string | number | null;
  type?: string | null;
  status?: string | null;
  year?: number | null;
  rating?: string | number | null;
  chapters?: number | null;
  canSave?: boolean;
}

/** Normalize manga rows (hub cards, rails, readlist rows…). */
export function peekFromManga(
  src: MangaPeekSource | null | undefined,
  routeTo: string | null | undefined,
): QuickPeekMedia | null {
  const name = String(src?.name ?? "").trim();
  if (!src || !name || !routeTo) return null;
  return {
    kind: "manga",
    id: String(src.id ?? name),
    name,
    poster: String(src.poster ?? ""),
    banner: src.banner ?? null,
    anilistId: toPositiveIntOrNull(src.anilistId) ?? anilistIdFromRouteId(src.id),
    canSave: src.canSave,
    type: src.type ?? undefined,
    status: src.status ?? undefined,
    year: typeof src.year === "number" ? src.year : undefined,
    rating: src.rating ?? undefined,
    chapters: typeof src.chapters === "number" ? src.chapters : undefined,
    routeTo,
  };
}

/**
 * Normalize `PosterItem`-style rows (discover boards, genre grids, manga
 * picks) whose only reliable identity is the `href`. External links are
 * skipped — the peek's detail queries can't resolve them.
 */
export function peekFromHref(
  href: string | null | undefined,
  src: {
    title?: string | null;
    poster?: string | null;
    score?: string | null;
    meta?: string | null;
    anilistId?: number | null;
  },
): QuickPeekMedia | null {
  const to = String(href ?? "").trim();
  const title = String(src?.title ?? "").trim();
  if (!to || !title || /^https?:\/\//i.test(to)) return null;
  const manga = to.startsWith("/manga/");
  const anime = to.startsWith("/anime/");
  if (!manga && !anime) return null;
  const id = to.slice(anime ? "/anime/".length : "/manga/".length).split(/[?#]/)[0] || title;
  return {
    kind: manga ? "manga" : "anime",
    id,
    name: title,
    poster: String(src?.poster ?? ""),
    anilistId: src?.anilistId ?? anilistIdFromRouteId(id),
    rating: src?.score ?? undefined,
    type: src?.meta ?? undefined,
    routeTo: to,
  };
}
