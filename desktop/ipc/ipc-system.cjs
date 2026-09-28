'use strict';

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
    ipcMain.handle('window:is-maximized', () => {
        try {
            return !!getMainWindow()?.isMaximized();
        } catch (_) {
            return false;
        }
    });
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
    // Windows/macOS use the native login-item API. On Linux that call is a no-op,
    // so we manage a freedesktop autostart entry (~/.config/autostart) by hand.
    const linuxAutostartFile = () =>
        pathMod.join(require('os').homedir(), '.config', 'autostart', 'tatakai.desktop');

    function setLinuxAutostart(enabled) {
        const file = linuxAutostartFile();
        if (!enabled) {
            if (fs.existsSync(file)) fs.unlinkSync(file);
            return;
        }
        const execPath = process.execPath;
        const iconPath = pathMod.join(pathMod.dirname(execPath), 'resources', 'icon.png');
        const content = [
            '[Desktop Entry]',
            'Type=Application',
            'Name=Tatakai',
            `Exec=${execPath}`,
            `Icon=${iconPath}`,
            'Terminal=false',
            'X-GNOME-Autostart-enabled=true',
            'Comment=Start Tatakai at login',
        ].join('\n') + '\n';
        fs.mkdirSync(pathMod.dirname(file), { recursive: true });
        fs.writeFileSync(file, content, 'utf8');
    }

    ipcMain.handle('set-auto-launch', async (_event, enabled) => {
        try {
            if (process.platform === 'linux') {
                setLinuxAutostart(Boolean(enabled));
            } else {
                app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath });
            }
            return { success: true };
        } catch (err) {
            logger.error('Set auto-launch failed:', err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('get-auto-launch', async () => {
        try {
            if (process.platform === 'linux') {
                return { success: true, enabled: fs.existsSync(linuxAutostartFile()) };
            }
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

    // ── Drive & App Storage Diagnostics ───────────────────────────────────────
    function getDirectorySize(dirPath) {
        let total = 0;
        try {
            if (!fs.existsSync(dirPath)) return 0;
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);
                try {
                    if (entry.isDirectory()) {
                        total += getDirectorySize(fullPath);
                    } else if (entry.isFile()) {
                        total += fs.statSync(fullPath).size;
                    }
                } catch (_) { }
            }
        } catch (_) { }
        return total;
    }

    function getDriveInfo(targetPath) {
        try {
            if (fs.statfsSync) {
                const resolved = path.resolve(targetPath || app.getPath('userData'));
                const stats = fs.statfsSync(resolved);
                const total = Number(stats.blocks) * Number(stats.bsize);
                const free = Number(stats.bavail) * Number(stats.bsize);
                const root = path.parse(resolved).root || resolved;
                return { root, totalBytes: total, freeBytes: free, usedBytes: Math.max(0, total - free) };
            }
        } catch (_) { }
        return { root: 'System Drive', totalBytes: 0, freeBytes: 0, usedBytes: 0 };
    }

    ipcMain.handle('system:get-storage-info', async (_event, customDownloadsPath, customTorrentCachePath) => {
        try {
            const userData = app.getPath('userData');
            const defaultDownloads = path.join(app.getPath('videos'), 'Tatakai');
            const downloadsPath = customDownloadsPath && typeof customDownloadsPath === 'string'
                ? customDownloadsPath
                : defaultDownloads;

            const defaultTorrentCache = path.join(userData, 'torrent_cache');
            const torrentCachePath = customTorrentCachePath && typeof customTorrentCachePath === 'string'
                ? customTorrentCachePath
                : defaultTorrentCache;

            const appCachePath = path.join(userData, 'Cache');

            const [downloadsSize, torrentCacheSize, appCacheSize] = [
                getDirectorySize(downloadsPath),
                getDirectorySize(torrentCachePath),
                getDirectorySize(appCachePath),
            ];

            const driveInfo = getDriveInfo(downloadsPath);

            return {
                success: true,
                drive: driveInfo,
                appStorage: {
                    downloadsSize,
                    torrentCacheSize,
                    appCacheSize,
                    totalAppBytes: downloadsSize + torrentCacheSize + appCacheSize,
                },
                paths: {
                    downloadsPath,
                    torrentCachePath,
                    appCachePath,
                },
            };
        } catch (err) {
            logger.error('[Storage] get-storage-info failed:', err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('system:clear-storage-category', async (_event, category, customPath) => {
        try {
            const userData = app.getPath('userData');
            let targetDir = null;

            if (category === 'torrent_cache') {
                targetDir = customPath || path.join(userData, 'torrent_cache');
            } else if (category === 'video_downloads') {
                targetDir = customPath || path.join(app.getPath('videos'), 'Tatakai');
            } else if (category === 'app_cache') {
                targetDir = path.join(userData, 'Cache');
            }

            if (!targetDir || !fs.existsSync(targetDir)) {
                return { success: true, message: 'Directory already empty or not found' };
            }

            const entries = fs.readdirSync(targetDir);
            for (const entry of entries) {
                try {
                    const full = path.join(targetDir, entry);
                    fs.rmSync(full, { recursive: true, force: true });
                } catch (_) { }
            }

            logger.info(`[Storage] Cleared storage category: ${category} at ${targetDir}`);
            return { success: true, category };
        } catch (err) {
            logger.error(`[Storage] Failed to clear category ${category}:`, err);
            return { success: false, error: err.message };
        }
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

    // ── Memory profile & reclaim ────────────────────────────────────────────────
    // The renderer's memory-profile selector mirrors its choice here so main.cjs
    // can read it at the next launch and set V8's old-space cap. We only persist
    // the JSON; the cap can't change on a running V8.
    const MEMORY_PROFILE_FILE = path.join(app.getPath('userData'), 'memory-profile.json');
    ipcMain.handle('system:set-memory-profile', async (_event, profile) => {
        try {
            if (profile !== 'low' && profile !== 'balanced' && profile !== 'unlimited') {
                return { success: false, error: 'invalid-profile' };
            }
            fs.writeFileSync(MEMORY_PROFILE_FILE, JSON.stringify({ profile }), 'utf8');
            logger.info(`[Memory] Persisted profile=${profile} (applies next launch)`);
            return { success: true, profile, needsRestart: true };
        } catch (err) {
            logger.error('[Memory] Failed to persist memory profile:', err);
            return { success: false, error: err.message };
        }
    });

    // "Free memory now" main-side half: close idle Cloudflare Chromium contexts
    // immediately and force a GC (V8 is launched with --expose-gc by main.cjs).
    ipcMain.handle('system:reclaim-memory', async () => {
        let contextsClosed = 0;
        try {
            const cfBypass = require('../runtime/proxy/cloudflare-bypass.cjs');
            if (typeof cfBypass.reclaimIdleContexts === 'function') {
                contextsClosed = await cfBypass.reclaimIdleContexts(0);
            }
        } catch (err) {
            logger.warn('[Memory] CF context reclaim failed:', err.message);
        }
        let gcRan = false;
        try {
            if (typeof global.gc === 'function') {
                global.gc();
                gcRan = true;
            }
        } catch (_) { /* gc not exposed */ }
        logger.info(`[Memory] reclaim: contextsClosed=${contextsClosed} gc=${gcRan}`);
        return { success: true, contextsClosed, gcRan };
    });

    // ── Auto-updater ──────────────────────────────────────────────────────────
    // Ownership of the electron-updater singleton (feed URL, X-Client-Id header,
    // event broadcasting, and the update:* IPC channels) lives entirely in
    // desktop/services/update-manager.cjs. The legacy duplicate that used to sit
    // here emitted a second, differently-shaped `updater-event` on the same
    // channel — it was removed to collapse to a single modern payload shape.
    // `autoUpdater` remains a positional parameter for call-site compatibility.
};
