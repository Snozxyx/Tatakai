import { afterEach, expect, mock, test } from "bun:test";

mock.module("../TatakaiAPI/src/config/env", () => ({ env: {} }));
mock.module("../TatakaiAPI/src/config/logger", () => ({ log: { info() {}, warn() {}, error() {} } }));
const { fetchMangaBakaSeries } = await import("../TatakaiAPI/src/services/mapping/mangabaka");
const { fetchMangabakaLibrary } = await import("../TatakaiAPI/src/services/mangabakaSync");
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test("hydrates progress-only library entries with title, cover and tracker IDs", async () => {
  const urls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    urls.push(url);
    if (url.includes("/my/library?")) return Response.json({ data: [{ series_id: 6479, state: "reading", progress_chapter: 12 }] });
    expect(url).toBe("https://api.mangabaka.org/v1/series/6479");
    return Response.json({ data: { id: 6479, title: "Resolved comic", cover: { x350: { x1: "https://cover.fixture/comic.jpg" } }, source: { anilist: { id: 159301 }, kitsu: { id: 67006 } } } });
  };
  expect(await fetchMangabakaLibrary("fixture-token")).toEqual([expect.objectContaining({
    seriesId: 6479, title: "Resolved comic", coverUrl: "https://cover.fixture/comic.jpg",
    anilistId: 159301, kitsuId: 67006, state: "reading", progressChapter: 12,
  })]);
  await fetchMangaBakaSeries(6479, { source: "mangabaka" });
  expect(urls.filter(url => url.endsWith("/series/6479"))).toHaveLength(1);
});

test("keeps library progress when the public series lookup fails", async () => {
  globalThis.fetch = async (input) => String(input).includes("/my/library?")
    ? Response.json({ data: [{ series_id: 999999, state: "paused", progress_chapter: 7 }] })
    : new Response("unavailable", { status: 503 });
  expect(await fetchMangabakaLibrary("fixture-token")).toEqual([expect.objectContaining({
    seriesId: 999999, state: "paused", progressChapter: 7, title: null, coverUrl: null,
  })]);
});
