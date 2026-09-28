'use strict';

/**
 * `app://` — a real, secure origin for the packaged renderer.
 *
 * The packaged app used to load `dist/index.html` over `file://`, which gives
 * the renderer a null/opaque origin (`window.location.origin === 'file://'`).
 * Cloudflare Turnstile refuses to render in that context (no secure origin, no
 * hostname to validate the sitekey against), so the auth captcha never appeared
 * on desktop. Serving the same `dist/` bundle over a custom scheme registered as
 * `standard` + `secure` gives the renderer `window.isSecureContext === true` and
 * a stable hostname.
 *
 * The host is the real product domain so the origin's hostname matches the
 * Turnstile sitekey's allowed domain: `app://tatakai.me`. IMPORTANT: the sitekey
 * (Cloudflare dashboard → Turnstile → domain management) must list `tatakai.me`
 * for the widget to validate; otherwise it renders but errors on solve. This is
 * the piece that needs a real-device test.
 *
 * The renderer uses HashRouter on Electron (see `src/App.tsx`), so client routes
 * live in the URL hash and never hit this handler — it only serves the initial
 * document and the Vite assets (referenced relatively, `./assets/…`, because the
 * build sets Vite `base: './'`). All loopback/API servers already send
 * `Access-Control-Allow-Origin: *`, so the origin change introduces no CORS
 * regression.
 */

const fs = require('fs');
const path = require('path');

const APP_SCHEME = 'app';
const APP_HOST = 'tatakai.me';
const APP_START_URL = `${APP_SCHEME}://${APP_HOST}/index.html`;

/** Privileges entry to merge into registerSchemesAsPrivileged (before ready). */
const APP_SCHEME_PRIVILEGES = {
  scheme: APP_SCHEME,
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: true,
    stream: true,
  },
};

const MIME_BY_EXT = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Register the `app://` file handler against `distDir`. Must run after the
 * `ready` event (protocol.handle requirement) and before the window loads.
 */
function registerAppScheme(protocol, distDir, logger) {
  const root = path.normalize(distDir);

  protocol.handle(APP_SCHEME, async (request) => {
    try {
      const url = new URL(request.url);
      let rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      if (rel === '') rel = 'index.html';

      let filePath = path.normalize(path.join(root, rel));

      // Path-traversal guard: never serve outside dist/.
      if (filePath !== root && !filePath.startsWith(root + path.sep)) {
        return new Response('Forbidden', { status: 403 });
      }

      let exists = false;
      try {
        exists = fs.statSync(filePath).isFile();
      } catch (_) {
        exists = false;
      }

      if (!exists) {
        // Only a real page navigation to an extension-less client route gets the
        // SPA shell. A same-origin fetch()/XHR to a missing path must 404 so the
        // caller's own fallback runs — notably the `/api/proxy/*` helpers, which
        // only exist in the hosted web build (on desktop there is no server
        // behind app://tatakai.me/api). Returning index.html to those handed HTML
        // bytes to callers expecting binary and broke .kai extension installs
        // (JSZip: "Can't find end of central directory : is this a zip file ?").
        const isNavigation =
          request.mode === 'navigate' || request.destination === 'document';
        if (isNavigation && path.extname(rel) === '') {
          filePath = path.join(root, 'index.html');
        } else {
          return new Response('Not found', { status: 404 });
        }
      }

      const data = await fs.promises.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      return new Response(data, {
        status: 200,
        headers: { 'Content-Type': MIME_BY_EXT[ext] || 'application/octet-stream' },
      });
    } catch (err) {
      logger?.error?.('[app-scheme] Failed to serve', request.url, err?.message);
      return new Response('Internal error', { status: 500 });
    }
  });

  logger?.info?.(`[app-scheme] Serving ${APP_START_URL} from ${root}`);
}

module.exports = { APP_SCHEME, APP_HOST, APP_START_URL, APP_SCHEME_PRIVILEGES, registerAppScheme };
