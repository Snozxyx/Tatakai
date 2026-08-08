'use strict';

const themeBridge = require('../services/theme-bridge.cjs');

module.exports = function registerThemeHandlers(ipcMain, app, fs, path) {
    ipcMain.handle('theme:persist', async (_event, payload) => {
        try {
            const merged = themeBridge.writeTheme(app, fs, path, payload || {});
            return { success: true, theme: merged };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('theme:get-splash', async () => {
        const tokens = themeBridge.readThemeForSplash(app, fs, path);
        return { success: true, ...tokens };
    });
};
