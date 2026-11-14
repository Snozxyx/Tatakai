import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';

test('chapter scene details require an explicit reveal until the spoiler warning is disabled', () => {
  const result = spawnSync(process.execPath, ['tests/fixtures/chapter-spoilers.tsx'], { cwd: process.cwd(), encoding: 'utf8', timeout: 30000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || String(result.error));
  expect(result.status).toBe(0);
}, 35000);
