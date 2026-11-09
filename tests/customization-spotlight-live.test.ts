import { expect, test } from 'bun:test';

test('spotlight settings open live preview automatically, update it immediately, and preserve snap layout after Save', async () => {
  const child = Bun.spawn([process.execPath, 'run', 'tests/fixtures/customization-spotlight-live.tsx'], { cwd: process.cwd(), env: { ...process.env, NODE_ENV: 'test' }, stdout: 'pipe', stderr: 'pipe' });
  const [code, output, error] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  expect({ code, error: code ? error.slice(-4000) : '', output }).toEqual({ code: 0, error: '', output: 'live spotlight checks passed\n' });
}, 30000);
