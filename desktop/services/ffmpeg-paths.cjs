'use strict';

/**
 * Resolve spawnable ffmpeg / ffprobe binary paths in a packaged app.
 *
 * `@ffmpeg-installer/ffmpeg` reports `.path` inside the app bundle, which in a
 * packaged build is `…/resources/app.asar/node_modules/@ffmpeg-installer/…`.
 * A binary inside an asar archive is NOT a real file on disk, so `spawn()` on
 * that path fails with ENOENT (which surfaced as torrent `transcode_error` and
 * the download queue's re-encode failures). electron-builder's `asarUnpack`
 * copies the binary out to the sibling `app.asar.unpacked/…` tree, so the fix
 * is to rewrite the `app.asar` path segment to `app.asar.unpacked` at runtime.
 *
 * In dev the reported path has no `app.asar` segment, so the rewrite is a no-op.
 */

const fs = require('fs');

let ffmpegInstaller = null;
try {
  ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
} catch (_) {
  ffmpegInstaller = null;
}

/**
 * Rewrite an `…/app.asar/…` path to `…/app.asar.unpacked/…` so the target is
 * the real unpacked file. Only rewrites when `app.asar` appears as a genuine
 * path segment (guarded on both slash styles), and only when the unpacked file
 * actually exists — otherwise the original path is returned untouched.
 */
function toUnpackedPath(p) {
  if (typeof p !== 'string' || !p) return p;
  if (!/([\\/])app\.asar([\\/])/.test(p)) return p;
  const unpacked = p.replace(/([\\/])app\.asar([\\/])/, '$1app.asar.unpacked$2');
  try {
    if (fs.existsSync(unpacked)) return unpacked;
  } catch (_) {
    /* fall through to original */
  }
  return p;
}

/** Absolute, spawnable ffmpeg path (or null when the installer is missing). */
const ffmpegPath = ffmpegInstaller && ffmpegInstaller.path
  ? toUnpackedPath(ffmpegInstaller.path)
  : null;

/**
 * ffprobe ships beside ffmpeg in the same platform package (when present).
 * Derive it from the resolved ffmpeg path so it points at the unpacked copy too.
 * `@ffmpeg-installer` does not always include ffprobe, so callers must guard on
 * existence (they already do via `fs.existsSync`).
 */
const ffprobePath = ffmpegPath
  ? ffmpegPath.replace(/ffmpeg(\.exe)?$/i, 'ffprobe$1')
  : null;

module.exports = { ffmpegPath, ffprobePath, toUnpackedPath };
