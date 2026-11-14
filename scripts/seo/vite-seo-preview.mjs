import { resolve } from 'node:path';
import { createSeoServer } from './server.mjs';
import { canonicalSitemapPath } from './sitemap-utils.mjs';
import { matchEntityRoute } from './routes.mjs';
export function seoPreviewPlugin() {
  return { name: 'tatakai-seo-preview', apply: 'serve', configurePreviewServer(server) {
    const indexPath = resolve(server.config.root, server.config.build.outDir, 'index.html');
    const handler = createSeoServer({ indexPath }).listeners('request')[0];
    server.middlewares.use((req, res, next) => {
      const path = (req.url || '/').split('?')[0];
      if (canonicalSitemapPath(path) || matchEntityRoute(path)) return handler(req, res);
      next();
    });
  }};
}
export default seoPreviewPlugin;
