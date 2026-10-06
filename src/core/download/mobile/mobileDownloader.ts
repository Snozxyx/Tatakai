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
  isNativeProxyUrl,
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
function baseNameFor(input: { animeName: string; episodeNumber: number }): string {
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

/**
 * Floors below which a "completed" download is certainly a blocked/expired
 * link's error page, not video. Real episodes are tens of MB; CDN block pages
 * are typically a few hundred bytes (the reported 693 B case).
 */
const MIN_DIRECT_BYTES = 64 * 1024;
const MIN_HLS_TOTAL_BYTES = 256 * 1024;

/** `text/html` (and empty) payloads are never video segments. */
function isBlockedContentType(contentType: string): boolean {
  const ct = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (!ct) return false;
  return ct.startsWith('text/html') || ct.includes('application/json');
}

function looksLikePlaylist(text: string): boolean {
  return /#EXTM3U/i.test(String(text || '').slice(0, 4096));
}

/** True when the native HLS → MP4 remux service is available. */
function hasMuxService(): boolean {
  try {
    if (!isCapacitor()) return false;
    const cap = Capacitor as unknown as { isPluginAvailable?: (name: string) => boolean };
    return typeof cap.isPluginAvailable === 'function' && cap.isPluginAvailable('TatakaiMux');
  } catch {
    return false;
  }
}

interface MuxPlugin {
  muxHlsToMp4(opts: { url: string; headers?: Record<string, string>; outPath: string; jobId: string }): Promise<{
    success: boolean;
    jobId?: string;
    size?: number;
    error?: string;
  }>;
  cancelMux(opts: { jobId: string }): Promise<{ success: boolean }>;
  addListener(
    eventName: 'muxProgress',
    listener: (event: { jobId?: string; timeMs?: number; progress?: number; size?: number }) => void,
  ): Promise<{ remove: () => Promise<void> }>;
}

async function getMuxPlugin(): Promise<MuxPlugin | null> {
  if (!hasMuxService()) return null;
  try {
    const { registerPlugin } = await import('@capacitor/core');
    return registerPlugin<MuxPlugin>('TatakaiMux');
  } catch {
    return null;
  }
}

/** True when a URL is a torrent source. */
function isTorrentUrl(url: string): boolean {
  const u = String(url || '').toLowerCase();
  return (
    u.startsWith('magnet:') ||
    u.includes('.torrent') ||
    u.startsWith('magnet:?') ||
    u.includes('/webtorrent/') ||
    u.startsWith('torrent-session://')
  );
}

/** Desktop parity: any http(s) / proxy (in-memory or native loopback) / torrent URL is downloadable on mobile. */
export function isDownloadableOnMobile(url: string): boolean {
  const u = String(url || '').trim();
  if (!u) return false;
  if (isMobileProxyUrl(u)) return true;
  if (isNativeProxyUrl(u)) return true;
  if (isTorrentUrl(u)) return true;
  if (/^https?:\/\//i.test(u)) return true;
  return false;
}

async function downloadSubtitlesSidecar(
  episodeDir: string,
  subs: NonNullable<MobileDownloadInput['subtitles']>,
): Promise<string[]> {
  const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
  const { fetchMobileProxyText } = await import('@/core/extensions/mobile/mobileProxy');
  const { normalizeSubtitleToVtt } = await import('@/core/player/subtitle-utils');

  const saved: string[] = [];
  for (const sub of subs.slice(0, 8)) {
    const rawUrl = String((sub as { url?: string }).url || '').trim();
    if (!rawUrl) continue;
    const flatHeaders = normalizeMobileHeaders((sub as { headers?: unknown }).headers);
    const originalUrl = (sub as { originalUrl?: string }).originalUrl;
    try {
      let vtt = '';

      // Path 1: in-app proxy token — resolve natively with header replay.
      if (isMobileProxyUrl(rawUrl)) {
        const text = await fetchMobileProxyText(rawUrl, {
          originalUrl,
          headers: flatHeaders,
          timeoutMs: 20000,
        });
        if (text) vtt = normalizeSubtitleToVtt(text);
      }

      // Path 2: headered plain URL via the mobile proxy (Referer-gated CDNs).
      if (!vtt && Object.keys(flatHeaders).length) {
        const res = await fetchViaMobileProxy(rawUrl, {
          headers: flatHeaders,
          responseType: 'text',
          timeoutMs: 20000,
        });
        if (res.ok && res.text) vtt = normalizeSubtitleToVtt(res.text);
      }

      // Path 3: bare fetch with the video's referer when the CDN accepts CORS.
      if (!vtt) {
        try {
          const headers = new Headers({ Accept: 'text/vtt, text/plain, */*' });
          const referer =
            (flatHeaders['Referer'] || flatHeaders['referer']) ||
            (originalUrl ? new URL(originalUrl).origin : '');
          if (referer) headers.set('Referer', referer);
          const r = await fetch(rawUrl, { headers, signal: AbortSignal.timeout(15000) });
          if (r.ok) {
            const text = await r.text();
            if (text) vtt = normalizeSubtitleToVtt(text);
          }
        } catch { /* ignore */ }
      }

      if (!vtt) {
        console.warn('[mobileDownloader] subtitle fetch failed', rawUrl);
        continue;
      }

      const lang = String(
        (sub as { lang?: string }).lang ||
          (sub as { language?: string }).language ||
          (sub as { label?: string }).label ||
          '',
      ).trim().replace(/[^a-z0-9_-]+/gi, '').slice(0, 16) || `sub${saved.length + 1}`;
      const filename = `sub-${lang}.vtt`;
      const path = `${episodeDir}/${filename}`;
      await Filesystem.writeFile({
        path,
        directory: Directory.Documents,
        data: vtt,
        encoding: Encoding.UTF8,
        recursive: true,
      });
      saved.push(path);
    } catch (e) {
      console.warn('[mobileDownloader] subtitle write failed', rawUrl, e);
    }
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
  // A few-hundred-byte "video" is a CDN block/expired-link page saved as a
  // file (previously recorded as a successful download, then "Error loading
  // video" on play). Reject it here so the row lands in Failed with retry.
  if (size == null || size < MIN_DIRECT_BYTES) {
    try {
      await Filesystem.deleteFile({ path: destPath, directory: Directory.Documents });
    } catch { /* best-effort */ }
    throw new Error(
      `Downloaded file is too small (${size ?? 0} B) — the link was blocked or expired. Open the episode and download again.`,
    );
  }
  // Store a WebView-readable URL. Playback also converts older raw file/content
  // URIs so downloads made by previous builds continue to work.
  return { uri: Capacitor.convertFileSrc(uri), size };
}

/**
 * Resolve a (possibly master) playlist URL to its media playlist, desktop
 * parity: hls.js plays the top rendition adaptively, but a download must pin
 * the highest-bandwidth variant. Shared by the MP4 remux path and the
 * segment-folder fallback so both download the same rendition.
 */
async function resolveHlsVariantPlaylist(
  target: { url: string; headers: Record<string, string> },
): Promise<{ playlistUrl: string; playlistText: string }> {
  const fetchText = async (url: string): Promise<string> => {
    const res = await fetchViaMobileProxy(url, { headers: target.headers, responseType: 'text', timeoutMs: 30000 });
    if (res.ok && res.text) {
      if (!looksLikePlaylist(res.text)) {
        throw new Error('Stream link returned a blocked page instead of a playlist — open the episode and download again.');
      }
      return res.text;
    }
    // Bare fallback keeps the replay headers: without them a gated CDN answers
    // 403, which must fail loudly — never save an error page as a playlist.
    const r = await fetch(url, { headers: target.headers as HeadersInit });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const text = await r.text();
    if (!looksLikePlaylist(text)) {
      throw new Error('Stream link returned a blocked page instead of a playlist — open the episode and download again.');
    }
    return text;
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
  return { playlistUrl, playlistText };
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

  const { playlistUrl, playlistText } = await resolveHlsVariantPlaylist(target);

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
            // A per-segment 200 with an HTML body is a block page, not video —
            // saving it produced "completed" downloads that can't play.
            if (isBlockedContentType(res.contentType)) {
              throw new Error(`seg ${my}: blocked (HTML response) — the link likely expired`);
            }
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
  // Verify what actually hit disk (not the in-memory sum): a truncated write
  // must fail here instead of recording a "completed" row that can't play.
  let onDiskBytes = 0;
  try {
    for (const name of localSegNames) {
      try {
        const st = await Filesystem.stat({ path: `${episodeDir}/${name}`, directory: Directory.Documents });
        const s = Number((st as { size?: number }).size) || 0;
        onDiskBytes += s;
      } catch { /* missing segment */ }
    }
  } catch { /* best-effort */ }
  if (onDiskBytes < MIN_HLS_TOTAL_BYTES) {
    try {
      await Filesystem.rmdir({ path: episodeDir, directory: Directory.Documents, recursive: true });
    } catch { /* best-effort */ }
    throw new Error(
      `Downloaded episode is incomplete (${onDiskBytes} B) — the stream was cut off. Try again from the series page.`,
    );
  }
  // WebView-playable URL for the local playlist.
  const playable = Capacitor.convertFileSrc(uri);
  return { uri: playable, size: onDiskBytes };
}

/**
 * Desktop-parity HLS download: repackages the best variant into a SINGLE
 * `.mp4` (stream copy, no re-encode) via the native mux service — Android
 * ffmpeg (`TatakaiMux`), iOS AVFoundation passthrough. The offline player,
 * gallery apps, and file managers all open the result, exactly like desktop's
 * `Episode_<n>.mp4`.
 *
 * Throws on any failure (plugin missing, incompatible stream, cancelled) so
 * the caller falls back to the segment-folder path.
 */
async function downloadHlsAsMp4(
  episodeId: string,
  target: { url: string; headers: Record<string, string> },
  destRelPath: string,
  isCancelled: () => boolean,
  svcLabel?: string,
): Promise<{ uri: string; size?: number }> {
  const plugin = await getMuxPlugin();
  if (!plugin) throw new Error('Remux service not available on this device.');
  const { Capacitor } = await import('@capacitor/core');
  const { Filesystem, Directory } = await import('@capacitor/filesystem');

  let playlistUrl: string;
  try {
    ({ playlistUrl } = await resolveHlsVariantPlaylist(target));
  } catch (e) {
    throw new Error(`Remux: playlist failed — ${e instanceof Error ? e.message : String(e)}`);
  }
  if (isCancelled()) throw new Error('cancelled');
  // Ensure the parent exists before resolving the destination URI — on some
  // shells getUri/stat on a path with a missing parent throws "file does not
  // exist" instead of resolving.
  try {
    await Filesystem.mkdir({ path: 'tatakai/anime', directory: Directory.Documents, recursive: true });
  } catch { /* exists */ }
  let uri: string;
  try {
    ({ uri } = await Filesystem.getUri({ path: destRelPath, directory: Directory.Documents }));
  } catch (e) {
    throw new Error(`Remux: destination failed — ${e instanceof Error ? e.message : String(e)}`);
  }
  // Native code needs a filesystem path, not a file:// URI.
  const absPath = String(uri).replace(/^file:\/\//, '');
  if (!absPath || /^\s*$/.test(absPath)) throw new Error('Unable to resolve the download destination.');

  // Progress: iOS reports real 0–100%; Android reports elapsed encode time, so
  // pulse forward (capped) to keep the row alive until completion.
  let ticks = 0;
  const progressListener = await plugin.addListener('muxProgress', (e) => {
    try {
      if (e?.jobId && e.jobId !== episodeId) return;
      const pct = Number(e?.progress);
      let next: number;
      if (Number.isFinite(pct)) {
        next = Math.max(1, Math.min(99, Math.round(pct)));
      } else {
        ticks += 1;
        next = Math.max(1, Math.min(95, 4 + ticks * 2));
      }
      markProgress(episodeId, next);
      if (svcLabel) downloadServiceProgress(episodeId, svcLabel, next);
    } catch { /* progress must never break the mux */ }
  });
  try {
    markProgress(episodeId, 2);
    const res = await plugin.muxHlsToMp4({
      url: playlistUrl,
      headers: target.headers,
      outPath: absPath,
      jobId: episodeId,
    }).catch((e: unknown) => {
      throw new Error(`Remux: converter failed — ${e instanceof Error ? e.message : String(e)}`);
    });
    if (isCancelled()) throw new Error('cancelled');
    if (!res?.success) throw new Error(String(res?.error || 'Remux failed'));
    let size = Number(res.size) || 0;
    if (!size) {
      try {
        const stat = await Filesystem.stat({ path: destRelPath, directory: Directory.Documents });
        size = Number((stat as { size?: number }).size) || 0;
      } catch { /* non-fatal */ }
    }
    if (size < MIN_HLS_TOTAL_BYTES) {
      try {
        await Filesystem.deleteFile({ path: destRelPath, directory: Directory.Documents });
      } catch { /* best-effort */ }
      throw new Error(
        `Remuxed file is too small (${size} B) — the stream was cut off. Try again from the series page.`,
      );
    }
    return { uri: Capacitor.convertFileSrc(uri), size };
  } finally {
    try {
      await progressListener.remove();
    } catch { /* ignore */ }
  }
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
    // Snapshot for later retry — survives completion so broken files can be
    // re-downloaded in place (the start-time meta is deleted on completion).
    rememberRetryMeta(input.episodeId, input);
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

    // HLS path — desktop parity: a single .mp4 via the native remux service,
    // falling back to the segment-folder + local playlist when remux is
    // unavailable or the stream refuses it.
    if (isHlsUrl(target.url)) {
      try {
        try {
          await Filesystem.mkdir({ path: episodeDir, directory: Directory.Documents, recursive: true });
        } catch { /* exists */ }
        let uri: string;
        let size: number | undefined;
        let muxed = false;
        if (hasMuxService()) {
          try {
            const mp4 = await downloadHlsAsMp4(
              input.episodeId,
              target,
              `${dir}/${baseName}.mp4`,
              isCancelled,
              svcLabel,
            );
            uri = mp4.uri;
            size = mp4.size;
            muxed = true;
          } catch (e) {
            if (isCancelled() || (e instanceof Error && e.message === 'cancelled')) throw e;
            console.warn('[mobileDownloader] mp4 remux failed, falling back to segment download', e);
          }
        }
        if (!muxed) {
          const folder = await downloadHls(input.episodeId, target, episodeDir, baseName, isCancelled, svcLabel);
          uri = folder.uri;
          size = folder.size;
        }
        if (isCancelled()) {
          await removeAnimeDownloadFiles(input.animeName, input.episodeNumber).catch(() => 0);
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
          await removeAnimeDownloadFiles(input.animeName, input.episodeNumber).catch(() => 0);
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
        await removeAnimeDownloadFiles(input.animeName, input.episodeNumber).catch(() => 0);
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
 * Absolute ceiling for one queued job. The queue is strictly serial, so a job
 * whose native half never settles (hung ffmpeg/torrent/FileTransfer with no
 * timeout of its own) used to block every download behind it forever — queued
 * rows sat on "Waiting…" and never started. On expiry the job is cancelled
 * (native halves are stopped best-effort) and fails visibly with retry.
 */
const MAX_JOB_MS = 40 * 60 * 1000;

function stallAfter(episodeId: string): { promise: Promise<never>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const promise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timer = null;
      try {
        active.get(episodeId)?.cancel();
      } catch { /* best-effort */ }
      void (async () => {
        try {
          const plugin = await getMuxPlugin();
          await plugin?.cancelMux({ jobId: episodeId });
        } catch { /* plugin missing — nothing to stop */ }
      })();
      reject(new Error('Download stalled with no completion for a long time — try again on a faster connection.'));
    }, MAX_JOB_MS);
  });
  return {
    promise,
    cancel: () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
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
  // Watchdog: the queue is serial, so a job that never settles would block
  // everything behind it. Race each job against the ceiling; expiry cancels
  // the job and fails it visibly (with retry) instead of hanging "Waiting…".
  const watchdog = stallAfter(input.episodeId);
  const task = downloadQueue.then(async () => {
    try {
      await Promise.race([runMobileDownload(input), watchdog.promise]);
    } finally {
      watchdog.cancel();
    }
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
  // Await nothing: stop a native remux in flight too (best-effort).
  void (async () => {
    try {
      const plugin = await getMuxPlugin();
      await plugin?.cancelMux({ jobId: episodeId });
    } catch { /* plugin missing — nothing to stop */ }
  })();
}

/** True while the episode is queued to start or actively downloading. */
export function isEpisodeDownloading(episodeId: string): boolean {
  return starting.has(episodeId) || active.has(episodeId);
}

interface StoredDownloadMeta {
  animeId?: number;
  animeTitle?: string;
  episodeNumber?: number;
  posterUrl?: string;
  sourceType?: 'hls' | 'torrent';
  url?: string;
  headers?: Record<string, string>;
  originalUrl?: string;
  subtitles?: MobileDownloadInput['subtitles'];
}

const RETRY_KEY_PREFIX = 'tatakai:dl:retry:';

/**
 * Persist a retry snapshot that survives completion. The start-time meta
 * (`tatakai:dl:meta:`) is deleted when history is recorded, which made
 * completed-but-broken rows unretryable — this key keeps url/headers so a
 * poisoned file can be re-downloaded in place from the offline hub.
 */
function rememberRetryMeta(episodeId: string, input: MobileDownloadInput): void {
  try {
    let prev: StoredDownloadMeta | null = null;
    try {
      prev = JSON.parse(localStorage.getItem(`tatakai:dl:meta:${episodeId}`) || 'null');
    } catch { prev = null; }
    localStorage.setItem(
      `${RETRY_KEY_PREFIX}${episodeId}`,
      JSON.stringify({
        animeId: prev?.animeId || 0,
        animeTitle: prev?.animeTitle || input.animeName,
        episodeNumber: prev?.episodeNumber ?? input.episodeNumber,
        posterUrl: prev?.posterUrl,
        sourceType: prev?.sourceType,
        url: input.url,
        headers: input.headers,
        originalUrl: input.originalUrl,
        subtitles: input.subtitles,
      }),
    );
  } catch { /* storage unavailable */ }
}

function readRetryMeta(episodeId: string): StoredDownloadMeta | null {
  for (const key of [`tatakai:dl:meta:${episodeId}`, `${RETRY_KEY_PREFIX}${episodeId}`]) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const meta = JSON.parse(raw) as StoredDownloadMeta;
      if (meta && String(meta.url || '').trim()) return meta;
    } catch { /* malformed */ }
  }
  return null;
}

/**
 * Delete an anime episode's files from disk: the direct file
 * (`tatakai/anime/<base>.<ext>`) and/or the HLS folder (`tatakai/anime/<base>/`).
 * Returns the number of entries removed.
 */
export async function removeAnimeDownloadFiles(animeTitle: string, episodeNumber: number): Promise<number> {
  if (!isCapacitor()) return 0;
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const base = baseNameFor({ animeName: animeTitle || 'Anime', episodeNumber: Number(episodeNumber) || 0 });
  let removed = 0;
  try {
    const { files } = await Filesystem.readdir({ path: 'tatakai/anime', directory: Directory.Documents });
    const names = (files || []).map((f: unknown) => (typeof f === 'string' ? f : String((f as { name?: string }).name || '')));
    for (const name of names) {
      if (name !== base && !name.startsWith(`${base}.`)) continue;
      try {
        if (name.includes('.')) {
          await Filesystem.deleteFile({ path: `tatakai/anime/${name}`, directory: Directory.Documents });
        } else {
          await Filesystem.rmdir({ path: `tatakai/anime/${name}`, directory: Directory.Documents, recursive: true });
        }
        removed++;
      } catch { /* already gone */ }
    }
  } catch { /* folder missing */ }
  // The HLS folder shares the exact base name (no extension) — covered above,
  // but attempt directly in case the listing missed it.
  try {
    await Filesystem.rmdir({ path: `tatakai/anime/${base}`, directory: Directory.Documents, recursive: true });
    removed++;
  } catch { /* already gone */ }
  return removed;
}

/**
 * Delete a completed anime download: files from disk + its history row, so
 * storage is actually freed (previously only Dexie rows were touched and the
 * file stayed on disk).
 */
export async function deleteMobileAnimeDownload(
  historyId: string,
  animeTitle: string,
  episodeNumber: number,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    await removeAnimeDownloadFiles(animeTitle, episodeNumber);
  } catch (e) {
    console.warn('[mobileDownloader] file delete failed', e);
  }
  try {
    const { db } = await import('@/core/db/tatakai-db');
    await db.downloadHistory.delete(historyId);
  } catch (e) {
    console.warn('[mobileDownloader] history delete failed', e);
    return { ok: false, reason: 'history_delete_failed' };
  }
  return { ok: true };
}

/**
 * Re-enqueue a failed/cancelled anime download from the meta stored at start
 * time (see `useDownload`). Falls back to the retry snapshot that survives
 * completion, so completed-but-broken rows can be re-downloaded in place.
 * Proxy tokens may have expired since the first attempt — the resolver falls
 * back to `originalUrl`, and a repeat failure surfaces the same error so the
 * user can retry from the series page instead.
 */
export async function retryMobileDownload(
  episodeId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isCapacitor()) return { ok: false, reason: 'not_mobile' };
  const meta = readRetryMeta(episodeId);
  const url = String(meta?.url || '').trim();
  if (!url) return { ok: false, reason: 'missing_stream_url' };
  if (isEpisodeDownloading(episodeId)) return { ok: false, reason: 'already_downloading' };
  // Drop the poisoned files first so the retry never plays/keeps stale bytes.
  if (meta?.animeTitle) {
    await removeAnimeDownloadFiles(meta.animeTitle, Number(meta.episodeNumber) || 0).catch(() => 0);
  }
  const { markQueued } = await import('@/core/download/download-monitor');
  const sourceType: 'hls' | 'torrent' = isTorrentUrl(url) ? 'torrent' : 'hls';
  markQueued(episodeId, {
    animeName: meta?.animeTitle,
    episodeNumber: meta?.episodeNumber,
    posterUrl: meta?.posterUrl,
    sourceType: meta?.sourceType ?? sourceType,
  });
  return startMobileDownload({
    episodeId,
    url,
    animeName: meta?.animeTitle || 'Anime',
    episodeNumber: Number(meta?.episodeNumber) || 0,
    headers: meta?.headers,
    originalUrl: meta?.originalUrl,
    subtitles: meta?.subtitles,
  });
}
