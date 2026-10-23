const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { resolveChapter } = require("../desktop/runtime/translate/reader.cjs");

test("reader imports only chapter-owned downloaded files and rejects traversal", () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "tatakai-translate-reader-")
  );
  try {
    const series = path.join(root, "Series");
    const chapter = path.join(series, "Chapter_1");
    fs.mkdirSync(chapter, { recursive: true });
    fs.writeFileSync(
      path.join(series, "manifest.json"),
      JSON.stringify({
        anilistId: 123,
        title: "Series",
        chapters: [{ chapterKey: "one", dir: "Chapter_1" }],
      })
    );
    const manifest = {
      chapterKey: "one",
      provider: "provider",
      pages: [{ file: "001.png" }],
    };
    fs.writeFileSync(
      path.join(chapter, "manifest.json"),
      JSON.stringify(manifest)
    );
    fs.writeFileSync(path.join(chapter, "001.png"), "fixture");
    const result = resolveChapter(root, 123, "one");
    assert.equal(result.paths[0], fs.realpathSync(path.join(chapter, "001.png")));
    assert.equal(result.title, "Series");
    assert.equal(resolveChapter(root, 123, "missing"), null);
    manifest.pages[0].file = "../../outside.png";
    fs.writeFileSync(
      path.join(chapter, "manifest.json"),
      JSON.stringify(manifest)
    );
    assert.throws(() => resolveChapter(root, 123, "one"), /missing|outside/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
