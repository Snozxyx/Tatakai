'use strict';

const crypto = require('crypto');
const os = require('os');

/**
 * TorrentSessionManager
 *
 * Desktop-only torrent engine wrapper around WebTorrent v2 (ESM-only).
 *
 * This module is consumed by:
 * - `desktop/runtime/torrent/facade.cjs`
 * - `desktop/ipc/ipc-torrent.cjs`
 * - download manager which listens for `torrent:progress` on the manager instance
 *
 * NOTE: This file was previously corrupted/truncated. The implementation below
 * is intentionally self-contained and test-driven (see `tests/torrent-*.test.js`).
 */

const { EventEmitter } = require('events');
const { TorrentCacheManager } = require('../cache/cache-manager.cjs');
const { prioritizePlaybackPieces, prioritizeSeekPoint } = require('./piece-prioritizer.cjs');
const { waitForPrebuffer } = require('../streaming/stream-bridge.cjs');
const { startRemuxJob } = require('../streaming/hls-remux.cjs');
const { matchTorrentFilesToEpisode } = require('../naming/episode-matcher.cjs');
const { parseReleaseName } = require('../naming/release-parser.cjs');
const { detectBatchTorrentLayout } = require('../naming/batch-detector.cjs');

const PLAYABLE_VIDEO_EXTENSIONS = /\.(mp4|mkv|avi|m4v|ts|mov|webm|flv|wmv|mpg|mpeg|ogv)$/i;

const STREAM_HOST = '127.0.0.1';
const STREAM_PORT = 8888;

const METADATA_TIMEOUT_MS = 35_000;
const PREVIEW_TIMEOUT_MS = 20_000;
const HEARTBEAT_MS = 2000;
const NO_PEERS_GRACE_MS = 25_000;
const PEERS_FLAP_WINDOW_MS = 30_000;
const STALL_DETECT_MS = 45_000;
const SPEED_EWMA_ALPHA = 0.3;
const STREAMING_IDLE_MS = 20_000;

const EXTRA_TRACKERS = [
    // Top tier UDP Trackers
    'udp://tracker.opentrackr.org:1337/announce',
    'udp://open.stealth.si:80/announce',
    'udp://tracker.torrent.eu.org:451/announce',
    'udp://exodus.desync.com:6969/announce',
    'udp://tracker.moeking.me:6969/announce',
    'udp://tracker.bitsearch.to:1337/announce',
    'udp://explodie.org:6969/announce',
    'udp://9.rarbg.me:2710/announce',
    'udp://open.demonii.com:1337/announce',
    'udp://tracker.cyberia.is:6969/announce',
    'udp://ipv4.tracker.harry.lu:80/announce',
    
    // Top tier HTTP Trackers (great fallback if UDP is blocked by ISP/router)
    'http://tracker.gbitt.info:80/announce',
    'http://tracker.ipv6tracker.ru:80/announce',
    'http://nyaa.tracker.wf:7777/announce',
    
    // WebSocket (WebRTC) Trackers
    'wss://tracker.openwebtorrent.com',
    'wss://tracker.btorrent.xyz',
    'wss://tracker.files.fm:7073/announce',
    'wss://tracker.gbitt.info:443/announce',
];

const DEFAULT_TORRENT_SETTINGS = {
    schedule: 'default',
    limitDownload: 0,
    limitUpload: 0,
    maxConns: 3,
    enableUpnp: true,
    autoFreeSpace: true,
    cleanupMaxCacheGb: 50,
    cleanupMaxAgeHours: 72,
    cleanupOnPlaybackEnd: true,
};

function safeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function nowIso() {
    try {
        return new Date().toISOString();
    } catch {
        return '';
    }
}

function isValidTorrentBuffer(buf) {
    try {
        if (!buf) return false;
        const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
        if (b.length < 3) return false;
        // bencode dict starts with 'd'
        return b[0] === 0x64; // 'd'
    } catch {
        return false;
    }
}

function normalizeTorrentBuffer(value) {
    if (value == null) return null;
    if (Buffer.isBuffer(value)) return value;
    if (value instanceof Uint8Array) return Buffer.from(value);
    if (value instanceof ArrayBuffer) return Buffer.from(new Uint8Array(value));
    if (typeof value === 'object') return Buffer.from(Object.values(value));
    return Buffer.from(value);
}

class TorrentSessionManager extends EventEmitter {
    constructor({ app, fs, path, logger, getMainWindow }) {
        super();
        this._app = app;
        this._fs = fs;
        this._path = path;
        this._logger = logger;
        this._getMainWindow = typeof getMainWindow === 'function' ? getMainWindow : () => null;

        this._client = null;
        this._streamServer = null;
        this._hlsJobs = new Map(); // sessionId -> Map<variantKey, { proc, url, manifestPath, startedAt }>

        this._sessions = new Map(); // sessionId -> entry
        this._pendingStarts = new Map(); // startKey -> promise
        this._streamingSessions = new Set();

        this._activeTranscodes = new Set();
        this._sessionTranscodes = new Map(); // sessionId -> Set<ChildProcess>

        this._defaultTrackers = EXTRA_TRACKERS.slice();

        this._settingsPath = this._path.join(this._app.getPath('userData'), 'torrent-settings.json');
        this._torrentSettings = this._loadSettings();

        this._cache = new TorrentCacheManager({
            app: this._app,
            fs: this._fs,
            path: this._path,
            maxBytes: safeNumber(this._torrentSettings.cleanupMaxCacheGb, 50) * 1024 * 1024 * 1024,
        });

        this._storagePathOverride = '';
    }

    // ── Settings ────────────────────────────────────────────────────────────

    _loadSettings() {
        try {
            if (this._fs.existsSync(this._settingsPath)) {
                const raw = this._fs.readFileSync(this._settingsPath, 'utf8');
                const parsed = JSON.parse(raw);
                return this._sanitizeSettings(parsed);
            }
        } catch (err) {
            this._logger?.warn?.('[Torrent] Failed to load settings:', err?.message || err);
        }
        return { ...DEFAULT_TORRENT_SETTINGS };
    }

    _sanitizeSettings(input = {}) {
        const maxConns = Math.max(1, Math.min(800, Math.floor(safeNumber(input.maxConns, DEFAULT_TORRENT_SETTINGS.maxConns))));
        const cleanupMaxCacheGb = Math.max(1, Math.min(500, Math.floor(safeNumber(input.cleanupMaxCacheGb, DEFAULT_TORRENT_SETTINGS.cleanupMaxCacheGb))));
        const cleanupMaxAgeHours = Math.max(1, Math.min(24 * 30, Math.floor(safeNumber(input.cleanupMaxAgeHours, DEFAULT_TORRENT_SETTINGS.cleanupMaxAgeHours))));
        const limitDownload = Math.max(0, Math.floor(safeNumber(input.limitDownload, DEFAULT_TORRENT_SETTINGS.limitDownload)));
        const limitUpload = Math.max(0, Math.floor(safeNumber(input.limitUpload, DEFAULT_TORRENT_SETTINGS.limitUpload)));

        return {
            schedule: typeof input.schedule === 'string' && input.schedule.trim() ? input.schedule.trim() : DEFAULT_TORRENT_SETTINGS.schedule,
            limitDownload,
            limitUpload,
            maxConns,
            enableUpnp: input.enableUpnp == null ? DEFAULT_TORRENT_SETTINGS.enableUpnp : Boolean(input.enableUpnp),
            autoFreeSpace: input.autoFreeSpace == null ? DEFAULT_TORRENT_SETTINGS.autoFreeSpace : Boolean(input.autoFreeSpace),
            cleanupMaxCacheGb,
            cleanupMaxAgeHours,
            cleanupOnPlaybackEnd: input.cleanupOnPlaybackEnd == null ? DEFAULT_TORRENT_SETTINGS.cleanupOnPlaybackEnd : Boolean(input.cleanupOnPlaybackEnd),
        };
    }

