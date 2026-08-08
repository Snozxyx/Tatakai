import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { createRequire } from 'module';
import fs from 'fs';
import os from 'os';
import path from 'path';

const require = createRequire(import.meta.url);
const { TorrentSessionManager } = require('../desktop/runtime/torrent/session/session-manager.cjs');

const tempDirs = new Set();
let originalSetInterval;

function makeManager() {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tatakai-torrent-settings-'));
    tempDirs.add(tempDir);

    const app = {
        getPath(name) {
            if (name !== 'userData') {
                throw new Error(`Unexpected path request: ${name}`);
            }
            return tempDir;
        },
    };

    const logger = {
        info() {},
        warn() {},
        error() {},
    };

    const manager = new TorrentSessionManager({
        app,
        fs,
        path,
        logger,
        getMainWindow: () => null,
    });

    return { manager, tempDir };
}

describe('TorrentSessionManager settings', () => {
    beforeEach(() => {
        originalSetInterval = globalThis.setInterval;
        globalThis.setInterval = () => ({ unref() {} });
        delete globalThis.localStorage;
    });

    afterEach(() => {
        globalThis.setInterval = originalSetInterval;
        delete globalThis.localStorage;

        for (const dir of tempDirs) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
        tempDirs.clear();
    });

    it('persists sanitized torrent settings and does not require localStorage', () => {
        const { manager, tempDir } = makeManager();

        expect(() => {
            const settings = manager.updateTorrentSettings({
                schedule: 'gaming',
                limitDownload: 12,
                limitUpload: 4,
            });

            expect(settings).toEqual({
                schedule: 'gaming',
                limitDownload: 12,
                limitUpload: 4,
                maxConns: 3,
                enableUpnp: true,
                autoFreeSpace: true,
                cleanupMaxCacheGb: 50,
                cleanupMaxAgeHours: 72,
                cleanupOnPlaybackEnd: true,
            });
        }).not.toThrow();

        const savedPath = path.join(tempDir, 'torrent-settings.json');
        const saved = JSON.parse(fs.readFileSync(savedPath, 'utf8'));
        expect(saved).toEqual({
            schedule: 'gaming',
            limitDownload: 12,
            limitUpload: 4,
            maxConns: 3,
            enableUpnp: true,
            autoFreeSpace: true,
            cleanupMaxCacheGb: 50,
            cleanupMaxAgeHours: 72,
            cleanupOnPlaybackEnd: true,
        });

        expect(() => manager._applyBandwidthSchedule()).not.toThrow();
    });

    it('loads the last saved torrent settings on startup', () => {
        const { manager: firstManager, tempDir } = makeManager();

        firstManager.updateTorrentSettings({
            schedule: 'night-owl',
            limitDownload: 8,
            limitUpload: 2,
        });

        const app = {
            getPath(name) {
                if (name !== 'userData') {
                    throw new Error(`Unexpected path request: ${name}`);
                }
                return tempDir;
            },
        };

        const reloadedManager = new TorrentSessionManager({
            app,
            fs,
            path,
            logger: { info() {}, warn() {}, error() {} },
            getMainWindow: () => null,
        });

        expect(reloadedManager._torrentSettings).toEqual({
            schedule: 'night-owl',
            limitDownload: 8,
            limitUpload: 2,
            maxConns: 3,
            enableUpnp: true,
            autoFreeSpace: true,
            cleanupMaxCacheGb: 50,
            cleanupMaxAgeHours: 72,
            cleanupOnPlaybackEnd: true,
        });
    });

    it('sanitizes cleanup and connection settings', () => {
        const { manager } = makeManager();

        const settings = manager.updateTorrentSettings({
            maxConns: 900,
            enableUpnp: false,
            autoFreeSpace: false,
            cleanupMaxCacheGb: 5,
            cleanupMaxAgeHours: 12,
            cleanupOnPlaybackEnd: false,
        });

        expect(settings).toMatchObject({
            maxConns: 800,
            enableUpnp: false,
            autoFreeSpace: false,
            cleanupMaxCacheGb: 5,
            cleanupMaxAgeHours: 12,
            cleanupOnPlaybackEnd: false,
        });
    });
});
