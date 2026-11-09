import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('custom providers discover desktop bundles, refresh on desktop/mobile installs, and explain hidden sources', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/test-fixtures/custom-provider-discovery.ts', import.meta.url))], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    encoding: 'utf8',
    timeout: 15000,
  });
  if (result.status !== 0) throw Error(result.stderr || result.stdout || String(result.error));
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('Custom provider discovery: 7 scenarios passed');
  expect(result.stdout).toContain('Custom provider directory and hooks: cached and pending desktop/mobile install refresh passed');
  expect(result.stdout).toContain('Custom provider visibility: hidden-state explanation, settings link, and reveal passed');
}, 20000);
