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
const { apply: applyBranding } = require('./services/branding-init.cjs');
const { createCrashService } = require('./services/crash-service.cjs');
const { createLogService } = require('./services/log-service.cjs');
const { createErrorTracker } = require('./services/error-tracker.cjs');
const { createPerfMonitor } = require('./services/perf-monitor.cjs');
const { createPlatformAdapter } = require('./services/platform-adapter.cjs');
const { createUpdateManager } = require('./services/update-manager.cjs');
const { adBlocker } = require('./security/ad-blocker.cjs');

const isDev = !app.isPackaged;
const DESKTOP_DIR = __dirname;

// ── Silence benign transitive-dep deprecation noise ───────────────────────────
// A transitive dependency still does `require('punycode')`, which Node flags as
// DEP0040 on every launch. It is not our code and there is no drop-in swap at the
// require site, so the warning is pure noise. Filter ONLY that one code; every
// other warning (including any we introduce) still prints normally.
const _emitWarning = process.emitWarning.bind(process);
process.emitWarning = (warning, ...args) => {
    const opt = args[0];
    const code = opt && typeof opt === 'object' ? opt.code : args[1];
    if (code === 'DEP0040') return;
    return _emitWarning(warning, ...args);
};

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
// Bound the HTTP disk cache so a long-lived install can't let Chromium's cache
// grow without limit (it defaults to a large fraction of free disk). 300 MB is
// ample for posters/thumbnails/HLS segments and keeps the on-disk footprint
// predictable. Transparent to features — the cache just evicts sooner.
app.commandLine.appendSwitch('disk-cache-size', String(300 * 1024 * 1024));

