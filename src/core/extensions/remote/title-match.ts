/** Provider search order is not a title mapping: compare titles and upstream IDs. */
export interface TitleMatchOptions {
  query?: string;
  dub?: boolean;
  media?: { id?: number; idMal?: number; englishTitle?: string; romajiTitle?: string; nativeTitle?: string; synonyms?: string[] };
}
export function titleSearchQueries(opts: TitleMatchOptions): string[] {
  return [...new Set([opts.query, opts.media?.englishTitle, opts.media?.romajiTitle,
    opts.media?.nativeTitle, ...(opts.media?.synonyms || [])].filter((t): t is string => typeof t === 'string' && !!t.trim()).map(t => t.trim()))];
}
function normalize(title: string): string {
  return title.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/\b(?:dubbed|subbed|dub|sub)\b/g, '')
    .replace(/\b(\d+)(?:st|nd|rd|th)\b/g, '$1')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  // A sequel/season number must never silently map to a different installment.
  if ((a.match(/\d+/g) || []).join(',') !== (b.match(/\d+/g) || []).join(',')) return 0;
  // Keep typo tolerance conservative for short titles such as Naruto.
  if (Math.min(a.length, b.length) < 8) return 0;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    previous = current;
  }
  return 1 - previous[b.length] / Math.max(a.length, b.length);
}
export function automaticTitleMatch(candidates: any[], opts: TitleMatchOptions): string | null {
  const aliases = titleSearchQueries(opts).map(normalize);
  const ranked = candidates.filter(c => c && c.id != null && String(c.id).length).map(c => {
    const idMatch = (opts.media?.id != null && Number(c.anilistId ?? c.idAnilist) === Number(opts.media.id))
      || (opts.media?.idMal != null && Number(c.malId ?? c.idMal) === Number(opts.media.idMal));
    const titles = [c.title, c.name, c.englishTitle, c.romajiTitle, c.nativeTitle, ...(Array.isArray(c.synonyms) ? c.synonyms : [])]
      .filter((t): t is string => typeof t === 'string');
    const score = idMatch ? 2 : Math.max(0, ...titles.flatMap(t => aliases.map(a => similarity(normalize(t), a))));
    const dubbed = titles.some(t => /\b(?:dub|dubbed)\b/i.test(t));
    return { id: String(c.id), score, languagePreference: dubbed === !!opts.dub ? 1 : 0 };
  }).filter(c => c.score >= 0.88).sort((a, b) => b.score - a.score || b.languagePreference - a.languagePreference || a.id.localeCompare(b.id));
  return ranked[0]?.id || null;
}
