'use strict';
// Dedicated sandbox preload: only the interfaces declared by this extension page.
const { contextBridge, ipcRenderer } = require('electron');
const value = process.argv.find(arg => arg.startsWith('--tatakai-page='));
if (value) {
  const { channel, interfaces, answering, dialogs } = JSON.parse(value.slice('--tatakai-page='.length));
  if (dialogs) {
    contextBridge.exposeInMainWorld('__tatakaiSourceDialog', (kind, message, defaultText) => ipcRenderer.sendSync(channel, { type: 'dialog', kind, message: String(message).slice(0, 65536), defaultText: String(defaultText || '').slice(0, 10000) }));
    contextBridge.executeInMainWorld({ func: () => {
    for (const kind of ['alert', 'confirm', 'prompt']) {
      const native = window[kind].bind(window);
      window[kind] = (message, defaultText) => {
        const result = window.__tatakaiSourceDialog(kind, String(message), defaultText);
        if (result?.show) return native(message, defaultText);
        return kind === 'prompt' ? result?.accept ? String(result.text ?? '') : null : kind === 'confirm' ? !!result?.accept : undefined;
      };
    }
    } });
  }
  for (const name of new Set([...Object.keys(interfaces), ...Object.keys(answering)])) {
    const bridge = Object.create(null);
    for (const method of new Set([...(interfaces[name] || []), ...(answering[name] || [])])) {
      bridge[method] = (...args) => {
        const message = JSON.stringify({ 'cs3-js': 1, name, method, args });
        if (message.length > 65536) throw Error('Extension message too large');
        if (!(answering[name] || []).includes(method)) { ipcRenderer.send(channel, { type: 'message', message }); return; }
        const result = ipcRenderer.sendSync(channel, { type: 'call', message });
        if (result?.error) throw Error(String(result.error));
        return result?.value;
      };
    }
    contextBridge.exposeInMainWorld(name, bridge);
  }
}
