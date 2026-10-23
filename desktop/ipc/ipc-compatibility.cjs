'use strict';
const path = require('node:path');
const { CompatibilityBroker } = require('../runtime/compatibility/broker.cjs');
const { CompatibilityBrowser } = require('../runtime/compatibility/browser.cjs');
module.exports = function registerCompatibility({ ipcMain, app, getMainWindow, proxy }) {
  const broker = new CompatibilityBroker({ root: path.join(app.getPath('userData'), 'compatibility', 'mihon'), proxy, browser: new CompatibilityBrowser(getMainWindow, { root: path.join(app.getPath('userData'), 'compatibility', 'cloudstream', 'data') }) });
  ipcMain.handle('compatibility:request', async (event, payload) => {
    const win = getMainWindow();
    if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw Error('Compatibility access requires the main application');
    try { return { ok: true, result: await broker.request(payload) }; }
    catch (error) { return { ok: false, error: String(error.message || error).replace(/https?:\/\/\S+/g, '[source URL]').slice(0, 300) }; }
  });
  app.once('before-quit', () => broker.stop());
  return broker;
};
