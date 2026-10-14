import type { MappedMangaChapter } from "@/types/manga";

export function mangaChapterLanguagePreference(
  selected: string,
  profile: string
) {
  return {
    filter: selected,
    ranking: selected === "auto" ? profile : selected,
  };
}

export function filterMangaChapters<T extends MappedMangaChapter>(
  chapters: T[],
  provider: string,
  language: string,
  normalizeLanguage: (value: string | null | undefined) => string,
  volume: number | null = null
): T[] {
  return chapters.filter((chapter) => {
    if (
      volume != null &&
      (chapter.volume == null || Math.trunc(Number(chapter.volume)) !== volume)
    )
      return false;
    if (!chapter.sources.length && chapter.metadataSource === 'mangaupdates') return provider === 'auto' && language === 'auto';
    return chapter.sources.some(
      (source) =>
        (provider === "auto" || source.provider === provider) &&
        (language === "auto" || normalizeLanguage(source.language) === language)
    );
  });
}
