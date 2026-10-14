import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
test("built-in MangaDex catalog and reading work without installed extensions", () => {
  const result = spawnSync(
    process.execPath,
    ["test", "scripts/mangadex-direct.test.ts"],
    { cwd: process.cwd(), encoding: "utf8", timeout: 30000 }
  );
  if (result.status !== 0)
    throw new Error(result.stderr || result.stdout || String(result.error));
  expect(result.status).toBe(0);
}, 35000);
