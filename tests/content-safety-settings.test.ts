import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';

test('Adult Mode settings require confirmation, update every consumer, and keep the mode in memory', () => {
  // Isolate AuthContext and persistence mocks from the other application tests.
  const result = spawnSync(process.execPath, ['tests/fixtures/content-safety-settings.tsx'], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 30000,
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || String(result.error));
  expect(result.status).toBe(0);
}, 35000);
