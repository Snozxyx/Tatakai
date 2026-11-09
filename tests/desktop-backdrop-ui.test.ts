import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
for (const scenario of ['drafts', 'saved-blur', 'saved-transparent', 'transparent-flow', 'older-bridge']) test(`desktop backdrop ${scenario} honors native state and commits only on Apply`, () => {
  const result = spawnSync(process.execPath, ['tests/fixtures/desktop-backdrop-ui.tsx', scenario], { cwd: process.cwd(), encoding: 'utf8', timeout: 20000 });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || String(result.error));
  expect(result.stdout).toContain('DESKTOP_BACKDROP_UI_OK');
}, 25000);
