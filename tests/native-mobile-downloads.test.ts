import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';

// Capacitor mocks must not leak into other tests in the shared Bun process.
test('native mobile bridge integration runs in an isolated Capacitor runtime', () => {
  const result = spawnSync(process.execPath, ['test', 'scripts/native-mobile-download-bridge.test.ts'], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 30_000,
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || String(result.error));
  expect(result.status).toBe(0);
}, 35_000);
