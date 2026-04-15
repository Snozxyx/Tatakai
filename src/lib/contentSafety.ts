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
