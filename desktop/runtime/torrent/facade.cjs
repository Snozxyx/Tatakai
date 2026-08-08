'use strict';

const { searchTorrentCandidates } = require('./core/candidate-discovery.cjs');
const { TorrentSessionManager } = require('./session/session-manager.cjs');
const { createPlaybackManifest } = require('./streaming/stream-bridge.cjs');
const { buildDisplayTitleFromRelease, buildQualityBadge } = require('./naming/display-title-builder.cjs');
const { detectBatchTorrentLayout } = require('./naming/batch-detector.cjs');

/**
 * TorrentFacade — public API for the TatakaiTorrentCore system.
 *
 * Consumed by ipc-torrent.cjs IPC handlers.
 * Methods map directly to IPC channels: torrent:search, torrent:start, etc.
 */
class TorrentFacade {
    constructor({ app, fs, path, logger, getMainWindow }) {
        this._logger = logger;
        this._sessions = new TorrentSessionManager({ app, fs, path, logger, getMainWindow });
    }

    // ── torrent:search ────────────────────────────────────────────────────────

    async search(options) {
        try {
            if (process.env.TATAKAI_DISABLE_TORRENT === '1') {
                return { success: true, candidates: [], disabled: true };
            }

            const result = await searchTorrentCandidates(options || {});

            // Enrich each candidate with display metadata
            const enriched = (result.candidates || []).map((c) => ({
                ...c,
                displayTitle: buildDisplayTitleFromRelease(c.parsed),
                qualityBadge: buildQualityBadge(c.parsed),
            }));

            return {
                success: result.success,
                candidates: enriched,
                source: result.source,
            };
        } catch (err) {
            this._logger.error('[Torrent] search failed:', err.message);
            return { success: false, error: err.message, candidates: [] };
        }
    }

    // ── torrent:start ─────────────────────────────────────────────────────────

    async start(infoHash, options) {
        return this._sessions.start(infoHash, options || {});
    }

    // ── torrent:start-file (buffer support) ───────────────────────────────────
    // Requirements 5.1, 5.2, 5.3

    async startFromBuffer(buf, options) {
        // Ensure buf is a proper Buffer (convert from ArrayBuffer if needed)
        const torrentBuffer = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
        return this._sessions.start(null, { ...(options || {}), torrentBuffer });
    }

    // ── torrent:preview ───────────────────────────────────────────────────────
    // Requirements 3.1, 3.2, 3.3, 3.4, 3.5

    async preview(magnet) {
        return this._sessions.preview(magnet);
    }

    // ── torrent:restore-session ──────────────────────────────────────────────

    async restoreSession(snapshot) {
        if (Array.isArray(snapshot)) {
            return this._sessions.restoreSession(...snapshot);
        }

        const staging = snapshot?.staging ?? [];
        const seeding = snapshot?.seeding ?? [];
        const completed = snapshot?.completed ?? [];
        const current = snapshot?.current ?? null;
        return this._sessions.restoreSession(staging, seeding, completed, current);
    }

    // ── torrent:stop ──────────────────────────────────────────────────────────

    async stop(sessionId, options) {
        return this._sessions.stop(sessionId, options || {});
    }

    // ── torrent:disconnect-peers ─────────────────────────────────────────────

    disconnectPeers(sessionId) {
        return this._sessions.disconnectPeers(sessionId);
    }

    // ── torrent:stats ─────────────────────────────────────────────────────────

    async stats(sessionId) {
        return this._sessions.stats(sessionId);
    }

    // ── torrent:stream ────────────────────────────────────────────────────────

