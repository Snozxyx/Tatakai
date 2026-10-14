import { expect, mock, test } from "bun:test";

const detailIds: string[] = [];
mock.module("../src/core/content/manga-client", () => ({
  getMangaDetail: async (id: string) => {
    detailIds.push(id);
    return { detail: { canonicalTitle: "Catalog title", coverImage: "https://cover.fixture/catalog.jpg", format: "manga" } };
  },
}));
mock.module("../src/lib/mapping/mangabaka", () => ({
  fetchMangaBakaSeries: async (id: string, options: { source: string }) => {
    expect(options.source).toBe("mangabaka");
    if (id === "999999") return null;
    return { title: "Resolved comic", cover: { large: "https://cover.fixture/comic.jpg" }, anilistId: 159301, malId: null, type: "manhua" };
  },
}));
const { needsReadlistMetadata, resolveReadlistMetadata } = await import("../src/lib/reader/readlistMetadata");
const row = { manga_id: "mangabaka:6479", manga_title: "MangaBaka #6479", manga_poster: null, format: "unknown", anilist_id: null, mal_id: null };

test("repairs legacy imported cards and uses mapped identity for chapter lookups", async () => {
  expect(needsReadlistMetadata(row)).toBe(true);
  expect(await resolveReadlistMetadata(row)).toEqual({ id: "159301", title: "Resolved comic", poster: "https://cover.fixture/comic.jpg", format: "manhua" });
});

test("preserves a saved title while filling a missing cover", async () => {
  expect(await resolveReadlistMetadata({ ...row, manga_id: "159301", manga_title: "My saved title" })).toMatchObject({ title: "My saved title", poster: "https://cover.fixture/catalog.jpg" });
  expect(detailIds).toContain("159301");
});

test("does not reinterpret an unmapped MangaBaka ID as an AniList ID", async () => {
  const count = detailIds.length;
  expect(await resolveReadlistMetadata({ ...row, manga_id: "mangabaka:999999" })).toMatchObject({ id: "mangabaka:999999", title: null, poster: null });
  expect(detailIds).toHaveLength(count);
});