    updateTorrentSettings(next = {}) {
        const sanitized = this._sanitizeSettings({ ...this._torrentSettings, ...(next || {}) });
        this._torrentSettings = sanitized;
        try {
            this._fs.writeFileSync(this._settingsPath, JSON.stringify(sanitized, null, 2));
        } catch (err) {
            this._logger?.warn?.('[Torrent] Failed to persist settings:', err?.message || err);
        }

        // Apply new cache quota immediately.
        try {
            this._cache._maxBytes = safeNumber(sanitized.cleanupMaxCacheGb, 50) * 1024 * 1024 * 1024;
        } catch (_) {}

        this._applyBandwidthSchedule();

        if (this._client && Number.isFinite(sanitized.maxConns)) {
            try {
                this._client.maxConns = sanitized.maxConns;
            } catch (_) {}
        }
        return sanitized;
    }

    _applyBandwidthSchedule() {
        // For now this is a no-op used by tests; actual scheduling can be added later.
        return true;
    }

    // ── Client lifecycle ─────────────────────────────────────────────────────

    async _ensureClient() {
        if (this._client) return this._client;

        // Use dynamic import for WebTorrent v2 (ESM).
        const mod = await import('webtorrent');
        const WebTorrent = mod?.default || mod;
        const client = new WebTorrent({
            maxConns: this._torrentSettings.maxConns,
            dht: true,
            tracker: true,
            webSeeds: true,
        });

        this._client = client;

        try {
            // Start shared HTTP stream server once.
            this._startStreamServer();
        } catch (err) {
            this._logger?.warn?.('[Torrent] Failed to start stream server:', err?.message || err);
        }

        return this._client;
    }

    _startStreamServer() {
        if (this._streamServer || !this._client || typeof this._client.createServer !== 'function') return;
        const server = this._client.createServer({ origin: '*' });
        this._streamServer = server;
        server.listen(STREAM_PORT, STREAM_HOST, () => {
            this._logger?.info?.(`[Torrent] Stream server listening on http://${STREAM_HOST}:${STREAM_PORT}`);
        });
        if (typeof server.once === 'function') {
            server.once('error', (err) => {
                this._logger?.warn?.('[Torrent] Stream server error:', err?.message || err);
            });
        }
    }

    // ── Storage paths ────────────────────────────────────────────────────────

    getStoragePaths() {
        try {
            const torrentPath = this._getTorrentStoragePath();
            const usage = this._cache.getUsage();
            return {
                success: true,
                torrentPath,
                cachePath: usage.root,
                usage,
            };
        } catch (err) {
            return { success: false, error: err?.message || String(err) };
        }
    }

    setStoragePath(nextPath) {
        try {
            const normalized = typeof nextPath === 'string' ? nextPath.trim() : '';
            this._storagePathOverride = normalized;
            return { success: true, path: this._getTorrentStoragePath() };
        } catch (err) {
            return { success: false, error: err?.message || String(err) };
        }
    }

    _getTorrentStoragePath() {
        const override = typeof this._storagePathOverride === 'string' && this._storagePathOverride.trim()
            ? this._storagePathOverride.trim()
            : null;
        const base = override || this._cache.getRoot();
        const out = this._path.join(base, 'torrents');
        try {
            if (!this._fs.existsSync(out)) this._fs.mkdirSync(out, { recursive: true });
        } catch (_) {}
        return out;
    }

    // ── Preview (metadata-only) ──────────────────────────────────────────────

    async preview(magnetOrBuffer) {
        const client = await this._ensureClient();
        const torrentBuffer = normalizeTorrentBuffer(magnetOrBuffer);
        const validTorrentBuffer = torrentBuffer && isValidTorrentBuffer(torrentBuffer) ? torrentBuffer : null;
        const source = validTorrentBuffer || this._injectTrackersIntoMagnet(String(magnetOrBuffer || '').trim());

        return new Promise((resolve) => {
            let settled = false;
            let existingTorrent = null;
            let existingReadyHandler = null;

            const finalize = (value) => {
                if (settled) return;
                settled = true;
                resolve(value);
            };

            const timeoutId = setTimeout(() => {
                if (existingReadyHandler && existingTorrent && typeof existingTorrent.removeListener === 'function') {
                    existingTorrent.removeListener('metadata', existingReadyHandler);
                    existingTorrent.removeListener('ready', existingReadyHandler);
                }
                finalize({ success: false, error: 'preview_timeout' });
            }, PREVIEW_TIMEOUT_MS);

            const resolveFromTorrent = (torrent, { removeAfter }) => {
                if (settled) return;
                try {
                    clearTimeout(timeoutId);
                    const classification = this._classifyTorrentFiles(torrent);
                    const hasExeFiles = Boolean((torrent.files || []).some((f) => /\.exe$/i.test(f?.name || f?.path || '')));

                    if (removeAfter) {
                        // Must not persist state: do not add to _sessions.
                        const removePromise = client.remove(torrent, { destroyStore: true }, () => {});
                        if (removePromise?.catch) removePromise.catch(() => {});
                    }

                    finalize({
                        success: true,
                        infoHash: torrent.infoHash,
                        name: torrent.name,
                        totalSize: safeNumber(torrent.length, 0),
                        hasExeFiles,
                        ...classification,
                    });
                } catch (err) {
                    if (removeAfter) {
                        try {
                            const removePromise = client.remove(torrent, { destroyStore: true }, () => {});
                            if (removePromise?.catch) removePromise.catch(() => {});
                        } catch (_) {}
                    }
                    finalize({ success: false, error: err?.message || String(err) });
                }
            };

            const onTorrent = (torrent) => resolveFromTorrent(torrent, { removeAfter: true });

            const resolveExistingOrAdd = async () => {
                try {
                    // Reuse an existing torrent to avoid duplicate add errors.
                    existingTorrent = await this._getExistingTorrent(
                        client,
                        magnetOrBuffer,
                        typeof source === 'string' ? source : '',
                        validTorrentBuffer
                    );
                    if (existingTorrent) {
                        const resolveExisting = () => resolveFromTorrent(existingTorrent, { removeAfter: false });
                        if (this._isTorrentMetadataReady(existingTorrent)) {
                            resolveExisting();
                        } else if (typeof existingTorrent.once === 'function') {
                            existingReadyHandler = resolveExisting;
                            existingTorrent.once('metadata', existingReadyHandler);
                            existingTorrent.once('ready', existingReadyHandler);
                        } else {
                            resolveExisting();
                        }
                        return;
                    }

                    const announce = validTorrentBuffer ? (this._defaultTrackers || []).slice() : undefined;
                    client.add(source, { store: false, announce }, onTorrent);
                } catch (err) {
                    clearTimeout(timeoutId);
                    finalize({ success: false, error: err?.message || String(err) });
                }
            };

            void resolveExistingOrAdd();
        });
    }

