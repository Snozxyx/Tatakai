import { expect, test } from 'bun:test';

test('real card and home renderers preserve defaults, preview safely, and hide section queries', async () => {
  const child = Bun.spawn([process.execPath, 'run', 'tests/fixtures/customization-render.tsx'], { cwd: process.cwd(), env: { ...process.env, NODE_ENV: 'production' }, stdout: 'pipe', stderr: 'pipe' });
  const [code, output, error] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  expect({ code, error: error.slice(-4000), output }).toEqual({ code: 0, error: '', output: 'customization render checks passed\n' });
}, 30000);
