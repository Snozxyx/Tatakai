'use strict';

const { TorrentFacade } = require('../runtime/torrent/facade.cjs');
const { parseReleaseName } = require('../runtime/torrent/naming/release-parser.cjs');

module.exports = function registerTorrentHandlers(ipcMain, app, fs, path, logger, getMainWindow) {
    const facade = new TorrentFacade({ app, fs, path, logger, getMainWindow });

    ipcMain.handle('torrent:search', async (_event, options) => facade.search(options));

    ipcMain.handle('torrent:start', async (_event, infoHash, options) => {
        if (infoHash && typeof infoHash === 'object' && !Array.isArray(infoHash)) {
            const payload = infoHash;
            // Requirement 5.1: support torrentBuffer in the torrent:start payload
            if (payload.torrentBuffer != null) {
                let buf;
                if (Buffer.isBuffer(payload.torrentBuffer)) {
                    buf = payload.torrentBuffer;
                } else if (payload.torrentBuffer instanceof Uint8Array) {
                    buf = Buffer.from(payload.torrentBuffer);
                } else if (typeof payload.torrentBuffer === 'object') {
                    buf = Buffer.from(Object.values(payload.torrentBuffer));
                } else {
                    return { success: false, error: 'invalid_torrent_buffer' };
                }
                return facade.startFromBuffer(buf, payload);
            }
            return facade.start(payload.infoHash || payload.hash, payload);
        }
        return facade.start(infoHash, options || {});
    });

    // Requirement 5.2: torrent:start-file accepts a torrentBuffer and options,
    // converts to Buffer if needed, delegates to facade.startFromBuffer()
    ipcMain.handle('torrent:start-file', async (_event, { torrentBuffer, options }) => {
        let buf;
        if (Buffer.isBuffer(torrentBuffer)) {
            buf = torrentBuffer;
        } else if (torrentBuffer instanceof Uint8Array) {
            buf = Buffer.from(torrentBuffer);
        } else if (torrentBuffer && typeof torrentBuffer === 'object') {
            // Plain object fallback from contextBridge serialisation
            buf = Buffer.from(Object.values(torrentBuffer));
        } else {
            return { success: false, error: 'invalid_torrent_buffer' };
        }
        return facade.startFromBuffer(buf, options || {});
    });

    // Requirement 3.1-3.5: torrent:preview is metadata-only, no disk writes,
    // classifies files, removes torrent before returning, 20s timeout
    ipcMain.handle('torrent:preview', async (_event, magnet) => facade.preview(magnet));

    ipcMain.handle('torrent:restore-session', async (_event, snapshot) => facade.restoreSession(snapshot));

    ipcMain.handle('torrent:import-file', async (_event, filePath) => {
        try {
            const buffer = await fs.promises.readFile(filePath);
            return { success: true, torrentBuffer: buffer };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('torrent:stop', async (_event, sessionId, options) => facade.stop(sessionId, options));
    ipcMain.handle('torrent:disconnect-peers', async (_event, sessionId) => facade.disconnectPeers(sessionId));

    ipcMain.handle('torrent:stats', async (_event, sessionId) => facade.stats(sessionId));
    ipcMain.handle('torrent:stream', async (_event, sessionId, fileIndex, options) => facade.stream(sessionId, fileIndex, options));
    ipcMain.handle('torrent:clear-all', async () => facade.clearAllData());
    ipcMain.handle('torrent:restart-service', async () => facade.restartService());
    ipcMain.handle('torrent:update-settings', async (_event, settings) => facade.updateSettings(settings));

    // Requirement 2.5: torrent:peers returns current seeders/leechers for an active session
    ipcMain.handle('torrent:peers', async (_event, sessionId) => facade.peers(sessionId));

    ipcMain.handle('torrent:get-file-path', async (_event, sessionId) => facade.getFilePath(sessionId));

    ipcMain.handle('torrent:get-storage-paths', async () => facade.getStoragePaths());
    ipcMain.handle('torrent:set-storage-path', async (_event, nextPath) => facade.setStoragePath(nextPath));
    ipcMain.handle('torrent:ensure-prebuffer', async (_event, sessionId, fileIndex, options) =>
        facade.ensurePrebuffer(sessionId, fileIndex, options)
    );

    // Manual repair trigger from UI: reannounce trackers / add fallbacks
    ipcMain.handle('torrent:reannounce', async (_event, sessionId) => facade.reannounce(sessionId));

    // Playback progress from renderer to prioritize pieces near the playhead
    ipcMain.handle('torrent:update-playback', async (_event, sessionId, currentTime, duration) =>
        facade.updatePlayback(sessionId, currentTime, duration)
    );

    // Development helper: request an immediate diagnostics dump for a session
    ipcMain.handle('torrent:dump-diagnostics', async (_event, sessionId) => facade.dumpDiagnostics(sessionId));

    // List active torrent sessions for renderer discovery
    ipcMain.handle('torrent:list-sessions', async () => facade.listSessions());

    ipcMain.handle('torrent:import-magnet-file', async (_event, filePath) => {
        try {
            const content = await fs.promises.readFile(filePath, 'utf8');
            const magnetLink = content.trim();
            if (!magnetLink.startsWith('magnet:?')) {
                throw new Error('Not a valid magnet file');
            }
            return { success: true, magnetLink };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('torrent:resolve-metadata', async (_event, magnetLink) => {
        // Parse metadata from magnet link (name, hash)
        const nameMatch = magnetLink.match(/dn=([^&]+)/);
        const name = nameMatch ? decodeURIComponent(nameMatch[1].replace(/\+/g, ' ')) : 'Unknown Torrent';
        const hashMatch = magnetLink.match(/xt=urn:btih:([^&]+)/i);
        const hash = hashMatch ? hashMatch[1].toLowerCase() : null;
        const parsed = parseReleaseName(name);

        return {
            success: true,
            name,
            hash,
            parsed,
            searchTitle: parsed.searchTitle || parsed.title || name,
            confidence: parsed.confidence || 0,
        };
    });

    return { facade };
};
