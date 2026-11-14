'use strict';

function getDevServerUrl(env = process.env) {
    const url = new URL(env.ELECTRON_DEV_SERVER_URL || 'http://localhost:8090');
    if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
        url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
        throw new Error('ELECTRON_DEV_SERVER_URL must be a local HTTP origin');
    }
    return url.origin;
}

function isDevServerUrl(rawUrl, env = process.env) {
    try {
        const url = new URL(rawUrl);
        const server = new URL(getDevServerUrl(env));
        return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
            !url.username && !url.password && url.port === server.port;
    } catch { return false; }
}

module.exports = { getDevServerUrl, isDevServerUrl };
