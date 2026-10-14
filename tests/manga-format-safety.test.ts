import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
test("manga providers reject novel editions and accept verified comic readers", () => {
  const result = spawnSync(
    process.execPath,
    ["test", "scripts/manga-format-safety.test.ts"],
    { cwd: process.cwd(), encoding: "utf8", timeout: 30000 }
  );
  if (result.status !== 0)
    throw new Error(result.stderr || result.stdout || String(result.error));
  expect(result.status).toBe(0);
}, 35000);
