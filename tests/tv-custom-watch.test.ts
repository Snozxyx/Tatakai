import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('Android TV custom streams use native playback and remote source selection', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/test-fixtures/tv-custom-watch.tsx', import.meta.url))], {
    cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8', timeout: 15000,
  });
  if (result.status !== 0) throw Error(result.stderr || result.stdout || String(result.error));
  expect(result.stdout).toContain('TV custom watch: native playback, quality selection, explicit IDs and progress passed');
}, 20000);
