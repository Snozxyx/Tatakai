import { expect, mock, test } from "bun:test";
const rows = new Map<string, any>();
let heldRead: Promise<any> | null = null;
mock.module("../src/core/db/tatakai-db", () => ({
  db: {
    kv: {
      get: async (key: string) => (heldRead ? await heldRead : rows.get(key)),
      put: async (row: any) => rows.set(row.key, row),
      delete: async (key: string) => rows.delete(key),
      where: () => ({
        startsWith: (prefix: string) => ({
          delete: async () => {
            for (const key of rows.keys())
              if (key.startsWith(prefix)) rows.delete(key);
          },
        }),
      }),
    },
  },
}));
mock.module("../src/lib/memoryProfile", () => ({
  getProfileKnobs: () => ({ cacheCaps: { extResult: 100 } }),
}));
const {
  writeCachedItems,
  readCachedItemsSync,
  hydrateCachedItems,
  clearCachedItemsByPrefix,
} = await import("../src/lib/cache/extensionResultCache");

test("Refresh deletes one manga from memory and storage and cancels queued chapter writes", async () => {
  const prefix = "manga-chapters::v2::42::";
  rows.set("xrc::" + prefix + "en", { value: "[1]" });
  rows.set("xrc::manga-chapters::v2::420::en", { value: "[2]" });
  rows.set("download-progress", { value: "preserved" });
  writeCachedItems(prefix + "en", [{ chapterNumber: 1 }], 10000);
  writeCachedItems(prefix + "es", [{ chapterNumber: 2 }], 10000);
  await clearCachedItemsByPrefix(prefix);
  await new Promise((resolve) => setTimeout(resolve, 450));
  expect(readCachedItemsSync(prefix + "en")).toBeNull();
  expect(await hydrateCachedItems(prefix + "en")).toBeNull();
  expect([...rows.keys()]).toEqual([
    "xrc::manga-chapters::v2::420::en",
    "download-progress",
  ]);
});
test("an old in-flight cache read cannot resurrect chapters after Refresh", async () => {
  let release!: (value: any) => void;
  heldRead = new Promise((resolve) => {
    release = resolve;
  });
  const read = hydrateCachedItems("manga-chapters::v2::42::en");
  await clearCachedItemsByPrefix("manga-chapters::v2::42::");
  release({ value: "[1]", ttl: 10, createdAt: new Date().toISOString() });
  expect(await read).toBeNull();
  expect(readCachedItemsSync("manga-chapters::v2::42::en")).toBeNull();
  heldRead = null;
});
