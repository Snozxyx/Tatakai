import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';

test('desktop anime and manga interruption recovery uses real local HTTP and disk checkpoints', () => {
  const result = spawnSync(process.execPath, ['test', 'scripts/download-recovery.test.ts'], { encoding: 'utf8', timeout: 45_000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || String(result.error));
  expect(result.status).toBe(0);
}, 50_000);

test('mobile manga checkpoint and resume preference run in an isolated Capacitor runtime', () => {
  const result = spawnSync(process.execPath, ['test', 'scripts/mobile-manga-recovery.test.ts'], { encoding: 'utf8', timeout: 30_000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || String(result.error));
  expect(result.status).toBe(0);
}, 35_000);
