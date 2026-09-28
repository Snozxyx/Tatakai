'use strict';

const pathModule = require('path');
const { Menu, shell } = require('electron');
const { attachStreamingCors } = require('./cors-bridge.cjs');
const { registerShortcuts } = require('./shortcuts.cjs');
const { adBlocker } = require('../security/ad-blocker.cjs');
const { APP_SCHEME, APP_HOST, APP_START_URL } = require('./app-scheme.cjs');

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
            url.startsWith(`${APP_SCHEME}://${APP_HOST}`) ||
            url.startsWith('https://api.tatakai.me') ||
            url.startsWith('http://localhost:8090') ||
            url.startsWith('http://127.0.0.1:8090') ||
            url.startsWith('file://')
        );
    };

    const isMac = process.platform === 'darwin';

    const mainWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        minWidth: 1000,
        minHeight: 600,
        // macOS keeps its native traffic lights via hiddenInset (frameless there
        // hides them entirely); Windows/Linux stay fully frameless with our
        // custom controls in TitleBar.tsx.
        ...(isMac
            ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 12, y: 9 } }
            : { frame: false }),
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
        // NOTE: do NOT set `paintWhenInitiallyHidden: false`. With `show: false`
        // that suppresses background painting, so `ready-to-show` NEVER fires —
        // the window is then only revealed by the 4s safety-net timeout, which
        // shows an unpainted frameless window (black) that invalidate() can't
        // reliably repaint. Default (true) lets it paint while hidden so
        // ready-to-show fires (~500ms) and reveals an already-painted window.
    });

    winState.mainWindow = mainWindow;

    // Keep the renderer's title-bar maximize/restore glyph in sync with the real
    // window state (double-click, OS shortcuts, snap all bypass our button).
    const emitMaximizeState = () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('window:maximize-changed', mainWindow.isMaximized());
        }
    };
    mainWindow.on('maximize', emitMaximizeState);
    mainWindow.on('unmaximize', emitMaximizeState);

    // Keep the renderer's Display settings fullscreen toggle in sync with the
    // real window state. Native enter/leave events fire no matter how fullscreen
    // was entered — F11 (shortcuts.cjs), the OS chrome, or the set-fullscreen
    // IPC — so this is the single source of truth for the broadcast.
    const emitFullscreenState = () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('window:fullscreen-changed', mainWindow.isFullScreen());
        }
    };
    mainWindow.on('enter-full-screen', emitFullscreenState);
    mainWindow.on('leave-full-screen', emitFullscreenState);

    // ── Idle memory reclaim (main-side half of B6) ──────────────────────────
    // When the window has been minimized / blurred for a while, close idle
    // Cloudflare Chromium contexts and force a GC. The renderer runs its own
    // idle reclaim (IdleReclaimProvider); this covers the "app left in the
    // background" case where the renderer is throttled. Gated so it only fires
    // while the window really is hidden/unfocused at fire time.
    const IDLE_RECLAIM_DELAY_MS = 3 * 60 * 1000;
    let idleReclaimTimer = null;
    const cancelIdleReclaim = () => {
        if (idleReclaimTimer) {
            clearTimeout(idleReclaimTimer);
            idleReclaimTimer = null;
        }
    };
    const runIdleReclaim = async () => {
        idleReclaimTimer = null;
        if (!mainWindow || mainWindow.isDestroyed()) return;
        // Only reclaim if still backgrounded — a user who came back cancels it.
        if (!mainWindow.isMinimized() && mainWindow.isFocused()) return;
        let contextsClosed = 0;
        try {
            const cfBypass = require('../runtime/proxy/cloudflare-bypass.cjs');
            if (typeof cfBypass.reclaimIdleContexts === 'function') {
                contextsClosed = await cfBypass.reclaimIdleContexts(0);
            }
        } catch (err) {
            logger.warn('[Memory] Idle CF reclaim failed:', err.message);
        }
        try {
            if (typeof global.gc === 'function') global.gc();
        } catch (_) { /* gc not exposed */ }
        logger.info(`[Memory] Idle reclaim (backgrounded): contextsClosed=${contextsClosed}`);
    };
    const armIdleReclaim = () => {
        cancelIdleReclaim();
        idleReclaimTimer = setTimeout(runIdleReclaim, IDLE_RECLAIM_DELAY_MS);
        if (typeof idleReclaimTimer.unref === 'function') idleReclaimTimer.unref();
    };
    mainWindow.on('minimize', armIdleReclaim);
    mainWindow.on('blur', armIdleReclaim);
    mainWindow.on('restore', cancelIdleReclaim);
    mainWindow.on('focus', cancelIdleReclaim);
    mainWindow.on('show', cancelIdleReclaim);
    mainWindow.on('closed', cancelIdleReclaim);

    // Prod now serves the renderer over the privileged `app://` scheme (a real
    // secure origin, so Turnstile can render) instead of `file://`. The old
    // file:// path is kept as a fallback if the scheme load ever fails, so the
    // worst case is exactly the previous behavior.
    const prodFileUrl = (() => {
        const normalizedPath = pathModule
            .join(desktopDir, '../dist/index.html')
            .replace(/\\/g, '/');
        return normalizedPath.startsWith('/')
            ? `file://${normalizedPath}`
            : `file:///${normalizedPath}`;
    })();

    const startUrl = isDev ? 'http://localhost:8090' : APP_START_URL;

    logger.info(`[Main] Loading: ${startUrl} (dev=${isDev})`);

    let prodFallbackTried = false;

    const loadURL = async (url) => {
        try {
            logger.info(`[Loading] Attempting: ${url}`);
            await mainWindow.loadURL(url);
            logger.info('[Loading] Loaded URL:', url);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.invalidate();
            }
        } catch (err) {
            logger.error(`[Loading] Failed to load ${url}:`, err.message);
            if (isDev && url.includes('localhost:8090')) {
                logger.info('[Loading] Dev server not ready, retrying in 2s...');
                setTimeout(() => loadURL(url), 2000);
            } else if (!isDev && !prodFallbackTried && url === APP_START_URL) {
                // app:// failed — fall back to the classic file:// load once.
                prodFallbackTried = true;
                logger.warn('[Loading] app:// load failed, falling back to file://');
                loadURL(prodFileUrl);
            } else {
                logger.warn('[Loading] Falling back to offline page');
                mainWindow.loadFile(pathModule.join(desktopDir, 'offline.html'));
            }
        }
    };

    loadURL(startUrl);

    // Crash-loop guard: a renderer that dies (or hangs) repeatedly must not be
    // reloaded forever — that storms CPU and never recovers. After N reloads
    // inside a rolling window, fall back to the offline page instead.
    const CRASH_WINDOW_MS = 60_000;
    const CRASH_MAX_RELOADS = 3;
    let crashReloads = [];
    const guardedReload = (why) => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        const now = Date.now();
        crashReloads = crashReloads.filter((t) => now - t < CRASH_WINDOW_MS);
        if (crashReloads.length >= CRASH_MAX_RELOADS) {
            logger.error(`[Renderer] Crash-loop guard tripped (${why}) — loading offline page instead of reloading`);
            crashReloads = [];
            try {
                mainWindow.loadFile(pathModule.join(desktopDir, 'offline.html'));
            } catch (_) {}
            return;
        }
        crashReloads.push(now);
        logger.warn(`[Renderer] Reloading after ${why} (${crashReloads.length}/${CRASH_MAX_RELOADS} within ${CRASH_WINDOW_MS / 1000}s)`);
        mainWindow.reload();
    };

    mainWindow.webContents.on('render-process-gone', (_event, details) => {
        logger.error('[Renderer] Process gone:', details);
        if (details.reason !== 'clean-exit') {
            guardedReload('render-process-gone');
        }
    });

    mainWindow.webContents.on('unresponsive', () => {
        logger.warn('[Renderer] Window unresponsive, attempting reload...');
        guardedReload('unresponsive');
    });

    // Safety net only. First paint fires `ready-to-show` (below) which shows the
    // window and closes the splash; this fallback covers the rare case where
    // ready-to-show never fires. Kept short so a slow first paint doesn't leave
    // the user staring at the splash — 4s, not the old 15s.
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
    }, 4000);

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
    } else if (isMac) {
        // macOS relies on the app menu for Cmd+Q/W/H and clipboard shortcuts
        // (Cmd+C/V/X/A). Stripping it (setApplicationMenu(null)) breaks all of
        // them, so ship a minimal native menu built from standard roles.
        Menu.setApplicationMenu(Menu.buildFromTemplate([
            { role: 'appMenu' },
            { role: 'editMenu' },
            { role: 'windowMenu' },
        ]));
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
            registerShortcuts(getMainWindow);
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
