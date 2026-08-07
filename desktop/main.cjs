'use strict';

const {
    app,
    BrowserWindow,
    ipcMain,
    dialog,
    shell,
    Tray,
    Menu,
    globalShortcut,
    protocol,
} = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// ── Production-readiness services ─────────────────────────────────────────────
const { apply: applyBranding }  = require('./services/branding-init.cjs');
const { createCrashService }    = require('./services/crash-service.cjs');
const { createLogService }      = require('./services/log-service.cjs');
const { createErrorTracker }    = require('./services/error-tracker.cjs');
const { createPerfMonitor }     = require('./services/perf-monitor.cjs');
const { createPlatformAdapter } = require('./services/platform-adapter.cjs');
const { createUpdateManager }   = require('./services/update-manager.cjs');

const isDev = !app.isPackaged;
const DESKTOP_DIR = __dirname;

// ── Branding (must run before anything else, before app.on('ready')) ──────────
applyBranding(app);

// ── Crash reporter (before app.on('ready')) ────────────────────────────────────
const crashService = createCrashService();
crashService.start({
    dsn: process.env.SENTRY_DSN,
    uploadToServer: !isDev,
});

// ── LogService ─────────────────────────────────────────────────────────────────
// First pass: create without ipcMain so ErrorTracker can be constructed with a logger.
const _loggerEarly = createLogService({ app, maxFileSizeMB: 10, maxFiles: 5 });
app.commandLine.appendSwitch('enable-webgl');
app.commandLine.appendSwitch('enable-accelerated-2d-canvas');

// ── ErrorTracker (wired into LogService for ERROR/FATAL forwarding) ───────────
const errorTracker = createErrorTracker({ logger: _loggerEarly, userDataPath: app.getPath('userData') });
errorTracker.init({
    dsn: process.env.SENTRY_DSN,
    release: app.getVersion(),
    environment: isDev ? 'development' : 'production',
    userDataPath: app.getPath('userData'),
});

// Second pass: create the production logger with both ipcMain and errorTracker.
// This is the instance used everywhere from this point forward.
const logger = createLogService({ app, maxFileSizeMB: 10, maxFiles: 5, ipcMain, errorTracker });

const { getOrCreateCID } = require('./services/cid.cjs');
const appCID = getOrCreateCID(app, fs, path, crypto, logger);
logger.info(`[CID] Device ID: ${appCID}`);

// Register custom media protocol before app is ready (must be called before ready event)
// This allows the renderer to load local media files via tatakai-media:// without
// webSecurity blocking them as cross-origin file:// requests.
protocol.registerSchemesAsPrivileged([
    {
        scheme: 'tatakai-media',
        privileges: {
            standard: true,
            secure: true,
            supportFetchAPI: true,
            bypassCSP: true,
            stream: true,
            corsEnabled: true,
        },
    },
]);

const {
    registerProtocolClient,
    registerSingleInstance,
    handleDeepLink,
} = require('./window/deep-link.cjs');

registerProtocolClient(app, path);

const winState = { mainWindow: null, splash: null };
const getMainWindow = () => winState.mainWindow;

// ── PerfMonitor, PlatformAdapter, UpdateManager ───────────────────────────────
// Constructed after winState so getMainWindow closure is valid.
const perfMonitor = createPerfMonitor({ logger, getMainWindow, ipcMain });
const platformAdapter = createPlatformAdapter({ app, BrowserWindow, logger });
const updateManager = createUpdateManager({
    ipcMain,
    autoUpdater,
    logger,
    app,
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_ANON_KEY,
});

if (!registerSingleInstance(app, getMainWindow, (url) => handleDeepLink(url, getMainWindow))) {
    process.exit(0);
}

const themeBridge = require('./services/theme-bridge.cjs');
const { createSplashWindow } = require('./window/splash-window.cjs');
const { createMainWindow } = require('./window/window-factory.cjs');
const { createTray } = require('./window/tray.cjs');
const { createDiscordRpc } = require('./services/discord-rpc.cjs');

const discordRpc = createDiscordRpc({
    logger,
    clientId: '1466113024929697836',
});
discordRpc.registerIpc(ipcMain);

const extensionRuntimeRef = { current: null };
const extensionRuntimeApi = require('./ipc/ipc-runtime.cjs')(ipcMain, app, fs, path, logger, getMainWindow);
extensionRuntimeRef.current = extensionRuntimeApi;

// Auto-load bundled extensions on startup
if (extensionRuntimeApi?.autoLoadBundledExtensions) {
    extensionRuntimeApi.autoLoadBundledExtensions(fs, path, logger, app);
    logger.info('[Runtime] Bundled extensions auto-loaded');
}

