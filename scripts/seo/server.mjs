import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { matchEntityRoute } from './routes.mjs';
import { resolveMeta, renderTags, injectIntoHtml, SITE_ORIGIN, SHARE_API_ORIGIN } from './inject.mjs';
import { canonicalSitemapPath, looksXml, sitemapContentType } from './sitemap-utils.mjs';

/** Public renderer: host selection is an explicit allowlist, never reflected from arbitrary request headers. */
export function createSeoServer({ indexPath, sites = {}, lookup = resolveMeta, fetchImpl = fetch }) {
  return createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
    const pathname = (req.url || '/').split('?')[0];
    const selected = sites[String(req.headers.host || '').split(':')[0]] || { origin: SITE_ORIGIN, indexPath };
    const origin = selected.origin;
    const sitemap = canonicalSitemapPath(pathname);
    if (sitemap) {
      if (sitemap !== pathname) { res.writeHead(301, { Location: sitemap }); res.end(); return; }
      try {
        const upstream = await fetchImpl(`${SHARE_API_ORIGIN}/api/public${sitemap}`, {
          headers: { accept: 'application/xml' }, signal: AbortSignal.timeout(15000),
        });
        const body = await upstream.text();
        if (!upstream.ok || !looksXml(body)) throw Error('Sitemap unavailable');
        const localized = body.replace(/(<loc>)https:\/\/tatakai\.(?:app|me)(?=\/|<)/g, `$1${origin}`);
        res.writeHead(200, { 'Content-Type': sitemapContentType(sitemap), 'Cache-Control': 'public, max-age=600', 'Content-Length': Buffer.byteLength(localized) });
        res.end(req.method === 'HEAD' ? undefined : localized);
      } catch {
        res.writeHead(503, { 'Content-Type': sitemapContentType(sitemap), 'Retry-After': '60' });
        res.end(req.method === 'HEAD' ? undefined : '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>');
      }
      return;
    }
    try {
      const base = await readFile(selected.indexPath, 'utf8');
      if (!base.includes('<!-- SEO:START -->') || !base.includes('<!-- SEO:END -->')) throw Error('Missing SEO markers');
      if (pathname === '/health/ready') { res.setHeader('Content-Type', 'application/json'); res.end(req.method === 'HEAD' ? undefined : '{"ready":true}'); return; }
      const match = matchEntityRoute(pathname);
      let meta = null;
      if (match) { try { meta = await lookup(match); } catch { /* Keep the page available on an API outage. */ } }
      const html = meta ? injectIntoHtml(base, renderTags(meta, `${origin}/assets/logo/crimson-sakura-banner.png`, origin)) : base;
      if (meta) res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Content-Length', Buffer.byteLength(html));
      res.end(req.method === 'HEAD' ? undefined : html);
    } catch {
      res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '5' });
      res.end(req.method === 'HEAD' ? undefined : 'Website temporarily unavailable');
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const indexPath = process.env.SEO_INDEX_PATH || resolve('dist/index.html');
  const sites = process.env.SEO_APP_INDEX_PATH ? {
    'tatakai.app': { origin: 'https://tatakai.app', indexPath: process.env.SEO_APP_INDEX_PATH },
    'www.tatakai.app': { origin: 'https://tatakai.app', indexPath: process.env.SEO_APP_INDEX_PATH },
    'tatakai.me': { origin: 'https://tatakai.me', indexPath },
    'www.tatakai.me': { origin: 'https://tatakai.me', indexPath },
  } : {};
  createSeoServer({ indexPath, sites }).listen(Number(process.env.PORT || 8088), '0.0.0.0');
}
