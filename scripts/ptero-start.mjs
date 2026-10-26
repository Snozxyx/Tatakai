import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize, resolve, sep } from 'node:path';
import { existsSync, createReadStream, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { matchEntityRoute } from './seo/routes.mjs';
import { resolveMeta, renderTags, injectIntoHtml, SITE_ORIGIN, SHARE_API_ORIGIN } from './seo/inject.mjs';
import { canonicalSitemapPath, looksXml, degradedSitemapBody, sitemapContentType } from './seo/sitemap-utils.mjs';
import { serveStaticMedia } from './media-cache.mjs';

const port = Number(process.env.PORT || process.env.SERVER_PORT || 8088);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = join(scriptDir, '..');
const distDir = join(rootDir, 'dist');
const viteBin = join(scriptDir, '..', 'node_modules', 'vite', 'bin', 'vite.js');
const distIndex = join(distDir, 'index.html');

/** Site default og:image, used when a matched entity has no image of its own. */
const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/tatakaibanner.png`;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.xsl': 'text/xsl; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

// ── Security headers ─────────────────────────────────────────────────────────
// SEC audit finding WEB-1: this server (the documented self-hosted production
// web entrypoint, `npm run start:web` / Pterodactyl) sent no security headers at
// all — no CSP, no HSTS, no nosniff — unlike the Vercel deployment, which gets
// them from vercel.json. Keep the two in sync when either changes.
const SITE_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.google-analytics.com https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' blob: https: http: http://localhost:* http://127.0.0.1:* http://[::1]:* https://*.supabase.co https://*.tatakai.me https://api.tatakai.me https://api.jikan.moe https://api.trace.moe https://graphql.anilist.co https://api.myanimelist.net https://api.mangabaka.org https://www.google-analytics.com https://*.datadoghq.com https://challenges.cloudflare.com https://huggingface.co https://*.huggingface.co https://*.hf.co",
  "media-src 'self' blob: https:",
  "worker-src 'self' blob:",
  "frame-src 'self' https: https://challenges.cloudflare.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  'upgrade-insecure-requests',
].join('; ');

/**
 * Apply the baseline security header set to a response.
 * @param {import('node:http').ServerResponse} res
 * @param {{html?: boolean}} [opts]
 */
function applySecurityHeaders(res, opts = {}) {
  if (!res.headersSent) {
    if (opts.html !== false) res.setHeader('Content-Security-Policy', SITE_CSP);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  }
}

function runOrExit(command, args, stepName) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env: process.env,
  });

  if (result.error) {
    console.error(`[ptero-start] Failed to run ${stepName}:`, result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(`[ptero-start] ${stepName} exited with code ${result.status ?? 1}`);
    process.exit(result.status ?? 1);
  }
}

function startStaticServer() {
  // Read the built index once; per-entity meta is injected into a copy of this
  // string on the SPA-fallback path. If it can't be read, injection is skipped
  // (falls back to streaming the file) — the site still serves.
  let baseIndexHtml = null;
  try {
    baseIndexHtml = readFileSync(distIndex, 'utf8');
  } catch (err) {
    console.warn('[ptero-start] Could not read index.html for SEO injection:', err.message);
  }

  const server = createServer(async (req, res) => {
    const reqPath = (req.url || '/').split('?')[0];
    // normalize() emits `\` separators on Windows (win32); canonicalize to `/`
    // so sitemap matching + file joins behave identically on every platform.
    const cleanPath = normalize(reqPath).replace(/\\/g, '/').replace(/^([.][.][/\\])+/, '');
    const sitemapMatch = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;

    // Dynamic Sitemap: proxy to TatakaiAPI generator.
    // CRITICAL: this branch must NEVER fall through to the SPA fallback below.
    // A sitemap URL served as index.html (text/html) is exactly what Google
    // reports as "Sitemap is HTML". Every exit path ends with valid XML + an
    // XML content type; when neither upstream nor disk has usable XML we answer
    // 503+XML (crawlers retry instead of indexing an HTML error page).
    const canonicalSitemap = canonicalSitemapPath(sitemapMatch);
    if (canonicalSitemap) {
      // Tolerated trailing slash (/sitemap-anime-1.xml/): redirect to the
      // canonical XML URL rather than serving SPA HTML for it.
      if (canonicalSitemap !== sitemapMatch) {
        const qs = (req.url || '').includes('?') ? (req.url || '').slice((req.url || '').indexOf('?')) : '';
        res.statusCode = 301;
        res.setHeader('Location', `${canonicalSitemap}${qs}`);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.end();
        return;
      }
      const expectedType = sitemapContentType(canonicalSitemap);
      const isXsl = canonicalSitemap.endsWith('.xsl');
      const degradedBody = degradedSitemapBody(canonicalSitemap, SITE_ORIGIN);
      let served = false;
      try {
        const upstream = `${SHARE_API_ORIGIN}/api/public${canonicalSitemap}`;
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        let r;
        try {
          r = await fetch(upstream, {
            headers: { accept: isXsl ? 'text/xsl, text/xml, application/xml, */*' : 'application/xml' },
            signal: ctrl.signal,
          });
        } finally {
          clearTimeout(timer);
        }
        if (r && r.ok) {
          const body = await r.text();
          // Guard against an upstream HTML error page (proxy/CDN 404 page).
          if (looksXml(body)) {
            res.statusCode = 200;
            res.setHeader('Content-Type', expectedType);
            res.setHeader('Cache-Control', 'public, max-age=3600');
            res.end(body);
            served = true;
          }
        }
      } catch {
        // Fall through to the degraded XML response below
      }
      if (!served) {
        res.statusCode = 503;
        res.setHeader('Content-Type', expectedType);
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Retry-After', '300');
        applySecurityHeaders(res, { html: false });
        res.end(degradedBody);
      }
      return;
    }

    const filePath = cleanPath === '/' ? distIndex : join(distDir, cleanPath.replace(/^[/\\]/, ''));

    // SEC audit finding WEB-2: containment check. normalize()+join() already
    // collapses `..`, but an encoded or unicode separator could otherwise escape
    // dist/ and serve an arbitrary file. Everything outside dist/ is a 404.
    const resolvedFile = resolve(filePath);
    if (resolvedFile !== distIndex && !resolvedFile.startsWith(distDir + sep)) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      applySecurityHeaders(res, { html: false });
      res.end('Not found');
      return;
    }

    // Real file on disk (assets, /index.html, favicon, …): stream it untouched.
    if (existsSync(filePath)) {
      if (serveStaticMedia(req, res, filePath)) return;
      const contentType = MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      applySecurityHeaders(res);
      createReadStream(filePath)
        .on('error', () => {
          res.statusCode = 500;
          res.end('Internal Server Error');
        })
        .pipe(res);
      return;
    }

    // SPA fallback: serve index.html, injecting per-entity meta for shareable
    // routes so social crawlers get a tailored preview. Non-entity SPA routes
    // (home, search, settings, …) serve the default meta unchanged.
    void serveSpaFallback(reqPath, res, baseIndexHtml);
  });

  server.listen(port, '0.0.0.0', () => {
    console.log(`[ptero-start] Serving dist on http://0.0.0.0:${port}`);
  });
}

