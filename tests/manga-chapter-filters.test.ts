import { expect, test } from "bun:test";
import {
  filterMangaChapters,
  mangaChapterLanguagePreference,
} from "../src/lib/reader/mangaChapterFilters";
import type { MappedMangaChapter } from "../src/types/manga";

const chapters: MappedMangaChapter[] = Array.from(
  { length: 122 },
  (_, index) => ({
    chapterNumber: index + 1,
    chapterTitle: null,
    canonicalOrder: index,
    volume: index < 60 ? 1 : 2,
    sources: [
      {
        provider: "mangadex",
        chapterKey: `mangadex:${index}`,
        providerChapterId: String(index),
        language: index === 121 ? "en" : "es",
        scanlator: null,
        releaseDate: null,
      },
    ],
  })
);
const normalize = (language: string | null | undefined) =>
  language || "unknown";

test("Auto shows all 122 MangaDex chapters even with an English profile preference", () => {
  const preference = mangaChapterLanguagePreference("auto", "en");
  expect(preference.ranking).toBe("en");
  expect(
    filterMangaChapters(chapters, "auto", preference.filter, normalize)
  ).toHaveLength(122);
});
test("explicit language filters show their actual count and persist inside volume filters", () => {
  const preference = mangaChapterLanguagePreference("en", "es");
  expect(
    filterMangaChapters(chapters, "mangadex", preference.filter, normalize)
  ).toHaveLength(1);
  expect(
    filterMangaChapters(chapters, "mangadex", preference.filter, normalize, 1)
  ).toHaveLength(0);
  expect(
    filterMangaChapters(chapters, "mangadex", preference.filter, normalize, 2)
  ).toHaveLength(1);
});
