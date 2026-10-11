import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';

test('manga download lifecycle records durable history in an isolated runtime', () => {
  const result = spawnSync(process.execPath, ['test', 'scripts/manga-download-history.test.ts'], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 30_000,
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || String(result.error));
  expect(result.status).toBe(0);
}, 35_000);
