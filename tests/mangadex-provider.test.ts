import { expect, test } from "bun:test";
import provider from "../toko/,/src/providers/manga/mangadex";

test("MangaDex preserves languages, groups, decimals and chapter zero without counting releases twice", async () => {
  const original = globalThis.fetch;
  const urls: string[] = [];
  const row = (
    id: string,
    number: string,
    lang: string,
    groups: string[],
    extra = {}
  ) => ({
    id,
    attributes: {
      chapter: number,
      translatedLanguage: lang,
      pages: 10,
      ...extra,
    },
    relationships: groups.map((name) => ({
      type: "scanlation_group",
      attributes: { name },
    })),
  });
  globalThis.fetch = (async (input: string) => {
    const url = String(input);
    urls.push(url);
    if (url.includes("/manga?"))
      return Response.json({
        data: [
          {
            id: "manga-id",
            attributes: { links: { al: "42" }, title: { en: "Fixture" } },
          },
        ],
      });
    if (url.includes("/feed"))
      return Response.json({
        total: 8,
        data: [
          row("zero", "0", "en", ["A"]),
          row("a", "1", "en", ["A"]),
          row("b", "1", "en", ["B"]),
          row("c", "1", "es", ["C", "D"]),
          row("d", "1.5", "en", ["A"]),
          row("bad", "2garbage", "en", ["A"]),
          row("external", "3", "en", ["A"], {
            externalUrl: "https://external.test",
          }),
          row("empty", "4", "en", ["A"], { pages: 0 }),
        ],
      });
    return Response.json({
      baseUrl: "https://node.test",
      chapter: { hash: "hash", data: ["one.jpg", "two.jpg"] },
    });
  }) as typeof fetch;
  try {
    const chapters = await provider.getChapters({
      anilistId: 42,
      titles: ["Fixture"],
    });
    expect(chapters.map((c) => c.number)).toEqual([0, 1, 1.5]);
    expect(chapters[1].sources.map((s) => [s.language, s.scanlator])).toEqual([
      ["en", "A"],
      ["en", "B"],
      ["es", "C, D"],
    ]);
    expect(new URL(urls[1]).searchParams.get("includeExternalUrl")).toBe("0");
    expect(await provider.getPages(chapters[1].sources[1].chapterKey)).toEqual([
      { pageNumber: 1, imageUrl: "https://node.test/data/hash/one.jpg" },
      { pageNumber: 2, imageUrl: "https://node.test/data/hash/two.jpg" },
    ]);
  } finally {
    globalThis.fetch = original;
  }
});

test("large MangaDex catalogs partition by language within the offset window", async () => {
  const original = globalThis.fetch;
  const queries: URL[] = [];
  globalThis.fetch = (async (input: string) => {
    const url = new URL(String(input));
    queries.push(url);
    if (url.pathname === "/manga")
      return Response.json({
        data: [
          {
            id: "large-id",
            attributes: {
              links: { al: "42" },
              availableTranslatedLanguages: ["en", "es"],
            },
          },
        ],
      });
    const language = url.searchParams.get("translatedLanguage[]");
    const row = {
      id: language || "en",
      attributes: {
        chapter: "5",
        pages: 1,
        translatedLanguage: language || "en",
      },
    };
    return Response.json({ total: language ? 1 : 10001, data: [row] });
  }) as typeof fetch;
  try {
    const chapters = await provider.getChapters({
      anilistId: 42,
      titles: ["Fixture"],
    });
    expect(chapters[0].sources.map((s) => s.language)).toEqual(["en", "es"]);
    expect(
      queries
        .filter((q) => q.pathname.endsWith("/feed"))
        .map((q) => q.searchParams.get("translatedLanguage[]"))
    ).toEqual([null, "en", "es"]);
  } finally {
    globalThis.fetch = original;
  }
});
