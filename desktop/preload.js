const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
    getPlatform: () => ipcRenderer.invoke('get-platform'),
    updateRPC: (data) => ipcRenderer.send('update-rpc', data),
});
