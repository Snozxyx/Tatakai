/**
 * Vite plugin: SEO for `vite preview` (the production self-host command the VPS
 * runs via `npm run preview`).
 *
 * Plain `vite preview` serves the static dist/index.html for every SPA route, so
 * social crawlers (which don't run JS) see the SAME default <title>/description/
 * og:image on every page — the "meta is identical on all pages" bug. This plugin
 * gives `vite preview` the same server-side behavior as scripts/ptero-start.mjs:
 *
 *   1. Per-entity meta injection — for shareable routes (anime, manga, profile,
 *      post, tier list, playlist) it fetches the normalized share blob from the
 *      backend and rewrites the <head> between the SEO markers, so a shared link
 *      shows that entity's real title/description/image (e.g. a profile link
 *      shows the user's banner + name).
 *   2. Sitemap proxy — `/sitemap.xml` and `/sitemap-*.xml` are streamed from the
 *      backend's live generator (which enumerates the whole Tiger DB catalog +
 *      public profiles/tier lists/playlists), so the sitemap served from the web
 *      origin is always current without a build step.
 *
 * Every failure degrades to the default HTML / a pass-through — a slow or down
 * backend never breaks a page load.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchEntityRoute } from './routes.mjs';
import {
  resolveMeta,
  renderTags,
  injectIntoHtml,
  SITE_ORIGIN,
  SHARE_API_ORIGIN,
} from './inject.mjs';
import {
  canonicalSitemapPath,
  looksXml,
  degradedSitemapBody,
  sitemapContentType,
} from './sitemap-utils.mjs';

const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/assets/logo/tatakaibanner.png`;

export function seoPreviewPlugin() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const distDir = join(scriptDir, '..', '..', 'dist');
  const distIndex = join(distDir, 'index.html');

  let baseIndexHtml = null;
  const getBaseHtml = () => {
    if (baseIndexHtml == null) {
      try {
        baseIndexHtml = readFileSync(distIndex, 'utf8');
      } catch {
        baseIndexHtml = '';
      }
    }
    return baseIndexHtml;
  };

  return {
    name: 'tatakai-seo-preview',
    apply: 'serve', // preview + dev; the middleware itself only acts on preview requests
    configurePreviewServer(server) {
      server.middlewares.use(async (req, res, next) => {
        try {
          const rawUrl = req.url || '/';
          const pathname = rawUrl.split('?')[0];

          // ---- Sitemap: stream from the backend generator (with local dist fallback) ----
          // CRITICAL: this branch must NEVER call next() / fall through to the
          // SPA fallback. A sitemap URL served as index.html (text/html) is
          // exactly what Google reports as "Sitemap is HTML". Every exit path
          // below ends with valid XML + an XML content type; when neither
          // upstream nor disk has usable XML we answer 503+XML (crawlers retry
          // instead of indexing an HTML error page).
          const canonicalSitemap = canonicalSitemapPath(pathname);
          if (canonicalSitemap) {
            // Tolerated trailing slash (/sitemap-anime-1.xml/): redirect to the
            // canonical XML URL rather than serving SPA HTML for it.
            if (canonicalSitemap !== pathname) {
              const qs = rawUrl.includes('?') ? rawUrl.slice(rawUrl.indexOf('?')) : '';
              res.statusCode = 301;
              res.setHeader('Location', `${canonicalSitemap}${qs}`);
              res.setHeader('Cache-Control', 'public, max-age=86400');
              res.end();
              return;
            }
            const isXsl = canonicalSitemap.endsWith('.xsl');
            const expectedType = sitemapContentType(canonicalSitemap);
            const degradedBody = degradedSitemapBody(canonicalSitemap, SITE_ORIGIN);
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
                const text = await r.text();
                // Guard against an upstream HTML error page (proxy/CDN 404 page).
                if (looksXml(text)) {
                  res.statusCode = 200;
                  res.setHeader('Content-Type', expectedType);
                  res.setHeader('Cache-Control', 'public, max-age=3600');
                  res.end(text);
                  return;
                }
              }
            } catch {
              // Proceed to local disk fallback below
            }

            // Local fallback if upstream returned non-200 or errored (e.g. dist/sitemap.xsl)
            const localFile = join(distDir, canonicalSitemap.replace(/^\/+/, ''));
            if (existsSync(localFile)) {
              try {
                const diskContent = readFileSync(localFile, 'utf8');
                if (looksXml(diskContent)) {
                  res.statusCode = 200;
                  res.setHeader('Content-Type', expectedType);
                  res.setHeader('Cache-Control', 'public, max-age=3600');
                  res.end(diskContent);
                  return;
                }
              } catch {
                // Fall through to the degraded XML response below
              }
            }
            // Degraded but still valid XML — never HTML, never next().
            res.statusCode = 503;
            res.setHeader('Content-Type', expectedType);
            res.setHeader('Cache-Control', 'no-store');
            res.setHeader('Retry-After', '300');
            res.end(degradedBody);
            return;
          }

          // ---- Per-entity meta injection ----
          if (req.method !== 'GET') return next();
          const accept = String(req.headers.accept || '');
          if (!accept.includes('text/html')) return next();
          // Skip anything that looks like a real asset (has a file extension).
          const lastSeg = pathname.split('/').pop() || '';
          if (lastSeg.includes('.')) return next();

          const match = matchEntityRoute(pathname);
          if (!match) return next();

          const base = getBaseHtml();
          if (!base) return next();

          const meta = await resolveMeta(match);
          if (!meta) return next();

          const html = injectIntoHtml(base, renderTags(meta, DEFAULT_OG_IMAGE));
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(html);
          return;
        } catch {
          return next();
        }
      });
    },
  };
}

export default seoPreviewPlugin;
