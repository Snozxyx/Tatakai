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
    .toLowerCase()
    .replace(/[^a-z0-9+\s-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

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

