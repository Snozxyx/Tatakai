import type { MangaChapterSource } from "@/types/manga";

// Keep chapter navigation on the same reliability order as MangaPage. Raw
// extension order is discovery order, not a quality signal, and can put a
// source that returns stale/blocked image URLs ahead of a healthy source.
const MANGA_PROVIDER_RELIABILITY = [
  "mangadex",
  "mangapill",
  "mangakatana",
  "weebcentral",
  "nelomanga",
  "comick",
  "atsu",
  "webtoons",
  "demonicscans",
];

export function providerReliabilityRank(provider?: string | null): number {
  const idx = MANGA_PROVIDER_RELIABILITY.indexOf(String(provider || "").toLowerCase());
  return idx === -1 ? MANGA_PROVIDER_RELIABILITY.length : idx;
}

export function sortMangaChapterSources(
  sources?: MangaChapterSource[] | null,
): MangaChapterSource[] {
  return [...(sources || [])]
    .filter((source) => Boolean(source?.provider && source?.chapterKey))
    .sort(
      (left, right) =>
        providerReliabilityRank(left.provider) - providerReliabilityRank(right.provider),
    );
}

export function pickMangaChapterSource(
  sources: MangaChapterSource[] | null | undefined,
  preferProvider?: string | null,
): MangaChapterSource | null {
  const ordered = sortMangaChapterSources(sources);
  return ordered.find((source) => source.provider === preferProvider) || ordered[0] || null;
}

export function nextMangaChapterSource(
  sources: MangaChapterSource[] | null | undefined,
  current?: {
    provider?: string | null;
    chapterKey?: string | null;
    providerChapterId?: string | null;
  },
): MangaChapterSource | null {
  const ordered = sortMangaChapterSources(sources);
  if (!ordered.length) return null;
  const different = ordered.find(
    (source) =>
      source.provider !== current?.provider ||
      source.chapterKey !== current?.chapterKey ||
      (source.providerChapterId || "") !== (current?.providerChapterId || ""),
  );
  return different || ordered[0];
}
