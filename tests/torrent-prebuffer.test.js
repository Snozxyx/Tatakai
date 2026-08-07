import { afterEach, describe, expect, it } from 'bun:test';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { createPlaybackManifest, waitForPrebuffer } = require('../desktop/runtime/torrent/streaming/stream-bridge.cjs');

let originalNow = Date.now;

afterEach(() => {
  Date.now = originalNow;
});

function makeTorrent(readyPieces) {
  return {
    done: false,
    downloadSpeed: 1024 * 1024,
    pieceLength: 256 * 1024,
    length: 10 * 1024 * 1024,
    downloaded: 8 * 1024 * 1024,
    bitfield: {
      get(index) {
        return readyPieces.has(index);
      },
    },
    files: [
      {
        name: 'episode.mkv',
        path: 'episode.mkv',
        offset: 0,
        length: 10 * 1024 * 1024,
        downloaded: 8 * 1024 * 1024,
      },
    ],
  };
}

describe('torrent prebuffer guard', () => {
  it('does not mark sparse files ready when byte zero is missing', async () => {
    let calls = 0;
    Date.now = () => (calls++ === 0 ? 0 : 91_000);

    const torrent = makeTorrent(new Set([10, 11, 12, 39]));
    const result = await waitForPrebuffer(torrent, 0, 512 * 1024);

    expect(result.ready).toBe(false);
    expect(result.reason).toBe('prebuffer_timeout');
  });

  it('marks MKV ready only after leading pieces and some metadata pieces exist', async () => {
    const torrent = makeTorrent(new Set([0, 1, 36, 37, 38, 39]));
    const result = await waitForPrebuffer(torrent, 0, 512 * 1024);

    expect(result.ready).toBe(true);
  });

  it('does not hand the player a URL when prebuffer times out', async () => {
    let calls = 0;
    Date.now = () => (calls++ === 0 ? 0 : 91_000);

    const torrent = makeTorrent(new Set([10, 11, 12, 39]));
    const result = await createPlaybackManifest(
      { sessionId: 'session-1', fileIndex: 0 },
      async () => ({ success: true, url: 'http://127.0.0.1/video', fileIndex: 0 }),
      torrent,
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('prebuffer_timeout');
    expect(result.url).toBe(null);
  });
});
