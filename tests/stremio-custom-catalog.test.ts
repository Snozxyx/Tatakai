import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('hosted Stremio catalogs browse with independent raw offsets and explicit playback IDs', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/test-fixtures/stremio-custom-catalog.ts', import.meta.url))], {
    cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8', timeout: 15000,
  });
  if (result.status !== 0) throw Error(result.stderr || result.stdout || String(result.error));
  expect(result.stdout).toContain('Stremio custom catalog: pagination, explicit IDs, capabilities and headers passed');
}, 20000);
