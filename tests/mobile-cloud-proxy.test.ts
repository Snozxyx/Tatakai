import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';

test('cloud fallback URL and exclusion contracts pass in an isolated runtime', () => {
  const result = spawnSync(process.execPath, ['test', 'scripts/mobile-cloud-proxy.test.ts'], { cwd: process.cwd(), encoding: 'utf8', timeout: 30000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || String(result.error));
  expect(result.status).toBe(0);
}, 35000);
