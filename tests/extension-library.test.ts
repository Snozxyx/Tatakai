import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';
import { afterAll, describe, expect, it } from 'bun:test';
Dexie.dependencies.indexedDB = indexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;
const { db } = await import('../src/core/db/tatakai-db');
const { extensionLibrary, extensionTitleRoute, updateExtensionLibrary, libraryKey } = await import('../src/core/extensions/compatibility/library');
const { extensionChapterKey, extensionDownloadIdentity } = await import('../src/core/extensions/compatibility/downloads');
const previousWindow = globalThis.window;
if (!previousWindow) Object.defineProperty(globalThis, 'window', { value: new EventTarget(), configurable: true });
afterAll(async () => { await db.delete(); if (!previousWindow) delete (globalThis as any).window; });
describe('device-local extension identity and progress', () => {
  const title = { namespace: 'compat-mihon', sourceId: 'source-a', id: 'original-title', title: 'A title', kind: 'read' as const };
  it('separates profiles/sources and retains chapter progress and bookmarks across reopen', async () => {
    await updateExtensionLibrary('profile-a', title, { saved: true, progress: { id: 'chapter/1', label: 'Chapter 1', position: 3, duration: 20, completed: false, updatedAt: new Date().toISOString() } });
    await updateExtensionLibrary('profile-a', title, { progress: { id: 'chapter/2', label: 'Chapter 2', position: 1, duration: 20, completed: false, updatedAt: new Date().toISOString() } });
    await db.close(); await db.open();
    const [stored] = await extensionLibrary('profile-a');
    expect(stored.saved).toBe(true); expect(stored.entries['chapter/1'].position).toBe(3); expect(stored.latest).toBe('chapter/2');
    expect(extensionTitleRoute(stored)).toBe('/x/compat-mihon/source-a/read/original-title/chapter%2F2');
    expect(await extensionLibrary('profile-b')).toEqual([]);
    expect(libraryKey('profile-a', title)).not.toBe(libraryKey('profile-a', { ...title, sourceId: 'source-b' }));
  });
  it('uses reserved negative download IDs and distinct bounded chapter keys', async () => {
    const a = await extensionDownloadIdentity(title), b = await extensionDownloadIdentity({ ...title, sourceId: 'source-b' });
    expect(a).toBeLessThan(0); expect(Number.isSafeInteger(a)).toBe(true); expect(a).not.toBe(b);
    expect(await extensionDownloadIdentity(title)).toBe(a);
    const first = await extensionChapterKey('source-a', 'very-long-common-prefix/'.repeat(100) + 'one');
    const second = await extensionChapterKey('source-a', 'very-long-common-prefix/'.repeat(100) + 'two');
    expect(first).not.toBe(second); expect(first.length).toBeLessThan(120);
  });
});
