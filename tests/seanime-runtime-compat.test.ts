import { it, expect } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { seanimeAdapterFactory, buildSeanimeBundle } from '../src/core/extensions/remote/seanime';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { __tatakai_parse_html__ } = require('../desktop/runtime/extension/extension-worker-pool.cjs');

it('supports callable HTML selection and synchronous/awaited response readers', async () => {
  const adapter = seanimeAdapterFactory(`class Provider { async search() {
    const response = await fetch('https://fixture.test/search');
    const $ = LoadDoc(response.text());
    return $('a').map((i, el) => ({ id: el.attr('href'), title: el.text(), first: $('a').first().text() }));
  } }`, __tatakai_parse_html__, async () => new Response('<a href="one">Naruto</a><a href="two">Bleach</a>'));
  expect(await adapter.remoteSearch({})).toEqual([{ id: 'one', title: 'Naruto', first: 'Naruto' }, { id: 'two', title: 'Bleach', first: 'Naruto' }]);
});

it('reports upstream HTML/HTTP failures without leaking configured query parameters', async () => {
  const code = `class Provider { async search() { return (await fetch('https://fixture.test/api?token=private')).json(); } }`;
  const adapter = seanimeAdapterFactory(code, __tatakai_parse_html__, async () => new Response('<!DOCTYPE html>blocked', { status: 200 }));
  await expect(adapter.remoteSearch({})).rejects.toThrow('received HTML (HTTP 200)');
  const forbidden = seanimeAdapterFactory(code, __tatakai_parse_html__, async () => new Response('Forbidden', { status: 403 }));
  await expect(forbidden.remoteSearch({})).rejects.toThrow('Upstream HTTP 403 from fixture.test');
});

it('loads the HTML parser inside the real desktop worker', async () => {
  const bundle = await buildSeanimeBundle(`class Provider { search() { return LoadDoc('<a href="one">Naruto</a>')('a').map((i, el) => ({ id: el.attr('href'), title: el.text() })); } }`, 'javascript');
  const script = `const { ExtensionWorkerPool } = require('./desktop/runtime/extension/extension-worker-pool.cjs');
    (async () => { const pool = new ExtensionWorkerPool(); try {
      await pool.getOrSpawn('html-fixture', process.env.TATAKAI_TEST_BUNDLE, { permissions: [] });
      const result = await pool.invoke('html-fixture', 'remoteSearch', [{}]);
      const worker = await pool.getOrSpawn('html-fixture', process.env.TATAKAI_TEST_BUNDLE, { permissions: [] });
      const reused = await pool.getOrSpawn('html-fixture', process.env.TATAKAI_TEST_BUNDLE, { permissions: [] });
      if (worker !== reused) throw Error('Worker cache was lost');
      console.log('RESULT:' + JSON.stringify(result));
    } finally { pool.terminateAll(); } })().catch(e => { console.error(e); process.exitCode = 1; });`;
  const output = execFileSync(process.execPath.endsWith('bun.exe') ? 'node' : process.execPath, ['-e', script], { cwd: process.cwd(), env: { ...process.env, TATAKAI_TEST_BUNDLE: bundle }, encoding: 'utf8', timeout: 10000 });
  expect(JSON.parse(output.split('RESULT:')[1].trim())).toEqual([{ id: 'one', title: 'Naruto' }]);
});
