import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
test('branding assets preserve interior artwork and declare OS appearance variants in Node', () => {
  const result = spawnSync('node', ['scripts/check-branding-assets.mjs'], { cwd: process.cwd(), encoding: 'utf8', timeout: 20000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  expect(result.stdout).toContain('BRANDING_ASSETS_OK');
}, 25000);
