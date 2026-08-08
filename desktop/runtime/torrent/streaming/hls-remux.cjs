'use strict';

const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');

const HOST = '127.0.0.1';
const PORT = 8890;

const ROOT_DIR_NAME = 'tatakai-hls';

let server = null;
let serverRoot = null;

function ensureServer(app, logger) {
  if (server) return { server, root: serverRoot };
  const root = path.join(app.getPath('temp'), ROOT_DIR_NAME);
  serverRoot = root;
  if (!fs.existsSync(root)) fs.mkdirSync(root, { recursive: true });

  server = http.createServer((req, res) => {
    try {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Range, Origin, Accept, Content-Type');
      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
      }

      const parsed = url.parse(req.url || '/');
      const decoded = decodeURIComponent(parsed.pathname || '/');
      const rel = decoded.replace(/^\/+/, '');
      const full = path.normalize(path.join(root, rel));
      if (!full.startsWith(path.normalize(root))) {
        res.statusCode = 403;
        res.end('forbidden');
        return;
      }
      if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
        res.statusCode = 404;
        res.end('not_found');
        return;
      }
      const ext = path.extname(full).toLowerCase();
      if (ext === '.m3u8') res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      else if (ext === '.m4s') res.setHeader('Content-Type', 'video/iso.segment');
      else if (ext === '.mp4') res.setHeader('Content-Type', 'video/mp4');
      else if (ext === '.ts') res.setHeader('Content-Type', 'video/mp2t');
      else res.setHeader('Content-Type', 'application/octet-stream');

      fs.createReadStream(full).pipe(res);
    } catch (err) {
      res.statusCode = 500;
      res.end('error');
      logger?.warn?.('[TorrentHLS] Serve error:', err?.message || err);
    }
  });

  server.listen(PORT, HOST, () => {
    logger?.info?.(`[TorrentHLS] Server listening on http://${HOST}:${PORT}`);
  });
  server.on('error', (err) => {
    logger?.warn?.('[TorrentHLS] Server error:', err?.message || err);
  });

  return { server, root };
}

function getVariantKey({ audioTrackIndex }) {
  const a = audioTrackIndex == null ? 'auto' : String(audioTrackIndex);
  return `a${a}`;
}

function startRemuxJob({ app, logger, sessionId, inputUrl, audioTrackIndex }) {
  const { root } = ensureServer(app, logger);
  const variant = getVariantKey({ audioTrackIndex });
  const outDir = path.join(root, sessionId, variant);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const manifestName = 'index.m3u8';
  const manifestPath = path.join(outDir, manifestName);
  const segmentPattern = path.join(outDir, 'seg-%05d.m4s');
  const initName = path.join(outDir, 'init.mp4');

  const isNetwork = String(inputUrl || '').startsWith('http://') || String(inputUrl || '').startsWith('https://');

  const args = [
    '-hide_banner',
    '-loglevel', 'warning',
    '-fflags', '+genpts',
    '-avoid_negative_ts', 'make_non_negative',
    '-analyzeduration', '10000000',
    '-probesize', '10000000',
  ];

  if (isNetwork) {
    args.push(
      '-rw_timeout', '60000000',
      '-timeout', '60000000',
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '10'
    );
  }

  args.push(
    '-i', String(inputUrl || '').replace(/\\/g, '/'),
    '-map', '0:v:0'
  );

  if (audioTrackIndex != null && Number.isFinite(Number(audioTrackIndex))) {
    args.push('-map', `0:a:${Number(audioTrackIndex)}`);
  } else {
    // default: first audio track if present, otherwise let ffmpeg decide.
    args.push('-map', '0:a:0?');
  }

  args.push(
    '-c', 'copy',
    '-f', 'hls',
    '-hls_time', '4',
    '-hls_list_size', '0',
    '-hls_playlist_type', 'event',
    '-hls_flags', 'independent_segments',
    '-hls_segment_type', 'fmp4',
    '-hls_fmp4_init_filename', path.basename(initName),
    '-hls_segment_filename', segmentPattern.replace(/\\/g, '/'),
    manifestPath.replace(/\\/g, '/')
  );

  const proc = spawn(ffmpegInstaller.path, args, {
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  proc.stderr.on('data', (buf) => {
    const line = String(buf || '').trim();
    if (line) logger?.info?.('[TorrentHLS] ffmpeg:', line);
  });

  return {
    proc,
    outDir,
    manifestPath,
    url: `http://${HOST}:${PORT}/${encodeURIComponent(sessionId)}/${encodeURIComponent(variant)}/${manifestName}`,
  };
}

module.exports = {
  ensureServer,
  startRemuxJob,
};

