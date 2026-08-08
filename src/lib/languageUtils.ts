/**
 * Shared language normalization helpers used by SourceLanguageTabs (Watch page)
 * and any other component that needs stable language keys from raw provider strings.
 */

/**
 * Converts a raw language string into a stable tab key.
 * Lowercases, trims whitespace, and replaces spaces with hyphens.
 *
 * Examples:
 *   "English Sub" → "english-sub"
 *   "Hindi"       → "hindi"
 *   " Japanese  " → "japanese"
 */
export function normalizeWatchLanguageKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "-");
}

/**
 * Formats a raw language string into a human-readable label.
 * Trims surrounding whitespace and title-cases each word.
 *
 * Examples:
 *   "english sub" → "English Sub"
 *   "  hindi   "  → "Hindi"
 *   "ENGLISH DUB" → "English Dub"
 */
export function formatWatchLanguageLabel(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
