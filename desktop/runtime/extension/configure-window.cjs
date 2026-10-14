'use strict';
function configuredManifest(value) {
    try {
        if (!/^stremio:\/\//i.test(value)) return null;
        const url = new URL(value.replace(/^stremio:/i, 'https:'));
        if (!url.hostname || url.username || url.password || !url.pathname.endsWith('/manifest.json')) return null;
        return url.href;
    } catch { return null; }
}
function openConfigureWindow(BrowserWindow, parent, endpoint) {
    const target = new URL(endpoint);
    if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password) throw Error('Invalid configuration URL');
    const win = new BrowserWindow({ width: 960, height: 760, title: 'Configure extension', parent,
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true } });
    let resolveResult;
    const result = new Promise(resolve => { resolveResult = resolve; });
    let delivered = false;
    win.on('closed', () => resolveResult({ success: false }));
    const capture = value => {
        const manifest = configuredManifest(value);
        if (!manifest) return false;
        if (!delivered && parent && !parent.isDestroyed()) {
            delivered = true;
            resolveResult({ success: true, manifestUrl: manifest });
            parent.webContents.send('extension:configured', manifest);
            parent.focus();
            win.close();
        }
        return true;
    };
    const navigation = (event, url) => {
        if (capture(url) || !/^https?:\/\//i.test(url)) event.preventDefault();
    };
    win.webContents.on('will-navigate', navigation);
    win.webContents.on('will-redirect', navigation);
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (!capture(url) && /^https?:\/\//i.test(url)) void win.loadURL(url);
        return { action: 'deny' };
    });
    void win.loadURL(target.href).catch(() => { resolveResult({ success: false }); win.close(); });
    return result;
}
module.exports = { configuredManifest, openConfigureWindow };
