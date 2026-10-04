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
import { readFileSync } from 'node:fs';
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

const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/assets/logo/tatakaibanner.png`;
const SITEMAP_RE = /^\/sitemap(-[\w.-]+)?\.xml$/;

export function seoPreviewPlugin() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const distIndex = join(scriptDir, '..', '..', 'dist', 'index.html');

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

          // ---- Sitemap: stream from the backend generator ----
          if (SITEMAP_RE.test(pathname)) {
            try {
              const upstream = `${SHARE_API_ORIGIN}/api/public${pathname}`;
              const r = await fetch(upstream, { headers: { accept: 'application/xml' } });
              if (!r.ok) return next();
              const xml = await r.text();
              res.setHeader('Content-Type', 'application/xml; charset=utf-8');
              res.setHeader('Cache-Control', 'public, max-age=3600');
              res.end(xml);
              return;
            } catch {
              return next();
            }
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
