import { expect, test } from "bun:test";
import { declaresNovelContent } from "../src/lib/reader/mangaSourceFormat";
import { mangaChaptersCacheKey } from "../src/core/content/manga-client";
test("the app rejects explicitly declared prose formats without rejecting manga titles mentioning novels", () => {
  expect(declaresNovelContent({ medium: "light_novel" })).toBe(true);
  expect(declaresNovelContent({ mediaType: "NOVEL" })).toBe(true);
  expect(
    declaresNovelContent({ type: "Manhwa", title: "The Novel's Extra" })
  ).toBe(false);
  expect(declaresNovelContent({ chapterTitle: "Novel Adventures" })).toBe(
    false
  );
});
test("retired mixed-format snapshots cannot seed the new chapter catalog", () => {
  expect(mangaChaptersCacheKey("42")).toBe("manga-chapters::v3::42::::");
});
