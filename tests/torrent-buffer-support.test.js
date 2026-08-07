/**
 * Unit tests for .torrent buffer support in TorrentSessionManager and TorrentFacade.
 *
 * **Task 2.6: Add .torrent buffer support to TorrentSessionManager.start() and TorrentFacade**
 *
 * **Validates: Requirements 5.1, 5.2, 5.3**
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { TorrentSessionManager } = require('../desktop/runtime/torrent/session/session-manager.cjs');
const { TorrentFacade } = require('../desktop/runtime/torrent/facade.cjs');

// ---------------------------------------------------------------------------
// Mock WebTorrent client factory
// ---------------------------------------------------------------------------

function makeFakeTorrent(
    infoHash = 'aabbccddeeff00112233445566778899aabbccdd',
    overrides = {},
) {
    return {
        name: overrides.name || 'Test Torrent from Buffer',
        infoHash: overrides.infoHash || infoHash,
        length: overrides.length || 1024 * 1024 * 100, // 100 MB
        files: overrides.files || [
            { name: 'episode01.mkv', path: 'episode01.mkv', length: 1024 * 1024 * 100 },
        ],
        progress: 0,
        downloadSpeed: 0,
        uploadSpeed: 0,
        numPeers: 0,
        ratio: 0,
        done: false,
        _trackers: [],
        on: () => {},
    };
}

function makeMockClient({ simulateTimeout = false, fakeTorrent = null } = {}) {
    const torrent = fakeTorrent ?? makeFakeTorrent();
    const addedSources = [];
    const removedTorrents = [];

    const client = {
        _addedSources: addedSources,
        _removedTorrents: removedTorrents,
        _torrent: torrent,

        add(source, opts, cb) {
            addedSources.push({ source, opts });
            if (!simulateTimeout && typeof cb === 'function') {
                Promise.resolve().then(() => cb(torrent));
            }
            return torrent;
        },

        remove(t, opts, cb) {
            removedTorrents.push({ torrent: t, opts });
            if (typeof cb === 'function') {
                Promise.resolve().then(() => cb(null));
            }
        },

        createServer() {
            return {
                listen(port, host, cb) {
                    setTimeout(() => cb(), 0);
                },
                address() {
                    return { port: 8888 };
                },
                once() {},
            };
        },

        on() {},
        once() {},
    };

    return client;
}

function makeManagerWithMockClient(mockClient) {
    const mockFs = {
        existsSync: () => true,
        mkdirSync: () => {},
        readdirSync: () => [],
        statSync: () => ({ size: 0 }),
        promises: {
            readdir: async () => [],
            stat: async () => ({ size: 0 }),
            unlink: async () => {},
        },
    };

    const mockApp = {
        getPath: (name) => `/tmp/tatakai-test/${name}`,
    };

    const mockPath = {
        join: (...args) => args.join('/'),
        basename: (p) => p.split('/').pop(),
        resolve: (...args) => args.join('/'),
    };

    const mockLogger = {
        info: () => {},
        warn: () => {},
        error: () => {},
    };

    const manager = new TorrentSessionManager({
        app: mockApp,
        fs: mockFs,
        path: mockPath,
        logger: mockLogger,
        getMainWindow: () => null,
    });

    // Inject the mock client
    manager._client = mockClient;

    return manager;
}

// ---------------------------------------------------------------------------
// Unit Tests
// ---------------------------------------------------------------------------

describe('TorrentSessionManager — .torrent buffer support', () => {
    let mockClient;
    let manager;

    beforeEach(() => {
        mockClient = makeMockClient();
        manager = makeManagerWithMockClient(mockClient);
    });

    it('accepts a valid .torrent buffer and uses it as the torrent source', async () => {
        const validBuffer = Buffer.from('d8:announce44:http://tracker.example.com:8080/announce4:infod6:lengthi1024e4:name12:test.torrent12:piece lengthi16384e6:pieces20:xxxxxxxxxxxxxxxxxxxx7:privatei1eee');

        const result = await manager.start(null, { torrentBuffer: validBuffer });

        expect(result.success).toBe(true);
        expect(result.sessionId).toBeDefined();
        expect(mockClient._addedSources.length).toBe(1);
        expect(Buffer.isBuffer(mockClient._addedSources[0].source)).toBe(true);
    });

    it('converts ArrayBuffer to Buffer before validation', async () => {
        const arrayBuffer = new Uint8Array([0x64, 0x38, 0x3a]).buffer;

        const result = await manager.start(null, { torrentBuffer: arrayBuffer });

        expect(result.success).toBe(true);
        expect(mockClient._addedSources.length).toBe(1);
        expect(Buffer.isBuffer(mockClient._addedSources[0].source)).toBe(true);
    });

    it('returns error for invalid .torrent buffer (empty)', async () => {
        const emptyBuffer = Buffer.from([]);

        const result = await manager.start(null, { torrentBuffer: emptyBuffer });

        expect(result.success).toBe(false);
        expect(result.error).toBe('invalid_torrent_buffer');
        expect(mockClient._addedSources.length).toBe(0);
    });

    it('returns error for invalid .torrent buffer (wrong start byte)', async () => {
        const invalidBuffer = Buffer.from([0x00, 0x01, 0x02, 0x03]);

        const result = await manager.start(null, { torrentBuffer: invalidBuffer });

        expect(result.success).toBe(false);
        expect(result.error).toBe('invalid_torrent_buffer');
        expect(mockClient._addedSources.length).toBe(0);
    });

    it('prefers torrentBuffer over magnet when both are provided', async () => {
        const validBuffer = Buffer.from('d8:announce44:http://tracker.example.com:8080/announce4:infod6:lengthi1024eee');
        const magnet = 'magnet:?xt=urn:btih:aabbccddeeff00112233445566778899aabbccdd';

        const result = await manager.start(magnet, { torrentBuffer: validBuffer });

        expect(result.success).toBe(true);
        expect(Buffer.isBuffer(mockClient._addedSources[0].source)).toBe(true);
    });

    it('selects the supported video file inside a mixed torrent', async () => {
        const validBuffer = Buffer.from('d8:announce44:http://tracker.example.com:8080/announce4:infod6:lengthi1024eee');
        const mixedTorrent = makeFakeTorrent(undefined, {
            files: [
                { name: 'notes.txt', path: 'notes.txt', length: 1024 },
                { name: 'episode01.mp4', path: 'episode01.mp4', length: 1024 * 1024 * 40 },
                { name: 'sample.nfo', path: 'sample.nfo', length: 512 },
            ],
            length: 1024 * 1024 * 40,
        });

        const mixedClient = makeMockClient({ fakeTorrent: mixedTorrent });
        const mixedManager = makeManagerWithMockClient(mixedClient);

        const result = await mixedManager.start(null, { torrentBuffer: validBuffer });

        expect(result.success).toBe(true);
        expect(result.fileName).toBe('episode01.mp4');
    });

    it('matches folder-based season packs by season and episode', async () => {
        const validBuffer = Buffer.from('d8:announce44:http://tracker.example.com:8080/announce4:infod6:lengthi1024eee');
        const seasonPack = makeFakeTorrent(undefined, {
            name: 'Great Anime Complete Season Pack',
            files: [
                { name: 'Episode 03.mkv', path: 'Season 1/Episode 03.mkv', length: 1024 * 1024 * 40 },
                { name: 'Episode 03.mkv', path: 'Season 2/Episode 03.mkv', length: 1024 * 1024 * 41 },
                { name: 'Episode 04.mkv', path: 'Season 2/Episode 04.mkv', length: 1024 * 1024 * 42 },
            ],
            length: 1024 * 1024 * 123,
        });

        const seasonClient = makeMockClient({ fakeTorrent: seasonPack });
        const seasonManager = makeManagerWithMockClient(seasonClient);

        const result = await seasonManager.start(null, {
            torrentBuffer: validBuffer,
            episode: 3,
            season: 2,
        });

        expect(result.success).toBe(true);
        expect(result.fileIndex).toBe(1);
        expect(result.selectedFile.path).toBe('Season 2/Episode 03.mkv');
        expect(result.detectedEpisodes).toEqual([3, 4]);
        expect(result.seasonOrganization).toEqual([
            { season: 1, episodeCount: 1, episodes: [3], totalBytes: 1024 * 1024 * 40 },
            { season: 2, episodeCount: 2, episodes: [3, 4], totalBytes: 1024 * 1024 * 83 },
        ]);
    });

    it('defaults season packs to the first detected episode when no episode is requested', async () => {
        const validBuffer = Buffer.from('d8:announce44:http://tracker.example.com:8080/announce4:infod6:lengthi1024eee');
        const seasonPack = makeFakeTorrent(undefined, {
            name: 'Great Anime Complete Season Pack',
            files: [
                { name: 'Episode 03.mkv', path: 'Season 1/Episode 03.mkv', length: 1024 * 1024 * 40 },
                { name: 'Episode 03.mkv', path: 'Season 2/Episode 03.mkv', length: 1024 * 1024 * 41 },
                { name: 'Episode 04.mkv', path: 'Season 2/Episode 04.mkv', length: 1024 * 1024 * 42 },
            ],
            length: 1024 * 1024 * 123,
        });

        const seasonClient = makeMockClient({ fakeTorrent: seasonPack });
        const seasonManager = makeManagerWithMockClient(seasonClient);

        const result = await seasonManager.start(null, {
            torrentBuffer: validBuffer,
        });

        expect(result.success).toBe(true);
        expect(result.fileIndex).toBe(0);
        expect(result.selectedFile.path).toBe('Season 1/Episode 03.mkv');
        expect(result.selectionReason).toBe('first_detected_episode');
    });

    it('restores the current torrent session through the new restore API', async () => {
        const validBuffer = Buffer.from('d8:announce44:http://tracker.example.com:8080/announce4:infod6:lengthi1024eee');
        const restoreClient = makeMockClient({ fakeTorrent: makeFakeTorrent('restore-hash') });
        const restoreManager = makeManagerWithMockClient(restoreClient);
        const startCalls = [];

        restoreManager.start = async (infoHash, options = {}) => {
            startCalls.push({ infoHash, options });
            return {
                success: true,
                sessionId: 'restored-session',
                infoHash: String(infoHash),
                fileIndex: options.fileIndex ?? 0,
            };
        };

        const result = await restoreManager.restoreSession(
            [{ infoHash: 'stage-hash' }],
            [{ infoHash: 'seed-hash' }],
            [{ infoHash: 'complete-hash' }],
            {
                infoHash: 'restore-hash',
                fileIndex: 2,
                options: { torrentBuffer: validBuffer },
            },
        );

        expect(result.success).toBe(true);
        expect(result.restored).toEqual({ staging: 1, seeding: 1, completed: 1 });
        expect(startCalls).toHaveLength(1);
        expect(startCalls[0].infoHash).toBe('restore-hash');
        expect(startCalls[0].options.fileIndex).toBe(2);
        expect(startCalls[0].options.torrentBuffer).toBe(validBuffer);
        expect(result.current.sessionId).toBe('restored-session');
    });

    it('kills session-scoped transcodes when a torrent session is stopped', async () => {
        const sessionTorrent = makeFakeTorrent('transcode-hash', {
            files: [{ name: 'episode01.mkv', path: 'episode01.mkv', length: 1024 * 1024 * 40 }],
        });
        const transcodeClient = makeMockClient({ fakeTorrent: sessionTorrent });
        const transcodeManager = makeManagerWithMockClient(transcodeClient);
        const proc = {
            killed: false,
            kill(signal) {
                this.killed = signal;
            },
        };

        transcodeManager._sessions.set('session-transcode', {
            torrent: sessionTorrent,
            sessionId: 'session-transcode',
            startedAt: Date.now(),
        });
        transcodeManager._sessionTranscodes.set('session-transcode', new Set([proc]));
        transcodeManager._activeTranscodes.add(proc);

        const result = await transcodeManager.stop('session-transcode');

        expect(result.success).toBe(true);
        expect(proc.killed).toBe('SIGKILL');
        expect(transcodeManager._sessionTranscodes.has('session-transcode')).toBe(false);
        expect(transcodeManager._activeTranscodes.has(proc)).toBe(false);
    });

    it('blocks torrents with no playable video files', async () => {
        const validBuffer = Buffer.from('d8:announce44:http://tracker.example.com:8080/announce4:infod6:lengthi1024eee');
        const unsupportedTorrent = makeFakeTorrent(undefined, {
            files: [
                { name: 'readme.txt', path: 'readme.txt', length: 1024 },
                { name: 'cover.jpg', path: 'cover.jpg', length: 2048 },
            ],
            length: 3072,
        });

        const unsupportedClient = makeMockClient({ fakeTorrent: unsupportedTorrent });
        const unsupportedManager = makeManagerWithMockClient(unsupportedClient);

        const result = await unsupportedManager.start(null, { torrentBuffer: validBuffer });

        expect(result.success).toBe(false);
        expect(result.blocked).toBe(true);
        expect(String(result.error || '')).toContain('UNSUPPORTED_MEDIA');
        expect(unsupportedClient._removedTorrents.length).toBe(1);
    });

    it('previews a torrent buffer and returns playable-file metadata', async () => {
        const previewTorrent = makeFakeTorrent(undefined, {
            files: [
                { name: 'notes.txt', path: 'notes.txt', length: 1024 },
                { name: 'episode01.mp4', path: 'episode01.mp4', length: 1024 * 1024 * 40 },
                { name: 'episode02.mp4', path: 'episode02.mp4', length: 1024 * 1024 * 39 },
            ],
            length: 1024 * 1024 * 80,
        });

        const previewClient = makeMockClient({ fakeTorrent: previewTorrent });
        const previewManager = makeManagerWithMockClient(previewClient);

        const validBuffer = Buffer.from('d8:announce44:http://tracker.example.com:8080/announce4:infod6:lengthi1024eee');
        const result = await previewManager.preview(validBuffer);

        expect(result.success).toBe(true);
        expect(Array.isArray(result.playableFiles)).toBe(true);
        expect(result.playableFiles.length).toBe(2);
        expect(result.detectedEpisodes).toEqual([1, 2]);
    });

    it('builds a WebTorrent stream URL under /webtorrent and preserves nested file paths', async () => {
        const torrent = makeFakeTorrent(undefined, {
            files: [
                {
                    name: 'Episode 01.mp4',
                    path: 'Season 1/Episode 01.mp4',
                    length: 1024 * 1024 * 42,
                },
            ],
        });

        const streamClient = makeMockClient({ fakeTorrent: torrent });
        const streamManager = makeManagerWithMockClient(streamClient);

        streamManager._sessions.set('session-stream', {
            torrent,
            targetFileIndex: 0,
        });

        const result = await streamManager.stream('session-stream', 0);

        expect(result.success).toBe(true);
        expect(result.url).toBe(
            'http://127.0.0.1:8888/' +
            torrent.infoHash +
            '/0'
        );
    });
});

describe('TorrentFacade — startFromBuffer()', () => {
    let mockClient;
    let manager;
    let facade;

    beforeEach(() => {
        mockClient = makeMockClient();
        manager = makeManagerWithMockClient(mockClient);

        const mockApp = { getPath: () => '/tmp/test' };
        const mockFs = {
            existsSync: () => true,
            mkdirSync: () => {},
            readdirSync: () => [],
            statSync: () => ({ size: 0 }),
            promises: {
                readdir: async () => [],
                stat: async () => ({ size: 0 }),
                unlink: async () => {},
            },
        };
        const mockPath = { join: (...args) => args.join('/'), basename: (p) => p.split('/').pop() };
        const mockLogger = { info: () => {}, warn: () => {}, error: () => {} };

        facade = new TorrentFacade({
            app: mockApp,
            fs: mockFs,
            path: mockPath,
            logger: mockLogger,
            getMainWindow: () => null,
        });

        // Inject the mock client into the facade's session manager
        facade._sessions._client = mockClient;
    });

    it('converts ArrayBuffer to Buffer and delegates to start()', async () => {
        const arrayBuffer = new Uint8Array([0x64, 0x38, 0x3a]).buffer; // 'd8:'

        const result = await facade.startFromBuffer(arrayBuffer, {});

        expect(result.success).toBe(true);
        expect(mockClient._addedSources.length).toBe(1);
        expect(Buffer.isBuffer(mockClient._addedSources[0].source)).toBe(true);
    });

    it('passes Buffer directly to start() without conversion', async () => {
        const buffer = Buffer.from('d8:announce44:http://tracker.example.com:8080/announce4:infod6:lengthi1024eee');

        const result = await facade.startFromBuffer(buffer, {});

        expect(result.success).toBe(true);
        expect(mockClient._addedSources.length).toBe(1);
        expect(mockClient._addedSources[0].source).toBe(buffer);
    });

    it('returns error for invalid buffer', async () => {
        const invalidBuffer = Buffer.from([0x00, 0x01, 0x02]);

        const result = await facade.startFromBuffer(invalidBuffer, {});

        expect(result.success).toBe(false);
        expect(result.error).toBe('invalid_torrent_buffer');
    });
});
