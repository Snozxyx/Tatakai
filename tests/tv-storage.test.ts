import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';
import { expect, test } from 'bun:test';
Dexie.dependencies.indexedDB = indexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;

test('TV schema upgrade preserves existing history, extensions and offline stores', async () => {
  const original = new Dexie('tatakai');
  original.version(7).stores({ cachedMedia: 'id', watchProgress: 'id,mediaId,updatedAt', offlineEpisodes: 'id', extensions: 'id', kv: 'key', downloadRules: 'id', downloadHistory: 'id', offlineChapters: 'id', mobileExtensionBundles: 'id', offlineNovels: 'id' });
  await original.table('watchProgress').put({ id: 'show:episode', mediaId: 'show', progress: 420 });
  await original.table('mobileExtensionBundles').put({ id: 'extension', enabled: true });
  await original.table('offlineEpisodes').put({ id: 'offline', localPath: '/device/file.mkv' });
  original.close();
  const { db } = await import('../src/core/db/tatakai-db');
  await db.open();
  expect(db.verno).toBe(8);
  expect((await db.watchProgress.get('show:episode'))?.progress).toBe(420);
  expect((await db.mobileExtensionBundles.get('extension'))?.enabled).toBe(true);
  expect((await db.offlineEpisodes.get('offline'))?.localPath).toBe('/device/file.mkv');
  expect(db.tables.map(table => table.name)).toContain('iptvPrograms');
});

test('failed and cancelled playlist refreshes preserve playable cached channels and encrypted source references', async () => {
  const { db } = await import('../src/core/db/tatakai-db');
  const { savePlaylist, readStream } = await import('../src/core/iptv/iptvStorage');
  const originalFetch = globalThis.fetch;
  let playlistText = '#EXTM3U\n#EXTINF:-1 tvg-id="shared",HD\n#EXTHTTP:{"Authorization":"Bearer fixture-secret"}\nhttps://example.com/hd?token=fixture-secret\n#EXTINF:-1 tvg-id="shared",SD\nhttps://example.com/sd';
  globalThis.fetch = (async () => new Response(playlistText)) as typeof fetch;
  try {
    const playlist = await savePlaylist('Fixture', { kind: 'm3u', url: 'https://example.com/list?password=fixture-secret' });
    const channels = await db.iptvChannels.where('playlistId').equals(playlist.id).toArray();
    expect(channels).toHaveLength(2);
    expect(new Set(channels.map(channel => channel.id)).size).toBe(2);
    expect(JSON.stringify(await db.iptvPlaylists.toArray())).not.toContain('fixture-secret');
    expect(JSON.stringify(channels)).not.toContain('fixture-secret');
    playlistText = '#EXTM3U\n#EXT-X-TARGETDURATION:10\n#EXTINF:10,\na.ts';
    await expect(savePlaylist('Fixture', { kind: 'm3u', url: 'https://example.com/broken' }, playlist)).rejects.toThrow('HLS');
    expect(await readStream(channels.find(channel => channel.name === 'HD')!)).toMatchObject({ headers: { Authorization: 'Bearer fixture-secret' } });
    expect((await db.iptvPlaylists.get(playlist.id))?.credentialRef).toBe(playlist.credentialRef);
    playlistText = '#EXTM3U\n#EXTINF:-1,New\nhttps://example.com/new';
    const cancel = new AbortController(); cancel.abort();
    await expect(savePlaylist('Fixture', { kind: 'm3u', url: 'https://example.com/new-list' }, playlist, cancel.signal)).rejects.toThrow();
    expect(await db.iptvChannels.where('playlistId').equals(playlist.id).count()).toBe(2);
  } finally { globalThis.fetch = originalFetch; }
});
