import { expect, mock, test } from "bun:test";
let legacy = false,
  ambiguous = false,
  calls = 0;
mock.module("../src/lib/platform/platform", () => ({
  isCapacitor: () => true,
  isElectron: () => false,
}));
mock.module("../src/lib/api/backendOrigin", () => ({
  resolveBackendOrigin: () => "https://backend.fixture",
}));
mock.module("../src/core/content/mangadex-api", () => ({
  resolveMangaDexMapping: async () => ({
    attributes: {
      links: { al: "42", mu: legacy ? "19401" : "njeqwry" },
      title: { en: "Fixture Series" },
    },
  }),
}));
mock.module("../src/core/extensions/remote/transport", () => ({
  extensionFetch: async (url: string, init: RequestInit) => {
    calls++;
    if (url.endsWith("/series/19401")) return new Response("", { status: 404 });
    if (url.endsWith("/series/search"))
      return Response.json({
        results: [
          { record: { series_id: 51239621230, title: "Fixture Series" } },
          ...(ambiguous
            ? [{ record: { series_id: 999, title: "Fixture Series" } }]
            : []),
        ],
      });
    if (url.endsWith("/series/51239621230"))
      return Response.json({
        series_id: 51239621230,
        title: "Fixture Series",
        url: "https://www.mangaupdates.com/series/njeqwry/fixture",
        latest_chapter: 5,
        status: "Ongoing",
      });
    const body = JSON.parse(String(init.body));
    expect(body.search).toBe("51239621230");
    expect(body.search_type).toBe("series");
    expect(body.page).toBe(1);
    return Response.json({
      total_hits: 4,
      results: [
        {
          record: {
            chapter: "1-3",
            title: "Fixture Series",
            volume: "1",
            release_date: "2026-10-01",
            groups: [{ name: "A" }],
          },
        },
        {
          record: {
            chapter: "2",
            title: "Fixture Series",
            volume: "1",
            release_date: "2026-10-02",
            groups: [{ name: "B" }],
          },
        },
        {
          record: {
            chapter: "5",
            title: "Fixture Series",
            volume: "2",
            release_date: "2026-10-03",
            groups: [{ name: "A" }],
          },
        },
        {
          metadata: { series: { series_id: 999 } },
          record: { chapter: "99999", release_date: "2099-01-01" },
        },
      ],
    });
  },
}));
const {
  fetchMangaUpdatesCatalog,
  applyMangaUpdatesCatalog,
  clearMangaUpdatesCache,
  releaseChapterNumbers,
} = await import("../src/core/content/mangaupdates-api");

test("AniList/MangaDex bridge resolves base-36 MangaUpdates IDs and verified release metadata", async () => {
  const catalog = (await fetchMangaUpdatesCatalog("42"))!;
  expect(catalog.metadata.latestChapter).toBe(5);
  expect(catalog.metadata.latestReleaseDate).toBe("2026-10-03");
  expect(catalog.chapters.map((c) => c.chapterNumber)).toEqual([1, 2, 3, 5]);
  expect(catalog.chapters[1].releaseGroups).toEqual(["A", "B"]);
  const source = {
    provider: "mangapill",
    chapterKey: "mangapill:2",
    providerChapterId: "2",
    language: "en",
    scanlator: "B",
    releaseDate: null,
  };
  const merged = applyMangaUpdatesCatalog(
    {
      anilistId: 42,
      chapters: [],
      partial: false,
      failedProviders: [],
      mappedChapters: [
        {
          chapterNumber: 2,
          chapterTitle: "Actual Chapter Title",
          volume: 1,
          canonicalOrder: 0,
          sources: [source],
        },
      ],
    },
    catalog
  );
  expect(
    merged.mappedChapters.find((c) => c.chapterNumber === 2)?.chapterTitle
  ).toBe("Actual Chapter Title");
  expect(
    merged.mappedChapters.find((c) => c.chapterNumber === 2)?.sources
  ).toEqual([source]);
  expect(
    merged.mappedChapters.find((c) => c.chapterNumber === 5)?.sources
  ).toEqual([]);
  const previous = calls;
  await fetchMangaUpdatesCatalog("42");
  expect(calls).toBe(previous);
  clearMangaUpdatesCache("42");
  await fetchMangaUpdatesCatalog("42");
  expect(calls).toBeGreaterThan(previous);
});
test("legacy links use an exact title crosswalk and ambiguous titles remain unmapped", async () => {
  legacy = true;
  expect((await fetchMangaUpdatesCatalog("43"))?.metadata.seriesId).toBe(
    51239621230
  );
  ambiguous = true;
  expect(await fetchMangaUpdatesCatalog("44")).toBeNull();
});
test("chapter ranges are bounded and IDs or suffixes are never mistaken for chapter numbers", () => {
  expect(releaseChapterNumbers("12.5")).toEqual([12.5]);
  expect(releaseChapterNumbers("1-3")).toEqual([1, 2, 3]);
  expect(releaseChapterNumbers("1-99999")).toEqual([]);
  expect(releaseChapterNumbers("356b")).toEqual([]);
});
