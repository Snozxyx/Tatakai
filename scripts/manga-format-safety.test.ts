import { expect, test } from "bun:test";
import { pickBestMangaCandidate } from "../toko/,/src/utils/manga/manga-title-resolver";
import { hasNovelSeriesMetadata } from "../toko/,/src/utils/manga/manga-format";
import { loadHtml } from "../toko/,/src/utils/http/fetch";
import novelcool from "../toko/,/src/providers/manga/novelcool";
import atsu from "../toko/,/src/providers/manga/atsu";

test("fuzzy matching rejects novel adaptations before choosing a manga candidate", () => {
  const novel = { name: "Fixture", format: "LIGHT_NOVEL" };
  const comic = { name: "Fixture", format: "Comic" };
  expect(
    pickBestMangaCandidate(["Fixture"], [novel, comic], (c) => [c.name])
      ?.candidate
  ).toBe(comic);
  for (const name of [
    "Fixture (Novel)",
    "Fixture [LN]",
    "Fixture (Web Novel)",
    "[Novel] Fixture",
    "Fixture - Light Novel",
  ]) {
    expect(
      pickBestMangaCandidate(["Fixture"], [{ name }], (c) => [c.name])
    ).toBeNull();
  }
  expect(
    pickBestMangaCandidate(
      ["The Novel's Extra"],
      [{ name: "The Novel's Extra" }],
      (c) => [c.name]
    )
  ).not.toBeNull();
  expect(
    pickBestMangaCandidate(
      ["Fixture"],
      [{ name: "Fixture", url: "https://site.test/novel/fixture" }],
      (c) => [c.name]
    )
  ).toBeNull();
});

test("series metadata detects prose formats without treating descriptions as format labels", () => {
  expect(
    hasNovelSeriesMetadata(
      loadHtml(
        '<div class="post-content_item"><div class="summary-heading">Type</div><div class="summary-content">Web Novel</div></div>'
      )
    )
  ).toBe(true);
  expect(
    hasNovelSeriesMetadata(
      loadHtml(
        '<div class="post-content_item"><div class="summary-heading">Description</div><div class="summary-content">A hero enters a novel world.</div></div>'
      )
    )
  ).toBe(false);
});

test("NovelCool verifies panels before accepting chapters and skips the same-title prose edition", async () => {
  const original = globalThis.fetch;
  let comicExists = false;
  const seen: string[] = [];
  globalThis.fetch = (async (input: string) => {
    const url = String(input);
    seen.push(url);
    let html = "";
    if (url.includes("/search/?"))
      html =
        '<div class="book-item"><a href="/novel/Prose.html"><span class="book-name">Fixture</span></a></div>' +
        (comicExists
          ? '<div class="book-item"><a href="/novel/Comic.html"><span class="book-name">Fixture</span></a></div>'
          : "");
    else if (url.endsWith("/novel/Prose.html"))
      html =
        '<div class="chapter-item-list"><div class="chp-item"><a href="/chapter/prose-chapter-1000/1">Chapter 1000</a></div></div>';
    else if (url.endsWith("/novel/Comic.html"))
      html =
        '<div class="chapter-item-list">' +
        [1, 2]
          .map(
            (n) =>
              `<div class="chp-item"><a href="/chapter/comic-chapter-${n}/${n}">Chapter ${n}</a></div>`
          )
          .join("") +
        "</div>";
    else if (url.includes("/chapter/prose"))
      html =
        '<div class="reading-content"><p>A long prose chapter without comic panels.</p></div>';
    else if (url.includes("/chapter/comic"))
      html =
        '<img class="mangaread-manga-pic" src="https://images.test/panel.jpg">';
    return new Response(html);
  }) as typeof fetch;
  try {
    expect(await novelcool.getChapters({ titles: ["Fixture"] })).toEqual([]);
    comicExists = true;
    const chapters = await novelcool.getChapters({ titles: ["Fixture"] });
    expect(chapters.map((c) => c.number)).toEqual([1, 2]);
    expect(
      chapters.every((c) => c.sources[0].chapterKey.includes("comic-chapter"))
    ).toBe(true);
    expect(seen.some((url) => url.includes("/chapter/prose"))).toBe(true);
  } finally {
    globalThis.fetch = original;
  }
});

test("Atsu excludes case and separator variants of Novel before loading a chapter list", async () => {
  const original = globalThis.fetch;
  const seen: string[] = [];
  globalThis.fetch = (async (input: string) => {
    const url = String(input);
    seen.push(url);
    if (url.includes("/search/"))
      return Response.json({
        hits: [
          {
            document: { id: "novel", title: "Fixture", medium: "light_novel" },
          },
          { document: { id: "comic", title: "Fixture", medium: "Comic" } },
        ],
      });
    return Response.json({
      chapters: [{ id: "chapter", number: 1, title: "Comic chapter" }],
    });
  }) as typeof fetch;
  try {
    expect(
      (await atsu.getChapters({ titles: ["Fixture"] })).map((c) => c.number)
    ).toEqual([1]);
    expect(seen.some((url) => url.includes("mangaId=novel"))).toBe(false);
    expect(seen.some((url) => url.includes("mangaId=comic"))).toBe(true);
  } finally {
    globalThis.fetch = original;
  }
});