async function serveSpaFallback(reqPath, res, baseIndexHtml) {
  res.setHeader('Content-Type', MIME_TYPES['.html']);
  applySecurityHeaders(res);

  // No cached HTML (unreadable at startup): stream the file as a last resort.
  if (baseIndexHtml == null) {
    createReadStream(distIndex)
      .on('error', () => {
        res.statusCode = 500;
        res.end('Internal Server Error');
      })
      .pipe(res);
    return;
  }

  let html = baseIndexHtml;
  try {
    const match = matchEntityRoute(reqPath);
    if (match) {
      const meta = await resolveMeta(match);
      if (meta) html = injectIntoHtml(baseIndexHtml, renderTags(meta, DEFAULT_OG_IMAGE));
    }
  } catch (err) {
    // Any injection failure degrades to the default meta — never a 500.
    console.warn('[ptero-start] SEO injection failed:', err?.message);
    html = baseIndexHtml;
  }

  res.end(html);
}

if (existsSync(distIndex)) {
  startStaticServer();
} else if (existsSync(viteBin)) {
  console.warn('[ptero-start] dist/ not found. Falling back to Vite build+preview.');
  runOrExit(process.execPath, [viteBin, 'build'], 'vite build');

  console.log(`[ptero-start] Starting preview on 0.0.0.0:${port}`);

  const preview = spawn(process.execPath, [viteBin, 'preview', '--host', '0.0.0.0', '--port', String(port), '--strictPort'], {
    stdio: 'inherit',
    env: process.env,
  });

  preview.on('error', (err) => {
    console.error('[ptero-start] Failed to start preview process:', err.message);
    process.exit(1);
  });

  preview.on('exit', (code) => {
    process.exit(code ?? 0);
  });
} else {
  console.error('[ptero-start] Missing both dist/ and Vite.');
  console.error('[ptero-start] For Pterodactyl, install production deps and deploy prebuilt dist/.');
  console.error('[ptero-start] Suggested install command: npm i --omit=dev');
  process.exit(1);
}
