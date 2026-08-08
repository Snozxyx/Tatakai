'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

/**
 * AutoDownloader — polls for new episodes every 30 minutes and enqueues
 * downloads for subscribed anime series.
 *
 * Subscription record shape:
 * {
 *   title:            string   — anime title used for search / display
 *   nextEpisode:      number   — next episode number to download
 *   addedAt:          number   — timestamp (ms) when subscription was created
 *   enqueuedEpisodes: number[] — episode numbers already enqueued (dedup guard)
 * }
 *
 * Requirements: 20.1 – 20.9
 */
class AutoDownloader {
    constructor(logger) {
        this.logger = logger;
        /** @type {Map<string, {title: string, nextEpisode: number, addedAt: number, enqueuedEpisodes: number[]}>} */
        this.subscriptions = new Map(); // animeId -> subscription record
        this.intervalId = null;
        this._enqueueFn = null; // set by start()
        this.configPath = path.join(app.getPath('userData'), 'auto-downloader.json');

        this.loadConfig();
    }

    // ─── Persistence ──────────────────────────────────────────────────────────

    loadConfig() {
        try {
            if (fs.existsSync(this.configPath)) {
                const data = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
                const entries = Object.entries(data.subscriptions || {});
                this.subscriptions = new Map(
                    entries.map(([id, rec]) => [
                        id,
                        {
                            title: rec.title,
                            nextEpisode: rec.nextEpisode,
                            addedAt: rec.addedAt,
                            // Migrate old records that lack enqueuedEpisodes
                            enqueuedEpisodes: Array.isArray(rec.enqueuedEpisodes) ? rec.enqueuedEpisodes : [],
                        },
                    ])
                );
            }
        } catch (err) {
            this.logger.error('[AutoDownloader] Failed to load config:', err.message);
        }
    }

    saveConfig() {
        try {
            const data = {
                subscriptions: Object.fromEntries(this.subscriptions),
            };
            fs.writeFileSync(this.configPath, JSON.stringify(data, null, 2));
        } catch (err) {
            this.logger.error('[AutoDownloader] Failed to save config:', err.message);
        }
    }

    // ─── Public API ───────────────────────────────────────────────────────────

    /**
     * Subscribe to auto-download for an anime.
     * Requirement 20.1: creates a subscription record with nextEpisode set to
     * the specified episode number.
     *
     * @param {string} animeId
     * @param {string} title
     * @param {number} nextEpisode
     */
    subscribe(animeId, title, nextEpisode) {
        this.subscriptions.set(animeId, {
            title,
            nextEpisode,
            addedAt: Date.now(),
            enqueuedEpisodes: [],
        });
        this.saveConfig();
        this.logger.info(`[AutoDownloader] Subscribed to "${title}" starting at episode ${nextEpisode}`);
        return true;
    }

    /**
     * Unsubscribe from auto-download for an anime.
     * Requirement 20.2
     *
     * @param {string} animeId
     */
    unsubscribe(animeId) {
        if (this.subscriptions.has(animeId)) {
            this.subscriptions.delete(animeId);
            this.saveConfig();
            return true;
        }
        return false;
    }

    /**
     * Return all active subscription records.
     * Requirement 20.3
     */
    getSubscriptions() {
        return Array.from(this.subscriptions.entries()).map(([id, data]) => ({
            id,
            ...data,
        }));
    }

    // ─── Lifecycle ────────────────────────────────────────────────────────────

