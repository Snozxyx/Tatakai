import { describe, expect, test } from "bun:test";
import type { MangaChapterSource } from "../src/types/manga";
import {
  nextMangaChapterSource,
  pickMangaChapterSource,
  sortMangaChapterSources,
} from "../src/lib/reader/mangaSourceSelection";

function source(provider: string, chapterKey: string, providerChapterId = chapterKey): MangaChapterSource {
  return {
    provider,
    chapterKey,
    providerChapterId,
    language: "en",
    scanlator: null,
    releaseDate: null,
  };
}

describe("manga source selection", () => {
  test("uses reliability order when no current provider is available", () => {
    const ordered = sortMangaChapterSources([
      source("allmanga", "allmanga:2"),
      source("mangadex", "mangadex:2"),
      source("comick", "comick:2"),
    ]);

    expect(ordered.map((item) => item.provider)).toEqual(["mangadex", "comick", "allmanga"]);
  });

  test("keeps the current provider for next and continuous chapters when it exists", () => {
    const picked = pickMangaChapterSource([
      source("mangadex", "mangadex:3"),
      source("comick", "comick:3"),
    ], "comick");

    expect(picked?.provider).toBe("comick");
    expect(picked?.chapterKey).toBe("comick:3");
  });

  test("falls back to the best available provider when the current provider is missing", () => {
    const picked = pickMangaChapterSource([
      source("allmanga", "allmanga:4"),
      source("mangapill", "mangapill:4"),
    ], "comick");

    expect(picked?.provider).toBe("mangapill");
  });

  test("retry failover treats provider-native chapter ids as distinct attempts", () => {
    const fallback = nextMangaChapterSource([
      source("mangadex", "mangadex:5", "public-id"),
      source("mangadex", "mangadex:5", "private-id"),
    ], {
      provider: "mangadex",
      chapterKey: "mangadex:5",
      providerChapterId: "public-id",
    });

    expect(fallback?.providerChapterId).toBe("private-id");
  });
});
