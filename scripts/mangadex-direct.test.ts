import { expect, mock, test } from "bun:test";

let native = false;
let calls: string[] = [];
let currentId = 100;
const primary = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const alternate = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const cached: any[] = [];
const fixture = async (input: string, init: RequestInit = {}) => {
  const target = new URL(input);
  const url =
    target.pathname === "/api/proxy/json"
      ? new URL(target.searchParams.get("url")!)
      : target;
  calls.push(input);
  if (
    url.pathname.includes("graphql") ||
    url.hostname === "graphql.anilist.co"
  ) {
    currentId = JSON.parse(String(init.body)).variables.id;
    return Response.json({
      data: { Media: { title: { english: "API Fixture" } } },
    });
  }
  if (url.pathname === "/manga")
    return Response.json({
      data: [
        {
          id: "manga-fixture",
          attributes: { links: { al: String(currentId) } },
        },
      ],
    });
  if (url.pathname.endsWith("/feed"))
    return Response.json({
      total: 5,
      data: [
        {
          id: "zero",
          attributes: { chapter: "0", pages: 1, translatedLanguage: "en" },
        },
        {
          id: primary,
          attributes: {
            chapter: "1",
            pages: 10,
            translatedLanguage: "en",
            publishAt: "2026-10-01T00:00:00Z",
          },
          relationships: [
            { type: "scanlation_group", attributes: { name: "Group A" } },
          ],
        },
        {
          id: alternate,
          attributes: {
            chapter: "1",
            pages: 10,
            translatedLanguage: "es",
            publishAt: "2026-10-02T00:00:00Z",
          },
          relationships: [
            { type: "scanlation_group", attributes: { name: "Group B" } },
          ],
        },
        {
          id: "decimal",
          attributes: {
            chapter: "1.5",
            pages: 1,
            translatedLanguage: "en",
            publishAt: "2026-10-03T00:00:00Z",
          },
        },
        { id: "invalid", attributes: { chapter: "abc123", pages: 1 } },
      ],
    });
  if (url.pathname.endsWith(primary)) return new Response("", { status: 404 });
  if (url.pathname.endsWith(alternate))
    return Response.json({
      baseUrl: "https://images.test",
      chapter: { hash: "hash", data: ["a.jpg"] },
    });
  throw new Error(`Unexpected request: ${url}`);
};
mock.module("../src/lib/platform/platform", () => ({
  isCapacitor: () => false,
  isElectron: () => native,
}));
mock.module("../src/lib/api/backendOrigin", () => ({
  resolveBackendOrigin: () => "https://backend.fixture",
  resolveApiV3Base: () => "https://backend.fixture/api/v3",
  ANILIST_GRAPHQL_ENDPOINT: "https://backend.fixture/graphql",
}));
mock.module("../src/core/extensions/remote/transport", () => ({
  extensionFetch: fixture,
}));
mock.module("../src/lib/cache/extensionResultCache", () => ({
  clearCachedItemsByPrefix: async () => {},
  readCachedItemsSync: () => [],
  hydrateCachedItems: async () => [],
  writeCachedItems: (_key: string, items: any[]) => {
    cached.push(...items);
  },
  MANGA_CHAPTERS_TTL_MS: 1000,
}));
let extensionCalls = 0;
mock.module('../src/core/content/manga-extension-runtime',()=>({
 fetchExtensionMangaPages:async(params:any)=>({success:true,data:{pages:[{pageNumber:1,imageUrl:'https://extension.test/page.jpg'}],chapter:{provider:params.extensionId},readMeta:{provider:params.extensionId,fallbackUsed:false}}}),
 fetchExtensionMangaChapters:async()=>{extensionCalls++;return {chapters:[{number:2,title:'Extension Chapter Two',sources:[{provider:'mangapill',chapterKey:'mangapill:2',providerChapterId:'2',language:'en',scanlator:null,releaseDate:null}]}],providersAvailable:['toko'],failedProviders:[]};},
 mergeChaptersWithExtensions:(base:any,payload:any)=>({...base,mappedChapters:[...base.mappedChapters,...payload.chapters.map((c:any)=>({chapterNumber:c.number,chapterTitle:c.title,volume:null,canonicalOrder:base.mappedChapters.length,sources:c.sources}))]}),
}));
mock.module('../src/core/content/mangaupdates-api',()=>({fetchMangaUpdatesCatalog:async()=>null,applyMangaUpdatesCatalog:(base:any)=>base,clearMangaUpdatesCache:()=>{}}));
const { getMangaChapters, getMangaReadByKey, clearMangaChaptersCache } =
  await import("../src/core/content/manga-client");
const original = globalThis.fetch;
globalThis.fetch = fixture as typeof fetch;

test("website chapter catalog uses MangaDex API through the allowlisted JSON proxy, and keeps working extension sources", async () => {
  const result = await getMangaChapters("100");
  expect(result.mappedChapters.map((c) => c.chapterNumber)).toEqual([
    0, 1, 1.5, 2,
  ]);
  expect(
    result.mappedChapters[1].sources.map((s) => [s.language, s.scanlator])
  ).toEqual([
    ["en", "Group A"],
    ["es", "Group B"],
  ]);
  expect(result.mappedChapters[2].published).toBe("2026-10-03T00:00:00Z");
  expect(calls.filter((c) => c.includes("/api/proxy/json"))).toHaveLength(2);
  expect(cached).toEqual(result.mappedChapters);
});
test("native catalog calls MangaDex directly and repeat visits reuse the built-in metadata cache", async () => {
  native = true;
  calls = [];
  const result = await getMangaChapters("101");
  expect(result.mappedChapters).toHaveLength(4);
  expect(
    calls.filter((c) => c.startsWith("https://api.mangadex.org"))
  ).toHaveLength(2);
  const count = calls.length;
  await getMangaChapters("101");
  expect(calls.length).toBe(count);
  expect(extensionCalls).toBeGreaterThan(1);
});
test("Refresh clears the MangaDex catalog cache and fetches chapters again", async () => {
  native = true;
  const before = calls.length;
  await clearMangaChaptersCache("101");
  const result = await getMangaChapters("101");
  expect(result.mappedChapters).toHaveLength(4);
  expect(calls.length - before).toBe(1);
});
test("built-in reader retries another scanlator release without an extension", async () => {
  const result = await getMangaReadByKey("100", `mangadex:${primary}`, {
    provider: "mangadex",
    alternatives: [
      { provider: "mangadex", chapterKey: `mangadex:${alternate}` },
    ],
  });
  expect(result.success).toBe(true);
  expect(result.data?.pages[0].imageUrl).toBe(
    "https://images.test/data/hash/a.jpg"
  );
  expect(result.data?.chapter.providerChapterId).toBe(alternate);
  expect(result.data?.readMeta.fallbackUsed).toBe(true);
  globalThis.fetch = original;
});
test('failed MangaDex pages fall back to a working extension source',async()=>{
 const result=await getMangaReadByKey('100',`mangadex:${primary}`,{provider:'mangadex',alternatives:[{provider:'mangapill',chapterKey:'mangapill:2',providerChapterId:'2'}]});
 expect(result.success).toBe(true);expect(result.data?.pages[0].imageUrl).toBe('https://extension.test/page.jpg');
 expect(result.data?.readMeta.fallbackUsed).toBe(true);
});
