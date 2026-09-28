'use strict';

// Window-scoped accelerators via before-input-event instead of globalShortcut.
// globalShortcut grabs keys OS-wide — F12 / Ctrl+R would fire even when Tatakai
// is in the background and the user is working in another app. before-input-event
// only sees input while this window is focused, which is the correct scope for
// app shortcuts.
function registerShortcuts(getMainWindow) {
    const win = getMainWindow();
    if (!win || win.isDestroyed() || !win.webContents) return;
    const wc = win.webContents;

    const matches = (input, key, { ctrl = false, shift = false } = {}) => {
        if ((input.key || '').toLowerCase() !== key.toLowerCase()) return false;
        const ctrlOrCmd = input.control || input.meta;
        if (ctrl !== !!ctrlOrCmd) return false;
        if (shift !== !!input.shift) return false;
        return true;
    };

    wc.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown') return;

        // F11 → toggle OS fullscreen. The window broadcasts
        // 'window:fullscreen-changed' on state change, so the renderer's
        // Display settings toggle stays in sync however fullscreen was entered.
        if (matches(input, 'F11')) {
            win.setFullScreen(!win.isFullScreen());
            return event.preventDefault();
        }
        // F12 → toggle DevTools
        if (matches(input, 'F12')) {
            wc.isDevToolsOpened() ? wc.closeDevTools() : wc.openDevTools();
            return event.preventDefault();
        }
        // Ctrl/Cmd+Shift+I → log viewer
        if (matches(input, 'i', { ctrl: true, shift: true })) {
            wc.send('toggle-log-viewer');
            return event.preventDefault();
        }
        // Ctrl/Cmd+Shift+R → hard reload (checked before plain reload)
        if (matches(input, 'r', { ctrl: true, shift: true })) {
            wc.reloadIgnoringCache();
            return event.preventDefault();
        }
        // Ctrl/Cmd+R → reload
        if (matches(input, 'r', { ctrl: true })) {
            wc.reload();
            return event.preventDefault();
        }
        // Ctrl/Cmd+Shift+T → torrent restart
        if (matches(input, 't', { ctrl: true, shift: true })) {
            wc.send('torrent:restart-shortcut', { requestedAt: Date.now() });
            return event.preventDefault();
        }
    });
}

module.exports = { registerShortcuts };
