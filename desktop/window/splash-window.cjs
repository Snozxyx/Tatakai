'use strict';

const pathModule = require('path');

/**
 * @param {import('electron').BrowserWindow} BrowserWindow
 * @param {string} desktopDir - __dirname of desktop folder
 * @param {Record<string,string>} query - theme tokens for splash.html
 */
function createSplashWindow(BrowserWindow, desktopDir, query = {}) {
    const splash = new BrowserWindow({
        width: 400,
        height: 400,
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        icon: pathModule.join(desktopDir, '..', 'resources', 'icon-512.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    const splashPath = pathModule.join(desktopDir, 'splash.html');
    const q = {};
    Object.entries(query).forEach(([k, v]) => {
        if (v != null && v !== '') q[k] = String(v);
    });
    if (Object.keys(q).length > 0) {
        splash.loadFile(splashPath, { query: q });
    } else {
        splash.loadFile(splashPath);
    }
    splash.center();
    return splash;
}

module.exports = { createSplashWindow };
