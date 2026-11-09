import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('catalog loading preserves TV focus, independent cursors and content filtering', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/test-fixtures/custom-catalog-more.tsx', import.meta.url))], {
    cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8', timeout: 15000,
  });
  if (result.status !== 0) throw Error(result.stderr || result.stdout || String(result.error));
  expect(result.stdout).toContain('Custom catalog controls: independent cursors, retry, adult filtering, focus and cancellation passed');
}, 20000);
