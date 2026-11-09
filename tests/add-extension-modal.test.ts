import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('addon previews reject stale reads and mismatches, preserve cancellation, and save configured addons', () => {
  const fixture = fileURLToPath(new URL('./fixtures/add-extension-modal.tsx', import.meta.url));
  const result = spawnSync(process.execPath, [fixture], {
    cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8', timeout: 20000,
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || String(result.error));
  expect(result.stdout).toContain('ADD_EXTENSION_PREVIEW_CONFIGURATION_OK');
}, 25000);
