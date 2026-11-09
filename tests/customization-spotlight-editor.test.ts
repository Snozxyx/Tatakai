import { expect, test } from 'bun:test';

test('Preferences Spotlight editor renders live source content and shares one template across media', async () => {
  const child = Bun.spawn([process.execPath, 'run', 'tests/fixtures/customization-spotlight-editor.tsx'], { cwd: process.cwd(), env: { ...process.env, NODE_ENV: 'test' }, stdout: 'pipe', stderr: 'pipe' });
  const [code, output, error] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  expect({ code, error: code ? error.slice(-4000) : '', output }).toEqual({ code: 0, error: '', output: 'preferences spotlight checks passed\n' });
}, 30000);