// Start proxy server immediately on startup so it's ready when extensions need it
if (extensionRuntimeApi?.ensureExtensionFetchProxy) {
    extensionRuntimeApi.ensureExtensionFetchProxy()
        .then((proxyUrl) => {
            logger.info(`[Runtime] Proxy server pre-started at ${proxyUrl}`);
            console.log(`[Runtime] ✅ Proxy ready at ${proxyUrl}`);
        })
        .catch((err) => {
            logger.error('[Runtime] Failed to pre-start proxy:', err.message);
            console.error('[Runtime] ❌ Proxy pre-start failed:', err.message);
        });
}

require('./ipc/ipc-library.cjs')(ipcMain, app, dialog, shell, fs, path, logger, getMainWindow);
require('./ipc/ipc-download-manager.cjs')(ipcMain, app, fs, path, logger, getMainWindow);
const torrentRuntimeApi = require('./ipc/ipc-torrent.cjs')(ipcMain, app, fs, path, logger, getMainWindow);
require('./ipc/ipc-system.cjs')(ipcMain, app, dialog, autoUpdater, fs, path, logger, getMainWindow, appCID, isDev);
require('./ipc/ipc-theme.cjs')(ipcMain, app, fs, path);
require('./ipc/ipc-media.cjs')(ipcMain, app, logger);
require('./ipc/ipc-home-server.cjs')(ipcMain, app, fs, path, logger, getMainWindow, {
    getExtensionRuntime: () => extensionRuntimeRef.current,
    getTorrentFacade: () => torrentRuntimeApi?.facade,
});

app.on('ready', () => {
    if (!isDev) {
        protocol.registerFileProtocol('file', (request, callback) => {
            const url = request.url.substr(7);
            try {
                callback({ path: path.normalize(decodeURIComponent(url)) });
            } catch {
                callback({ path: path.normalize(decodeURI(url)) });
            }
        });
    }

    // Register tatakai-media:// protocol for serving local video/media files.
    // This is always registered (dev + prod) to allow offline library playback.
    // tatakai-media:///C:/path/to/file.mkv → serves the file with streaming support.
    protocol.registerFileProtocol('tatakai-media', (request, callback) => {
        const urlPath = request.url.replace(/^tatakai-media:\/\/\//i, '');
        try {
            const decoded = decodeURIComponent(urlPath);
            const normalizedPath = path.normalize(
                process.platform === 'win32' ? decoded : '/' + decoded
            );
            callback({ path: normalizedPath });
        } catch (err) {
            logger.error('[tatakai-media] Failed to resolve path:', request.url, err);
            callback({ error: -2 }); // NET::ERR_FAILED
        }
    });

    const splashTokens = themeBridge.toSplashQuery(themeBridge.readThemeForSplash(app, fs, path));
    winState.splash = createSplashWindow(BrowserWindow, DESKTOP_DIR, splashTokens);

    // ── Start production services ─────────────────────────────────────────────
    perfMonitor.start();
    platformAdapter.ensureDesktopEntry();  // Linux only; no-op on other platforms
    platformAdapter.registerProtocol('tatakai');

    setTimeout(() => {
        if (app.isQuitting) return;

        createMainWindow({
            BrowserWindow,
            globalShortcut,
            winState,
            isDev,
            logger,
            desktopDir: DESKTOP_DIR,
        });

        discordRpc.init();

        const trayIconPath = path.join(DESKTOP_DIR, '..', 'resources', 'icon-512.png');
        createTray({
            Tray,
            Menu,
            app,
            iconPath: trayIconPath,
            fs,
            getMainWindow,
            logger,
        });

        // ── Post-window production services ──────────────────────────────────
        // These need the main window to exist so crash IPC push can reach the renderer.
        crashService.checkPreviousCrashes(winState.mainWindow, logger, { dialog })
        updateManager.checkOnStartup('stable').catch((err) => {
            logger.error('[main] updateManager.checkOnStartup failed', { err: String(err) });
        });
    }, 1500);
});

app.on('window-all-closed', () => {
    globalShortcut.unregisterAll();
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
    if (winState.mainWindow === null) {
        createMainWindow({
            BrowserWindow,
            globalShortcut,
            winState,
            isDev,
            logger,
            desktopDir: DESKTOP_DIR,
        });
    }
});

app.on('will-quit', async () => {
    app.isQuitting = true;
    globalShortcut.unregisterAll();
    perfMonitor.stop();
    try { await logger.close(); } catch (_) {}
});

app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event) => {
        event.preventDefault();
        logger.warn('[Security] Blocked webview attach');
    });
    contents.setWindowOpenHandler(({ url }) => {
        if (/^https:\/\//i.test(url)) shell.openExternal(url);
        return { action: 'deny' };
    });
});

app.on('open-url', (event, url) => {
    event.preventDefault();
    handleDeepLink(url, getMainWindow);
});
