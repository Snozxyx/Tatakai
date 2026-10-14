import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
test("MangaUpdates mapping, release metadata, and refresh regressions", () => {
  const result = spawnSync(
    process.execPath,
    ["test", "scripts/mangaupdates-catalog.test.ts"],
    { cwd: process.cwd(), encoding: "utf8", timeout: 30000 }
  );
  if (result.status !== 0)
    throw new Error(result.stderr || result.stdout || String(result.error));
  expect(result.status).toBe(0);
}, 35000);
