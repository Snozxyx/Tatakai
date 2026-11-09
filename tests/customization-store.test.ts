import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
test('appearance preferences and images remain offline and device-local', () => {
  const result = spawnSync(process.execPath, ['test', 'scripts/customization-store.test.tsx'], { cwd: process.cwd(), encoding: 'utf8', timeout: 30000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || String(result.error));
  expect(result.status).toBe(0);
}, 35000);
