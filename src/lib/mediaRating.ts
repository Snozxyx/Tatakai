/**
 * One parser for the `rating` field the media cards receive, because that field
 * carries two unrelated things depending on which adapter produced the row: a
 * 0–10 score (`aniListToCard` divides `averageScore` by 10) or a content rating
 * like `PG-13` / `R - 17+` from the streaming API.
 *
 * Only the numeric shape belongs behind a star. Every card used to render the
 * field raw, so a `PG-13` row showed up as "★ PG-13"; splitting it here is what
 * lets `UnifiedMediaCard`, `AnimeCardWithPreview` and the v6 poster grids agree
 * on the answer instead of each guessing (docs/Plans.md §2 — "Cards (improve
 * polish and consistency)").
 */

export interface SplitRating {
  /** A 0–10 score, already trimmed and safe to render behind a star. */
  score?: string;
  /** A content rating (`PG-13`, `R+`), which belongs in the meta line. */
  label?: string;
}

export function splitRating(rating?: string | number | null): SplitRating {
  if (rating === null || rating === undefined) return {};

  const raw = String(rating).trim();
  if (!raw) return {};

  const value = Number(raw);
  if (Number.isFinite(value)) {
    // `0` means "unrated" rather than "rated zero", so it earns no chip at all.
    if (value <= 0) return {};
    // Anything above 10 is not a score any adapter here produces, so it goes to
    // the meta line rather than behind a star.
    return value <= 10 ? { score: raw } : { label: raw };
  }

  return { label: raw };
}
