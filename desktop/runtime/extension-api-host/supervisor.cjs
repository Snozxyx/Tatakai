'use strict';

/**
 * Extension-API Host supervisor
 * ------------------------------------------------------------------------------
 * Thin lifecycle wrapper around the generic host request handler
 * (`host-server.cjs`). Runs IN-PROCESS in the Electron main process so the
 * handler can call the `registry` and `localProxy` singletons directly (the
 * in-app proxy that mints tokenized, Cloudflare-bypassing media URLs lives in
 * the main process).
 *
 * Responsibilities:
 *   - start({ registry, localProxy, logger, ensureProxy }) — ensures the proxy
 *     is up FIRST (so `localProxy.registerSource` works), then binds a loopback
 *     HTTP server on 127.0.0.1. Prefers port 8099; on EADDRINUSE falls back to
 *     an ephemeral free port.
 *   - getBaseUrl() → "http://127.0.0.1:<port>" (or null before start)
 *   - listNamespaces() → mounted namespaces for `runtime:get-api-base`
 *   - refresh() — invalidate cached bundles (call after extension reload)
 *   - stop() — graceful shutdown (called from app 'will-quit')
 *   - re-listen guard: if the server closes unexpectedly while running, it
 *     rebinds once on an ephemeral port.
 */

const http = require('node:http');
const { createHostApp } = require('./host-server.cjs');

const HOST = '127.0.0.1';
const DEFAULT_PORT = 8099;

function createExtensionApiHost() {
    let server = null;
    let port = null;
    let app = null;
    let deps = null;
    let started = false;
    let stopping = false;
    let restartAttempts = 0;

    function getBaseUrl() {
        return port ? `http://${HOST}:${port}` : null;
    }

    function getPort() {
        return port;
    }

    function listNamespaces() {
        return app ? app.listNamespaces() : [];
    }

    function refresh() {
        app?.invalidateBundles();
    }

    /**
     * Attempt to bind on `preferredPort`. Resolves with the bound server, or
     * `null` on EADDRINUSE (so the caller can retry on an ephemeral port).
     * Rejects on any other listen error.
     */
    function tryListen(preferredPort) {
        return new Promise((resolve, reject) => {
            const srv = http.createServer(app.handler);
            const onError = (err) => {
                srv.removeListener('listening', onListening);
                if (err && err.code === 'EADDRINUSE') {
                    resolve(null); // signal: retry ephemeral
                } else {
                    reject(err);
                }
            };
            const onListening = () => {
                srv.removeListener('error', onError);
                resolve(srv);
            };
            srv.once('error', onError);
            srv.once('listening', onListening);
            srv.listen(preferredPort, HOST);
        });
    }

    /** Attach the unexpected-close re-listen guard. */
    function attachGuard() {
        server.on('error', (err) => {
            deps?.logger?.error?.(`[ExtHost] server error: ${err.message}`);
        });
        server.on('close', () => {
            if (stopping || !started) return;
            if (restartAttempts >= 3) {
                deps?.logger?.error?.('[ExtHost] server closed unexpectedly — max restart attempts reached');
                return;
            }
            restartAttempts++;
            deps?.logger?.warn?.(`[ExtHost] server closed unexpectedly — rebinding (attempt ${restartAttempts})`);
            tryListen(0)
                .then((srv) => {
                    if (!srv) return;
                    server = srv;
                    port = server.address().port;
                    attachGuard();
                    deps?.logger?.info?.(`[ExtHost] rebound on ${getBaseUrl()}`);
                })
                .catch((err) => deps?.logger?.error?.(`[ExtHost] rebind failed: ${err.message}`));
        });
    }

    /**
     * @param {object} args
     * @param {object} args.registry     ExtensionRegistry singleton
     * @param {object} args.localProxy   LocalProxyServer singleton
     * @param {object} [args.logger]     LogService
     * @param {Function} [args.ensureProxy] async () => proxyBaseUrl (started first)
     * @returns {Promise<string|null>} the host base URL
     */
    async function start({ registry, localProxy, logger, ensureProxy } = {}) {
        if (started) return getBaseUrl();
        if (!registry || !localProxy) {
            throw new Error('[ExtHost] start requires { registry, localProxy }');
        }
        deps = { registry, localProxy, logger, ensureProxy };

        // Ensure the in-app proxy is running FIRST so registerSource() mints
        // valid tokenized URLs (baseUrl() would otherwise be :null).
        if (typeof ensureProxy === 'function') {
            try {
                await ensureProxy();
            } catch (err) {
                logger?.warn?.(`[ExtHost] proxy ensure failed (media URLs may not proxy): ${err.message}`);
            }
        }

        app = createHostApp({ registry, localProxy, logger });

        let srv = null;
        try {
            srv = await tryListen(DEFAULT_PORT);
        } catch (err) {
            logger?.warn?.(`[ExtHost] listen on ${DEFAULT_PORT} failed (${err.message}); trying ephemeral port`);
            srv = null;
        }
        if (!srv) {
            srv = await tryListen(0); // ephemeral free port
        }

        server = srv;
        port = server.address().port;
        started = true;
        restartAttempts = 0;
        attachGuard();

        const namespaces = listNamespaces();
        logger?.info?.(`[ExtHost] listening on ${getBaseUrl()}`);
        logger?.info?.(`[ExtHost] mounted namespaces: ${namespaces.map((n) => n.namespace).join(', ') || '(none installed)'}`);
        return getBaseUrl();
    }

    async function stop() {
        stopping = true;
        started = false;
        if (server) {
            const srv = server;
            server = null;
            await new Promise((resolve) => {
                try {
                    srv.close(() => resolve());
                } catch (_) {
                    resolve();
                }
            });
        }
        port = null;
        stopping = false;
    }

    return { start, stop, getBaseUrl, getPort, listNamespaces, refresh };
}

module.exports = { createExtensionApiHost };
