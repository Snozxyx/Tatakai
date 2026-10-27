import { expect, test } from 'bun:test';
import { serverMappedChapters, serverMappedPages } from '../src/core/extensions/server/client';

test('server manga providers remain distinct and page requests retain upstream identities', async () => {
  const originalFetch = globalThis.fetch;
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const invoked: any[] = [];
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: () => JSON.stringify([{ id: 'fixture', serverId: 'fixture', url: 'https://fixture.example', token: '', enabled: true, name: 'Fixture' }]),
  } });
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    const payload = init?.body ? JSON.parse(String(init.body)) : null;
    if (payload) invoked.push(payload);
    const data = input.endsWith('/sources') ? [{ id: 'bundle~read', extensionId: 'bundle', name: 'Bundle', ecosystem: 'tatakai', kind: 'read', available: true }]
      : payload.op === 'chapters' ? { chapters: [{ number: 1, sources: ['fast', 'slow'].map(provider => ({ provider, chapterKey: provider + ':1', providerChapterId: provider + '-private' })) }], partial: false }
      : [{ imageUrl: 'https://fixture.example/page.jpg' }];
    return Response.json({ success: true, data });
  }) as typeof fetch;
  try {
    const result = await serverMappedChapters({ anilistId: 42, title: 'Fixture' });
    const sources = result.chapters[0].sources;
    expect(new Set(sources.map((source: any) => source.provider)).size).toBe(2);
    expect(sources[1].providerName).toBe('slow · Bundle · Fixture');
    const pages = await serverMappedPages({ extensionId: sources[1].provider, chapterKey: sources[1].chapterKey, providerChapterId: sources[1].providerChapterId });
    expect(pages.success).toBe(true);
    expect(invoked.at(-1).sourceId).toBe('bundle~read');
    expect(invoked.at(-1).args.provider).toBe('slow');
    expect(invoked.at(-1).args.chapterKey).toBe('slow:1');
    expect(invoked.at(-1).args.providerChapterId).toBe('slow-private');
  } finally {
    globalThis.fetch = originalFetch;
    if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
    else delete (globalThis as any).localStorage;
  }
});
