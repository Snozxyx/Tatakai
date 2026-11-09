import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
test('launcher drafts and Cancel never change OS icons; Save and committed auto mode do', () => {
  const result = spawnSync(process.execPath, ['tests/fixtures/branding-selector.tsx'], { cwd: process.cwd(), encoding: 'utf8', timeout: 20000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || String(result.error));
  expect(result.stdout).toContain('BRANDING_PREVIEW_SAVE_CANCEL_OK');
}, 25000);
