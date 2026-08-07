'use strict';

function registerProtocolClient(app, pathModule) {
    if (process.defaultApp) {
        if (process.argv.length >= 2) {
            app.setAsDefaultProtocolClient('tatakai', process.execPath, [pathModule.resolve(process.argv[1])]);
            app.setAsDefaultProtocolClient('magnet', process.execPath, [pathModule.resolve(process.argv[1])]);
        }
    } else {
        app.setAsDefaultProtocolClient('tatakai');
        app.setAsDefaultProtocolClient('magnet');
    }
}

function handleDeepLink(url, getMainWindow) {
    const mainWindow = getMainWindow();
    if (!mainWindow) return;
    
    // Security: Only allow specific protocols
    if (!url.startsWith('tatakai://') && !url.startsWith('magnet:?')) {
        return;
    }

    // Handle magnet link directly
    if (url.startsWith('magnet:?')) {
        mainWindow.webContents.send('torrent:open-magnet', url);
        return;
    }

    // Handle tatakai:// protocol
    let rawRoute = url.replace('tatakai://', '');
    
    // Decode if it's potentially encoded (some browsers do this)
    if (rawRoute.includes('%')) {
        try {
            const decoded = decodeURIComponent(rawRoute);
            if (decoded.startsWith('magnet:?')) {
                rawRoute = decoded;
            }
        } catch (e) {
            // ignore decode errors
        }
    }
    
    // Check if it's a magnet wrapped in tatakai://
    if (rawRoute.startsWith('magnet:?')) {
        mainWindow.webContents.send('torrent:open-magnet', rawRoute);
        return;
    }

    // Security: Sanitize standard routes
    // Only allow alphanumeric, slashes, dashes, underscores, dots, and question marks (for queries)
    const sanitizedRoute = '/' + rawRoute.replace(/[^a-zA-Z0-9\/\-_\.\?\=&]/g, '');

    mainWindow.webContents.send('navigate', sanitizedRoute);
}

/**
 * Returns true if this process should continue (has the lock).
 */
function registerSingleInstance(app, getMainWindow, onDeepLink) {
    const gotTheLock = app.requestSingleInstanceLock();
    if (!gotTheLock) {
        app.quit();
        return false;
    }
    app.on('second-instance', (_event, commandLine) => {
        const mainWindow = getMainWindow();
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
        
        // Find the URL or File path in the command line
        // Some systems might have the URL as the last argument, others might have it elsewhere
        const urlArg = commandLine.find(arg => 
            arg.startsWith('tatakai://') || 
            arg.startsWith('magnet:?') ||
            arg.endsWith('.torrent') || 
            arg.endsWith('.magnet')
        );

        if (!urlArg) return;

        if (urlArg.startsWith('tatakai://') || urlArg.startsWith('magnet:?')) {
            onDeepLink(urlArg);
        } else if (urlArg.endsWith('.torrent') || urlArg.endsWith('.magnet')) {
            // It's a file
            if (mainWindow) {
                mainWindow.webContents.send('torrent:open-file', urlArg);
            }
        }
    });
    return true;
}

module.exports = {
    registerProtocolClient,
    handleDeepLink,
    registerSingleInstance,
};