    // ── Start / restore ──────────────────────────────────────────────────────

    async start(infoHashOrMagnet, options = {}) {
        const client = await this._ensureClient();

        const torrentBuffer = normalizeTorrentBuffer(options.torrentBuffer);
        if (torrentBuffer != null && !isValidTorrentBuffer(torrentBuffer)) {
            return { success: false, error: 'invalid_torrent_buffer' };
        }

        const optionMagnet = typeof options?.magnet === 'string'
            ? options.magnet.trim()
            : typeof options?.magnetLink === 'string'
                ? options.magnetLink.trim()
                : typeof options?.magnet_link === 'string'
                    ? options.magnet_link.trim()
                    : '';
        const magnet = (torrentBuffer ? '' : optionMagnet || String(infoHashOrMagnet || '').trim()) || '';
        const source = torrentBuffer || this._injectTrackersIntoMagnet(magnet);
        if (!source || (typeof source === 'string' && !source.trim())) {
            return { success: false, error: 'missing_magnet' };
        }

        const startKey = this._buildStartKey(infoHashOrMagnet, { ...options, _resolvedBuffer: torrentBuffer }, magnet);
        if (this._pendingStarts.has(startKey)) return this._pendingStarts.get(startKey);

        const promise = new Promise((resolve) => {
            const sessionId = `ts_${crypto.randomBytes(8).toString('hex')}`;
            const entry = {
                sessionId,
                infoHash: null,
                name: null,
                startedAt: Date.now(),
                pending: true,
                torrent: null,
                targetFileIndex: 0,
                heartbeat: null,
                lastDownloadAt: 0,
                lastPlaybackAt: 0,
                lastPeersAt: 0,
                lastNonZeroPeersAt: 0,
                ewmaDownloadSpeed: 0,
                ewmaUploadSpeed: 0,
                pausedForStreaming: false,
                seedingStopped: false,
                deferSeedingPause: false,
                repair: null,
            };

            this._sessions.set(sessionId, entry);

            const onResolved = (torrent) => {
                entry.pending = false;
                entry.torrent = torrent;
                entry.infoHash = torrent.infoHash;
                entry.name = torrent.name;

                const classification = this._classifyTorrentFiles(torrent, options);
                if (classification.blockedUnsupportedMedia) {
                    try {
                        const removePromise = client.remove(torrent, { destroyStore: true }, () => {});
                        if (removePromise?.catch) removePromise.catch(() => {});
                    } catch (_) {}
                    this._sessions.delete(sessionId);
                    this._emitTorrentBlocked({ sessionId, infoHash: torrent.infoHash, name: torrent.name });
                    resolve({
                        success: false,
                        blocked: true,
                        error: `UNSUPPORTED_MEDIA: no playable video files`,
                        ...classification,
                    });
                    return;
                }

                entry.targetFileIndex = classification.selectedFileIndex ?? 0;

                // Apply playback prioritization immediately.
                try {
                    prioritizePlaybackPieces(torrent, entry.targetFileIndex, {});
                } catch (_) {}

                // Emit metadata ready to renderer.
                this._emitMetadataReady({
                    sessionId,
                    infoHash: torrent.infoHash,
                    name: torrent.name,
                    fileIndex: entry.targetFileIndex,
                    fileName: classification.selectedFile?.name,
                    files: classification.files,
                    playableFiles: classification.playableFiles,
                    detectedEpisodes: classification.detectedEpisodes,
                });

                // Track last download activity.
                try {
                    torrent.on?.('download', () => { entry.lastDownloadAt = Date.now(); });
                } catch (_) {}

                // Pause seeding when the torrent completes to keep the full file without extra uploads.
                try {
                    if (torrent.done) {
                        this._handleTorrentCompleted(entry);
                    } else {
                        torrent.once?.('done', () => {
                            this._handleTorrentCompleted(entry);
                        });
                    }
                } catch (_) {}

                // Periodic heartbeat to UI and download manager listeners.
                entry.heartbeat = setInterval(() => {
                    this._applyStreamingPriority();
                    const payload = this._buildProgressEvent(sessionId, entry);
                    if (!payload) return;
                    this.emit('torrent:progress', payload);
                    this._emitTorrentProgressToRenderer(payload);
                }, HEARTBEAT_MS);
                if (entry.heartbeat && typeof entry.heartbeat.unref === 'function') entry.heartbeat.unref();

                this._applyStreamingPriority();

                resolve({
                    success: true,
                    sessionId,
                    infoHash: torrent.infoHash,
                    name: torrent.name,
                    fileIndex: entry.targetFileIndex,
                    fileName: classification.selectedFile?.name,
                    selectedFile: classification.selectedFile,
                    selectionReason: classification.selectionReason,
                    detectedEpisodes: classification.detectedEpisodes,
                    seasonOrganization: classification.seasonOrganization,
                    playableFiles: classification.playableFiles,
                    files: classification.files,
                });
            };

            let existingTorrent = null;
            let existingReadyHandler = null;
            let existingResolved = false;

            const timeoutId = setTimeout(() => {
                if (!this._sessions.has(sessionId)) return;
                if (existingReadyHandler && existingTorrent && typeof existingTorrent.removeListener === 'function') {
                    existingTorrent.removeListener('metadata', existingReadyHandler);
                    existingTorrent.removeListener('ready', existingReadyHandler);
                }
                entry.pending = false;
                this._sessions.delete(sessionId);
                resolve({ success: false, retryable: true, error: 'metadata_timeout' });
            }, METADATA_TIMEOUT_MS);

            const resolveExisting = (torrent) => {
                if (existingResolved) return;
                existingResolved = true;
                clearTimeout(timeoutId);
                onResolved(torrent);
            };

            const resolveExistingOrAdd = async () => {
                try {
                    // Reuse an existing torrent to avoid duplicate add errors.
                    existingTorrent = await this._getExistingTorrent(client, infoHashOrMagnet, magnet, torrentBuffer);
                    if (existingTorrent) {
                        if (this._isTorrentMetadataReady(existingTorrent)) {
                            resolveExisting(existingTorrent);
                        } else if (typeof existingTorrent.once === 'function') {
                            existingReadyHandler = () => resolveExisting(existingTorrent);
                            existingTorrent.once('metadata', existingReadyHandler);
                            existingTorrent.once('ready', existingReadyHandler);
                        } else {
                            resolveExisting(existingTorrent);
                        }
                        return;
                    }

                    const downloadPath = typeof options.downloadPath === 'string' && options.downloadPath.trim()
                        ? options.downloadPath.trim()
                        : this._getTorrentStoragePath();
                    const announce = torrentBuffer ? (this._defaultTrackers || []).slice() : undefined;

                    client.add(
                        source,
                        {
                            path: downloadPath,
                            maxConns: this._torrentSettings.maxConns,
                            announce,
                        },
                        (torrent) => {
                            clearTimeout(timeoutId);
                            onResolved(torrent);
                        }
                    );
                } catch (err) {
                    clearTimeout(timeoutId);
                    this._sessions.delete(sessionId);
                    resolve({ success: false, error: err?.message || String(err) });
                }
            };

            void resolveExistingOrAdd();
        }).finally(() => {
            this._pendingStarts.delete(startKey);
        });

        this._pendingStarts.set(startKey, promise);
        return promise;
    }

