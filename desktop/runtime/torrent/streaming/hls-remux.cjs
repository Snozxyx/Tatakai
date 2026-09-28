'use strict';

/**
 * On-the-fly HLS remux for torrent-backed playback.
 *
 * Chromium plays MP4/H.264 natively but not Matroska, so an `.mkv` has to be
 * repackaged before the `<video>` element will touch it. ffmpeg writes fMP4 HLS
 * into a temp directory and a small static server hands it to the renderer.
 *
 * Remuxing is attempted in three passes, cheapest first (see `ATTEMPTS`). A
 * straight stream copy is what makes playback start in seconds, but it only
 * works when every mapped stream has a codec the MP4 muxer can carry — DTS,
 * PCM and TrueHD do not, and ffmpeg exits at once with "Could not find tag for
 * codec …". That exit was previously indistinguishable from any other failure
 * and the dead job stayed cached, so the session reported `transcode_error`
 * forever and the player was handed an empty src. Each pass now records why it
 * died, and the caller can fall through to the next one.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
// Resolved to the unpacked binary in a packaged build (app.asar → app.asar.unpacked);
// spawning the asar-internal path fails with ENOENT.
const { ffmpegPath } = require('../../../services/ffmpeg-paths.cjs');

const HOST = '127.0.0.1';
const PORT = 8890;

const ROOT_DIR_NAME = 'tatakai-hls';

/** How much stderr to keep per job — enough for ffmpeg's final error lines. */
const STDERR_TAIL_CHARS = 4000;

/**
 * Remux strategies in ascending order of cost.
 *
 * `copy` is ~50× faster than real time and is what should almost always run.
 * `audio` re-encodes only the soundtrack, which is what an unsupported audio
 * codec in an otherwise fine H.264 release needs. `full` re-encodes both and is
 * the last resort for exotic video (VP9-in-MKV, or 10-bit HEVC on a machine
 * whose player cannot decode it).
 */
const ATTEMPTS = [
  {
    key: 'copy',
    label: 'stream copy',
    codec: ['-c:v', 'copy', '-c:a', 'copy'],
  },
  {
    key: 'audio',
    label: 'audio re-encode',
    codec: ['-c:v', 'copy', '-c:a', 'aac', '-ac', '2', '-b:a', '192k'],
  },
  {
    key: 'full',
    label: 'full re-encode',
    codec: [
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '22',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-ac', '2',
      '-b:a', '192k',
    ],
  },
];

const ATTEMPT_COUNT = ATTEMPTS.length;

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

      const parsed = new URL(req.url || '/', 'http://localhost');
      const decoded = decodeURIComponent(parsed.pathname || '/');
      const rel = decoded.replace(/^\/+/, '');
      const full = path.normalize(path.join(root, rel));
      // `startsWith` on the bare root would also accept a sibling directory
      // whose name merely begins with it, so the separator is part of the test.
      const rootWithSep = path.normalize(root) + path.sep;
      if (!full.startsWith(rootWithSep)) {
        res.statusCode = 403;
        res.end('forbidden');
        return;
      }

      let stat = null;
      try {
        stat = fs.statSync(full);
      } catch {
        stat = null;
      }
      if (!stat || !stat.isFile()) {
        res.statusCode = 404;
        res.end('not_found');
        return;
      }

      const ext = path.extname(full).toLowerCase();
      if (ext === '.m3u8') {
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
        // The playlist grows while ffmpeg runs; a cached copy would freeze
        // playback at whatever segment count the first request happened to see.
        res.setHeader('Cache-Control', 'no-store');
      } else if (ext === '.m4s') res.setHeader('Content-Type', 'video/iso.segment');
      else if (ext === '.mp4') res.setHeader('Content-Type', 'video/mp4');
      else if (ext === '.ts') res.setHeader('Content-Type', 'video/mp2t');
      else res.setHeader('Content-Type', 'application/octet-stream');

      if (req.method === 'HEAD') {
        res.setHeader('Content-Length', String(stat.size));
        res.end();
        return;
      }

      res.setHeader('Content-Length', String(stat.size));
      const stream = fs.createReadStream(full);
      stream.on('error', () => {
        res.destroy();
      });
      stream.pipe(res);
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

/** Best-effort recursive delete, so a retry never inherits a half-written pass. */
function clearDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* the next pass writes into it regardless */
  }
}

/**
 * The lines worth showing a user out of an ffmpeg stderr dump — the muxer's
 * complaint, not the sixty lines of stream metadata that precede it.
 */
