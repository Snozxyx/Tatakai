'use strict';

module.exports = function registerBackdropHandlers(ipcMain, runtime, getMainWindow) {
    ipcMain.handle('backdrop:get-capabilities', () => runtime.getCapabilities());
    ipcMain.handle('backdrop:get-selection', () => runtime.getSelection());
    ipcMain.handle('backdrop:set-selection', (event, payload) => {
        const window = getMainWindow();
        if (!window || event.sender !== window.webContents) return { success: false, ...runtime.getSelection(), error: 'Only the main app window can change its backdrop.' };
        return runtime.setSelection(payload);
    });
};
