import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';

test('adult catalog adapters preserve identities, isolate caches, and retain chapter metadata', () => {
  const result = spawnSync(process.execPath, ['tests/fixtures/adult-surfaces.ts'], { cwd: process.cwd(), encoding: 'utf8', timeout: 30000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || String(result.error));
  expect(result.status).toBe(0);
}, 35000);
