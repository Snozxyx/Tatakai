import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, normalize } from 'node:path';
import { existsSync, createReadStream, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { matchEntityRoute } from './seo/routes.mjs';
import { resolveMeta, renderTags, injectIntoHtml, SITE_ORIGIN } from './seo/inject.mjs';

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

  const server = createServer((req, res) => {
    const reqPath = (req.url || '/').split('?')[0];
    const cleanPath = normalize(reqPath).replace(/^([.][.][/\\])+/, '');
    const filePath = cleanPath === '/' ? distIndex : join(distDir, cleanPath.replace(/^[/\\]/, ''));

    // Real file on disk (assets, /index.html, favicon, …): stream it untouched.
    if (existsSync(filePath)) {
      const contentType = MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
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