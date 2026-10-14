import { expect, mock, test } from "bun:test";
import type { MappedMangaChapter } from "../src/types/manga";

let cached: MappedMangaChapter[] = [];
let written: MappedMangaChapter[] = [];
let extensionCalls = 0;
const chapter = (
  number: number,
  provider: string,
  key = String(number)
): MappedMangaChapter => ({
  chapterNumber: number,
  chapterTitle: `Chapter ${number}`,
  volume: null,
  canonicalOrder: number,
  sources: [
    {
      provider,
      chapterKey: `${provider}:${key}`,
      providerChapterId: key,
      language: "en",
      scanlator: "Group",
      releaseDate: null,
    },
  ],
});
mock.module("../src/lib/platform/platform", () => ({
  isCapacitor: () => true,
}));
mock.module("../src/lib/api/backendOrigin", () => ({
  resolveBackendOrigin: () => "https://api.mobile-fixture.test",
  resolveApiV3Base: () => "https://api.mobile-fixture.test/api/v3",
  ANILIST_GRAPHQL_ENDPOINT: "https://api.mobile-fixture.test/graphql",
}));
mock.module("../src/lib/cache/extensionResultCache", () => ({
  clearCachedItemsByPrefix: async () => {},
  readCachedItemsSync: () => cached,
  hydrateCachedItems: async () => cached,
  writeCachedItems: (_key: string, items: MappedMangaChapter[]) => {
    written = items;
  },
  MANGA_CHAPTERS_TTL_MS: 1000,
}));
mock.module("../src/core/content/manga-extension-runtime", () => ({
  fetchExtensionMangaChapters: async () => {
    extensionCalls++;
    return {
      chapters: [chapter(1, "mangadex")],
      providersAvailable: ["toko"],
      failedProviders: [],
    };
  },
  mergeChaptersWithExtensions: (base: any, payload: any) => ({
    ...base,
    mappedChapters: payload.chapters,
  }),
}));
mock.module("../src/core/content/mangadex-api", () => ({
  fetchMangaDexChapters: async () => null,
}));
mock.module('../src/core/content/mangaupdates-api',()=>({fetchMangaUpdatesCatalog:async()=>null,applyMangaUpdatesCatalog:(base:any)=>base,clearMangaUpdatesCache:()=>{}}));
const { getMangaChapters, unionMappedChapters } = await import(
  "../src/core/content/manga-client"
);
const { getNovelDetail } = await import("../src/core/content/novel-client");

test("novel detail uses the resolved backend instead of the mobile WebView origin", async () => {
  const original = globalThis.fetch;
  let target = "";
  globalThis.fetch = (async (url: any) => {
    target = String(url);
    return Response.json({
      data: {
        media: { anilistId: 42, titleEnglish: "Mobile Novel", format: "NOVEL" },
      },
    });
  }) as typeof fetch;
  try {
    expect((await getNovelDetail("42")).detail.canonicalTitle).toBe(
      "Mobile Novel"
    );
    expect(target).toBe(
      "https://api.mobile-fixture.test/api/v3/manga/by-anilist/42"
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("metadata failure still loads and caches the installed manga catalog", async () => {
  const original = globalThis.fetch;
  cached = [];
  globalThis.fetch = (async () => {
    throw new Error("Backend offline");
  }) as typeof fetch;
  try {
    const result = await getMangaChapters("42");
    expect(extensionCalls).toBe(1);
    expect(result.mappedChapters[0].sources[0].provider).toBe("mangadex");
    expect(written).toEqual(result.mappedChapters);
  } finally {
    globalThis.fetch = original;
  }
});
test("fresh providers replace stale wrong numbers, retain unavailable sources and preserve alternate releases", () => {
  const first = chapter(1, "mangadex", "a");
  const second = chapter(1, "mangadex", "b");
  first.sources.push(...second.sources);
  const merged = unionMappedChapters(
    [first],
    [chapter(9999, "mangadex"), chapter(2, "temporarily-offline")]
  );
  expect(merged.map((c) => c.chapterNumber)).toEqual([1, 2]);
  expect(merged[0].sources.map((s) => s.providerChapterId)).toEqual(["a", "b"]);
});
