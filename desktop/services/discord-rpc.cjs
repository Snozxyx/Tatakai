'use strict';

const DiscordRPC = require('discord-rpc');

function createDiscordRpc({ logger, clientId }) {
    let rpc = null;
    let rpcReady = false;
    let pendingRpcActivity = null;

    function init() {
        try {
            DiscordRPC.register(clientId);
        } catch (err) {
            logger.warn('Discord RPC register failed', err);
        }

        rpc = new DiscordRPC.Client({ transport: 'ipc' });
        rpc.on('ready', () => {
            rpcReady = true;
            if (pendingRpcActivity) {
                const { details, state, extra } = pendingRpcActivity;
                pendingRpcActivity = null;
                void setActivity(details, state, extra);
                return;
            }
            // On first connect show a minimal idle presence.
            void setActivity('On Tatakai', 'Just opened the app', {
                largeImageKey: 'logo',
                largeImageText: 'Tatakai — Otaku Community',
            });
        });
        rpc.on('disconnected', () => {
            rpcReady = false;
        });
        rpc.on('error', (err) => {
            rpcReady = false;
            logger.warn('Discord RPC error', err);
        });
        rpc.login({ clientId }).catch((err) => {
            logger.warn('Discord RPC login failed', err);
        });
    }

    /**
     * @param {string} details  - First (bold) line shown by Discord.
     * @param {string} state    - Second line.
     * @param {Object} extra    - Optional rich fields.
     * @param {Date}   [extra.startTime]
     * @param {Date}   [extra.endTime]
     * @param {string} [extra.largeImageKey]
     * @param {string} [extra.largeImageText]
     * @param {string} [extra.smallImageKey]
     * @param {string} [extra.smallImageText]
     * @param {Array}  [extra.buttons]          - Up to 2 {label, url} objects.
     * @param {boolean}[extra.instance]
     */
    async function setActivity(details, state, extra = {}) {
        if (!rpc) return;

        const normalizedExtra = extra && typeof extra === 'object' ? extra : {};
        if (!rpcReady) {
            pendingRpcActivity = { details, state, extra: normalizedExtra };
            return;
        }

        /** @type {Record<string, any>} */
        const activity = {
            details: details || 'On Tatakai',
            state: state || '',
            largeImageKey: normalizedExtra.largeImageKey || 'logo',
            largeImageText: normalizedExtra.largeImageText || 'Tatakai — Otaku Community',
            instance: normalizedExtra.instance === true,
        };

        // Timestamps
        if (normalizedExtra.startTime) {
            activity.startTimestamp = normalizedExtra.startTime;
        }
        if (normalizedExtra.endTime) {
            activity.endTimestamp = normalizedExtra.endTime;
        }

        // Small image
        if (normalizedExtra.smallImageKey) {
            activity.smallImageKey = normalizedExtra.smallImageKey;
        }
        if (normalizedExtra.smallImageText) {
            activity.smallImageText = normalizedExtra.smallImageText;
        }

        // Buttons — Discord accepts up to 2.
        if (Array.isArray(normalizedExtra.buttons) && normalizedExtra.buttons.length > 0) {
            activity.buttons = normalizedExtra.buttons.slice(0, 2).map((btn) => ({
                label: String(btn.label || 'Visit').slice(0, 32),
                url: String(btn.url || 'https://tatakai.me'),
            }));
        }

        try {
            await rpc.setActivity(activity);
        } catch (err) {
            logger.warn('Discord RPC setActivity failed', err);
        }
    }

    /**
     * Truly clear the activity. The renderer calls this on logout / page-leave.
     * We call `rpc.clearActivity()` and do NOT fall back to a stub presence —
     * the user's Discord profile should show nothing, not "Browsing Anime".
     */
    async function clearActivity() {
        pendingRpcActivity = null;
        if (!rpc || !rpcReady) return;
        try {
            await rpc.clearActivity();
        } catch (err) {
            logger.warn('Discord RPC clearActivity failed', err);
        }
    }

    function registerIpc(ipcMain) {
        ipcMain.on('update-rpc', (_event, data) => {
            void setActivity(data.details, data.state, data.extra);
        });
        ipcMain.on('clear-rpc', () => {
            void clearActivity();
        });
    }

    return { init, setActivity, clearActivity, registerIpc };
}

module.exports = { createDiscordRpc };