    /**
     * Start the polling service.
     * Requirement 20.4: poll every 30 minutes.
     *
     * @param {Function} runEpisodeDownload  — the internal download enqueue fn
     *   from ipc-download-manager.cjs (same signature as runEpisodeDownload)
     */
    start(runEpisodeDownload) {
        if (this.intervalId) return;
        this._enqueueFn = runEpisodeDownload;
        this.logger.info('[AutoDownloader] Service started (poll interval: 30 min)');

        // Requirement 20.4: poll every 30 minutes
        this.intervalId = setInterval(() => {
            this.checkFeeds();
        }, 30 * 60 * 1000);

        // Initial check 30 seconds after start to avoid blocking app startup
        setTimeout(() => this.checkFeeds(), 30000);
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            this.logger.info('[AutoDownloader] Service stopped');
        }
    }

    // ─── Feed Checking ────────────────────────────────────────────────────────

    /**
     * Check all subscriptions for new episodes and enqueue downloads.
     * Requirements 20.4 – 20.9
     */
    async checkFeeds() {
        this.logger.info('[AutoDownloader] Checking feeds for new episodes...');

        if (this.subscriptions.size === 0) {
            this.logger.info('[AutoDownloader] No subscriptions to check.');
            return;
        }

        for (const [animeId, data] of this.subscriptions) {
            try {
                await this._checkSubscription(animeId, data);
            } catch (err) {
                this.logger.error(
                    `[AutoDownloader] Error checking subscription for "${data.title}":`,
                    err.message
                );
            }
        }
    }

    /**
     * Check a single subscription for the next episode and enqueue if found.
     *
     * @param {string} animeId
     * @param {{ title: string, nextEpisode: number, enqueuedEpisodes: number[] }} data
     */
    async _checkSubscription(animeId, data) {
        const { title, nextEpisode } = data;

        this.logger.info(
            `[AutoDownloader] Checking "${title}" for episode ${nextEpisode}...`
        );

        // Requirement 20.7: never enqueue the same episode twice for the same subscription
        if (data.enqueuedEpisodes.includes(nextEpisode)) {
            this.logger.info(
                `[AutoDownloader] Episode ${nextEpisode} of "${title}" already enqueued — skipping.`
            );
            return;
        }

        // Attempt to find a source for episode N
        const source = await this._resolveSource(animeId, title, nextEpisode);

        if (!source) {
            // Requirement 20.9: both sources unavailable — skip, retry next poll
            this.logger.info(
                `[AutoDownloader] No source available for "${title}" episode ${nextEpisode} — will retry next poll.`
            );
            return;
        }

        // Build the download payload
        const episodeId = `auto-${animeId}-ep${nextEpisode}-${Date.now()}`;
        const payload = {
            episodeId,
            animeName: title,
            episodeNumber: nextEpisode,
            sourceType: source.sourceType,
            ...(source.sourceType === 'hls' ? { url: source.url, headers: source.headers || {} } : {}),
            ...(source.sourceType === 'torrent' ? { magnet: source.magnet } : {}),
        };

        this.logger.info(
            `[AutoDownloader] Enqueuing "${title}" episode ${nextEpisode} via ${source.sourceType}`
        );

        // Requirement 20.7: mark as enqueued before calling the download fn
        data.enqueuedEpisodes.push(nextEpisode);
        this.saveConfig();

        // Enqueue the download
        if (typeof this._enqueueFn === 'function') {
            const result = await this._enqueueFn(payload);
            if (result && result.success !== false) {
                // Requirement 20.6: after successful enqueue, register a completion
                // listener so nextEpisode is advanced to N+1 once the download finishes.
                this._watchForCompletion(animeId, nextEpisode, episodeId);
            } else {
                // Enqueue failed — remove from enqueuedEpisodes so it can be retried
                data.enqueuedEpisodes = data.enqueuedEpisodes.filter((ep) => ep !== nextEpisode);
                this.saveConfig();
                this.logger.warn(
                    `[AutoDownloader] Enqueue failed for "${title}" episode ${nextEpisode}:`,
                    result && result.error
                );
            }
        }
    }

    /**
     * Resolve the best available source for an episode.
     * Requirement 20.5: prefer HLS; fall back to torrent (Req 20.8).
     * Returns null when both are unavailable (Req 20.9).
     *
     * @param {string} animeId
     * @param {string} title
     * @param {number} episode
     * @returns {Promise<{sourceType: 'hls'|'torrent', url?: string, magnet?: string, headers?: object}|null>}
     */
    async _resolveSource(animeId, title, episode) {
        // ── Step 1: Try HLS source ────────────────────────────────────────────
        // Requirement 20.5 / 20.8: attempt HLS first
        try {
            const hlsSource = await this._findHlsSource(animeId, title, episode);
            if (hlsSource) {
                return { sourceType: 'hls', url: hlsSource.url, headers: hlsSource.headers };
            }
        } catch (err) {
            this.logger.warn(
                `[AutoDownloader] HLS source lookup failed for "${title}" ep ${episode}:`,
                err.message
            );
        }

        // ── Step 2: Fall back to torrent source ───────────────────────────────
        // Requirement 20.8: fall back to torrent if HLS is unavailable
        try {
            const torrentSource = await this._findTorrentSource(animeId, title, episode);
            if (torrentSource) {
                return { sourceType: 'torrent', magnet: torrentSource.magnet };
            }
        } catch (err) {
            this.logger.warn(
                `[AutoDownloader] Torrent source lookup failed for "${title}" ep ${episode}:`,
                err.message
            );
        }

        // Requirement 20.9: both unavailable
        return null;
    }

    /**
     * Attempt to find an HLS (m3u8) source for the given episode.
     * Returns { url, headers } on success, or null if unavailable.
     *
     * This is a stub that extension providers or the TatakaiAPI can populate.
     * The method is intentionally async so real implementations can make
     * network requests without changing the calling code.
     *
     * @param {string} _animeId
     * @param {string} _title
     * @param {number} _episode
     * @returns {Promise<{url: string, headers?: object}|null>}
     */
    // eslint-disable-next-line no-unused-vars
    async _findHlsSource(_animeId, _title, _episode) {
        // Real implementation: query TatakaiAPI / extension providers for an
        // HLS stream URL for this episode.  Return null when not found.
        return null;
    }

    /**
     * Attempt to find a torrent (magnet) source for the given episode.
     * Returns { magnet } on success, or null if unavailable.
     *
     * @param {string} _animeId
     * @param {string} title
     * @param {number} episode
     * @returns {Promise<{magnet: string}|null>}
     */
    // eslint-disable-next-line no-unused-vars
    async _findTorrentSource(_animeId, title, episode) {
        // Real implementation: search Nyaa RSS for a matching torrent candidate.
        // Return null when no suitable candidate is found.
        return null;
    }

    // ─── Completion Tracking ──────────────────────────────────────────────────

    /**
     * Listen for the download-completed IPC event for a specific episodeId and,
     * when it fires, advance nextEpisode to N+1.
     *
     * Requirement 20.6: update nextEpisode to N+1 before the next poll cycle.
     *
     * @param {string} animeId
     * @param {number} episode
     * @param {string} episodeId
     */
    _watchForCompletion(animeId, episode, episodeId) {
        // We use Electron's ipcMain to listen for the download-completed event
        // that ipc-download-manager.cjs sends to the renderer window.
        // Because AutoDownloader lives in the main process we can hook into the
        // event via the global ipcMain instance.
        let ipcMain;
        try {
            ipcMain = require('electron').ipcMain;
        } catch (_) {
            // Not in Electron context (e.g. unit tests) — skip
            return;
        }

        // Use a one-shot listener on the 'download-completed' channel.
        // ipcMain does not natively support filtering by payload, so we register
        // a handler and remove it once our episode is confirmed.
        const handler = (_event, payload) => {
            if (payload && payload.episodeId === episodeId) {
                ipcMain.removeListener('download-completed-internal', handler);
                this._onEpisodeDownloaded(animeId, episode);
            }
        };

        // ipc-download-manager sends 'download-completed' to the renderer window
        // via webContents.send, not via ipcMain.  We therefore use a direct
        // in-process event emitter approach: ipc-download-manager calls
        // autoDownloader.notifyDownloadCompleted() when a download finishes.
        // Store the pending completion so notifyDownloadCompleted() can resolve it.
        if (!this._pendingCompletions) {
            this._pendingCompletions = new Map();
        }
        this._pendingCompletions.set(episodeId, { animeId, episode });
    }

    /**
     * Called by ipc-download-manager (or tests) when a download completes.
     * Advances nextEpisode to N+1 for the relevant subscription.
     *
     * Requirement 20.6
     *
     * @param {string} episodeId
     */
    notifyDownloadCompleted(episodeId) {
        if (!this._pendingCompletions || !this._pendingCompletions.has(episodeId)) return;

        const { animeId, episode } = this._pendingCompletions.get(episodeId);
        this._pendingCompletions.delete(episodeId);
        this._onEpisodeDownloaded(animeId, episode);
    }

    /**
     * Advance nextEpisode to N+1 after a successful download.
     *
     * @param {string} animeId
     * @param {number} episode
     */
    _onEpisodeDownloaded(animeId, episode) {
        const data = this.subscriptions.get(animeId);
        if (!data) return;

        // Only advance if this episode is still the current nextEpisode
        // (guard against out-of-order completions)
        if (data.nextEpisode === episode) {
            data.nextEpisode = episode + 1;
            this.logger.info(
                `[AutoDownloader] "${data.title}" episode ${episode} downloaded — advancing to episode ${data.nextEpisode}`
            );
            this.saveConfig();
        }
    }
}

let instance = null;

module.exports = {
    init: (logger) => {
        if (!instance) instance = new AutoDownloader(logger);
        return instance;
    },
    getInstance: () => instance,
    // Exported for testing
    AutoDownloader,
};
