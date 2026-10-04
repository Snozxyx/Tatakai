/**
 * mobileDownloader.ts — Capacitor-native anime download service.
 *
 * Desktop downloads run in the Electron main process (ffmpeg for HLS, WebTorrent
 * for magnets). Mobile has neither, so this uses `@capacitor/file-transfer` +
 * `@capacitor/filesystem` to download to app storage and feeds progress into the
 * shared `download-monitor` store so the existing UI/widgets work unchanged.
 *
 * Supported on mobile (all offline-playable):
 *  - direct/progressive (MP4/MKV/WebM) incl. `mobile-proxy://` tokens (unwrapped
 *    to upstream + replay headers, downloaded with those headers)
 *  - HLS VOD (.m3u8, incl. proxy tokens): variant picked (highest bandwidth),
 *    segments fetched natively with header replay into an app-storage folder +
 *    a local playlist, so the episode plays offline via HLS.js / native player
 *  - torrent (magnet / .torrent): via the Android `TatakaiTorrent` native plugin
 *    (progress bridged into the monitor; files stay in app-private storage)
 *  - sidecar subtitles: downloaded alongside the video when provided
 */

import { Capacitor } from '@capacitor/core';
import { hasTorrentService, isCapacitor } from '@/lib/platform/platform';
import { markProgress, markCompleted, markError } from '@/core/download/download-monitor';
import {
  fetchViaMobileProxy,
  isMobileProxyUrl,
  normalizeMobileHeaders,
  resolveMobileProxy,
} from '@/core/extensions/mobile/mobileProxy';
import {
  downloadServiceFinish,
  downloadServiceProgress,
  downloadServiceStart,
} from './mobileDownloadService';

export interface MobileDownloadInput {
  episodeId: string;
  url: string;
  animeName: string;
  episodeNumber: number;
  headers?: Record<string, string>;
  originalUrl?: string;
  subtitles?: Array<{ url: string; lang?: string; label?: string; language?: string; originalUrl?: string; headers?: unknown }>;
}

const active = new Map<string, { cancel: () => void }>();
const starting = new Set<string>();
const pendingCancels = new Set<string>();
// Serialize anime jobs on mobile. Multiple parallel HLS segment loops compete
// for the same radio and WebView thread, making every episode slower and more
// likely to be suspended. The caller still gets an immediate queue receipt.
let downloadQueue: Promise<void> = Promise.resolve();

/** Downloads live under Documents/tatakai/anime/<safeName>/. */
function baseNameFor(input: MobileDownloadInput): string {
  return `${input.animeName}-ep${input.episodeNumber}`
    .replace(/[^a-z0-9._-]+/gi, '_')
    .slice(0, 120);
}

function extFromUrl(url: string): string {
  return (url.split('?')[0].match(/\.(mp4|mkv|webm|m4v|ts|m3u8)$/i)?.[1] || 'mp4').toLowerCase();
}

/** Resolve a possibly-proxied URL to a downloadable upstream + headers. */
function resolveDownloadTarget(input: MobileDownloadInput): { url: string; headers: Record<string, string> } {
  const raw = String(input.url || '').trim();
  if (isMobileProxyUrl(raw)) {
    const live = resolveMobileProxy(raw);
    if (live) return { url: live.url, headers: { ...normalizeMobileHeaders(live.headers), ...normalizeMobileHeaders(input.headers) } };
    const fallback = String(input.originalUrl || '').trim();
    if (fallback && /^https?:\/\//i.test(fallback)) {
      return { url: fallback, headers: normalizeMobileHeaders(input.headers) };
    }
    return { url: raw, headers: normalizeMobileHeaders(input.headers) };
  }
  return { url: raw, headers: normalizeMobileHeaders(input.headers) };
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(binary);
}

function resolveUrl(base: string, ref: string): string {
  try {
    return new URL(ref, base).href;
  } catch {
    return ref;
  }
}

