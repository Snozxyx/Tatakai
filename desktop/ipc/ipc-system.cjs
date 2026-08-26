'use strict';

const { Notification } = require('electron');
const pathMod = require('path');
const extPlayer = require('../services/external-player.cjs');
const { adBlocker } = require('../security/ad-blocker.cjs');

/**
 * ipc-system.cjs
 *
 * IPC handlers for system utilities: auto-updater, system info, auto-launch,
 * app reset, log export, and window controls.
 *
 * Registered by main.cjs via:
 *   require('./ipc-system.cjs')(ipcMain, app, dialog, autoUpdater, fs, path, logger, getMainWindow, appCID, isDev)
 */

module.exports = function registerSystemHandlers(ipcMain, app, dialog, autoUpdater, fs, path, logger, getMainWindow, appCID, isDev) {
    const { shell } = require('electron');

    ipcMain.on('log', (_event, { level, message, data }) => {
        if (logger[level]) logger[level](message, data);
    });

    ipcMain.on('notify', (_event, { title, body }) => {
        const iconDev = pathMod.join(__dirname, '../resources/icon.png');
        const iconProd = pathMod.join(process.resourcesPath, 'resources/icon.png');
        new Notification({
            title: title || 'Tatakai',
            body,
            icon: isDev ? iconDev : iconProd,
        }).show();
    });

    // ── External links ─────────────────────────────────────────────────────────
    ipcMain.handle('shell:open-external', async (_event, url) => {
        if (/^https?:\/\//i.test(url)) {
            // Route through the app-level ad blocker so an ad-network target can
            // never reach the user's browser, even via the in-app link handler.
            const verdict = adBlocker.evaluateWindowOpen(url, {
                source: 'ipc-open-external',
                userInitiated: true,
            });
            if (!verdict.allowExternal) {
                return { success: false, error: verdict.reason || 'blocked' };
            }
            await shell.openExternal(url);
            return { success: true };
        }
        return { success: false, error: 'invalid-url' };
    });

    // ── Window controls ───────────────────────────────────────────────────────
    ipcMain.on('window-minimize', () => getMainWindow()?.minimize());
    ipcMain.on('window-maximize', () => {
        const win = getMainWindow();
        if (!win) return;
        win.isMaximized() ? win.unmaximize() : win.maximize();
    });
    ipcMain.on('window-close', () => getMainWindow()?.close());
    ipcMain.on('open-devtools', () => {
        const win = getMainWindow();
        if (win?.webContents) win.webContents.openDevTools();
    });

    ipcMain.handle('window:set-fullscreen', async (_event, enabled) => {
        try {
            const win = getMainWindow();
            if (!win) return { success: false, error: 'no-window' };
            win.setFullScreen(Boolean(enabled));
            // Notify renderer of fullscreen state change
            win.webContents.send('window:fullscreen-changed', Boolean(enabled));
            return { success: true, fullscreen: win.isFullScreen() };
        } catch (err) {
            return { success: false, error: err?.message || String(err) };
        }
    });

    ipcMain.handle('window:is-fullscreen', async () => {
        try {
            const win = getMainWindow();
            if (!win) return { success: false, error: 'no-window' };
            return { success: true, fullscreen: win.isFullScreen() };
        } catch (err) {
            return { success: false, error: err?.message || String(err) };
        }
    });

    // ── Platform ──────────────────────────────────────────────────────────────
    ipcMain.handle('get-platform', () => process.platform);

    // ── System info ───────────────────────────────────────────────────────────
    ipcMain.handle('get-system-info', async () => {
        const os = require('os');
        return {
            platform: process.platform,
            arch: process.arch,
            version: app.getVersion(),
            electronVersion: process.versions.electron,
            nodeVersion: process.versions.node,
            totalMemory: Math.round(os.totalmem() / 1024 / 1024 / 1024 * 100) / 100,
            freeMemory: Math.round(os.freemem() / 1024 / 1024 / 1024 * 100) / 100,
            cpus: os.cpus().length,
            cid: appCID,
        };
    });

    ipcMain.handle('get-client-id', () => appCID);

    // ── External Player ───────────────────────────────────────────────────────
    ipcMain.handle('external-player:detect', async () => {
        try {
            const players = await extPlayer.detectExternalPlayers(fs);
            return { success: true, players };
        } catch (e) {
            logger.error('Failed to detect external players:', e);
            return { success: false, error: e.message };
        }
    });

    ipcMain.handle('external-player:launch', async (_event, { executablePath, streamUrl, options }) => {
        return extPlayer.launchExternalPlayer(executablePath, streamUrl, options, logger);
    });

    ipcMain.handle('external-player:get-pref', async () => {
        return extPlayer.loadPlayerPreference(app, fs, path);
    });

    ipcMain.handle('external-player:save-pref', async (_event, executablePath) => {
        extPlayer.savePlayerPreference(executablePath, app, fs, path);
        return { success: true };
    });

    // ── Log export ────────────────────────────────────────────────────────────
    ipcMain.handle('export-logs', async () => {
        const { canceled, filePath } = await dialog.showSaveDialog(getMainWindow(), {
            title: 'Export Logs',
            defaultPath: 'tatakai-logs.txt',
            filters: [{ name: 'Text Files', extensions: ['txt', 'log'] }],
        });
        if (canceled || !filePath) return false;
        try {
            fs.copyFileSync(logger.getLogPath(), filePath);
            return true;
        } catch (e) {
            logger.error('Failed to export logs', e);
            return false;
        }
    });

    // ── Auto-launch ───────────────────────────────────────────────────────────
    ipcMain.handle('set-auto-launch', async (_event, enabled) => {
        try {
            app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath });
            return { success: true };
        } catch (err) {
            logger.error('Set auto-launch failed:', err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('get-auto-launch', async () => {
        try {
            return { success: true, enabled: app.getLoginItemSettings().openAtLogin };
        } catch (err) {
            logger.error('Get auto-launch failed:', err);
            return { success: false, error: err.message };
        }
    });

    // ── App reset ─────────────────────────────────────────────────────────────
    ipcMain.handle('reset-app-data', async () => {
        logger.info('[App] Resetting app data...');
        try {
            const userDataPath = app.getPath('userData');
            const defaultDownloadPath = path.join(app.getPath('videos'), 'Tatakai');

            if (fs.existsSync(defaultDownloadPath)) {
                fs.rmSync(defaultDownloadPath, { recursive: true, force: true });
                logger.info('[App] Deleted download folder:', defaultDownloadPath);
            }

            for (const item of ['Cache', 'Code Cache', 'GPUCache']) {
                const itemPath = path.join(userDataPath, item);
                if (fs.existsSync(itemPath)) {
                    try {
                        fs.rmSync(itemPath, { recursive: true, force: true });
                        logger.info('[App] Deleted cache item:', item);
                    } catch (err) {
                        logger.warn('[App] Could not delete cache item:', item, err.message);
                    }
                }
            }

            return { success: true, message: 'App data reset successfully', needsRestart: true };
        } catch (err) {
            logger.error('[App] Failed to reset app data:', err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('app-relaunch', () => {
        app.relaunch();
        app.quit();
    });

    ipcMain.handle('reset-app', async () => {
        try {
            const { canceled } = await dialog.showMessageBox(getMainWindow(), {
                type: 'warning',
                buttons: ['Reset App', 'Cancel'],
                defaultId: 1,
                title: 'Reset Tatakai App',
                message: 'Are you sure you want to reset the app?',
                detail: 'This will clear all app settings and require setup again. The app will restart automatically.',
            });
            if (canceled) return { success: false, cancelled: true };

            const userData = app.getPath('userData');
            const settingsFile = path.join(userData, 'settings.json');
            if (fs.existsSync(settingsFile)) fs.unlinkSync(settingsFile);

            const cacheDir = path.join(userData, 'Cache');
            if (fs.existsSync(cacheDir)) {
                for (const file of fs.readdirSync(cacheDir)) {
                    try {
                        const fp = path.join(cacheDir, file);
                        if (fs.statSync(fp).isFile()) fs.unlinkSync(fp);
                    } catch (_) {}
                }
            }

            app.relaunch();
            app.quit();
            return { success: true };
        } catch (err) {
            logger.error('Reset app failed:', err);
            return { success: false, error: err.message };
        }
    });

    // ── Auto-updater ──────────────────────────────────────────────────────────
    autoUpdater.logger = logger;
    autoUpdater.autoDownload = false;

    if (!isDev) {
        autoUpdater.setFeedURL({ provider: 'github', owner: 'snozxyx', repo: 'Tatakai' });
        autoUpdater.requestHeaders = { 'X-Client-Id': appCID };
    }

    ipcMain.handle('check-for-updates', async () => {
        if (isDev) return { status: 'dev-mode' };
        try {
            const result = await autoUpdater.checkForUpdates();
            return { status: 'checked', result };
        } catch (err) {
            logger.error('Update check failed:', err);
            return { status: 'error', error: err.message };
        }
    });

    ipcMain.handle('download-update', () => autoUpdater.downloadUpdate());
    ipcMain.handle('quit-and-install', () => autoUpdater.quitAndInstall());

    autoUpdater.on('update-available', (info) => {
        getMainWindow()?.webContents.send('updater-event', { type: 'update-available', info });
    });
    autoUpdater.on('update-not-available', (info) => {
        getMainWindow()?.webContents.send('updater-event', { type: 'update-not-available', info });
    });
    autoUpdater.on('download-progress', (progress) => {
        getMainWindow()?.webContents.send('updater-event', { type: 'download-progress', progress });
    });
    autoUpdater.on('update-downloaded', (info) => {
        getMainWindow()?.webContents.send('updater-event', { type: 'update-downloaded', info });
    });
    autoUpdater.on('error', (err) => {
        getMainWindow()?.webContents.send('updater-event', { type: 'error', error: err.message });
    });
};
