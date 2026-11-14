import { classifyAdultContent, matchesContentMode, normalizeAdultCategories, selectedAdultCategories } from './adultContentPolicy';
import { getAdultMode } from './adultMode';
import type { MangaSearchItem } from "@/types/manga";

const EXPLICIT_PATTERNS: RegExp[] = [
  /\bhentai\b/i,
  /\bnsfw\b/i,
  /\b18\+\b/i,
  /\br[-\s]?18\b/i,
  /\berotica?\b/i,
  /\bsmut\b/i,
  /\buncensored\b/i,
  /\bnude\b/i,
  /\bsex\b/i,
  /\bdoujin\b/i,
  /\becchi\b/i,
  /\bntr\b/i,
  /\bnetorare\b/i,
  /\byaoi\b/i,
  /\byuri\b/i,
  /\bmilf\b/i,
];

const normalize = (value: string) =>
  value
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9+\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Shared policy for extension descriptors and catalogue cards. */
export function isExplicitExtensionContent(value: unknown): boolean {
  if(!value || typeof value !== 'object') return false;
  return (value as Record<string,unknown>).adultOnly === true || classifyAdultContent(value) !== null;
}

/** Non-React consumers use the same persisted preference as the global toggle. */
export function showAdultExtensionContent(): boolean { return getAdultMode() === 'adult'; }

export function isExplicitMangaSearchQuery(query: string): boolean {
  const normalized = normalize(query || "");
  if (!normalized) return false;
  return EXPLICIT_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function inferMangaAdultFlag(manga: unknown): boolean { return classifyAdultContent(manga) !== null; }
export function inferAnimeAdultFlag(anime: unknown): boolean { return classifyAdultContent(anime) !== null; }

/**
 * Drop mature anime from a discovery/home/feed list unless the user has opted to
 * see mature media everywhere. `pick` maps each item to the object
 * `inferAnimeAdultFlag` inspects (defaults to the item itself), so it works on
 * `AnimeCard[]`, `PosterItem[]`, `TatakaiMedia[]`, etc. When `showAdult` is true
 * the list is returned untouched.
 */
export function filterAdultAnime<T>(
  list: T[] | null | undefined,
  showAdult: boolean,
  pick: (item: T) => any = (item) => item,
): T[] {
  if (!Array.isArray(list)) return [];
  if (showAdult) return list;
  return list.filter((item) => !inferAnimeAdultFlag(pick(item)));
}