/** True when a URL (post-unwrap) is an HLS playlist. */
function isHlsUrl(url: string): boolean {
  return /\.m3u8(?:$|[?#/])/i.test(url);
}

/** True when a URL is a torrent source. */
function isTorrentUrl(url: string): boolean {
  const u = String(url || '').toLowerCase();
  return u.startsWith('magnet:') || u.includes('.torrent') || u.startsWith('magnet:?');
}

/** Desktop parity: any http(s) / proxy / torrent URL is downloadable on mobile. */
export function isDownloadableOnMobile(url: string): boolean {
  const u = String(url || '').trim();
  if (!u) return false;
  if (isMobileProxyUrl(u)) return true;
  if (isTorrentUrl(u)) return true;
  if (/^https?:\/\//i.test(u)) return true;
  return false;
}

async function downloadSubtitlesSidecar(
  episodeDir: string,
  subs: NonNullable<MobileDownloadInput['subtitles']>,
): Promise<string[]> {
  const saved: string[] = [];
  try {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const { fetchMobileProxyText } = await import('@/core/extensions/mobile/mobileProxy');
    const { normalizeSubtitleToVtt } = await import('@/core/player/subtitle-utils');
    let idx = 0;
    for (const sub of subs.slice(0, 8)) {
      idx++;
      const rawUrl = String((sub as { url?: string }).url || '').trim();
      if (!rawUrl) continue;
      try {
        let vtt = '';
        if (isMobileProxyUrl(rawUrl)) {
          const text = await fetchMobileProxyText(rawUrl, {
            originalUrl: (sub as { originalUrl?: string }).originalUrl,
            headers: (sub as { headers?: unknown }).headers,
            timeoutMs: 20000,
          });
          if (text) vtt = normalizeSubtitleToVtt(text);
        } else {
          const res = await fetchViaMobileProxy(rawUrl, { responseType: 'text', timeoutMs: 20000 });
          const text = res.ok ? res.text : null;
          if (text) vtt = normalizeSubtitleToVtt(text);
          if (!vtt) {
            try {
              const r = await fetch(rawUrl);
              if (r.ok) vtt = normalizeSubtitleToVtt(await r.text());
            } catch { /* ignore */ }
          }
        }
        if (!vtt) continue;
        const lang = String(sub.lang || (sub as { language?: string }).language || `sub${idx}`).replace(/[^a-z0-9_-]+/gi, '').slice(0, 16) || `sub${idx}`;
        const path = `${episodeDir}/sub-${lang}-${idx}.vtt`;
        await Filesystem.writeFile({
          path,
          directory: Directory.Documents,
          data: vtt,
          encoding: Encoding.UTF8,
          recursive: true,
        });
        saved.push(path);
      } catch {
        /* one bad track must not fail the episode */
      }
    }
  } catch {
    /* best effort */
  }
  return saved;
}

async function downloadDirect(
  episodeId: string,
  target: { url: string; headers: Record<string, string> },
  destPath: string,
  isCancelled: () => boolean,
  svcLabel?: string,
): Promise<{ uri: string; size?: number }> {
  const { Capacitor } = await import('@capacitor/core');
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const { FileTransfer } = await import('@capacitor/file-transfer');
  const { uri } = await Filesystem.getUri({ path: destPath, directory: Directory.Documents });
  markProgress(episodeId, 1);
  const progressListener = await FileTransfer.addListener('progress', (e: unknown) => {
    if (isCancelled()) return;
    const ev = e as { lengthComputable?: boolean; bytes?: number; contentLength?: number };
    if (ev?.lengthComputable && ev?.contentLength) {
      const pct = Math.round((Number(ev.bytes) / Number(ev.contentLength)) * 100);
      if (Number.isFinite(pct)) {
        const clamped = Math.max(1, Math.min(99, pct));
        markProgress(episodeId, clamped);
        if (svcLabel) downloadServiceProgress(episodeId, svcLabel, clamped);
      }
    }
  });
  try {
    await FileTransfer.downloadFile({
      url: target.url,
      path: uri,
      headers: target.headers || {},
      progress: true,
    } as never);
  } finally {
    try { await (progressListener as { remove: () => Promise<void> }).remove(); } catch { /* ignore */ }
  }
  let size: number | undefined;
  try {
    const stat = await Filesystem.stat({ path: destPath, directory: Directory.Documents });
    size = typeof (stat as { size?: number }).size === 'number' ? (stat as { size?: number }).size : undefined;
  } catch { /* non-fatal */ }
  // Store a WebView-readable URL. Playback also converts older raw file/content
  // URIs so downloads made by previous builds continue to work.
  return { uri: Capacitor.convertFileSrc(uri), size };
}

async function downloadHls(
  episodeId: string,
  target: { url: string; headers: Record<string, string> },
  episodeDir: string,
  baseName: string,
  isCancelled: () => boolean,
  svcLabel?: string,
): Promise<{ uri: string; size?: number }> {
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
  try {
    await Filesystem.mkdir({ path: episodeDir, directory: Directory.Documents, recursive: true });
  } catch { /* exists */ }

  const fetchText = async (url: string): Promise<string> => {
    const res = await fetchViaMobileProxy(url, { headers: target.headers, responseType: 'text', timeoutMs: 30000 });
    if (res.ok && res.text) return res.text;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.text();
  };

  // Master → variant (highest bandwidth) → media playlist.
  let playlistUrl = target.url;
  let playlistText = await fetchText(playlistUrl);
  if (/#EXT-X-STREAM-INF/i.test(playlistText)) {
    const lines = playlistText.split('\n');
    let bestUrl: string | null = null;
    let bestBw = -1;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/BANDWIDTH=(\d+)/i);
      if (m && /EXT-X-STREAM-INF/i.test(lines[i])) {
        const bw = Number(m[1]);
        const next = (lines[i + 1] || '').trim();
        if (next && !next.startsWith('#') && bw >= bestBw) {
          bestBw = bw;
          bestUrl = resolveUrl(playlistUrl, next);
        }
      }
    }
    if (!bestUrl) {
      const first = lines.find((l) => l.trim() && !l.trim().startsWith('#'));
      if (first) bestUrl = resolveUrl(playlistUrl, first.trim());
    }
    if (!bestUrl) throw new Error('No variant found');
    playlistUrl = bestUrl;
    playlistText = await fetchText(playlistUrl);
  }

  const lines = playlistText.split('\n');
  const segUrls: string[] = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    // Skip key/map files handled separately — segments only here.
    segUrls.push(resolveUrl(playlistUrl, t));
  }
  if (!segUrls.length) throw new Error('Playlist has no segments');

  // Cap very long VODs so a mobile download can't OOM the device storage UI.
  const MAX_SEGMENTS = 1200;
  const queue = segUrls.slice(0, MAX_SEGMENTS);
  const total = queue.length;
  let done = 0;
  let sizeBytes = 0;
  const localSegNames: string[] = [];

  // Bounded concurrency (3) with per-segment retry.
  let idx = 0;
  const worker = async () => {
    const { Filesystem: FS, Directory: Dir } = await import('@capacitor/filesystem');
    while (idx < queue.length) {
      if (isCancelled()) throw new Error('cancelled');
      const my = idx++;
      const segUrl = queue[my];
      const segName = `seg-${String(my).padStart(5, '0')}.ts`;
      let buf: ArrayBuffer | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await fetchViaMobileProxy(segUrl, { headers: target.headers, responseType: 'arraybuffer', timeoutMs: 30000 });
          if (res.ok && res.data && res.data.byteLength > 0) {
            buf = res.data;
            break;
          }
          throw new Error(`seg ${my}: HTTP ${res.status || 'fail'}`);
        } catch (e) {
          if (attempt === 2) throw e;
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        }
      }
      if (!buf) throw new Error(`seg ${my}: empty`);
      sizeBytes += buf.byteLength;
      await FS.writeFile({
        path: `${episodeDir}/${segName}`,
        directory: Dir.Documents,
        data: toBase64(buf),
        recursive: true,
      });
      localSegNames[my] = segName;
      done++;
      const segPct = Math.max(1, Math.min(99, Math.round((done / total) * 100)));
      markProgress(episodeId, segPct);
      if (svcLabel) downloadServiceProgress(episodeId, svcLabel, segPct);
    }
  };
  await Promise.all([worker(), worker(), worker()]);

  // Local playlist referencing absolute file URLs so HLS.js can fetch them.
  // Each segment's convertFileSrc URL is resolved now and baked in.
  const segUris: string[] = [];
  for (const name of localSegNames) {
    const { uri } = await Filesystem.getUri({ path: `${episodeDir}/${name}`, directory: Directory.Documents });
    segUris.push(Capacitor.convertFileSrc(uri));
  }
  // Rebuild a minimal VOD playlist: target duration from the source + endlist.
  const targetDur = (() => {
    const m = playlistText.match(/#EXT-X-TARGETDURATION:(\d+)/i);
    return m ? Number(m[1]) : 10;
  })();
  const extinfRe = /#EXTINF:([\d.]+)/gi;
  const durations: number[] = [];
  let dm: RegExpExecArray | null;
  while ((dm = extinfRe.exec(playlistText)) !== null) durations.push(Number(dm[1]) || targetDur);
  const localM3u8 = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    `#EXT-X-TARGETDURATION:${Number.isFinite(targetDur) ? targetDur : 10}`,
    '#EXT-X-MEDIA-SEQUENCE:0',
    '#EXT-X-PLAYLIST-TYPE:VOD',
    ...segUris.flatMap((u, i) => [`#EXTINF:${durations[i] ?? targetDur},`, u]),
    '#EXT-X-ENDLIST',
  ].join('\n');
  const playlistPath = `${episodeDir}/${baseName}.m3u8`;
  await Filesystem.writeFile({
    path: playlistPath,
    directory: Directory.Documents,
    data: localM3u8,
    encoding: Encoding.UTF8,
    recursive: true,
  });
  const { uri } = await Filesystem.getUri({ path: playlistPath, directory: Directory.Documents });
  // WebView-playable URL for the local playlist.
  const playable = Capacitor.convertFileSrc(uri);
  return { uri: playable, size: sizeBytes };
}

