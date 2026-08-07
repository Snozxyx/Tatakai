/**
 * Title normalization utilities for provider search matching.
 * Ported from A2 animeworld.ts normalization logic.
 */

const EXTRA_PATTERNS = [
  'OVA', 'SPECIAL', 'RECAP', 'FINAL SEASON', 'BONUS', 'SIDE STORY',
  'PART\\s*\\d+', 'EPISODE\\s*\\d+', 'MOVIE', 'FILM',
];
const EXTRA_RE = new RegExp(`\\b(${EXTRA_PATTERNS.join('|')})\\b`, 'gi');

/**
 * Normalize a title for search queries.
 * Removes season suffixes, ordinal numbers, extra words, and extra whitespace.
 */
export function normalizeTitle(title: string): string {
  return title
    .replace(/\b(\d+)(st|nd|rd|th)\b/gi, '$1')   // ordinal suffixes: 3rd→3
    .replace(/(\d+)\s*[Ss]eason/gi, '$1')          // "2 Season"→"2"
    .replace(/[Ss]eason\s*(\d+)/gi, '$1')          // "Season 2"→"2"
    .replace(EXTRA_RE, '')                          // remove extra words
    .replace(/-[^-]+-/g, ' ')                      // remove -...- blocks
    .replace(/[~:]/g, ' ')                         // special chars → space
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build a prioritized list of search queries from SourceOptions titles.
 * Returns deduplicated normalized titles, shortest first (best for search).
 */
export function buildSearchQueries(titles: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const t of titles) {
    if (!t) continue;
    const norm = normalizeTitle(t);
    if (norm && !seen.has(norm.toLowerCase())) {
      seen.add(norm.toLowerCase());
      result.push(norm);
    }
  }
  // Sort: shorter titles tend to match better
  return result.sort((a, b) => a.length - b.length);
}

/**
 * Pick the best title match from a list of candidates against a query.
 * Uses simple substring and word-overlap scoring.
 */
export function scoreMatch(query: string, candidate: string): number {
  const q = query.toLowerCase();
  const c = candidate.toLowerCase();
  if (c === q) return 1.0;
  if (c.includes(q) || q.includes(c)) return 0.9;
  const qWords = q.split(/\s+/);
  const cWords = c.split(/\s+/);
  const overlap = qWords.filter(w => cWords.includes(w)).length;
  return overlap / Math.max(qWords.length, cWords.length);
}
