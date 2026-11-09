import { expect, test } from 'bun:test';

test('saved mixed-source shelves preserve filters, safety, source identity and pagination cursors', async () => {
  const child = Bun.spawn([process.execPath, 'run', 'tests/fixtures/customization-sources.tsx'], { cwd: process.cwd(), env: { ...process.env, NODE_ENV: 'production' }, stdout: 'pipe', stderr: 'pipe' });
  const [code, output, error] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  expect({ code, error: error.slice(-3000), output }).toEqual({ code: 0, error: '', output: 'customization source checks passed\n' });
}, 30000);
