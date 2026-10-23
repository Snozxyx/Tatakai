'use strict';

const { createHomeServerStore } = require('./store.cjs');
const { createHomeServer } = require('./server.cjs');

function createHomeServerRuntime({ app, fs, path, logger, adapters }) {
  const store = createHomeServerStore({ app, fs, path, logger });
  let extensionRuntime;
  const ensureExtensionServer = () => extensionRuntime ||= import(require('node:url').pathToFileURL(require('node:path').join(__dirname, '../../../..', 'tatakai-server/src/desktop.mjs')).href)
    .then(module => module.createDesktopServer({ app, legacyStore: store, adapters }))
    .then(runtime => { app.once?.('before-quit', () => runtime.close()); return runtime; })
    .catch(error => { extensionRuntime = null; throw error; });
  adapters.handleExtensionServer = async (req, res) => {
    const runtime = await ensureExtensionServer();
    const config = store.read();
    const base = config.remoteBaseUrl || `http://${req.headers.host || 'localhost:' + config.port}`;
    return runtime.handle(req, res, base);
  };
  const server = createHomeServer({ store, adapters, logger });

  return {
    store,
    server,
    start: async (overrides) => { await ensureExtensionServer(); return server.start(overrides); },
    getExtensionServerBootstrap: async () => (await ensureExtensionServer()).bootstrap,
    stop: () => server.stop(),
    getStatus: () => server.getStatus(),
  };
}

module.exports = { createHomeServerRuntime };
