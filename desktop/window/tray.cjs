'use strict';

function createTray({ Tray, Menu, app, iconPath, fs, getMainWindow, logger }) {
    try {
        if (!fs.existsSync(iconPath)) return null;
        const tray = new Tray(iconPath);
        const contextMenu = Menu.buildFromTemplate([
            {
                label: 'Show App',
                click: () => {
                    const win = getMainWindow();
                    if (win && !win.isDestroyed()) win.show();
                },
            },
            { type: 'separator' },
            { label: 'Quit', click: () => app.quit() },
        ]);
        tray.setToolTip('Tatakai');
        tray.setContextMenu(contextMenu);
        tray.on('click', () => {
            const win = getMainWindow();
            if (win && !win.isDestroyed()) win.show();
        });
        return tray;
    } catch (e) {
        logger?.error?.('Failed to create tray:', e);
        console.error('Failed to create tray:', e);
        return null;
    }
}

module.exports = { createTray };
