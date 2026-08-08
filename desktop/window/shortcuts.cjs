'use strict';

function registerShortcuts(globalShortcut, getMainWindow) {
    globalShortcut.register('CommandOrControl+Shift+I', () => {
        const mainWindow = getMainWindow();
        if (mainWindow?.webContents) {
            mainWindow.webContents.send('toggle-log-viewer');
        }
    });

    globalShortcut.register('F12', () => {
        const mainWindow = getMainWindow();
        if (mainWindow?.webContents) {
            if (mainWindow.webContents.isDevToolsOpened()) {
                mainWindow.webContents.closeDevTools();
            } else {
                mainWindow.webContents.openDevTools();
            }
        }
    });

    globalShortcut.register('CommandOrControl+R', () => {
        getMainWindow()?.webContents?.reload();
    });

    globalShortcut.register('CommandOrControl+Shift+R', () => {
        getMainWindow()?.webContents?.reloadIgnoringCache();
    });

    globalShortcut.register('CommandOrControl+Shift+T', () => {
        getMainWindow()?.webContents?.send('torrent:restart-shortcut', {
            requestedAt: Date.now(),
        });
    });
}

module.exports = { registerShortcuts };
