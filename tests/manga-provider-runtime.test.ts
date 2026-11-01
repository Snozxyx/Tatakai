import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';

test('manga provider metadata survives native transports and diagnostics replace old titles', () => {
  const result = spawnSync(process.execPath, ['test', 'scripts/manga-provider-runtime.test.ts'], { cwd: process.cwd(), encoding: 'utf8', timeout: 15000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || String(result.error));
  expect(result.status).toBe(0);
});
