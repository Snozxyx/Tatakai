import { describe, expect, test } from "bun:test";
import { mangaPageAttemptIdentity } from "../src/core/content/manga-extension-runtime";

describe("manga page attempt identity", () => {
  test("allows a resume request to retry with the provider's resolved chapter id", () => {
    const resumed = mangaPageAttemptIdentity({
      provider: "mangadex",
      chapterKey: "mangadex:chapter-2",
    });
    const resolved = mangaPageAttemptIdentity({
      provider: "mangadex",
      chapterKey: "mangadex:chapter-2",
      providerChapterId: "private-chapter-uuid",
    });

    expect(resumed).not.toBe(resolved);
  });

  test("still deduplicates an identical source attempt", () => {
    const source = {
      provider: "comick",
      chapterKey: "comick:chapter-2",
      providerChapterId: "chapter-2-id",
    };

    expect(mangaPageAttemptIdentity(source)).toBe(mangaPageAttemptIdentity({ ...source }));
  });
});
