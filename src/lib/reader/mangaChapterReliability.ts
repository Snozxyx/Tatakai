import type { MappedMangaChapter } from "@/types/manga";

const isMangaDex = (chapter: MappedMangaChapter) =>
  chapter.sources.some(
    (source) =>
      source.provider.toLowerCase() === "mangadex" && source.chapterKey
  );

/** Prefer MangaDex's numbered releases for update badges when it is available. */
export function mangaUpdateChapters(
  chapters: MappedMangaChapter[]
): MappedMangaChapter[] {
  const readable = chapters.filter(
    (c) =>
      c.chapterNumber != null &&
      Number.isFinite(c.chapterNumber) &&
      c.chapterNumber >= 0 &&
      c.sources.some((s) => s.chapterKey && s.provider !== "tatakai_media")
  );
  const releases = chapters.filter(c => c.metadataSource === 'mangaupdates');
  return releases.length ? releases : removeMangaChapterOutliers(readable);
}

/** Reject obvious scraped IDs masquerading as numbers, without capping a lagging translation feed. */
export function removeMangaChapterOutliers(
  chapters: MappedMangaChapter[]
): MappedMangaChapter[] {
  const canonical = chapters
    .filter(isMangaDex)
    .map((c) => c.chapterNumber)
    .filter((n): n is number => n != null && Number.isFinite(n) && n >= 0);
  if (canonical.length < 3) return chapters;
  const ceiling = Math.max(...canonical);
  return chapters.filter((c) => {
    const number = c.chapterNumber;
    if (
      c.metadataSource === 'mangaupdates' ||
      number == null ||
      number <= Math.max(ceiling * 3, ceiling + 100) ||
      isMangaDex(c)
    )
      return true;
    const providers = new Set(
      c.sources
        .filter((s) => s.chapterKey && s.provider !== "tatakai_media")
        .map((s) => s.provider)
    );
    return providers.size >= 2;
  });
}
