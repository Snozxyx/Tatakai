import { expect, test } from "bun:test";
import { mergeReadlistAliases, readlistProgressLabels, type ResolvedReadlistItem } from "../src/lib/reader/readlistDisplay";

function row(overrides: Partial<ResolvedReadlistItem>): ResolvedReadlistItem {
  return {
    id: "import", manga_id: "mangabaka:1186", resolved_manga_id: "180891",
    manga_title: "Absolute Regression", manga_poster: "https://cover.fixture/absolute.jpg",
    updated_at: "2026-10-10T00:00:00Z", last_chapter_number: 121,
    last_chapter_key: null, last_chapter_title: null, last_page_index: 0,
    status: "completed", anilist_id: null,
    ...overrides,
  } as ResolvedReadlistItem;
}

test("combines resolved MangaBaka and AniList aliases and keeps the newest saved state", () => {
  const imported = row({});
  const local = row({ id: "local", manga_id: "anilist:180891", resolved_manga_id: undefined,
    updated_at: "2026-10-11T00:00:00Z", status: "reading", last_chapter_number: 125,
    last_chapter_key: "chapter-125", last_page_index: 8, manga_poster: null });
  expect(mergeReadlistAliases([imported, local])).toEqual([{
    ...local, manga_poster: imported.manga_poster,
  }]);
  expect(local.manga_poster).toBeNull();
  expect(imported.status).toBe("completed");
});

test("does not combine different comics that share a title or a numeric tracker ID", () => {
  expect(mergeReadlistAliases([
    row({ manga_id: "180891", resolved_manga_id: undefined }),
    row({ manga_id: "mal:180891", resolved_manga_id: undefined }),
    row({ manga_id: "mangabaka:180891", resolved_manga_id: undefined }),
  ])).toHaveLength(3);
});

test("shows unread imports as not started without invented page progress", () => {
  expect(readlistProgressLabels(row({ last_chapter_number: 0 }))).toEqual({
    hasChapter: false, chapterLabel: "Not started", pageLabel: null,
  });
  expect(readlistProgressLabels(row({}))).toEqual({
    hasChapter: true, chapterLabel: "Chapter 121", pageLabel: null,
  });
});

test("retains chapter zero and page progress when an actual reading session exists", () => {
  expect(readlistProgressLabels(row({ last_chapter_number: 0, last_chapter_key: "prologue", last_page_index: 3 }))).toEqual({
    hasChapter: true, chapterLabel: "Chapter 0", pageLabel: "Page 4",
  });
});