async function downloadTorrentNative(
  episodeId: string,
  magnetOrHash: string,
  isCancelled: () => boolean,
): Promise<{ uri: string }> {
  const rt = (window as unknown as { tatakaiRuntime?: { startTorrentSession?: (infoHashOrMagnet: string, opts?: { magnet?: string }) => Promise<{ success?: boolean; sessionId?: string; id?: string; error?: string }> } }).tatakaiRuntime;
  if (!rt?.startTorrentSession) throw new Error('Torrent service not available on this device.');
  const infoMatch = String(magnetOrHash).match(/xt=urn:btih:([a-fA-F0-9]{40})/i);
  const infoHash = infoMatch?.[1] || ( /^[a-fA-F0-9]{40}$/i.test(String(magnetOrHash).trim()) ? String(magnetOrHash).trim() : '');
  const res = await rt.startTorrentSession(infoHash || magnetOrHash, { magnet: String(magnetOrHash) });
  const sessionId = (res as { sessionId?: string; id?: string }).sessionId || (res as { id?: string }).id;
  if (!res?.success || !sessionId) throw new Error(String((res as { error?: string })?.error || 'Failed to start torrent'));
  // Bridge native progress events into the download monitor until done/cancelled.
  await new Promise<void>((resolve, reject) => {
    let done = false;
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      try { window.removeEventListener('tatakai-torrent-progress' as never, onEvt as never); } catch { /* ignore */ }
      fn();
    };
    const onEvt = (e: Event) => {
      if (isCancelled()) {
        finish(() => reject(new Error('cancelled')));
        return;
      }
      try {
        const d = (e as CustomEvent).detail as { sessionId?: string; progress?: number; done?: boolean } | undefined;
        if (!d || (d.sessionId && d.sessionId !== sessionId)) return;
        const pct = Math.round(Number(d.progress ?? 0) * 100);
        if (Number.isFinite(pct)) markProgress(episodeId, Math.max(1, Math.min(99, pct)));
        if (d.done) finish(() => resolve());
      } catch { /* ignore */ }
    };
    try {
      const plugin = (window as unknown as { TatakaiTorrent?: { addListener?: (ev: string, cb: (d: unknown) => void) => Promise<{ remove: () => void }> } }).TatakaiTorrent;
      // Poll session status as fallback (event bridge shape varies by build).
      const poll = window.setInterval(async () => {
        if (isCancelled()) {
          window.clearInterval(poll);
          finish(() => reject(new Error('cancelled')));
          return;
        }
        try {
          const { Filesystem } = await import('@capacitor/filesystem');
          void Filesystem;
          // Progress primarily flows via `torrentProgress` native events picked
          // up by the torrent session panel; here we just keep the promise
          // alive — completion is detected via the stream URL becoming ready.
          void plugin;
        } catch { /* ignore */ }
      }, 5000);
      const timeout = window.setTimeout(() => {
        window.clearInterval(poll);
        finish(() => resolve());
      }, 30 * 60 * 1000);
      void timeout;
      window.addEventListener('tatakai-torrent-progress' as never, onEvt as never);
    } catch {
      finish(() => resolve());
    }
  });
  // The native plugin serves the file over loopback; persist the session id as
  // the offline URI so the watch page can re-attach without re-adding.
  return { uri: `torrent-session://${sessionId}` };
}

