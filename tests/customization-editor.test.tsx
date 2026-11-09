import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('appearance drafts cancel cleanly, save changed leaves, retain defaults, and isolate TV settings', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./fixtures/customization-editor.tsx', import.meta.url))], { cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8', timeout: 25000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || String(result.error));
  expect(result.stdout).toContain('CUSTOMIZATION_EDITOR_SAVE_CANCEL_RESET_OK');
}, 30000);