    async stream(sessionId, fileIndex, options) {
        // First call: starts the HLS remux job (for MKV/WebM) or returns a
        // direct URL. For MKV files, session-manager will return
        // { success: false, error: 'transcode_not_ready' } on this first call
        // because ffmpeg just started and hasn't written index.m3u8 yet.
        // We must NOT return early in that case — createPlaybackManifest()
        // will do the prebuffer wait and then retry getStreamUrl() in a loop
        // until the manifest appears.
        const urlResult = await this._sessions.stream(sessionId, fileIndex, options);

        // Only bail out on hard errors unrelated to the transcode startup race.
        if (!urlResult?.success && urlResult?.error !== 'transcode_not_ready') {
            return urlResult;
        }

        // Get the active torrent for prebuffer check
        const entry = this._sessions._sessions?.get(sessionId);
        const torrent = entry?.torrent ?? null;

        // Derive the file name even when urlResult carries no name (transcode_not_ready path)
        const resolvedFileIndex = urlResult?.fileIndex ?? (Number.isFinite(Number(fileIndex)) ? Number(fileIndex) : (entry?.targetFileIndex ?? 0));
        const fileName = urlResult?.name || torrent?.files?.[resolvedFileIndex]?.name || '';

        // requiresContainerTail: sequential HLS remuxing does not need the tail/cues at start.
        const requiresContainerTail = false;

        return createPlaybackManifest(
            { sessionId, fileIndex: resolvedFileIndex },
            // Capture options so downstream stream can respect audio selection
            (sid, fi) => this._sessions.stream(sid, fi, options),
            torrent,
            { requireMetadataTail: requiresContainerTail }
        );
    }

    // ── torrent:peers ─────────────────────────────────────────────────────────
    // Requirement 2.5

    peers(sessionId) {
        return this._sessions.peers(sessionId);
    }

    getFilePath(sessionId) {
        return this._sessions.getFilePath(sessionId);
    }

    getStoragePaths() {
        return this._sessions.getStoragePaths();
    }

    setStoragePath(nextPath) {
        return this._sessions.setStoragePath(nextPath);
    }

    ensurePrebuffer(sessionId, fileIndex, options) {
        return this._sessions.ensurePrebuffer(sessionId, fileIndex, options || {});
    }

    // ── torrent:clear ─────────────────────────────────────────────────────────

    async clearAllData() {
        return this._sessions.clearAllData();
    }

    async restartService() {
        return this._sessions.restartService();
    }

    updateSettings(settings) {
        return {
            success: true,
            settings: this._sessions.updateTorrentSettings(settings || {}),
        };
    }

    // ── torrent:reannounce (manual repair trigger) ──────────────────────────

    async reannounce(sessionId) {
        return this._sessions.reannounceSession(sessionId);
    }

    // ── torrent:update-playback (streaming priority) ───────────────────────

    async updatePlayback(sessionId, currentTime, duration) {
        return this._sessions.updatePlayback(sessionId, currentTime, duration);
    }

    // Request an on-demand diagnostics dump for a session (development helper)
    async dumpDiagnostics(sessionId) {
        try {
            const entry = this._sessions._sessions.get(sessionId);
            if (!entry) return { success: false, error: 'no-session' };
            const diag = this._sessions._dumpSessionDiagnostics(sessionId, entry);
            return { success: true, diagnostics: diag };
        } catch (err) {
            this._logger.warn('[Torrent] dumpDiagnostics failed:', err?.message || err);
            return { success: false, error: err?.message || String(err) };
        }
    }

    // List active sessions (id, infoHash, name, progress) for renderer discovery
    listSessions() {
        try {
            const out = [];
            for (const [sessionId, entry] of this._sessions._sessions) {
                const t = entry.torrent || {};
                out.push({
                    sessionId,
                    infoHash: entry.infoHash || t.infoHash || null,
                    name: entry.name || t.name || null,
                    progress: typeof t.progress === 'number' ? Math.round((t.progress || 0) * 100000) / 1000 : null,
                    numPeers: t.numPeers ?? (t.wires ? t.wires.length : 0),
                    startedAt: entry.startedAt || null,
                });
            }
            return { success: true, sessions: out };
        } catch (err) {
            this._logger.warn('[Torrent] listSessions failed:', err?.message || err);
            return { success: false, error: err?.message || String(err) };
        }
    }

    // ── Cleanup ───────────────────────────────────────────────────────────────

    destroyAll() {
        this._sessions.destroyAll();
    }
}

module.exports = { TorrentFacade };
