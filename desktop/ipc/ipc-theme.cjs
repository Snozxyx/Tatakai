'use strict';

const themeBridge = require('../services/theme-bridge.cjs');

module.exports = function registerThemeHandlers(ipcMain, app, fs, path, windowBackdrop) {
    ipcMain.handle('theme:persist', async (_event, payload) => {
        try {
            const merged = themeBridge.writeTheme(app, fs, path, payload || {});
            windowBackdrop?.updateTheme(merged);
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