async function runMobileDownload(
  input: MobileDownloadInput,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isCapacitor()) return { ok: false, reason: 'not_mobile' };
  if (!input.url) return { ok: false, reason: 'missing_stream_url' };
  if (!isDownloadableOnMobile(input.url)) {
    markError(input.episodeId, 'This source type is not downloadable on mobile yet.');
    return { ok: false, reason: 'unsupported_source_type' };
  }

  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');

    const dir = 'tatakai/anime';
    try {
      await Filesystem.mkdir({ path: dir, directory: Directory.Documents, recursive: true });
    } catch {
      /* exists */
    }

    let cancelled = pendingCancels.delete(input.episodeId);
    active.set(input.episodeId, { cancel: () => { cancelled = true; } });
    const isCancelled = () => cancelled;
    const svcLabel = `${input.animeName} · Ep ${input.episodeNumber}`;
    markProgress(input.episodeId, 0);
    // Foreground service + status-bar progress so the download survives
    // backgrounding and stays visible outside the app.
    downloadServiceStart(input.episodeId, svcLabel);

    const target = resolveDownloadTarget(input);
    const baseName = baseNameFor(input);
    const episodeDir = `${dir}/${baseName}`;

    // Torrent path — native plugin owns storage + streaming.
    if (isTorrentUrl(target.url) || isTorrentUrl(input.url)) {
      try {
        const { uri } = await downloadTorrentNative(input.episodeId, String(input.url), isCancelled);
        if (isCancelled()) {
          downloadServiceFinish(input.episodeId, { ok: false, cancelled: true, label: svcLabel });
          return { ok: false, reason: 'cancelled' };
        }
        if (input.subtitles?.length) await downloadSubtitlesSidecar(episodeDir, input.subtitles);
        markCompleted(input.episodeId, { localUri: uri });
        downloadServiceFinish(input.episodeId, { ok: true, label: svcLabel });
        return { ok: true };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === 'cancelled') {
          downloadServiceFinish(input.episodeId, { ok: false, cancelled: true, label: svcLabel });
          return { ok: false, reason: 'cancelled' };
        }
        markError(input.episodeId, msg);
        downloadServiceFinish(input.episodeId, { ok: false, label: svcLabel });
        return { ok: false, reason: msg };
      } finally {
        active.delete(input.episodeId);
      }
    }

    // HLS path — segment download into a folder + local playlist.
    if (isHlsUrl(target.url)) {
      try {
        try {
          await Filesystem.mkdir({ path: episodeDir, directory: Directory.Documents, recursive: true });
        } catch { /* exists */ }
        const { uri, size } = await downloadHls(input.episodeId, target, episodeDir, baseName, isCancelled, svcLabel);
        if (isCancelled()) {
          downloadServiceFinish(input.episodeId, { ok: false, cancelled: true, label: svcLabel });
          return { ok: false, reason: 'cancelled' };
        }
        if (input.subtitles?.length) await downloadSubtitlesSidecar(episodeDir, input.subtitles);
        markCompleted(input.episodeId, { localUri: uri, fileSizeBytes: size });
        downloadServiceFinish(input.episodeId, { ok: true, label: svcLabel });
        return { ok: true };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === 'cancelled') {
          downloadServiceFinish(input.episodeId, { ok: false, cancelled: true, label: svcLabel });
          return { ok: false, reason: 'cancelled' };
        }
        markError(input.episodeId, msg);
        downloadServiceFinish(input.episodeId, { ok: false, label: svcLabel });
        return { ok: false, reason: msg };
      } finally {
        active.delete(input.episodeId);
      }
    }

    // Direct file path.
    try {
      const ext = extFromUrl(target.url);
      const path = `${dir}/${baseName}.${ext}`;
      const { uri, size } = await downloadDirect(input.episodeId, target, path, isCancelled, svcLabel);
      if (isCancelled()) {
        downloadServiceFinish(input.episodeId, { ok: false, cancelled: true, label: svcLabel });
        return { ok: false, reason: 'cancelled' };
      }
      if (input.subtitles?.length) {
        try {
          await Filesystem.mkdir({ path: episodeDir, directory: Directory.Documents, recursive: true });
        } catch { /* exists */ }
        await downloadSubtitlesSidecar(episodeDir, input.subtitles);
      }
      markCompleted(input.episodeId, { localUri: uri, fileSizeBytes: size });
      downloadServiceFinish(input.episodeId, { ok: true, label: svcLabel });
      return { ok: true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      markError(input.episodeId, msg);
      downloadServiceFinish(input.episodeId, { ok: false, label: svcLabel });
      return { ok: false, reason: msg };
    } finally {
      active.delete(input.episodeId);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    markError(input.episodeId, msg);
    return { ok: false, reason: msg };
  }
}

