import { beforeEach, describe, expect, it } from 'bun:test';
import {
  clearLocalTorrentSessionHistory,
  getLocalTorrentSessionHistory,
  getLocalTorrentSessionHistoryEnabled,
  setLocalTorrentSessionHistoryEnabled,
  updateLocalTorrentSessionHistory,
  upsertLocalTorrentSessionHistory,
} from '../src/lib/localStorage';

const makeStorage = () => {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
    _store: store,
  };
};

describe('torrent session history storage', () => {
  const storage = makeStorage();

  beforeEach(() => {
    storage.clear();
    globalThis.localStorage = storage;
    setLocalTorrentSessionHistoryEnabled(true);
    clearLocalTorrentSessionHistory();
  });

  it('stores and updates torrent sessions', () => {
    upsertLocalTorrentSessionHistory({
      sessionId: 'session-1',
      infoHash: 'hash-1',
      torrentName: 'Example Torrent',
      animeId: 'anime-1',
      animeName: 'Example Anime',
      episodeId: 'ep-1',
      episodeNumber: 1,
      fileName: 'episode01.mp4',
      fileIndex: 0,
      status: 'active',
      startedAt: '2026-05-11T00:00:00.000Z',
      updatedAt: '2026-05-11T00:00:00.000Z',
    });

    updateLocalTorrentSessionHistory('session-1', {
      status: 'completed',
      endedAt: '2026-05-11T01:00:00.000Z',
      progress: 100,
    });

    const sessions = getLocalTorrentSessionHistory();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].status).toBe('completed');
    expect(sessions[0].progress).toBe(100);
    expect(sessions[0].endedAt).toBe('2026-05-11T01:00:00.000Z');
  });

  it('respects the enable toggle', () => {
    setLocalTorrentSessionHistoryEnabled(false);
    upsertLocalTorrentSessionHistory({
      sessionId: 'session-2',
      torrentName: 'Disabled Torrent',
      animeName: 'Disabled Anime',
      animeId: 'anime-2',
      episodeId: 'ep-2',
      episodeNumber: 2,
      fileName: 'episode02.mp4',
      fileIndex: 0,
      status: 'active',
    });

    expect(getLocalTorrentSessionHistoryEnabled()).toBe(false);
    expect(getLocalTorrentSessionHistory()).toHaveLength(0);
  });

  it('clears torrent history', () => {
    upsertLocalTorrentSessionHistory({
      sessionId: 'session-3',
      torrentName: 'Clear Me',
      animeName: 'Clear Anime',
      animeId: 'anime-3',
      episodeId: 'ep-3',
      episodeNumber: 3,
      fileName: 'episode03.mp4',
      fileIndex: 0,
      status: 'active',
    });

    clearLocalTorrentSessionHistory();
    expect(getLocalTorrentSessionHistory()).toHaveLength(0);
  });
});
