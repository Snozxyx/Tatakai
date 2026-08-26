'use strict';

const pathModule = require('path');
const { Menu, shell } = require('electron');
const { attachStreamingCors } = require('./cors-bridge.cjs');
const { registerShortcuts } = require('./shortcuts.cjs');
const { adBlocker } = require('../security/ad-blocker.cjs');

/**
 * @param {object} deps
 * @param {import('electron').BrowserWindow} deps.BrowserWindow
 * @param {import('electron').globalShortcut} deps.globalShortcut
 * @param {object} deps.winState - { mainWindow, splash }
 * @param {boolean} deps.isDev
 * @param {object} deps.logger
 * @param {string} deps.desktopDir - __dirname of desktop/
 */
function createMainWindow(deps) {
    const {
        BrowserWindow,
        globalShortcut,
        winState,
        isDev,
        logger,
        desktopDir,
    } = deps;

    const getMainWindow = () => winState.mainWindow;
    const shouldOpenDevTools = isDev && process.env.ELECTRON_DEVTOOLS === '1';
    const isAllowedAppUrl = (url) => {
        if (!url || typeof url !== 'string') return false;
        return (
            
            url.startsWith('https://api.tatakai.me') ||
            url.startsWith('http://localhost:8090') ||
            url.startsWith('http://127.0.0.1:8090') ||
            url.startsWith('file://')
        );
    };

    const mainWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        minWidth: 1000,
        minHeight: 600,
        frame: false,
        show: false,
        title: 'Tatakai',
        webPreferences: {
            preload: pathModule.join(desktopDir, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            devTools: isDev,
            webSecurity: true,
            sandbox: true,
            allowRunningInsecureContent: false,
            enableBlinkFeatures: 'CSSContainerQueries',
            backgroundThrottling: false,
        },
        backgroundColor: '#09090b',
        icon: pathModule.join(desktopDir, '..', 'resources', 'icon.ico'),
        paintWhenInitiallyHidden: false,
    });

    winState.mainWindow = mainWindow;

    const startUrl = isDev
        ? 'http://localhost:8090'
        : pathModule.join(desktopDir, '../dist/index.html');

    logger.info(`[Main] Loading: ${startUrl} (dev=${isDev})`);

    const loadURL = async (url) => {
        try {
            logger.info(`[Loading] Attempting: ${url}`);
            if (!isDev) {
                const normalizedPath = url.replace(/\\/g, '/');
                const fileUrl = normalizedPath.startsWith('/')
                    ? `file://${normalizedPath}`
                    : `file:///${normalizedPath}`;
                await mainWindow.loadURL(fileUrl);
                logger.info('[Loading] Loaded file URL:', fileUrl);
            } else {
                await mainWindow.loadURL(url);
                logger.info('[Loading] Loaded URL:', url);
            }
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.invalidate();
            }
        } catch (err) {
            logger.error(`[Loading] Failed to load ${url}:`, err.message);
            if (isDev && url.includes('localhost:8090')) {
                logger.info('[Loading] Dev server not ready, retrying in 2s...');
                setTimeout(() => loadURL(url), 2000);
            } else {
                logger.warn('[Loading] Falling back to offline page');
                mainWindow.loadFile(pathModule.join(desktopDir, 'offline.html'));
            }
        }
    };

    loadURL(startUrl);

    mainWindow.webContents.on('render-process-gone', (_event, details) => {
        logger.error('[Renderer] Process gone:', details);
        if (details.reason !== 'clean-exit') {
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.reload();
        }
    });

    mainWindow.webContents.on('unresponsive', () => {
        logger.warn('[Renderer] Window unresponsive, attempting reload...');
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.reload();
    });

    setTimeout(() => {
        if (winState.splash && !winState.splash.isDestroyed()) {
            winState.splash.close();
            winState.splash = null;
        }
        if (mainWindow && !mainWindow.isDestroyed()) {
            if (!mainWindow.isVisible()) {
                mainWindow.show();
                mainWindow.focus();
                mainWindow.webContents.invalidate();
            }
            if (!isDev && mainWindow.webContents.getURL() === '') {
                mainWindow.reload();
            }
            setTimeout(() => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.invalidate();
                }
            }, 500);
        }
    }, 15000);

    attachStreamingCors(mainWindow.webContents.session);
    // Network-level ad/tracker filter — drops ad scripts and ad iframes inside
    // third-party embeds before they load, without modifying the embed itself.
    adBlocker.attachToSession(mainWindow.webContents.session);
    mainWindow.webContents.session.setPermissionRequestHandler((_wc, permission, callback) => {
        callback(['clipboard-read', 'clipboard-write'].includes(permission));
    });
    mainWindow.webContents.session.setPermissionCheckHandler((_wc, permission) => {
        return ['clipboard-read', 'clipboard-sanitized-write'].includes(permission);
    });

    if (isDev) {
        const menu = Menu.buildFromTemplate([
            {
                label: 'View',
                submenu: [
                    {
                        label: 'Toggle Developer Tools',
                        accelerator: process.platform === 'darwin' ? 'Alt+Command+I' : 'Ctrl+Shift+I',
                        click: () => {
                            if (mainWindow.webContents.isDevToolsOpened()) {
                                mainWindow.webContents.closeDevTools();
                            } else {
                                mainWindow.webContents.openDevTools();
                            }
                        },
                    },
                    {
                        label: 'Reload',
                        accelerator: 'CmdOrCtrl+R',
                        click: () => mainWindow.webContents.reload(),
                    },
                    {
                        label: 'Force Reload',
                        accelerator: 'CmdOrCtrl+Shift+R',
                        click: () => mainWindow.webContents.reloadIgnoringCache(),
                    },
                ],
            },
        ]);
        Menu.setApplicationMenu(menu);
    } else {
        Menu.setApplicationMenu(null);
    }

    mainWindow.once('ready-to-show', () => {
        if (winState.splash && !winState.splash.isDestroyed()) {
            winState.splash.close();
            winState.splash = null;
        }
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
            mainWindow.focus();
            mainWindow.webContents.invalidate();
            setTimeout(() => {
                if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()) {
                    mainWindow.webContents.invalidate();
                }
            }, 500);
            registerShortcuts(globalShortcut, getMainWindow);
        }
    });

    mainWindow.on('closed', () => {
        winState.mainWindow = null;
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        // Same gate as main.cjs: ad-network and embed-initiated popups are
        // dropped here instead of being forwarded to the system browser.
        const verdict = adBlocker.evaluateWindowOpen(url, { source: 'main-window' });
        if (verdict.allowExternal) {
            shell.openExternal(url);
        }
        return { action: 'deny' };
    });

    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (!isAllowedAppUrl(url)) {
            event.preventDefault();
            logger.warn(`[Security] Blocked navigation: ${url}`);
        }
    });

    // Codes that mean "this load was deliberately stopped", not "the app is
    // broken": a cancelled request, an ad-blocker cancel, a CSP/CORB refusal.
    // Reloading on these is actively harmful — every ad request the blocker
    // drops inside an embed iframe would otherwise reload the whole app three
    // seconds later, so the embed could never finish starting.
    const DELIBERATE_LOAD_FAILURES = new Set([-3, -20, -27]); // ABORTED, BLOCKED_BY_CLIENT, BLOCKED_BY_RESPONSE

    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        console.error('Failed to load:', { errorCode, errorDescription, validatedURL, isMainFrame });
        // Only the app's own top-level document failing to load is a reason to
        // retry. Subframe failures are the embed's business (and its ads').
        if (!isDev || !isMainFrame) return;
        if (DELIBERATE_LOAD_FAILURES.has(errorCode)) return;
        if (!isAllowedAppUrl(validatedURL)) return;
        setTimeout(() => {
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.reload();
        }, 3000);
    });

    mainWindow.webContents.on('dom-ready', () => {
        logger.info('[Renderer] DOM ready');
    });

    mainWindow.webContents.on('did-finish-load', () => {
        logger.info('[Renderer] Page finished loading');
        if (shouldOpenDevTools && !mainWindow.webContents.isDevToolsOpened()) {
            mainWindow.webContents.openDevTools();
        }
    });

    if (isDev) {
        mainWindow.webContents.on('console-message', (event) => {
            const level = event?.level ?? 'info';
            const message = event?.message ?? '';
            logger.info(`[Renderer Console][${level}]: ${message}`);
        });
    }

    return mainWindow;
}

module.exports = { createMainWindow };