    async restoreSession(staging = [], seeding = [], completed = [], current = null) {
        // This API is used by tests for the "current" restore path only.
        const restored = {
            staging: Array.isArray(staging) ? staging.length : 0,
            seeding: Array.isArray(seeding) ? seeding.length : 0,
            completed: Array.isArray(completed) ? completed.length : 0,
        };

        let currentResult = null;
        if (current && (current.infoHash || current.hash)) {
            const infoHash = current.infoHash || current.hash;
            const options = { ...(current.options || {}), ...(current || {}) };
            currentResult = await this.start(infoHash, options);
        }

        return { success: true, restored, current: currentResult };
    }

    // ── Streaming ────────────────────────────────────────────────────────────

    async stream(sessionId, fileIndex, options = {}) {
        const entry = this._sessions.get(sessionId);
        if (!entry) return { success: false, error: 'session_not_found' };
        if (entry.pending || !entry.torrent?.files?.length) return { success: false, error: 'metadata_not_ready' };

        this._markStreamingSession(sessionId);

        const torrent = entry.torrent;
        const idx = Number.isFinite(Number(fileIndex)) ? Number(fileIndex) : entry.targetFileIndex;
        entry.targetFileIndex = idx;

        // Apply prioritization again when requesting stream (can happen after resume).
        try { prioritizePlaybackPieces(torrent, idx, {}); } catch (_) {}

        const file = torrent.files[idx];
        const rawUrl = `http://${STREAM_HOST}:${STREAM_PORT}/webtorrent/${torrent.infoHash}/${encodeURIComponent(file.path.replace(/\\/g, '/'))}`;
        const localResolved = this._resolveTorrentFilePath(entry, idx);
        const localPath = localResolved?.path || null;
        const isComplete = Boolean(torrent.done || entry.seedingStopped || (torrent.progress || 0) >= 0.99);
        const localUrl = isComplete && localPath ? this._toFileUrl(localPath) : '';

        const wantsAudio = options?.audioTrackIndex != null;
        const isMkv = /\.(mkv|webm)$/i.test(String(file?.name || ''));
        const shouldHls = Boolean(wantsAudio || isMkv);

        // When the torrent is fully downloaded and we only need HLS because it's
        // MKV (not because the user selected a specific audio track), bypass HLS
        // and return the direct URL. The WebTorrent HTTP server supports range
        // requests, giving the player full native seeking capability.
        if (isComplete && shouldHls && !wantsAudio) {
            return {
                success: true,
                url: rawUrl,
                rawUrl: localUrl || rawUrl,
                infoHash: torrent.infoHash,
                name: file?.name || torrent.name,
                length: file?.length || torrent.length,
                fileIndex: idx,
                transcoded: false,
            };
        }

        if (shouldHls) {
            const audioTrackIndex = options?.audioTrackIndex;
            const variantKey = `a${audioTrackIndex == null ? 'auto' : String(audioTrackIndex)}`;
            if (!this._hlsJobs.has(sessionId)) this._hlsJobs.set(sessionId, new Map());
            const jobs = this._hlsJobs.get(sessionId);
            let job = jobs.get(variantKey);

            if (!job) {
                const inputUrl = isComplete && localPath ? localPath : rawUrl;
                const started = startRemuxJob({
                    app: this._app,
                    logger: this._logger,
                    sessionId,
                    inputUrl,
                    audioTrackIndex,
                });
                job = {
                    proc: started.proc,
                    url: started.url,
                    manifestPath: started.manifestPath,
                    startedAt: Date.now(),
                    audioTrackIndex,
                };
                jobs.set(variantKey, job);
                // track for cleanup via existing transcode kill logic
                if (!this._sessionTranscodes.has(sessionId)) this._sessionTranscodes.set(sessionId, new Set());
                this._sessionTranscodes.get(sessionId).add(started.proc);
                this._activeTranscodes.add(started.proc);

                started.proc.on('exit', () => {
                    this._activeTranscodes.delete(started.proc);
                });
            }

            const ready = this._fs.existsSync(job.manifestPath);
            if (!ready) {
                const running = job.proc && job.proc.exitCode == null;
                if (!running) {
                    return { success: false, error: 'transcode_error', transcode: { status: 'error' } };
                }
                return { success: false, error: 'transcode_not_ready', transcode: { status: 'running' } };
            }

            return {
                success: true,
                url: job.url,
                rawUrl: localUrl || rawUrl,
                infoHash: torrent.infoHash,
                name: file?.name || torrent.name,
                length: file?.length || torrent.length,
                fileIndex: idx,
                transcoded: true,
                isM3U8: true,
            };
        }

        return {
            success: true,
            url: localUrl || rawUrl,
            rawUrl: localUrl || rawUrl,
            infoHash: torrent.infoHash,
            name: file?.name || torrent.name,
            length: file?.length || torrent.length,
            fileIndex: idx,
            transcoded: false,
        };
    }

    async ensurePrebuffer(sessionId, fileIndex = 0, options = {}) {
        const entry = this._sessions.get(sessionId);
        if (!entry) return { success: false, error: 'session_not_found' };
        if (entry.pending || !entry.torrent) return { success: false, error: 'metadata_not_ready' };
        try {
            const result = await waitForPrebuffer(entry.torrent, fileIndex, options.prebufferBytes, {
                requireMetadataTail: Boolean(options.requireMetadataTail),
            });
            return { success: true, ...result };
        } catch (err) {
            return { success: false, error: err?.message || String(err) };
        }
    }

    // ── Stats / peers ────────────────────────────────────────────────────────

