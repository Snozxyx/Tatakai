import { automaticTitleMatch } from '../remote/title-match';

/** Equal-title editions cannot silently replace one another in the main watch/reader routes. */
export function confidentCompatibilityTitle(candidates: { id: string; title: string }[], title: string): string | null {
  const ids = new Set(candidates.filter(c => automaticTitleMatch([c], { query: title }) !== null).map(c => c.id));
  return ids.size === 1 ? [...ids][0] : null;
}
