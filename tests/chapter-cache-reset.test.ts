import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
test("chapter refresh clears persistent snapshots safely", () => {
  const result = spawnSync(
    process.execPath,
    ["test", "scripts/chapter-cache-reset.test.ts"],
    { cwd: process.cwd(), encoding: "utf8", timeout: 15000 }
  );
  if (result.status !== 0)
    throw new Error(result.stderr || result.stdout || String(result.error));
  expect(result.status).toBe(0);
}, 20000);