    async stats(sessionId) {
        const entry = this._sessions.get(sessionId);
        if (!entry) return { success: false, error: 'session_not_found' };
        if (entry.pending || !(entry.torrent?.files?.length > 0)) {
            return { success: false, error: 'metadata_not_ready', sessionId, infoHash: entry.infoHash || entry.torrent?.infoHash };
        }

        const t = entry.torrent;
        const { seeders, leechers } = this._getSeederLeecher(t);
        const eta = this._calcEta(t);
        const storage = this._cache.getUsage();
        const stalledForMs = entry.lastDownloadAt ? Math.max(0, Date.now() - entry.lastDownloadAt) : 0;
        const availability = this._computeAvailability(entry, t, stalledForMs);

        const fileIndex = Number.isFinite(entry.targetFileIndex) ? entry.targetFileIndex : 0;
        const file = t.files?.[fileIndex];
        const rawUrl = file ? `http://${STREAM_HOST}:${STREAM_PORT}/webtorrent/${t.infoHash}/${encodeURIComponent(file.path.replace(/\\/g, '/'))}` : '';

        return {
            success: true,
            sessionId,
            name: entry.name || t.name,
            infoHash: t.infoHash,
            progress: Math.round((t.progress || 0) * 100),
            downloadSpeed: entry.ewmaDownloadSpeed || t.downloadSpeed || 0,
            uploadSpeed: entry.ewmaUploadSpeed || t.uploadSpeed || 0,
            numPeers: this._getPeerCount(t),
            seeders,
            leechers,
            ratio: t.ratio,
            // Byte counters for the session panel. `progress` alone cannot say
            // "1.2 GB of 5.4 GB", and the size the indexer advertised is often
            // wrong or absent — these come from the metadata we actually got.
            downloaded: Number(t.downloaded) || 0,
            uploaded: Number(t.uploaded) || 0,
            length: Number(t.length) || 0,
            numFiles: Array.isArray(t.files) ? t.files.length : 0,
            done: Boolean(t.done),
            verified: Boolean(t.done),
            eta,
            startedAt: entry.startedAt,
            storage,
            stalledForMs,
            availability: availability.state,
            availabilityMessage: availability.message,
            repair: entry.repair,
            rawUrl,
        };
    }

    peers(sessionId) {
        const entry = this._sessions.get(sessionId);
        if (!entry || !entry.torrent) return { success: false, error: 'session_not_found' };
        const { seeders, leechers } = this._getSeederLeecher(entry.torrent);
        return { success: true, seeders, leechers, numPeers: this._getPeerCount(entry.torrent) };
    }

    disconnectPeers(sessionId) {
        const entry = this._sessions.get(sessionId);
        if (!entry || !entry.torrent) return { success: false, error: 'session_not_found' };
        try {
            const torrent = entry.torrent;
            if (typeof torrent.pause === 'function') {
                torrent.pause();
            } else if (Array.isArray(torrent.wires)) {
                for (const wire of torrent.wires) {
                    try { wire.destroy(); } catch (_) {}
                }
            }
            return { success: true };
        } catch (err) {
            return { success: false, error: err?.message || String(err) };
        }
    }

    getFilePath(sessionId, fileIndex) {
        const entry = this._sessions.get(sessionId);
        if (!entry || !entry.torrent) return { success: false, error: 'session_not_found' };
        if (entry.pending || !(entry.torrent?.files?.length > 0)) {
            return { success: false, error: 'metadata_not_ready', sessionId, infoHash: entry.infoHash || entry.torrent?.infoHash };
        }

        const idx = Number.isFinite(Number(fileIndex))
            ? Number(fileIndex)
            : Number.isFinite(Number(entry.targetFileIndex))
                ? Number(entry.targetFileIndex)
                : 0;
        const file = entry.torrent.files?.[idx] || entry.torrent.files?.[0];
        if (!file) return { success: false, error: 'file_not_found' };

        const basePath = entry.torrent.path || this._getTorrentStoragePath();
        const relativePath = file.path || file.name || '';
        const fullPath = this._path.join(basePath, relativePath);

        return {
            success: true,
            path: fullPath,
            fileIndex: idx,
            name: file.name || null,
        };
    }

    _resolveTorrentFilePath(entry, fileIndex) {
        try {
            const torrent = entry?.torrent;
            if (!torrent || !torrent.files?.length) return null;
            const idx = Number.isFinite(Number(fileIndex))
                ? Number(fileIndex)
                : Number.isFinite(Number(entry?.targetFileIndex))
                    ? Number(entry.targetFileIndex)
                    : 0;
            const file = torrent.files?.[idx] || torrent.files?.[0];
            if (!file) return null;
            const basePath = torrent.path || this._getTorrentStoragePath();
            const relativePath = file.path || file.name || '';
            if (!relativePath) return null;
            const fullPath = this._path.join(basePath, relativePath);
            if (this._fs?.existsSync && !this._fs.existsSync(fullPath)) return null;
            return { path: fullPath, file };
        } catch {
            return null;
        }
    }

    _toFileUrl(filePath) {
        try {
            const normalized = String(filePath || '').replace(/\\/g, '/');
            if (!normalized) return '';
            if (normalized.startsWith('file://')) return normalized;
            return `file:///${normalized}`;
        } catch {
            return '';
        }
    }

    _getSwarmWires(torrent) {
        const t = torrent || {};
        const discovery = t._discovery || t.discovery || {};
        const swarm = t._swarm || t.swarm || discovery?.swarm || discovery?._swarm || {};
        const wires = swarm?.wires || discovery?.swarm?.wires || discovery?._swarm?.wires || t.wires;
        return Array.isArray(wires) ? wires : [];
    }

    _getPeerCount(torrent) {
        const t = torrent || {};
        const numPeers = Number.isFinite(t.numPeers) ? t.numPeers : null;
        const wires = this._getSwarmWires(t);
        if (wires.length > 0) return wires.length;
        return numPeers ?? 0;
    }

    _getSeederLeecher(torrent) {
        const t = torrent || {};
        const peers = this._getSwarmWires(t);
        let seeders = null;
        let leechers = null;

        if (peers.length > 0) {
            seeders = 0;
            leechers = 0;
            for (const w of peers) {
                // best-effort: many wire objects expose `peerChoking`/`amChoking` but not completed.
                const isSeeder = Boolean(w?.peerInterested === false && w?.peerChoking === false && w?.downloaded > 0 && w?.uploaded > 0);
                if (isSeeder) seeders += 1;
                else leechers += 1;
            }
        }

        // Fallback to tracker-provided counts if available.
        if (t._trackers && Array.isArray(t._trackers)) {
            for (const tr of t._trackers) {
                if (Number.isFinite(tr?.seeders)) {
                    seeders = seeders == null ? tr.seeders : Math.max(seeders, tr.seeders);
                }
                if (Number.isFinite(tr?.leechers)) {
                    leechers = leechers == null ? tr.leechers : Math.max(leechers, tr.leechers);
                }
            }
        }

        return { seeders, leechers };
    }

    _calcEta(torrent) {
        try {
            const t = torrent || {};
            if (t.done) return 0;
            const remaining = Math.max(0, (t.length || 0) - (t.downloaded || 0));
            const speed = Math.max(1, t.downloadSpeed || 0);
            if (!speed || remaining <= 0) return null;
            return remaining / speed;
        } catch {
            return null;
        }
    }

    // ── Playback updates ─────────────────────────────────────────────────────

