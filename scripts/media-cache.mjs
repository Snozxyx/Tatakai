import { createReadStream, statSync } from 'node:fs';
import path from 'node:path';

const types = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.avif': 'image/avif', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
};

/** Cache public static media, with validators and seekable video delivery. */
export function serveStaticMedia(req, res, filename) {
  const type = types[path.extname(filename).toLowerCase()];
  if (!type || !['GET', 'HEAD'].includes(req.method || 'GET')) return false;
  let stat;
  try { stat = statSync(filename); } catch { return false; }
  if (!stat.isFile()) return false;
  const etag = `"${stat.size.toString(16)}-${Math.trunc(stat.mtimeMs).toString(16)}"`;
  res.setHeader('Content-Type', type);
  res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  res.setHeader('ETag', etag);
  res.setHeader('Last-Modified', stat.mtime.toUTCString());
  res.setHeader('Accept-Ranges', 'bytes');
  if (req.headers['if-none-match'] === etag && !req.headers.range) {
    res.statusCode = 304; res.end(); return true;
  }
  let start = 0;
  let end = stat.size - 1;
  const range = req.headers.range;
  const ifRange = req.headers['if-range'];
  if (range && (!ifRange || ifRange === etag || ifRange === stat.mtime.toUTCString())) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (match && (match[1] || match[2])) {
      start = match[1] ? Number(match[1]) : Math.max(0, stat.size - Number(match[2]));
      end = match[1] && match[2] ? Math.min(Number(match[2]), end) : end;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= stat.size) {
        res.statusCode = 416; res.setHeader('Content-Range', `bytes */${stat.size}`); res.end(); return true;
      }
      res.statusCode = 206;
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
    }
    // Unsupported/multipart ranges are ignored; return a complete 200 response.
  }
  res.setHeader('Content-Length', Math.max(0, end - start + 1));
  if (req.method === 'HEAD' || stat.size === 0) { res.end(); return true; }
  const stream = createReadStream(filename, { start, end });
  stream.on('error', () => res.destroy());
  res.on('close', () => stream.destroy());
  stream.pipe(res);
  return true;
}

export function mediaCachePlugin() {
  let dist;
  return {
    name: 'tatakai-media-cache',
    configResolved(config) { dist = path.resolve(config.root, config.build.outDir); },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        let pathname;
        try { pathname = decodeURIComponent((req.url || '/').split('?')[0]); } catch { return next(); }
        const filename = path.resolve(dist, `.${pathname}`);
        if (!filename.startsWith(`${dist}${path.sep}`)) return next();
        if (!serveStaticMedia(req, res, filename)) next();
      });
    },
  };
}
