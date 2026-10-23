"use strict";
const fs = require("node:fs");
const path = require("node:path");

function inside(root, file) {
  const relative = path.relative(root, file);
  return (
    relative !== "" &&
    !relative.startsWith(`..${path.sep}`) &&
    relative !== ".." &&
    !path.isAbsolute(relative)
  );
}
function readJson(file) {
  if (fs.statSync(file).size > 4 * 1024 * 1024)
    throw new Error("Chapter manifest exceeds the size limit.");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function resolveChapter(root, anilistId, chapterKey) {
  if (
    !Number.isSafeInteger(anilistId) ||
    !anilistId ||
    typeof chapterKey !== "string" ||
    !chapterKey ||
    chapterKey.length > 512
  )
    throw new Error("Invalid chapter identity.");
  if (!fs.existsSync(root)) return null;
  const canonicalRoot = fs.realpathSync(root);
  for (const entry of fs.readdirSync(canonicalRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const seriesDir = path.join(canonicalRoot, entry.name);
    let series;
    try {
      series = readJson(path.join(seriesDir, "manifest.json"));
    } catch {
      continue;
    }
    if (Number(series.anilistId) !== anilistId) continue;
    const chapter = (
      Array.isArray(series.chapters) ? series.chapters : []
    ).find((c) => c.chapterKey === chapterKey);
    if (!chapter || typeof chapter.dir !== "string") return null;
    const directory = path.resolve(seriesDir, chapter.dir);
    if (
      !inside(seriesDir, directory) ||
      !fs.existsSync(directory) ||
      fs.lstatSync(directory).isSymbolicLink()
    )
      throw new Error("Invalid downloaded chapter directory.");
    const canonicalDir = fs.realpathSync(directory);
    if (!inside(canonicalRoot, canonicalDir))
      throw new Error("Downloaded chapter is outside the library.");
    const manifest = readJson(path.join(canonicalDir, "manifest.json"));
    if (
      manifest.chapterKey !== chapterKey ||
      !Array.isArray(manifest.pages) ||
      !manifest.pages.length
    )
      return null;
    const files = manifest.pages.map((page) => {
      if (
        typeof page.file !== "string" ||
        !/\.(png|jpe?g|webp|gif|bmp)$/i.test(page.file)
      )
        throw new Error("Unsupported downloaded page.");
      const file = path.resolve(canonicalDir, page.file);
      if (!inside(canonicalDir, file) || !fs.existsSync(file))
        throw new Error(
          "A downloaded page is missing. Download this chapter again."
        );
      if (
        fs.lstatSync(file).isSymbolicLink() ||
        !inside(canonicalDir, fs.realpathSync(file))
      )
        throw new Error("Downloaded page points outside its chapter.");
      return file;
    });
    return {
      paths: files,
      title: String(series.title || "Manga"),
      source: String(manifest.provider || ""),
    };
  }
  return null;
}
module.exports = { resolveChapter };
