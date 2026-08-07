'use strict';

const { createHomeServerStore } = require('./store.cjs');
const { createHomeServer } = require('./server.cjs');

function createHomeServerRuntime({ app, fs, path, logger, adapters }) {
  const store = createHomeServerStore({ app, fs, path, logger });
  const server = createHomeServer({ store, adapters, logger });

  return {
    store,
    server,
    start: (overrides) => server.start(overrides),
    stop: () => server.stop(),
    getStatus: () => server.getStatus(),
  };
}

module.exports = { createHomeServerRuntime };