    updatePlayback(sessionId, currentTime, duration) {
        const entry = this._sessions.get(sessionId);
        if (!entry || !entry.torrent) return { success: false, error: 'session_not_found' };
        entry.lastPlaybackAt = Date.now();
        this._markStreamingSession(sessionId);
        try {
            prioritizeSeekPoint(entry.torrent, entry.targetFileIndex || 0, Number(currentTime || 0), Number(duration || 0));
            return { success: true };
        } catch (err) {
            return { success: false, error: err?.message || String(err) };
        }
    }

    // ── Repair ───────────────────────────────────────────────────────────────

    async reannounceSession(sessionId) {
        const entry = this._sessions.get(sessionId);
        if (!entry || !entry.torrent) return { success: false, error: 'session_not_found' };
        try {
            entry.repair = { at: Date.now() };
            const t = entry.torrent;
            if (typeof t.announce === 'function') t.announce();
            if (t.discovery && typeof t.discovery.announce === 'function') t.discovery.announce();
            return { success: true };
        } catch (err) {
            return { success: false, error: err?.message || String(err) };
        }
    }

    // ── Stop / clear / restart ───────────────────────────────────────────────

    async stop(sessionId, options = {}) {
        const entry = this._sessions.get(sessionId);
        if (!entry) return { success: false, error: 'session_not_found' };

        this._clearStreamingSession(sessionId);

        const destroyStore = options.destroyStore != null
            ? Boolean(options.destroyStore)
            : Boolean(this._torrentSettings.autoFreeSpace && this._torrentSettings.cleanupOnPlaybackEnd);

        return new Promise((resolve) => {
            try {
                this._killSessionTranscodes(sessionId);
                if (entry.heartbeat) clearInterval(entry.heartbeat);
                if (this._hlsJobs.has(sessionId)) this._hlsJobs.delete(sessionId);

                if (this._client && entry.torrent) {
                    const removePromise = this._client.remove(entry.torrent, { destroyStore }, () => {});
                    if (removePromise?.catch) removePromise.catch(() => {});
                }

                if (destroyStore && entry.torrent?.path) {
                    try {
                        if (typeof this._fs.rmSync === 'function') {
                            this._fs.rmSync(entry.torrent.path, { recursive: true, force: true });
                        }
                    } catch (_) {}
                }

                this._sessions.delete(sessionId);
                this._runCacheCleanup();
                this._applyStreamingPriority();
                resolve({ success: true, destroyStore });
            } catch (err) {
                resolve({ success: false, error: err?.message || String(err) });
            }
        });
    }

    async clearAllData() {
        try {
            for (const sessionId of [...this._sessions.keys()]) {
                // do not destroy store here; user explicitly clearing cache should.
                // we do remove torrents and then clear cache root.
                await this.stop(sessionId, { destroyStore: true });
            }
            try {
                const root = this._cache.getRoot();
                this._fs.rmSync(root, { recursive: true, force: true });
                this._fs.mkdirSync(root, { recursive: true });
            } catch (_) {}
            return { success: true };
        } catch (err) {
            return { success: false, error: err?.message || String(err) };
        }
    }

    async restartService() {
        try {
            this.destroyAll();
            await this._ensureClient();
            return { success: true };
        } catch (err) {
            return { success: false, error: err?.message || String(err) };
        }
    }

    destroyAll() {
        try {
            for (const [sessionId, entry] of this._sessions) {
                try { if (entry.heartbeat) clearInterval(entry.heartbeat); } catch (_) {}
                this._killSessionTranscodes(sessionId);
            }
            this._sessions.clear();
            this._pendingStarts.clear();
            this._streamingSessions.clear();
            this._activeTranscodes.clear();
            this._sessionTranscodes.clear();
            this._hlsJobs.clear();

            if (this._client) {
                const client = this._client;
                this._client = null;
                try { client.destroy(() => {}); } catch (_) {}
            }
            if (this._streamServer) {
                try { this._streamServer.close(); } catch (_) {}
                this._streamServer = null;
            }
        } catch (_) {}
    }

    // ── Diagnostics helpers ──────────────────────────────────────────────────

    _dumpSessionDiagnostics(sessionId, entry) {
        const t = entry?.torrent;
        if (!t) return { sessionId, error: 'no-torrent' };
        const wires = this._getSwarmWires(t);
        return {
            sessionId,
            infoHash: t.infoHash,
            name: t.name,
            progress: t.progress,
            downloaded: t.downloaded,
            length: t.length,
            downloadSpeed: t.downloadSpeed,
            uploadSpeed: t.uploadSpeed,
            numPeers: this._getPeerCount(t),
            wires: wires.length,
            startedAt: entry.startedAt,
            lastDownloadAt: entry.lastDownloadAt,
            settings: this._torrentSettings,
            storage: this._cache.getUsage(),
        };
    }

    // ── Internal helpers ─────────────────────────────────────────────────────

    _buildStartKey(infoHash, options, magnet) {
        if (options?._resolvedBuffer != null) {
            const buf = Buffer.isBuffer(options._resolvedBuffer)
                ? options._resolvedBuffer
                : Buffer.from(options._resolvedBuffer);
            return `buffer:${crypto.createHash('sha1').update(buf).digest('hex')}`;
        }

        const parsedHash = this._extractInfoHash(magnet || infoHash);
        if (parsedHash) return `infohash:${parsedHash}`;

        return `magnet:${String(magnet || infoHash || '').trim()}`;
    }

    _extractInfoHash(input) {
        if (input == null) return null;
        const value = String(input).trim();
        if (!value) return null;
        if (/^[a-fA-F0-9]{40}$/.test(value)) return value.toLowerCase();
        if (/^[a-zA-Z2-7]{32}$/.test(value)) return value.toLowerCase();
        const match = value.match(/xt=urn:btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/i);
        return match ? String(match[1]).toLowerCase() : null;
    }

    _isTorrentMetadataReady(torrent) {
        return Boolean(torrent?.files?.length) || torrent?.ready === true || torrent?.metadata === true;
    }

    async _getExistingTorrent(client, infoHashOrMagnet, magnet, torrentBuffer) {
        if (!client || typeof client.get !== 'function') return null;
        const candidates = [];
        const parsedHash = this._extractInfoHash(magnet || infoHashOrMagnet);
        if (parsedHash) candidates.push(parsedHash);

        const pushString = (value) => {
            if (typeof value !== 'string') return;
            const trimmed = value.trim();
            if (!trimmed) return;
            if (!candidates.includes(trimmed)) candidates.push(trimmed);
        };

        pushString(infoHashOrMagnet);
        pushString(magnet);

        if (torrentBuffer) candidates.push(torrentBuffer);

        for (const id of candidates) {
            try {
                const torrent = await client.get(id);
                if (torrent) return torrent;
            } catch (_) {}
        }

        return null;
    }

