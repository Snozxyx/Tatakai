export interface ReleaseIdentity {
  id: string; seriesId: string; canonicalSeriesId?: string | null; title: string; date: string | null;
  chapter: string | null; volume?: string | null; releaseKind?: string; region?: string | null; provider?: string;
}
const normalize = (value: string) => value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export function deduplicateReleases<T extends ReleaseIdentity>(rows: T[]): T[] {
  const ids = new Set<string>(), events = new Set<string>();
  const canonicalByTitle = new Map<string, Set<string>>();
  for (const row of rows) if (row.canonicalSeriesId) {
    const title = normalize(row.title); const ids = canonicalByTitle.get(title) || new Set<string>();
    ids.add(row.canonicalSeriesId); canonicalByTitle.set(title, ids);
  }
  return rows.filter(row => {
    const id = `${row.provider || 'mangaupdates'}:${row.id}`;
    const kind = row.releaseKind || (row.chapter ? 'chapter' : 'volume');
    const number = kind === 'chapter' ? row.chapter : row.volume;
    // Unknown release numbers must not collapse unrelated editions.
    const title = normalize(row.title), canonical = canonicalByTitle.get(title);
    const identity = row.canonicalSeriesId || (canonical?.size === 1 ? [...canonical][0] : `title:${title}`);
    const event = JSON.stringify([identity, row.date, kind, number ? number.replace(/\b0+(?=\d)/g, '') : row.id, row.region || null]);
    if (ids.has(id) || events.has(event)) return false;
    ids.add(id); events.add(event); return true;
  });
}
