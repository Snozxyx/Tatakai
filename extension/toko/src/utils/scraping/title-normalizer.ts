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
 * Convert a title string into a URL-friendly slug.
 */
export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

/** Latin letters/digits/punctuation only — no CJK, Hangul, Cyrillic, Arabic, Thai. */
const LATIN_ONLY_RE = /^[\p{Script=Latin}\p{Nd}\p{P}\p{Zs}\p{S}]+$/u;

/**
 * "JJK", "KnY", "OP", "SL" — a real alternate name, but useless as a site-search
 * query: these catalogues index full titles, so searching the initialism returns
 * nothing (or the wrong show).
 */
function looksLikeAbbreviation(title: string): boolean {
  const t = title.trim();
  if (/\s/.test(t)) return false;
  if (t.length <= 4) return true;
  // All-caps single word up to 6 chars ("NARUTO" is 6 but has a real entry, so
  // the bound stays tight and multi-word titles are never treated this way).
  return t.length <= 6 && t === t.toUpperCase() && /[A-Z]/.test(t);
}

/**
 * How likely a title is to match a Latin-script anime catalogue. Lower is tried
 * first.
 */
function queryRank(title: string): number {
  if (!LATIN_ONLY_RE.test(title)) return 2; // native CJK/Hangul/etc.
  if (looksLikeAbbreviation(title)) return 1;
  return 0;
}

/**
 * Build a prioritized list of search queries from SourceOptions titles.
 *
 * Order matters a lot: most callers take `.slice(0, 2)` because each query is a
 * separate HTTP round trip, so whatever lands in the first two slots is
 * effectively the whole search.
 *
 * This used to sort by ascending length ("shorter titles tend to match better").
 * That is wrong as soon as the title list contains abbreviations or native
 * titles, because character count has nothing to do with match quality — CJK
 * titles are always short, and initialisms shorter still. Measured: Jujutsu
 * Kaisen searched as `["JJK", "呪術廻戦"]` and Demon Slayer as `["KnY", "鬼滅の刃"]`,
 * so the canonical English names were never tried at all and toonstream,
 * animepahe and animetosho all reported `empty` on shows they actually carry.
 *
 * So rank by script/shape instead and keep the caller's order within each rank —
 * the host already supplies english → romaji → userPreferred → native →
 * synonyms, i.e. best first.
 */
export function buildSearchQueries(titles: string[]): string[] {
  const seen = new Set<string>();
  const result: Array<{ title: string; rank: number; index: number }> = [];
  for (const t of titles) {
    if (!t) continue;
    const norm = normalizeTitle(t);
    if (norm && !seen.has(norm.toLowerCase())) {
      seen.add(norm.toLowerCase());
      result.push({ title: norm, rank: queryRank(norm), index: result.length });
    }
  }
  return result
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.title);
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
