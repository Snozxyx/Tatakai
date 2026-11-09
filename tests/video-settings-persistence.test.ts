import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';

test('video settings retain edits across consumers, drawer mounts and account hydration', () => {
  // Keep the AuthContext/Supabase fixture mocks out of the shared test process.
  const result = spawnSync(process.execPath, ['test', 'scripts/video-settings-persistence.test.tsx'], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 20000,
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || String(result.error));
  expect(result.status).toBe(0);
}, 25000);
