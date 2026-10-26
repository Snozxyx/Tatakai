'use strict';

/**
 * ipc-guard.cjs — sender validation for main-process IPC handlers
 * -----------------------------------------------------------------------------
 * SEC audit finding DESK-2.
 *
 * Every `ipcMain.handle(...)` handler in `desktop/ipc/*` is written as if the
 * only caller is our own bundled renderer. Nothing enforced that. The bridge
 * lives on the main window's frame, but a window that has been navigated
 * somewhere else (a provider page that escaped `will-navigate`, a redirect on
 * the dev server, a future change to `nodeIntegrationInSubFrames`) inherits the
 * same preload and therefore the same privileged API surface.
 *
 * This module wraps `ipcMain.handle` once, before any handler is registered, so
 * every IPC request is checked against the frame it actually came from:
 *
 *   allowed  app://tatakai.me/...            (packaged renderer)
 *            file://<dist>/…                 (packaged fallback load)
 *            file://<desktop>/offline.html   (crash-loop guard page)
 *            http://localhost:8090/…         (Vite dev server, dev only)
 *   denied   everything else, including any remote http(s) page
 *
 * `ipcMain.on(...)` (fire-and-forget) is left alone on purpose: the
 * extension/compatibility browser windows talk over per-page dynamic channels
 * with their own sender checks, and those frames are *supposed* to be remote.
 */

const { URL, fileURLToPath } = require('node:url');
const path = require('node:path');

const APP_SCHEME_HOST = 'tatakai.me';
const DEV_ORIGINS = new Set([
    'http://localhost:8090',
    'http://127.0.0.1:8090',
]);

/**
 * @param {string} rawUrl
 * @param {object} opts
 * @param {boolean} [opts.isDev]
 * @param {string}  [opts.distDir]     absolute path of the packaged renderer dir
 * @param {string}  [opts.desktopDir]  absolute path of desktop/
 * @returns {boolean}
 */
function isTrustedFrameUrl(rawUrl, opts = {}) {
    if (typeof rawUrl !== 'string' || rawUrl === '') return false;

    let url;
    try {
        url = new URL(rawUrl);
    } catch (_) {
        return false;
    }

    if (url.protocol === 'app:') {
        return url.hostname === APP_SCHEME_HOST;
    }

    if (url.protocol === 'file:') {
        let filePath;
        try {
            filePath = path.resolve(fileURLToPath(url));
        } catch (_) {
            return false;
        }
        const roots = [opts.distDir, opts.desktopDir].filter(Boolean).map((d) => path.resolve(d));
        return roots.some((root) => filePath === root || filePath.startsWith(root + path.sep));
    }

    if (url.protocol === 'http:' || url.protocol === 'https:') {
        return Boolean(opts.isDev) && DEV_ORIGINS.has(url.origin);
    }

    return false;
}

/**
 * Wrap `ipcMain.handle` so every invoke is sender-checked.
 *
 * @param {import('electron').IpcMain} ipcMain
 * @param {object} opts
 * @param {object} [opts.logger]     structured logger with .warn / .error
 * @param {boolean} [opts.isDev]
 * @param {string}  [opts.distDir]
 * @param {string}  [opts.desktopDir]
 * @returns {{ blocked: () => number, uninstall: () => void }}
 */
function installIpcSenderGuard(ipcMain, opts = {}) {
    if (!ipcMain || typeof ipcMain.handle !== 'function') {
        throw new TypeError('installIpcSenderGuard requires an ipcMain');
    }
    if (ipcMain.__tatakaiSenderGuardInstalled) {
        return ipcMain.__tatakaiSenderGuardInstalled;
    }

    const logger = opts.logger || null;
    const originalHandle = ipcMain.handle.bind(ipcMain);
    let blockedCount = 0;

    const wrappedHandle = (channel, listener) => {
        if (typeof listener !== 'function') {
            throw new TypeError(`ipcMain.handle('${channel}') requires a listener function`);
        }
        return originalHandle(channel, async (event, ...args) => {
            const frameUrl = event && event.senderFrame ? event.senderFrame.url : '';
            if (!isTrustedFrameUrl(frameUrl, opts)) {
                blockedCount += 1;
                const detail = `channel=${String(channel)} sender=${frameUrl || 'unknown'}`;
                if (logger && typeof logger.warn === 'function') {
                    logger.warn(`[Security] Blocked IPC from untrusted frame (${detail})`);
                } else {
                    console.warn(`[Security] Blocked IPC from untrusted frame (${detail})`);
                }
                throw new Error('IPC blocked: untrusted sender');
            }
            return listener(event, ...args);
        });
    };

    ipcMain.handle = wrappedHandle;
    const handleHandle = { blocked: () => blockedCount, uninstall: () => { ipcMain.handle = originalHandle; delete ipcMain.__tatakaiSenderGuardInstalled; } };
    ipcMain.__tatakaiSenderGuardInstalled = handleHandle;
    return handleHandle;
}

module.exports = { installIpcSenderGuard, isTrustedFrameUrl };
