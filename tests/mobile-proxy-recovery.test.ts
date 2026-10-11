import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
test('cached proxy recovery runs in an isolated native runtime', () => {
  const result = spawnSync(process.execPath, ['test', 'scripts/mobile-proxy-recovery.test.ts'], { cwd: process.cwd(), encoding: 'utf8', timeout: 30000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || String(result.error));
  expect(result.status).toBe(0);
}, 35000);