// ── V8 heap cap (memory profile, read before app.whenReady) ────────────────────
// The renderer's memory-profile selector mirrors the choice to a tiny JSON here
// (via the `system:set-memory-profile` IPC); we read it now so V8's old-space cap
// applies from launch. A tighter cap makes V8 collect sooner, trading a little
// throughput for a lower resident heap. `--expose-gc` lets the "Free memory now"
// reclaim call `global.gc()`. Unlimited omits the cap (V8 default) but still
// exposes gc. Falls back to Balanced (1536 MB) if the file is missing/unreadable.
const MEMORY_PROFILE_FILE = path.join(app.getPath('userData'), 'memory-profile.json');
const V8_HEAP_CAP_MB = { low: 1024, balanced: 1536, unlimited: null };
function readPersistedMemoryProfile() {
    try {
        const raw = fs.readFileSync(MEMORY_PROFILE_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        const p = parsed && parsed.profile;
        if (p === 'low' || p === 'balanced' || p === 'unlimited') return p;
    } catch {
        /* missing/unreadable → default */
    }
    return 'balanced';
}
(() => {
    const profile = readPersistedMemoryProfile();
    const capMb = Object.prototype.hasOwnProperty.call(V8_HEAP_CAP_MB, profile)
        ? V8_HEAP_CAP_MB[profile]
        : 1536;
    const flags = ['--expose-gc'];
    if (capMb) flags.unshift(`--max-old-space-size=${capMb}`);
    app.commandLine.appendSwitch('js-flags', flags.join(' '));
    _loggerEarly.info(`[Memory] profile=${profile} v8HeapCapMb=${capMb ?? 'default'}`);
})();

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
//
// `app://` gives the packaged renderer a real, secure origin (isSecureContext +
// a stable hostname) so Cloudflare Turnstile can render — under file:// the
// captcha never appeared. See desktop/window/app-scheme.cjs.
const { APP_SCHEME_PRIVILEGES, registerAppScheme } = require('./window/app-scheme.cjs');
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
    APP_SCHEME_PRIVILEGES,
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

// App-level ad / popunder blocker. Blocks at the network + popup layer in the
// main process; nothing is injected into embedded pages.
adBlocker.init({ logger, getMainWindow });
adBlocker.registerIpc(ipcMain);
const updateManager = createUpdateManager({
    ipcMain,
    autoUpdater,
    logger,
    app,
    appCID,
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

// Auto-load user-installed extensions (downloaded .kai files)
// Scans <userData>/extensions for bundle.js + manifest.json
if (extensionRuntimeApi?.autoLoadInstalledExtensions) {
    extensionRuntimeApi.autoLoadInstalledExtensions(fs, path, logger, app);
    logger.info('[Runtime] Installed extensions auto-loaded');
}

// Proxy + extension-API host are network servers that were previously spun up
// at module-load time, on the critical boot path. They're now deferred to just
// after the main window exists (see the post-ready block below) so first paint
// isn't competing with them for CPU/IO. Nothing is removed — they still start
// automatically; `ensureExtensionFetchProxy` is idempotent, so any extension
// that needs the proxy earlier still triggers it on demand.
let _deferredRuntimeServicesStarted = false;
function startDeferredRuntimeServices() {
    if (_deferredRuntimeServicesStarted) return;
    _deferredRuntimeServicesStarted = true;

    // Start proxy server so it's ready when extensions need it.
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

    // Start the generic extension-API host. Runs after extensions auto-load
    // (above) so installed namespaces (e.g. Toko) mount, and passes
    // ensureExtensionFetchProxy so emitted media URLs get proxied through the
    // in-app proxy. No-op if no installed extension declares `apiServer`.
    if (extensionRuntimeApi?.extensionApiHost) {
        let preferredPort = 8099;
        try {
            const extCfgFile = path.join(app.getPath('userData'), 'extension-host-config.json');
            if (fs.existsSync(extCfgFile)) {
                const parsed = JSON.parse(fs.readFileSync(extCfgFile, 'utf8'));
                if (parsed?.preferredPort && Number(parsed.preferredPort) > 0) {
                    preferredPort = Number(parsed.preferredPort);
                }
            }
        } catch (_) {}

        extensionRuntimeApi.extensionApiHost.start({
            registry: extensionRuntimeApi.registry,
            localProxy: extensionRuntimeApi.localProxy,
            logger,
            ensureProxy: extensionRuntimeApi.ensureExtensionFetchProxy,
            preferredPort,
        })
            .then((baseUrl) => {
                if (baseUrl) {
                    logger.info(`[Runtime] Extension-API host started at ${baseUrl}`);
                    console.log(`[Runtime] ✅ Extension-API host at ${baseUrl}`);
                }
            })
            .catch((err) => {
                logger.error('[Runtime] Failed to start extension-API host:', err.message);
                console.error('[Runtime] ❌ Extension-API host start failed:', err.message);
            });
    }
}

require('./ipc/ipc-library.cjs')(ipcMain, app, dialog, shell, fs, path, logger, getMainWindow);
require('./ipc/ipc-download-manager.cjs')(ipcMain, app, fs, path, logger, getMainWindow);
// Manga chapter downloads: must resolve pages WITH per-page headers in-main, so
// it gets the extension runtime (registry/workerPool/ensureExtensionFetchProxy).
require('./ipc/ipc-manga-download-manager.cjs')(ipcMain, app, fs, path, logger, getMainWindow, extensionRuntimeApi);
// Offline manga library: reads on-disk manifests + serves pages via tatakai-media://.
require('./ipc/ipc-manga-library.cjs')(ipcMain, app, shell, fs, path, logger);
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

        // Serve the built renderer over app://tatakai.me (prod only; dev uses
        // the Vite server). Path-traversal-guarded, SPA-fallback to index.html.
        registerAppScheme(protocol, path.join(DESKTOP_DIR, '..', 'dist'), logger);
    }

    // Register tatakai-media:// protocol for serving local video/media files.
    // This is always registered (dev + prod) to allow offline library playback.
    // tatakai-media:///C:/path/to/file.mkv → serves the file with streaming support.
    protocol.registerFileProtocol('tatakai-media', (request, callback) => {
        try {
            // Standard-scheme URL canonicalization collapses a Windows drive letter
            // into the URL authority: Chromium rewrites `tatakai-media:///C:/dir/file`
            // to `tatakai-media://c/dir/file` (drive letter → lowercased host, colon
            // dropped). Rebuild the real path from host + pathname so BOTH that
            // canonicalized form and a literal `///C:/…` form resolve. On POSIX the
            // host is empty and pathname is already absolute.
            const u = new URL(request.url);
            const host = u.hostname;
            const pathname = decodeURIComponent(u.pathname);
            let filePath;
            if (process.platform === 'win32') {
                if (/^[a-zA-Z]$/.test(host)) {
                    filePath = `${host}:${pathname}`;                     // c + /dir/file → c:/dir/file
                } else {
                    filePath = pathname.replace(/^\/([a-zA-Z]:)/, '$1');  // /C:/dir/file → C:/dir/file
                }
                filePath = filePath.replace(/\//g, '\\');
            } else {
                filePath = pathname;
            }
            callback({ path: path.normalize(filePath) });
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
        crashService.checkPreviousCrashes(winState.mainWindow, logger)
        updateManager.checkOnStartup('stable').catch((err) => {
            logger.error('[main] updateManager.checkOnStartup failed', { err: String(err) });
        });

        // Spin up the proxy + extension-API host after first paint has had a
        // chance to settle, instead of on the module-load critical path. Kept
        // automatic (no feature change) — just moved off the hot boot window.
        setTimeout(startDeferredRuntimeServices, 1200);
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
    try { await extensionRuntimeApi?.extensionApiHost?.stop(); } catch (_) { }
    try { await extensionRuntimeApi?.shareTunnel?.stop(); } catch (_) { }
    try { await logger.close(); } catch (_) { }
});

app.on('web-contents-created', (_event, contents) => {
    contents.on('will-attach-webview', (event) => {
        event.preventDefault();
        logger.warn('[Security] Blocked webview attach');
    });
    contents.setWindowOpenHandler(({ url }) => {
        // Popups are routed through the app-level ad blocker: an embed's
        // popunder must never reach shell.openExternal (i.e. the user's real
        // browser). Legitimate in-app links still open externally.
        const verdict = adBlocker.evaluateWindowOpen(url, { source: 'web-contents' });
        if (verdict.allowExternal) shell.openExternal(url);
        return { action: 'deny' };
    });
});

app.on('open-url', (event, url) => {
    event.preventDefault();
    handleDeepLink(url, getMainWindow);
});
