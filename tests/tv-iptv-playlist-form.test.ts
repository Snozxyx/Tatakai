import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('TV playlist type, Xtream fields, Import and Cancel are reachable with a remote', () => {
  const fixture = fileURLToPath(new URL('./fixtures/tv-iptv-playlist-form.tsx', import.meta.url));
  const result = spawnSync(process.execPath, [fixture], { cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8', timeout: 15000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || String(result.error));
  expect(result.stdout).toContain('TV_IPTV_REMOTE_IMPORT_CANCEL_OK');
}, 20000);
