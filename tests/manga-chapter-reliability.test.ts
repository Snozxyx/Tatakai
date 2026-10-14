import { expect, test } from "bun:test";
import {
  mangaUpdateChapters,
  removeMangaChapterOutliers,
} from "../src/lib/reader/mangaChapterReliability";
import type { MappedMangaChapter } from "../src/types/manga";

const chapter = (number: number, providers: string[]): MappedMangaChapter => ({
  chapterNumber: number,
  chapterTitle: `Chapter ${number}`,
  volume: null,
  canonicalOrder: number,
  sources: providers.map((provider) => ({
    provider,
    chapterKey: `${provider}:${number}`,
    providerChapterId: String(number),
    language: "en",
    scanlator: null,
    releaseDate: null,
  })),
});

test("MangaDex update numbers ignore a scraper ID and count decimal releases separately", () => {
  const chapters = [
    chapter(1, ["mangadex"]),
    chapter(2, ["mangadex"]),
    chapter(2.5, ["mangadex"]),
    chapter(90000, ["scraper"]),
  ];
  expect(mangaUpdateChapters(chapters).map((c) => c.chapterNumber)).toEqual([
    1, 2, 2.5,
  ]);
  expect(
    removeMangaChapterOutliers(chapters).map((c) => c.chapterNumber)
  ).toEqual([1, 2, 2.5]);
});

test("chapter validation retains newer translations and corroborated numbering", () => {
  const chapters = [
    chapter(1, ["mangadex"]),
    chapter(2, ["mangadex"]),
    chapter(3, ["mangadex"]),
    chapter(4, ["other"]),
    chapter(500, ["first", "second"]),
  ];
  expect(removeMangaChapterOutliers(chapters)).toEqual(chapters);
  expect(mangaUpdateChapters([chapter(2, ["other"])])[0].chapterNumber).toBe(2);
  expect(mangaUpdateChapters([chapter(9, ["tatakai_media"])])).toEqual([]);
});
