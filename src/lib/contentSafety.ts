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
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  if (['nsfw', 'isNsfw', 'is_nsfw', 'isAdult', 'adult', 'is18Plus'].some(key => row[key] === true)) return true;
  const labels = [row.name, row.title, row.rating, row.ageRating, row.contentRating,
    ...(Array.isArray(row.genres) ? row.genres : []), ...(Array.isArray(row.tags) ? row.tags : []),
    ...(Array.isArray(row.categories) ? row.categories : [])];
  return labels.some(label => typeof label === 'string' && EXPLICIT_PATTERNS.some(pattern => pattern.test(normalize(label))));
}

/** Non-React consumers use the same persisted preference as the global toggle. */
export function showAdultExtensionContent(): boolean {
  try {
    const saved = localStorage.getItem('tatakai_content_safety');
    if (saved) return JSON.parse(saved)?.showAdultEverywhere === true;
    const cookie = document.cookie.split(';').map(value => value.trim()).find(value => value.startsWith('tatakai_guest_settings_v1='));
    return cookie ? JSON.parse(decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1)))?.contentSafety?.showAdultEverywhere === true : false;
  } catch { return false; }
}

export function isExplicitMangaSearchQuery(query: string): boolean {
  const normalized = normalize(query || "");
  if (!normalized) return false;
  return EXPLICIT_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function inferMangaAdultFlag(
  manga: Partial<MangaSearchItem> | null | undefined
): boolean {
  if (!manga) return false;
  if (typeof manga.adult === "boolean") {
    return manga.adult;
  }

  const candidates = [
    manga.canonicalTitle,
    manga.title?.english,
    manga.title?.romaji,
    manga.title?.native,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  if (candidates.length === 0) return false;

  return candidates.some((title) => {
    const normalized = normalize(title);
    return EXPLICIT_PATTERNS.some((pattern) => pattern.test(normalized));
  });
}

export function inferAnimeAdultFlag(anime: any): boolean {
  if (!anime) return false;
  if (typeof anime.isAdult === "boolean") return anime.isAdult;
  if (typeof anime.adult === "boolean") return anime.adult;
  if (typeof anime.is18Plus === "boolean") return anime.is18Plus;
  if (typeof anime.isNsfw === "boolean") return anime.isNsfw;

  const ratingStr = String(anime.rating || anime.ageRating || "").toLowerCase();
  if (ratingStr.includes("rx") || ratingStr.includes("r18") || ratingStr.includes("18+") || ratingStr.includes("hentai")) {
    return true;
  }

  const genres: string[] = Array.isArray(anime.genres) ? anime.genres : [];
  if (genres.some((g) => typeof g === "string" && EXPLICIT_PATTERNS.some((p) => p.test(g.toLowerCase())))) {
    return true;
  }

  const candidates = [anime.name, anime.title, anime.englishTitle, anime.japaneseTitle]
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0);

  return candidates.some((title) => {
    const normalized = normalize(title);
    return EXPLICIT_PATTERNS.some((pattern) => pattern.test(normalized));
  });
}

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