    _injectTrackersIntoMagnet(magnet) {
        try {
            if (!magnet || typeof magnet !== 'string') return magnet;
            const trimmed = magnet.trim();
            if (!trimmed) return trimmed;

            let normalized = trimmed;
            if (!normalized.startsWith('magnet:')) {
                const hash = this._extractInfoHash(normalized);
                if (!hash) return trimmed;
                normalized = `magnet:?xt=urn:btih:${hash}`;
            }

            // Extract existing trackers from the magnet link to avoid duplicates
            const existingTrackers = new Set();
            const qIndex = normalized.indexOf('?');
            if (qIndex !== -1) {
                const queryString = normalized.substring(qIndex + 1);
                const parts = queryString.split('&');
                for (const part of parts) {
                    const [key, value] = part.split('=');
                    if (key && key.toLowerCase() === 'tr' && value) {
                        try {
                            const decoded = decodeURIComponent(value).trim().toLowerCase();
                            if (decoded) {
                                existingTrackers.add(decoded);
                            }
                        } catch (_) {}
                    }
                }
            }

            // Find default trackers that are not already present in the magnet link
            const toAdd = [];
            for (const tr of (this._defaultTrackers || [])) {
                if (tr && typeof tr === 'string') {
                    const normalizedTr = tr.trim().toLowerCase();
                    if (!existingTrackers.has(normalizedTr)) {
                        toAdd.push(tr.trim());
                    }
                }
            }

            if (toAdd.length > 0) {
                const joiner = normalized.includes('?') ? '&' : '?';
                const trs = toAdd.map((t) => `tr=${encodeURIComponent(t)}`).join('&');
                normalized = `${normalized}${joiner}${trs}`;
            }

            return normalized;
        } catch (e) {
            this._logger?.warn?.('[Torrent] Failed to inject trackers:', e?.message || e);
            return magnet;
        }
    }

    _classifyTorrentFiles(torrent, startOptions = {}) {
        const filesRaw = Array.isArray(torrent?.files) ? torrent.files : [];
        const files = filesRaw.map((f, index) => ({
            index,
            name: f.name,
            path: f.path,
            length: f.length,
            size: safeNumber(f.length, 0),
            isVideo: PLAYABLE_VIDEO_EXTENSIONS.test(String(f.name || f.path || '')),
            isExe: /\.exe$/i.test(String(f.name || f.path || '')),
            episodeNumber: parseReleaseName(f.name || '').episodeNumber,
        }));

        const playableFiles = files.filter((f) => PLAYABLE_VIDEO_EXTENSIONS.test(String(f.name || '')));
        const hasPlayableFiles = playableFiles.length > 0;

        const detectedEpisodes = playableFiles
            .map((f) => parseReleaseName(f.name || '').episodeNumber)
            .filter((n) => Number.isFinite(Number(n)))
            .map((n) => Number(n))
            .sort((a, b) => a - b)
            .filter((v, idx, arr) => idx === 0 || arr[idx - 1] !== v);

        const matchResult = startOptions?.episode != null
            ? matchTorrentFilesToEpisode(
                // Use full path when available so season folders (e.g. "Season 2/")
                // influence matching for duplicated episode filenames.
                playableFiles.map((f) => ({ name: f.path || f.name, length: f.length })),
                { episode: startOptions.episode, season: startOptions.season }
            )
            : null;

        let selectedFileIndex = null;
        let selectionReason = null;

        if (startOptions?.fileIndex != null && Number.isFinite(Number(startOptions.fileIndex))) {
            selectedFileIndex = Number(startOptions.fileIndex);
            selectionReason = 'requested_file_index';
        } else if (matchResult && matchResult.matched) {
            // map from playable files list back to torrent.files index:
            const playableOriginalIndex = playableFiles[matchResult.fileIndex]?.index;
            if (playableOriginalIndex != null) {
                selectedFileIndex = playableOriginalIndex;
                selectionReason = 'episode_match';
            }
        }

        if (selectedFileIndex == null && hasPlayableFiles) {
            const batchMeta = detectBatchTorrentLayout({ title: torrent?.name, name: torrent?.name }, playableFiles);
            const firstDetectedEpisode = detectedEpisodes[0] ?? null;
            const firstDetectedEpisodeFile = firstDetectedEpisode != null
                ? playableFiles.find((file) => Number(parseReleaseName(file.name || '').episodeNumber) === firstDetectedEpisode)
                : null;

            if (batchMeta.isBatch && firstDetectedEpisodeFile) {
                selectedFileIndex = firstDetectedEpisodeFile.index;
                selectionReason = 'first_detected_episode';
            } else {
                const largestPlayable = playableFiles.reduce((largest, current) => {
                    return (current.size || 0) > (largest.size || 0) ? current : largest;
                }, playableFiles[0]);
                selectedFileIndex = largestPlayable?.index ?? null;
                selectionReason = 'largest_playable';
            }
        }

        const selectedFile = selectedFileIndex != null
            ? files.find((file) => file.index === selectedFileIndex) || null
            : null;

        return {
            files,
            playableFiles,
            detectedEpisodes,
            hasPlayableFiles,
            hasFiles: filesRaw.length > 0,
            selectedFileIndex,
            selectedFile,
            selectionReason,
            matchResult,
            seasonOrganization: this._buildSeasonOrganization(playableFiles),
            blockedUnsupportedMedia: filesRaw.length > 0 && !hasPlayableFiles,
        };
    }

    _buildSeasonOrganization(playableFiles) {
        // Best-effort: infer season from folder names (`Season 2/`) or release parser.
        const bySeason = new Map();
        for (const f of playableFiles || []) {
            const parsed = parseReleaseName(f.name || '');
            let season = parsed.season;
            if (season == null) {
                const pathValue = String(f.path || '');
                const m = pathValue.match(/season\s*(\d{1,2})/i);
                if (m) season = Number(m[1]);
            }
            season = season == null ? 1 : Number(season);
            const ep = parsed.episodeNumber;
            if (!bySeason.has(season)) bySeason.set(season, { season, episodes: [], totalBytes: 0 });
            const s = bySeason.get(season);
            if (Number.isFinite(Number(ep))) s.episodes.push(Number(ep));
            s.totalBytes += safeNumber(f.length, 0);
        }
        const out = [...bySeason.values()].map((s) => {
            s.episodes.sort((a, b) => a - b);
            s.episodes = s.episodes.filter((v, i, arr) => i === 0 || arr[i - 1] !== v);
            return { season: s.season, episodeCount: s.episodes.length, episodes: s.episodes, totalBytes: s.totalBytes };
        });
        out.sort((a, b) => a.season - b.season);
        return out;
    }

    _runCacheCleanup() {
        try {
            const maxBytes = safeNumber(this._torrentSettings.cleanupMaxCacheGb, 50) * 1024 * 1024 * 1024;
            const maxAgeMs = safeNumber(this._torrentSettings.cleanupMaxAgeHours, 72) * 60 * 60 * 1000;
            const activePaths = [];
            for (const entry of this._sessions.values()) {
                if (entry?.torrent?.path) activePaths.push(entry.torrent.path);
            }
            this._cache.cleanupUnused({ maxBytes, maxAgeMs, activePaths });
        } catch (_) {}
    }

