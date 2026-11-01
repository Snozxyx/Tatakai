import { expect, test } from 'bun:test';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
const require = createRequire(import.meta.url);
const { createHostApp } = require('../desktop/runtime/extension-api-host/host-server.cjs');

test('desktop chapter flattening and caching preserve every upstream and its display name', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'manga-host-'));
  const bundlePath = join(dir, 'bundle.cjs');
  const sources = ['MangaK', 'Other group'].map((name, index) => ({
    provider: `atsu@group-${index}`, providerName: `Atsu · ${name}`, scanlator: name,
    chapterKey: `atsu@group-${index}:series|chapter-${index}`, providerChapterId: `chapter-${index}`, language: 'en',
  }));
  writeFileSync(bundlePath, `module.exports={getMangaChapters:async()=>[{number:1,sources:${JSON.stringify(sources)}}]};`);
  const entry = { bundlePath, manifest: { id: 'fixture', apiServer: { namespace: 'fixture', routes: ['manga/chapters'] }, capabilities: ['manga'] } };
  const host = createHostApp({ registry: { listLoaded: () => ['fixture'], lookup: () => entry } });
  const server = createServer(host.handler);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = `http://127.0.0.1:${(server.address() as any).port}/api/v3/fixture/manga/chapters?title=Fixture`;
    for (const cached of [false, true]) {
      const result = await (await fetch(url)).json();
      expect(result.cached).toBe(cached);
      expect(result.chapters).toHaveLength(2);
      sources.forEach((source, index) => expect(result.chapters[index]).toMatchObject(source));
    }
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
    rmSync(dir, { recursive: true, force: true });
  }
});
