import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
test('custom theme drafts resolve without publishing, committed palettes remain isolated, and deletion falls back safely', () => {
  const result = spawnSync(process.execPath, ['tests/fixtures/custom-theme-registry.tsx'], { cwd: process.cwd(), encoding: 'utf8', timeout: 20000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || String(result.error));
  expect(result.stdout).toContain('CUSTOM_THEME_REGISTRY_OK');
}, 25000);
