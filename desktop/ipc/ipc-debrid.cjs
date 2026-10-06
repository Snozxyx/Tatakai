'use strict';

/**
 * CORS-free transport for the two debrid APIs used by the renderer.
 * This is deliberately not a generic HTTP proxy: protocol, hostname, method,
 * headers and body size are all constrained before Node's fetch is reached.
 */

const ALLOWED_HOSTS = new Set([
    'api.real-debrid.com',
    'api.torbox.app',
]);
const ALLOWED_METHODS = new Set(['GET', 'POST']);
const ALLOWED_HEADERS = new Set(['accept', 'authorization', 'content-type']);
const MAX_BODY_BYTES = 256 * 1024;

function normalizeRequest(payload = {}) {
    const parsed = new URL(String(payload.url || ''));
    if (parsed.protocol !== 'https:' || parsed.port || !ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) {
        throw new Error('Debrid request target is not allowed');
    }

    const method = String(payload.method || 'GET').toUpperCase();
    if (!ALLOWED_METHODS.has(method)) throw new Error('Debrid request method is not allowed');

    const headers = {};
    for (const [name, value] of Object.entries(payload.headers || {})) {
        const normalizedName = String(name).toLowerCase();
        if (!ALLOWED_HEADERS.has(normalizedName)) continue;
        headers[normalizedName] = String(value);
    }

    const body = payload.body == null ? undefined : String(payload.body);
    if (body && Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
        throw new Error('Debrid request body is too large');
    }

    return {
        url: parsed.href,
        method,
        headers,
        body: method === 'GET' ? undefined : body,
        timeoutMs: Math.min(60_000, Math.max(1_000, Number(payload.timeoutMs) || 20_000)),
    };
}

async function performRequest(payload) {
    const request = normalizeRequest(payload);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), request.timeoutMs);
    try {
        const response = await fetch(request.url, {
            method: request.method,
            headers: request.headers,
            body: request.body,
            signal: controller.signal,
            // Neither provider redirects its JSON API calls. Refusing redirects
            // keeps the allowlist valid for the complete request, not just hop 1.
            redirect: 'error',
        });
        return {
            status: response.status,
            statusText: response.statusText,
            url: response.url || request.url,
            headers: Object.fromEntries(response.headers.entries()),
            body: await response.text(),
        };
    } finally {
        clearTimeout(timeout);
    }
}

module.exports = function registerDebridIpc(ipcMain) {
    ipcMain.handle('debrid:request', async (_event, payload) => performRequest(payload));
};

module.exports.normalizeRequest = normalizeRequest;
module.exports.performRequest = performRequest;

