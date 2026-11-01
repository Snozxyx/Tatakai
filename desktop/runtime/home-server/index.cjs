'use strict';

const { createHomeServerStore } = require('./store.cjs');
const { createHomeServer } = require('./server.cjs');
const pathApi = require('node:path');
const fsApi = require('node:fs');
const { pathToFileURL } = require('node:url');

// The extension server ships inside app.asar at <appRoot>/tatakai-server/src
// in installed builds ("files" in package.json, verified by
// scripts/verify-extension-server-package.cjs). In development the app is
// usually launched as `electron desktop/main.cjs`, which makes app.getAppPath()
// return <repo>/desktop even though the server lives at <repo>/tatakai-server.
// Resolving relative to this module's own location is stable in both cases
// (the packaged copy keeps the same relative layout under app.asar), so it is
// tried first; app.getAppPath() is kept as an extra hint for exotic layouts.
function resolveExtensionServerEntry(app) {
  const here = pathApi.resolve(__dirname, '..', '..', '..'); // repo root (dev) or app.asar root (packaged)
  const candidates = [
    pathApi.join(here, 'tatakai-server', 'src', 'desktop.mjs'),
    pathApi.join(app?.getAppPath?.() || here, 'tatakai-server', 'src', 'desktop.mjs'),
  ];
  for (const candidate of candidates) {
    try {
      if (candidate && fsApi.existsSync(candidate)) return candidate;
    } catch { /* unreadable path — try the next candidate */ }
  }
  return candidates[0];
}

function createHomeServerRuntime({ app, fs, path, logger, adapters }) {
  const store = createHomeServerStore({ app, fs, path, logger });
  let extensionRuntime;
  const ensureExtensionServer = () => extensionRuntime ||= import(pathToFileURL(resolveExtensionServerEntry(app)).href)
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

module.exports = { createHomeServerRuntime, resolveExtensionServerEntry };
