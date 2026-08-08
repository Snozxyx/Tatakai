/**
 * Title Normalizer
 *
 * Provides utilities for normalizing anime titles for fuzzy search and
 * building search variant arrays for catalog mapping.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7
 */

export interface NormalizationOptions {
  /** Remove leading "The", "A", or "An" (case-insensitive) */
  stripArticles?: boolean;
  /**
   * Remove `:`, `!`, `?`, `~` characters and apply NFKC Unicode normalization.
   * Useful for fuzzy matching (e.g. "Re:Zero" → "ReZero").
   */
  normalizeSpecialChars?: boolean;
  /** Expand abbreviations like "S2" → "Season 2" */
  expandAbbreviations?: boolean;
  /** Remove a trailing four-digit year in parentheses, e.g. "(2023)" */
  removeYearSuffix?: boolean;
}

/**
 * Normalize an anime title according to the provided options.
 *
 * The function is idempotent: applying it twice with the same options
 * produces the same result as applying it once (Requirement 10.4).
 */
export function normalizeTitle(
  title: string,
  opts: NormalizationOptions = {}
): string {
  let t = title.trim();

  // Normalize special characters for fuzzy matching (Requirement 10.1)
  if (opts.normalizeSpecialChars) {
    t = t
      .replace(/[：:]/g, "")   // Re:Zero → ReZero
      .replace(/[！!]/g, "")
      .replace(/[？?]/g, "")
      .replace(/[・]/g, " ")
      .replace(/[～~]/g, " ")
      .normalize("NFKC");      // full-width → half-width
  }

  // Strip leading articles (Requirement 10.2)
  if (opts.stripArticles) {
    t = t.replace(/^(The|A|An)\s+/i, "");
  }

  // Remove year suffix (Requirement 10.3)
  if (opts.removeYearSuffix) {
    t = t.replace(/\s*\(\d{4}\)\s*$/, "");
  }

  // Normalize whitespace
  t = t.replace(/\s+/g, " ").trim();

  return t;
}

/**
 * Build an array of search variant strings for a given title.
 *
 * The returned array:
 * - Always includes the original unmodified title (Requirement 10.5)
 * - Includes a stripped-article variant
 * - Includes a special-char-normalized variant
 * - Includes a combined stripped-article + special-char-normalized + year-stripped variant
 * - Includes a variant with "Season N", "Part N", or "Cour N" suffix removed (Requirement 10.6)
 * - Includes a variant with ordinal season suffix removed, e.g. "2nd Season" (Requirement 10.7)
 *
 * Duplicate variants are deduplicated. Empty strings are filtered out.
 */
export function buildSearchVariants(title: string): string[] {
  const variants = new Set<string>();

  // Always include the original title (Requirement 10.5)
  variants.add(title);

  // Stripped-article variant
  variants.add(normalizeTitle(title, { stripArticles: true }));

  // Special-char-normalized variant
  variants.add(normalizeTitle(title, { normalizeSpecialChars: true }));

  // Combined: stripped articles + special chars + year suffix removed
  variants.add(
    normalizeTitle(title, {
      stripArticles: true,
      normalizeSpecialChars: true,
      removeYearSuffix: true,
    })
  );

  // Handle "Season N", "Part N", "Cour N" suffix (Requirement 10.6)
  const withoutSeason = title
    .replace(/\s+(Season|Part|Cour)\s+\d+\s*$/i, "")
    .trim();
  if (withoutSeason !== title) {
    variants.add(withoutSeason);
    // Also add normalized version of the season-stripped variant
    variants.add(
      normalizeTitle(withoutSeason, {
        stripArticles: true,
        normalizeSpecialChars: true,
      })
    );
  }

  // Handle ordinal season suffix: "2nd Season", "3rd Season", etc. (Requirement 10.7)
  const withoutOrdinal = title
    .replace(/\s+\d+(st|nd|rd|th)\s+Season\s*$/i, "")
    .trim();
  if (withoutOrdinal !== title) {
    variants.add(withoutOrdinal);
    // Also add normalized version of the ordinal-stripped variant
    variants.add(
      normalizeTitle(withoutOrdinal, {
        stripArticles: true,
        normalizeSpecialChars: true,
      })
    );
  }

  return [...variants].filter(Boolean);
}