    _emitTorrentProgressToRenderer(payload) {
        try {
            const win = this._getMainWindow();
            if (win && !win.isDestroyed?.()) {
                win.webContents.send('torrent:progress', payload);
            }
        } catch (_) {}
    }

    _emitMetadataReady(payload) {
        try {
            const win = this._getMainWindow();
            if (win && !win.isDestroyed?.()) {
                win.webContents.send('torrent:metadata-ready', payload);
            }
        } catch (_) {}
    }

    _emitTorrentBlocked(payload) {
        try {
            const win = this._getMainWindow();
            if (win && !win.isDestroyed?.()) {
                win.webContents.send('torrent:blocked', payload);
            }
        } catch (_) {}
    }

    _buildProgressEvent(sessionId, entry) {
        const t = entry?.torrent;
        if (!t) return null;
        const { seeders, leechers } = this._getSeederLeecher(t);
        const rawDl = t.downloadSpeed || 0;
        const rawUl = t.uploadSpeed || 0;
        entry.ewmaDownloadSpeed = entry.ewmaDownloadSpeed
            ? (SPEED_EWMA_ALPHA * rawDl + (1 - SPEED_EWMA_ALPHA) * entry.ewmaDownloadSpeed)
            : rawDl;
        entry.ewmaUploadSpeed = entry.ewmaUploadSpeed
            ? (SPEED_EWMA_ALPHA * rawUl + (1 - SPEED_EWMA_ALPHA) * entry.ewmaUploadSpeed)
            : rawUl;

        const numPeers = this._getPeerCount(t);
        if (numPeers > 0) {
            entry.lastPeersAt = Date.now();
            entry.lastNonZeroPeersAt = Date.now();
        }

        const progressPct = Math.round((t.progress || 0) * 100);
        const stalledForMs = entry.lastDownloadAt ? Math.max(0, Date.now() - entry.lastDownloadAt) : 0;
        const availability = this._computeAvailability(entry, t, stalledForMs);
        return {
            sessionId,
            infoHash: t.infoHash,
            name: t.name,
            progress: progressPct,
            downloadSpeed: entry.ewmaDownloadSpeed || rawDl,
            uploadSpeed: entry.ewmaUploadSpeed || rawUl,
            numPeers,
            seeders,
            leechers,
            eta: this._calcEta(t),
            done: Boolean(t.done),
            verified: Boolean(t.done),
            stalledForMs,
            availability: availability.state,
            availabilityMessage: availability.message,
            repair: entry.repair,
            updatedAt: nowIso(),
        };
    }

    _computeAvailability(entry, torrent, stalledForMs) {
        const now = Date.now();
        if (torrent?.done) {
            return { state: 'ok', message: '' };
        }
        const numPeers = this._getPeerCount(torrent);
        const sinceStart = now - (entry?.startedAt || now);
        const lastNonZeroPeersAt = entry?.lastNonZeroPeersAt || 0;
        const peersRecently = lastNonZeroPeersAt > 0 && (now - lastNonZeroPeersAt) <= PEERS_FLAP_WINDOW_MS;

        if (numPeers <= 0) {
            if (sinceStart >= NO_PEERS_GRACE_MS && !peersRecently) {
                return {
                    state: 'no_peers',
                    message: 'No peers found yet. Try Repair or pick a different release.',
                };
            }
            return { state: 'searching', message: 'Searching for peers…' };
        }

        if (stalledForMs >= STALL_DETECT_MS && (entry?.ewmaDownloadSpeed || 0) <= 0) {
            return { state: 'stalled', message: 'Peers connected but download stalled. Try Repair.' };
        }

        return { state: 'ok', message: '' };
    }

    _markStreamingSession(sessionId) {
        if (!sessionId) return;
        const entry = this._sessions.get(sessionId);
        if (entry) entry.lastPlaybackAt = Date.now();
        this._streamingSessions.add(sessionId);
        this._applyStreamingPriority();
    }

    _clearStreamingSession(sessionId) {
        if (!sessionId) return;
        if (this._streamingSessions.delete(sessionId)) {
            this._applyStreamingPriority();
        }
    }

    _applyStreamingPriority() {
        const now = Date.now();
        for (const sessionId of [...this._streamingSessions]) {
            const entry = this._sessions.get(sessionId);
            if (!entry || (entry.lastPlaybackAt && now - entry.lastPlaybackAt > STREAMING_IDLE_MS)) {
                this._streamingSessions.delete(sessionId);
            }
        }

        const hasStreaming = this._streamingSessions.size > 0;
        for (const entry of this._sessions.values()) {
            const torrent = entry?.torrent;
            if (!torrent) continue;
            const isStreaming = this._streamingSessions.has(entry.sessionId);
            if (entry.deferSeedingPause && !isStreaming) {
                this._finalizeSeedingStop(entry);
                continue;
            }
            if (entry.seedingStopped) continue;

            if (hasStreaming && !isStreaming) {
                if (!entry.pausedForStreaming && typeof torrent.pause === 'function') {
                    try {
                        torrent.pause();
                        entry.pausedForStreaming = true;
                    } catch (_) {}
                }
            } else if (entry.pausedForStreaming && typeof torrent.resume === 'function') {
                try {
                    torrent.resume();
                } catch (_) {}
                entry.pausedForStreaming = false;
            }
        }
    }

    _handleTorrentCompleted(entry) {
        if (!entry || entry.seedingStopped) return;
        const torrent = entry.torrent;
        if (!torrent) return;

        const isStreaming = this._streamingSessions.has(entry.sessionId)
            || (entry.lastPlaybackAt && Date.now() - entry.lastPlaybackAt <= STREAMING_IDLE_MS);

        entry.seedingStopped = true;
        this._stopSeedingWires(torrent);

        if (isStreaming) {
            entry.deferSeedingPause = true;
            return;
        }

        this._finalizeSeedingStop(entry);
    }

    _finalizeSeedingStop(entry) {
        if (!entry || !entry.torrent) return;
        const torrent = entry.torrent;
        entry.deferSeedingPause = false;
        try {
            if (typeof torrent.pause === 'function') torrent.pause();
        } catch (_) {}
        this._stopSeedingWires(torrent);
        this._clearStreamingSession(entry.sessionId);
    }

    _stopSeedingWires(torrent) {
        try {
            const wires = this._getSwarmWires(torrent);
            for (const wire of wires) {
                try { wire?.destroy?.(); } catch (_) {}
            }
        } catch (_) {}
    }

    _killSessionTranscodes(sessionId) {
        const sessionTranscodes = this._sessionTranscodes.get(sessionId);
        if (!sessionTranscodes) return 0;
        let killed = 0;
        for (const proc of sessionTranscodes) {
            this._activeTranscodes.delete(proc);
            try {
                proc.kill('SIGKILL');
                killed += 1;
            } catch (_) {}
        }
        this._sessionTranscodes.delete(sessionId);
        return killed;
    }
}

module.exports = { TorrentSessionManager };

