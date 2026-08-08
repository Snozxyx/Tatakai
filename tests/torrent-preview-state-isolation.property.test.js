/**
 * Property-based tests for TorrentSessionManager.preview() state isolation.
 *
 * **Property 6: Torrent preview does not persist state**
 *
 * For any magnet link passed to `torrent:preview`, the operation must not
 * create a session entry in `TorrentSessionManager._sessions` and must remove
 * the torrent from the WebTorrent client before returning.
 *
 * **Validates: Requirements 3.3**
 */

import { describe, it, expect, beforeEach } from 'bun:test';
import { createRequire } from 'module';
import * as fc from 'fast-check';

const require = createRequire(import.meta.url);
const { TorrentSessionManager } = require('../desktop/runtime/torrent/session/session-manager.cjs');

// ---------------------------------------------------------------------------
// Mock WebTorrent client factory
//
// We mock the WebTorrent client so that:
//   1. client.add(magnet, { store: false }, cb) immediately invokes cb with a
//      fake torrent object (simulating successful metadata resolution).
//   2. client.remove(torrent, opts, cb?) is tracked so we can assert it was
//      called with the correct torrent.
//   3. The fake torrent has a minimal shape that satisfies the preview() code.
// ---------------------------------------------------------------------------

function makeFakeTorrent(infoHash = 'aabbccddeeff00112233445566778899aabbccdd') {
    return {
        name: 'Fake Torrent',
        infoHash,
        length: 1024 * 1024 * 500, // 500 MB
        files: [
            { name: 'episode01.mkv', path: 'episode01.mkv', length: 1024 * 1024 * 490 },
            { name: 'readme.txt',    path: 'readme.txt',    length: 1024 },
        ],
        _trackers: [],
        numPeers: 0,
    };
}

/**
 * Build a mock WebTorrent client.
 *
 * @param {object} opts
 * @param {boolean} [opts.simulateTimeout=false]  If true, client.add() never
 *   calls the callback, causing preview() to hit its 20-second timeout.
 *   (We override the timeout in tests to keep them fast.)
 * @param {object|null} [opts.fakeTorrent=null]  Custom fake torrent to use.
 */
function makeMockClient({ simulateTimeout = false, fakeTorrent = null } = {}) {
    const torrent = fakeTorrent ?? makeFakeTorrent();
    const removedTorrents = [];
    const addedMagnets = [];

    const client = {
        // Track calls
        _removedTorrents: removedTorrents,
        _addedMagnets: addedMagnets,
        _torrent: torrent,

        add(magnet, opts, cb) {
            addedMagnets.push({ magnet, opts });
            if (!simulateTimeout && typeof cb === 'function') {
                // Simulate async metadata resolution (next microtask)
                Promise.resolve().then(() => cb(torrent));
            }
            // Return a minimal torrent-like object (WebTorrent returns this synchronously)
            return torrent;
        },

        remove(t, opts, cb) {
            removedTorrents.push({ torrent: t, opts });
            if (typeof cb === 'function') {
                // Simulate async removal completion
                Promise.resolve().then(() => cb(null));
            }
        },

        once(event, cb) {
            // No-op: we don't simulate client-level errors in the happy path
        },

        on(event, cb) {
            // No-op
        },

        destroy(cb) {
            if (typeof cb === 'function') cb(null);
        },
    };

    return client;
}

/**
 * Build a TorrentSessionManager with a pre-injected mock WebTorrent client.
 * This bypasses _ensureClient() so we don't need a real WebTorrent install.
 */
function makeManagerWithMockClient(mockClient) {
    const logger = {
        info: () => {},
        warn: () => {},
        error: () => {},
    };

    // Provide a mock app with getPath() so TorrentCacheManager can initialize
    const mockApp = {
        getPath: (name) => `/tmp/tatakai-test/${name}`,
    };

    const mockPath = {
        join: (...parts) => parts.join('/'),
    };

    const mockFs = {
        existsSync: () => true,
        mkdirSync: () => {},
        readdirSync: () => [],
        statSync: () => ({ size: 0, mtimeMs: 0 }),
    };

    const manager = new TorrentSessionManager({
        app: mockApp,
        fs: mockFs,
        path: mockPath,
        logger,
        getMainWindow: () => null,
    });

    // Inject the mock client directly, bypassing the lazy ESM import
    manager._client = mockClient;

    return manager;
}