function summarizeFfmpegError(stderr) {
  const lines = String(stderr || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const notable = lines.filter((line) =>
    /could not find tag|incompatible|not supported|invalid data|no such|error|failed|unable/i.test(
      line,
    ),
  );

  return (notable.length > 0 ? notable : lines).slice(-3).join(' · ').slice(0, 400);
}

/**
 * Start one remux pass.
 *
 * @param {object} params
 * @param {number} [params.attempt] Index into `ATTEMPTS`; clamped.
 * @returns {{ proc: import('child_process').ChildProcess, outDir: string,
 *   manifestPath: string, url: string, attempt: number, attemptKey: string,
 *   attemptLabel: string, stderr: () => string }}
 */
function startRemuxJob({ app, logger, sessionId, inputUrl, audioTrackIndex, attempt = 0 }) {
  const { root } = ensureServer(app, logger);
  const index = Math.max(0, Math.min(ATTEMPT_COUNT - 1, Number(attempt) || 0));
  const strategy = ATTEMPTS[index];
  const variant = getVariantKey({ audioTrackIndex });

  // The attempt is part of the path so a fallback pass publishes a URL the
  // player has never loaded — reusing one would hand back a manifest hls.js
  // already has cached and errored on.
  const outDir = path.join(root, sessionId, `${variant}-${strategy.key}`);
  clearDir(outDir);
  fs.mkdirSync(outDir, { recursive: true });

  const manifestName = 'index.m3u8';
  const manifestPath = path.join(outDir, manifestName);
  const segmentPattern = path.join(outDir, 'seg-%05d.m4s');
  const initName = path.join(outDir, 'init.mp4');

  const isNetwork = /^https?:\/\//i.test(String(inputUrl || ''));

  const args = [
    '-hide_banner',
    '-loglevel', 'warning',
    '-fflags', '+genpts',
    '-avoid_negative_ts', 'make_non_negative',
    // A torrent still downloading feeds ffmpeg at the swarm's pace, so probing
    // is billed in wall-clock seconds: the old 10 MB probe was over a minute at
    // 145 KB/s and blew the caller's readiness timeout before a single segment
    // existed. Matroska carries every track header up front, so 2 MB is ample.
    '-analyzeduration', '5000000',
    '-probesize', '2500000',
  ];

  if (isNetwork) {
    args.push(
      '-rw_timeout', '60000000',
      '-timeout', '60000000',
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '10',
    );
  }

  args.push(
    '-i', String(inputUrl || '').replace(/\\/g, '/'),
    '-map', '0:v:0',
  );

  if (audioTrackIndex != null && Number.isFinite(Number(audioTrackIndex))) {
    // The renderer passes the *absolute* ffprobe stream index — what `probe()`
    // in media-probe.cjs reports as `index` and what the audio menu stores as
    // `track.id`. Map it by absolute stream index (`0:N`), NOT by the
    // audio-relative selector (`0:a:N`).
    //
    // The two disagree the moment a file has any non-audio stream before its
    // audio, which is every file: in the reported 18-track MKV the first audio
    // is stream 1 (`0:a:0`), so `0:a:1` played the *second* audio and `0:a:4`
    // (a Thai track at absolute index 4, but only audio indices 0..3 exist)
    // referenced nothing — ffmpeg exited, the manifest was never written, and
    // the poll loop timed out. That is the whole "audio not changing" bug.
    args.push('-map', `0:${Number(audioTrackIndex)}?`);
  } else {
    // default: first audio track if present, otherwise let ffmpeg decide.
    args.push('-map', '0:a:0?');
  }

  args.push(
    // Subtitles and attachments are extracted separately and have no place in
    // an fMP4 segment; mapping them in is a guaranteed muxer error.
    '-sn',
    '-dn',
    ...strategy.codec,
    // Interleaving a 4 s video segment against sparse audio can outrun the
    // default 1024-packet queue and abort the mux on long releases.
    '-max_muxing_queue_size', '4096',
    '-f', 'hls',
    // 2 s segments halve the time to first frame versus 4 s; ffmpeg only
    // publishes the playlist once a segment closes.
    '-hls_time', '2',
    '-hls_list_size', '0',
    '-hls_playlist_type', 'event',
    '-hls_flags', 'independent_segments',
    '-hls_segment_type', 'fmp4',
    '-hls_fmp4_init_filename', path.basename(initName),
    '-hls_segment_filename', segmentPattern.replace(/\\/g, '/'),
    manifestPath.replace(/\\/g, '/'),
  );

  const proc = spawn(ffmpegPath, args, {
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  let stderr = '';
  proc.stderr.on('data', (buf) => {
    const line = String(buf || '').trim();
    if (!line) return;
    stderr = `${stderr}${line}\n`.slice(-STDERR_TAIL_CHARS);
    logger?.info?.(`[TorrentHLS] ffmpeg(${strategy.key}):`, line);
  });

  proc.on('error', (err) => {
    stderr = `${stderr}${err?.message || err}\n`.slice(-STDERR_TAIL_CHARS);
    logger?.warn?.('[TorrentHLS] ffmpeg spawn failed:', err?.message || err);
  });

  return {
    proc,
    outDir,
    manifestPath,
    url: `http://${HOST}:${PORT}/${encodeURIComponent(sessionId)}/${encodeURIComponent(`${variant}-${strategy.key}`)}/${manifestName}`,
    attempt: index,
    attemptKey: strategy.key,
    attemptLabel: strategy.label,
    stderr: () => stderr,
  };
}

module.exports = {
  ensureServer,
  startRemuxJob,
  summarizeFfmpegError,
  ATTEMPT_COUNT,
};
