import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('Stremio reconfiguration preserves identity and settings while synchronizing both catalog stores', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/test-fixtures/stremio-installation.ts', import.meta.url))], { encoding: 'utf8', timeout: 30000 });
  expect(result.error).toBeUndefined();
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  expect(result.status).toBe(0);
});