// ---------------------------------------------------------------------------
// Magnet link arbitraries
// ---------------------------------------------------------------------------

/**
 * Generate a realistic-looking magnet link with an arbitrary info hash.
 * The info hash is a 40-character hex string (SHA-1).
 */
const magnetArb = fc.stringMatching(/^[0-9a-f]{40}$/).map(
    (hash) => `magnet:?xt=urn:btih:${hash}&dn=Fake+Anime+S01E01+%5B1080p%5D`
);

/**
 * Generate arbitrary strings that may or may not look like magnet links.
 * This tests that preview() handles any string without persisting state.
 */
const arbitraryStringArb = fc.oneof(
    magnetArb,
    fc.string(),
    fc.constant(''),
    fc.constant('magnet:?xt=urn:btih:invalid'),
    fc.constant('not-a-magnet-link'),
    fc.stringMatching(/^[0-9a-f]{40}$/), // bare info hash
);

// ---------------------------------------------------------------------------
// Unit tests — specific scenarios
// ---------------------------------------------------------------------------

describe('TorrentSessionManager.preview() — state isolation unit tests', () => {
    let mockClient;
    let manager;

    beforeEach(() => {
        mockClient = makeMockClient();
        manager = makeManagerWithMockClient(mockClient);
    });

    it('does not add any entry to _sessions after a successful preview', async () => {
        const magnet = 'magnet:?xt=urn:btih:aabbccddeeff00112233445566778899aabbccdd&dn=Test';

        expect(manager._sessions.size).toBe(0);

        const result = await manager.preview(magnet);

        expect(result.success).toBe(true);
        // _sessions must remain empty — no session was created
        expect(manager._sessions.size).toBe(0);
    });

    it('calls client.remove() with the previewed torrent before returning', async () => {
        const magnet = 'magnet:?xt=urn:btih:aabbccddeeff00112233445566778899aabbccdd&dn=Test';

        await manager.preview(magnet);

        // remove() must have been called exactly once
        expect(mockClient._removedTorrents.length).toBe(1);
        // The removed torrent must be the one that was added
        expect(mockClient._removedTorrents[0].torrent).toBe(mockClient._torrent);
    });

    it('calls client.remove() with destroyStore: true', async () => {
        const magnet = 'magnet:?xt=urn:btih:aabbccddeeff00112233445566778899aabbccdd&dn=Test';

        await manager.preview(magnet);

        expect(mockClient._removedTorrents.length).toBe(1);
        expect(mockClient._removedTorrents[0].opts).toMatchObject({ destroyStore: true });
    });

    it('_sessions remains empty even when the torrent has .exe files', async () => {
        const exeTorrent = {
            name: 'Malicious Torrent',
            infoHash: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
            length: 1024 * 1024,
            files: [
                { name: 'setup.exe', path: 'setup.exe', length: 1024 * 1024 },
            ],
            _trackers: [],
            numPeers: 0,
        };

        const exeClient = makeMockClient({ fakeTorrent: exeTorrent });
        const exeManager = makeManagerWithMockClient(exeClient);

        const result = await exeManager.preview('magnet:?xt=urn:btih:deadbeefdeadbeefdeadbeefdeadbeefdeadbeef');

        // Preview should still succeed (it reports hasExeFiles: true but doesn't block)
        expect(result.success).toBe(true);
        expect(result.hasExeFiles).toBe(true);

        // No session must be created
        expect(exeManager._sessions.size).toBe(0);
    });

    it('_sessions remains empty when preview times out', async () => {
        // Use a client that never calls the add() callback (simulates timeout)
        const timeoutClient = makeMockClient({ simulateTimeout: true });
        const timeoutManager = makeManagerWithMockClient(timeoutClient);

        // Override the timeout to 50ms so the test runs fast
        const originalSetTimeout = global.setTimeout;
        let timeoutCb = null;
        global.setTimeout = (cb, delay) => {
            if (delay === 20000) {
                // Capture the preview timeout callback and fire it immediately
                timeoutCb = cb;
                return originalSetTimeout(() => cb(), 10);
            }
            return originalSetTimeout(cb, delay);
        };

        try {
            const result = await timeoutManager.preview('magnet:?xt=urn:btih:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
            expect(result.success).toBe(false);
            expect(result.error).toBe('preview_timeout');
        } finally {
            global.setTimeout = originalSetTimeout;
        }

        // Even on timeout, _sessions must be empty
        expect(timeoutManager._sessions.size).toBe(0);
    });

    it('does not persist state across multiple sequential preview calls', async () => {
        const magnets = [
            'magnet:?xt=urn:btih:1111111111111111111111111111111111111111',
            'magnet:?xt=urn:btih:2222222222222222222222222222222222222222',
            'magnet:?xt=urn:btih:3333333333333333333333333333333333333333',
        ];

        for (const magnet of magnets) {
            const result = await manager.preview(magnet);
            expect(result.success).toBe(true);
            // After each preview, _sessions must still be empty
            expect(manager._sessions.size).toBe(0);
        }

        // remove() must have been called once per preview
        expect(mockClient._removedTorrents.length).toBe(magnets.length);
    });

    it('returns a valid TorrentPreviewResult shape', async () => {
        const magnet = 'magnet:?xt=urn:btih:aabbccddeeff00112233445566778899aabbccdd&dn=Test';

        const result = await manager.preview(magnet);

        expect(result.success).toBe(true);
        expect(typeof result.name).toBe('string');
        expect(typeof result.infoHash).toBe('string');
        expect(typeof result.totalSize).toBe('number');
        expect(Array.isArray(result.files)).toBe(true);
        expect(typeof result.hasExeFiles).toBe('boolean');

        // Each file must have the expected shape
        for (const file of result.files) {
            expect(typeof file.name).toBe('string');
            expect(typeof file.path).toBe('string');
            expect(typeof file.size).toBe('number');
            expect(typeof file.isVideo).toBe('boolean');
            expect(typeof file.isExe).toBe('boolean');
            expect(typeof file.index).toBe('number');
        }
    });
});

// ---------------------------------------------------------------------------
// Property-based tests — Property 6
// ---------------------------------------------------------------------------

/**
 * Property 6: Torrent preview does not persist state
 *
 * For any magnet link (or arbitrary string) passed to preview():
 *   1. `_sessions` must not contain any entry after the call returns.
 *   2. `client.remove()` must have been called with the torrent that was added.
 *
 * **Validates: Requirements 3.3**
 */
describe('TorrentSessionManager.preview() — Property 6: preview does not persist state', () => {
    // -------------------------------------------------------------------------
    // Property 6a: _sessions is always empty after preview() returns
    // -------------------------------------------------------------------------

    it('_sessions is always empty after preview() for any magnet-like string', async () => {
        await fc.assert(
            fc.asyncProperty(magnetArb, async (magnet) => {
                const client = makeMockClient();
                const manager = makeManagerWithMockClient(client);

                // _sessions must be empty before the call
                expect(manager._sessions.size).toBe(0);

                await manager.preview(magnet);

                // _sessions must still be empty after the call
                expect(manager._sessions.size).toBe(0);
            }),
            { numRuns: 100, seed: 42 }
        );
    });

    // -------------------------------------------------------------------------
    // Property 6b: client.remove() is always called after a successful preview
    // -------------------------------------------------------------------------

    it('client.remove() is always called after a successful preview for any magnet', async () => {
        await fc.assert(
            fc.asyncProperty(magnetArb, async (magnet) => {
                const client = makeMockClient();
                const manager = makeManagerWithMockClient(client);

                const result = await manager.preview(magnet);

                if (result.success) {
                    // remove() must have been called at least once
                    expect(client._removedTorrents.length).toBeGreaterThanOrEqual(1);

                    // The removed torrent must be the one that was added
                    const removedTorrent = client._removedTorrents[0].torrent;
                    expect(removedTorrent).toBe(client._torrent);

                    // destroyStore must be true (no disk artifacts)
                    expect(client._removedTorrents[0].opts).toMatchObject({ destroyStore: true });
                }
            }),
            { numRuns: 100, seed: 99 }
        );
    });

    // -------------------------------------------------------------------------
    // Property 6c: _sessions size never increases after preview()
    // -------------------------------------------------------------------------

    it('_sessions size never increases after preview() for any input', async () => {
        await fc.assert(
            fc.asyncProperty(arbitraryStringArb, async (input) => {
                const client = makeMockClient();
                const manager = makeManagerWithMockClient(client);

                const sizeBefore = manager._sessions.size;

                // preview() must not throw
                let result;
                try {
                    result = await manager.preview(input);
                } catch (_) {
                    // Even if preview throws internally, _sessions must not grow
                }

                const sizeAfter = manager._sessions.size;

                // _sessions must never grow as a result of preview()
                expect(sizeAfter).toBeLessThanOrEqual(sizeBefore);
                expect(sizeAfter).toBe(0);
            }),
            { numRuns: 200, seed: 7 }
        );
    });

    // -------------------------------------------------------------------------
    // Property 6d: preview() does not interfere with existing sessions
    // -------------------------------------------------------------------------

    it('preview() does not modify existing sessions in _sessions', async () => {
        await fc.assert(
            fc.asyncProperty(
                magnetArb,
                fc.string({ minLength: 5, maxLength: 20 }),
                async (magnet, existingSessionId) => {
                    const client = makeMockClient();
                    const manager = makeManagerWithMockClient(client);

                    // Manually inject a fake existing session
                    const fakeSession = {
                        torrent: makeFakeTorrent('existing000000000000000000000000000000000'),
                        sessionId: existingSessionId,
                        magnet: 'magnet:?xt=urn:btih:existing000000000000000000000000000000000',
                        targetFileIndex: 0,
                        startedAt: Date.now(),
                    };
                    manager._sessions.set(existingSessionId, fakeSession);

                    expect(manager._sessions.size).toBe(1);

                    await manager.preview(magnet);

                    // The existing session must still be present and unmodified
                    expect(manager._sessions.size).toBe(1);
                    expect(manager._sessions.has(existingSessionId)).toBe(true);
                    expect(manager._sessions.get(existingSessionId)).toBe(fakeSession);
                }
            ),
            { numRuns: 100, seed: 13 }
        );
    });

    // -------------------------------------------------------------------------
    // Property 6e: Multiple concurrent previews never leave sessions behind
    // -------------------------------------------------------------------------

    it('concurrent preview() calls never leave sessions in _sessions', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.array(magnetArb, { minLength: 2, maxLength: 5 }),
                async (magnets) => {
                    const client = makeMockClient();
                    const manager = makeManagerWithMockClient(client);

                    // Run all previews concurrently
                    await Promise.all(magnets.map((m) => manager.preview(m)));

                    // After all previews complete, _sessions must be empty
                    expect(manager._sessions.size).toBe(0);
                }
            ),
            { numRuns: 50, seed: 55 }
        );
    });

    // -------------------------------------------------------------------------
    // Property 6f: preview() result always has success field (never undefined)
    // -------------------------------------------------------------------------

    it('preview() always returns an object with a success field for any magnet', async () => {
        await fc.assert(
            fc.asyncProperty(magnetArb, async (magnet) => {
                const client = makeMockClient();
                const manager = makeManagerWithMockClient(client);

                const result = await manager.preview(magnet);

                expect(typeof result).toBe('object');
                expect(result).not.toBeNull();
                expect(typeof result.success).toBe('boolean');
            }),
            { numRuns: 100, seed: 33 }
        );
    });
});
