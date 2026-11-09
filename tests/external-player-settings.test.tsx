import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('an empty detected-player list allows browsing, saving and clearing a custom player in an isolated runtime', () => {
  const fixture = fileURLToPath(new URL('./fixtures/external-player-settings.tsx', import.meta.url));
  const result = spawnSync(process.execPath, [fixture], {
    cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8', timeout: 15000,
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || String(result.error));
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('CUSTOM_PLAYER_BROWSE_SAVE_CLEAR_OK');
}, 20000);
