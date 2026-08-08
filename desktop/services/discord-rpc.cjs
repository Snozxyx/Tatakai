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
            void setActivity('Browsing Anime', 'Main Menu');
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

    async function setActivity(details, state, extra = {}) {
        if (!rpc) return;

        const normalizedExtra = extra && typeof extra === 'object' ? extra : {};
        if (!rpcReady) {
            pendingRpcActivity = { details, state, extra: normalizedExtra };
            return;
        }

        const activity = {
            details: details || 'Browsing Anime',
            state: state || 'In Main Menu',
            largeImageKey: 'logo',
            largeImageText: 'Tatakai - Watch Anime Online',
            instance: false,
            buttons: [{ label: 'Watch with me!', url: 'https://tatakai.me' }],
        };

        if (normalizedExtra.startTime) {
            activity.startTimestamp = normalizedExtra.startTime;
        } else if (!('startTime' in normalizedExtra)) {
            activity.startTimestamp = new Date();
        }

        if (normalizedExtra.endTime) activity.endTimestamp = normalizedExtra.endTime;
        if (normalizedExtra.smallImageKey) activity.smallImageKey = normalizedExtra.smallImageKey;
        if (normalizedExtra.smallImageText) activity.smallImageText = normalizedExtra.smallImageText;

        try {
            await rpc.setActivity(activity);
        } catch (err) {
            logger.warn('Discord RPC setActivity failed', err);
        }
    }

    async function clearActivity() {
        pendingRpcActivity = null;
        if (!rpc || !rpcReady) return;
        try {
            await rpc.clearActivity();
        } catch (err) {
            logger.warn('Discord RPC clearActivity failed', err);
        }
        void setActivity('Browsing Anime', 'Main Menu');
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