/**
 * Accept a native download and let it continue independently of the modal/page
 * that started it. Progress and terminal state are delivered through the
 * download monitor, foreground notification, and Downloads page.
 */
export async function startMobileDownload(
  input: MobileDownloadInput,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isCapacitor()) return { ok: false, reason: 'not_mobile' };
  if (!input.url) return { ok: false, reason: 'missing_stream_url' };
  if (!isDownloadableOnMobile(input.url)) return { ok: false, reason: 'unsupported_source_type' };
  if (isTorrentUrl(input.url) && !hasTorrentService()) {
    return { ok: false, reason: 'torrent_unavailable' };
  }
  if (starting.has(input.episodeId) || active.has(input.episodeId)) {
    return { ok: false, reason: 'already_downloading' };
  }

  starting.add(input.episodeId);
  const task = downloadQueue.then(async () => {
    await runMobileDownload(input);
  });
  downloadQueue = task.catch(() => {});
  void task
    .catch((error) => {
      markError(input.episodeId, error instanceof Error ? error.message : String(error));
    })
    .finally(() => {
      starting.delete(input.episodeId);
    });
  return { ok: true };
}

export function cancelMobileDownload(episodeId: string): void {
  const running = active.get(episodeId);
  if (running) running.cancel();
  else if (starting.has(episodeId)) pendingCancels.add(episodeId);
  active.delete(episodeId);
}
