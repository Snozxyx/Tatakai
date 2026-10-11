import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { useSyncExternalStore } from 'react';
import { isMobileNative } from '@/lib/platform/platform';
import { loadMobileConfig } from '@/hooks/ui/useMobileConfig';
import { ensureNativeProxy } from '@/core/mobile/localProxyNative';
import { reconcileMobileDownloads, removeMobileDownloadState, type DownloadJobStatus } from '../download-monitor';
import { isAnyProxyUrl, normalizeMobileHeaders, resolveMobileProxy } from '@/core/extensions/mobile/mobileProxy';
import type { MobileDownloadInput } from './mobileDownloader';
import { readProxyQuerySnapshot } from '@/lib/api/proxy-utils';
import { DOWNLOAD_RESUME_EVENT, getDownloadAutoResume } from '@/lib/downloadPreferences';

export interface NativeDownloadJob {
  episodeId: string;
  url?: string;
  originalUrl?: string;
  headers?: Record<string, string>;
  animeId?: string;
  animeName: string;
  episodeNumber: number;
  posterUrl?: string;
  status: DownloadJobStatus;
  progress: number;
  error?: string;
  folder: string;
  entry: string;
  bytes?: number;
  completedAt?: number;
  subtitles?: Array<{ file?: string; lang?: string; language?: string; label?: string }>;
}
interface DownloadsPlugin {
  importLegacy(input: { name: string; episodeId: string; animeId: string; animeName: string; episodeNumber: number; posterUrl?: string }): Promise<void>;
  enqueue(input: MobileDownloadInput): Promise<{ success: boolean }>;
  cancel(input: { episodeId: string }): Promise<void>;
  retry(input: { episodeId: string }): Promise<void>;
  remove(input: { episodeId: string }): Promise<void>;
  snapshot(): Promise<{ jobs: NativeDownloadJob[] }>;
  reconcile(): Promise<{ jobs: NativeDownloadJob[] }>;
  configure(input: { dataSaver: boolean; wifiOnly: boolean; autoResume: boolean }): Promise<void>;
  resolvePlayback(input: { episodeId: string }): Promise<{ path: string; folder: string; entry: string }>;
  addListener(name: 'downloadsChanged', listener: (event: { jobs: NativeDownloadJob[] }) => void): Promise<PluginListenerHandle>;
}
const plugin = registerPlugin<DownloadsPlugin>('TatakaiDownloads');
let jobs: NativeDownloadJob[] = [];
const subscribers = new Set<() => void>();
let installation: Promise<void> | undefined;
let loadError: string | undefined;
let ready = false;
let legacyChecked = false;
let listenersInstalled = false;
export interface LegacyDownloadIssue { name: string; animeId?: string; title: string; error: string }
let legacyIssues: LegacyDownloadIssue[] = [];
try { legacyIssues = JSON.parse(localStorage.getItem('tatakai:legacy-download-issues') || '[]'); } catch { /* unavailable storage */ }
function publishIssues() {
  try { localStorage.setItem('tatakai:legacy-download-issues', JSON.stringify(legacyIssues)); } catch { /* unavailable storage */ }
  jobs = [...jobs]; for (const subscriber of subscribers) subscriber();
}
export function dismissLegacyDownloadIssue(name: string) {
  legacyIssues = legacyIssues.filter((issue) => issue.name !== name); publishIssues();
}
export function isNativeDownloadJob(id: string): boolean { return jobs.some((job) => job.episodeId === id); }

async function importLegacyDownloads() {
  if (legacyChecked) return;
  legacyChecked = true;
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  const { getHistory } = await import('../download-history-service');
  const history = await getHistory(500);
  let files;
  try { files = (await Filesystem.readdir({ path: 'tatakai/anime', directory: Directory.Documents })).files; }
  catch { return; }
  for (const file of files) {
    if (!/\.(mp4|mkv|webm|m4v)$/i.test(file.name) && file.type !== 'directory') continue;
    const previous = history.find((entry) => entry.status === 'completed' && entry.localPath?.includes(file.name));
    const episodeId = previous?.episodeId || `legacy:${file.name}`;
    if (jobs.some((job) => job.episodeId === episodeId)) {
      legacyIssues = legacyIssues.filter((issue) => issue.name !== file.name); continue;
    }
    try {
      await plugin.importLegacy({ name: file.name, episodeId, animeId: String(previous?.animeId || episodeId),
        animeName: previous?.animeTitle || file.name.replace(/[-_]ep\d+.*$/i, '').replace(/_/g, ' '),
        episodeNumber: previous?.episodeNumber || Number(file.name.match(/[-_]ep(\d+)/i)?.[1]) || 1,
        posterUrl: previous?.posterUrl });
      legacyIssues = legacyIssues.filter((issue) => issue.name !== file.name);
    } catch (failure) {
      legacyIssues = legacyIssues.filter((issue) => issue.name !== file.name);
      legacyIssues.push({ name: file.name, animeId: previous?.animeId ? String(previous.animeId) : undefined,
        title: previous?.animeTitle || file.name, error: failure instanceof Error ? failure.message : String(failure) });
    }
  }
  publishIssues();
}

export function hasNativeDownloads(): boolean {
  return isMobileNative() && Capacitor.isPluginAvailable('TatakaiDownloads');
}
function receive(next: NativeDownloadJob[]) {
  ready = true;
  loadError = undefined;
  jobs = next;
  reconcileMobileDownloads(next.map((job) => ({
    episodeId: job.episodeId, animeName: job.animeName, episodeNumber: job.episodeNumber,
    posterUrl: job.posterUrl, status: job.status, progress: job.progress, error: job.error,
    localUri: `native-offline://${encodeURIComponent(job.episodeId)}`,
  })));
  for (const subscriber of subscribers) subscriber();
}
export async function refreshNativeDownloads(): Promise<void> {
  if (!hasNativeDownloads()) return;
  try { receive((await plugin.reconcile()).jobs); loadError = undefined; }
  catch (error) {
    loadError = error instanceof Error ? error.message : String(error);
    jobs = [...jobs]; for (const subscriber of subscribers) subscriber(); throw error;
  }
}
export function installNativeDownloads(): Promise<void> {
  if (!hasNativeDownloads()) return Promise.resolve();
  if (installation) return installation;
  installation = (async () => {
    if (!listenersInstalled) {
    await plugin.addListener('downloadsChanged', ({ jobs: next }) => receive(next));
    const configure = () => {
      // Wi-Fi-only applies to auto-download admission; explicit downloads remain user initiated.
      void plugin.configure({ dataSaver: loadMobileConfig().dataSaver, wifiOnly: false, autoResume: getDownloadAutoResume() }).catch(() => {});
    };
    configure(); window.addEventListener('tatakai-mobile-config-updated', configure);
    window.addEventListener(DOWNLOAD_RESUME_EVENT, configure);
    if (getDownloadAutoResume()) void import('./mobileMangaDownloader').then(module => module.resumeInterruptedMangaDownloads()).catch(() => {});
    const { App } = await import('@capacitor/app');
    await App.addListener('resume', () => { void refreshNativeDownloads().catch(() => {}); });
    listenersInstalled = true;
    }
    await refreshNativeDownloads();
    void importLegacyDownloads().then(async () => receive((await plugin.snapshot()).jobs)).catch(() => {});
  })().catch((error) => {
    loadError = error instanceof Error ? error.message : String(error);
    installation = undefined;
    ready = true; jobs = [...jobs];
    for (const subscriber of subscribers) subscriber();
  });
  return installation;
}
function upstream(url: string, originalUrl?: string, headers?: unknown) {
  const source = isAnyProxyUrl(url) ? resolveMobileProxy(url) : null;
  let resolved = source?.url || (isAnyProxyUrl(url) ? originalUrl : url);
  if (!resolved || !/^https?:\/\//i.test(resolved) || /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/i.test(resolved)) {
    throw new Error('The saved source has expired. Open the series and resolve the episode again.');
  }
  const replay: Record<string, string> = {};
  for (const bag of [source?.headers, headers]) for (const [name, value] of Object.entries(normalizeMobileHeaders(bag))) {
    for (const existing of Object.keys(replay)) if (existing.toLowerCase() === name.toLowerCase()) delete replay[existing];
    replay[name] = value;
  }
  // Old cached sources may still carry the hosted streaming-proxy wrapper.
  // Native jobs must fetch its upstream with the wrapper's provider headers.
  for (let depth = 0; depth < 3; depth++) {
    const snapshot = readProxyQuerySnapshot(resolved);
    if (!snapshot.streamUrl || snapshot.streamUrl === resolved) break;
    if (snapshot.referer && !Object.keys(replay).some((key) => key.toLowerCase() === 'referer')) replay.Referer = snapshot.referer;
    if (snapshot.userAgent && !Object.keys(replay).some((key) => key.toLowerCase() === 'user-agent')) replay['User-Agent'] = snapshot.userAgent;
    resolved = snapshot.streamUrl;
  }
  if (!/^https?:\/\//i.test(resolved) || isAnyProxyUrl(resolved)) throw new Error('The saved source has expired. Resolve the episode again.');
  if (!Object.keys(replay).some((key) => key.toLowerCase() === 'user-agent')) replay['User-Agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
  return { url: resolved, headers: replay };
}
/**
 * Bounded install so a wedged native bridge surfaces a clear error instead of
 * pinning the caller (and the serial download queue behind it) forever. The
 * module-level install promise is left to settle on its own; a later call
 * retries against whatever state it reached.
 */
async function installNativeDownloadsBounded(timeoutMs = 15000): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('Download service is not responding. Reopen the app and retry.')),
      timeoutMs,
    );
  });
  try {
    await Promise.race([installNativeDownloads(), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
export async function enqueueNativeDownload(input: MobileDownloadInput) {
  await installNativeDownloadsBounded();
  const target = upstream(input.url, input.originalUrl, input.headers);
  const metadata = JSON.parse(localStorage.getItem(`tatakai:dl:meta:${input.episodeId}`) || '{}');
  // One bad subtitle URL (expired token, loopback leftovers) must never kill
  // the whole episode: drop unresolvable tracks and download the video.
  const safeSubtitles = (input.subtitles || []).flatMap((sub) => {
    try {
      const subtitleHeaders = { ...target.headers };
      const registeredHeaders = isAnyProxyUrl(sub.url) ? resolveMobileProxy(sub.url)?.headers : undefined;
      for (const bag of [registeredHeaders, sub.headers]) for (const [name, value] of Object.entries(normalizeMobileHeaders(bag))) {
        for (const existing of Object.keys(subtitleHeaders)) if (existing.toLowerCase() === name.toLowerCase()) delete subtitleHeaders[existing];
        subtitleHeaders[name] = value;
      }
      return [{ ...sub, ...upstream(sub.url, sub.originalUrl, subtitleHeaders), lang: sub.lang || sub.language }];
    } catch {
      return [];
    }
  });
  await plugin.enqueue({
    ...input, ...target, animeId: input.animeId || String(metadata.animeId || input.episodeId),
    posterUrl: input.posterUrl || metadata.posterUrl,
    subtitles: safeSubtitles,
  });
}
export async function cancelNativeDownload(episodeId: string) { await plugin.cancel({ episodeId }); }
export async function retryNativeDownload(episodeId: string) {
  const job = jobs.find((item) => item.episodeId === episodeId);
  if (job?.status === 'failed' && /403|401|410|error page|provider blocked/i.test(job.error || '') && job.url) {
    const previous = upstream(job.url, job.originalUrl, job.headers);
    const identity = new URL(previous.url);
    const { mobileExtensionDispatch } = await import('@/core/extensions/mobile/mobileExtensionHost');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const fresh = await Promise.race([
        mobileExtensionDispatch.resolveSources('toko', 'sources', { titles: [job.animeName], episode: job.episodeNumber, refresh: true }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Source refresh timed out. Open the series and select a download server.')), 30000); }),
      ]);
      // Match the same resource, including path: never silently change language,
      // episode or provider when refreshing an expired signed URL.
      const replacement = fresh.find((source) => {
        if (source.isEmbed || source.isTorrent) return false;
        try {
          const target = new URL(upstream(source.url, source.originalUrl, source.headers).url);
          return target.origin === identity.origin && target.pathname === identity.pathname;
        } catch { return false; }
      });
      if (!replacement) throw new Error('The provider could not refresh this stream. Open the series and select another download server.');
      await enqueueNativeDownload({ ...job, url: replacement.url, originalUrl: replacement.originalUrl, headers: replacement.headers, subtitles: replacement.subtitles });
      return;
    } finally { if (timer) clearTimeout(timer); }
  }
  await plugin.retry({ episodeId });
}
export async function deleteNativeDownload(episodeId: string) {
  await plugin.remove({ episodeId }); removeMobileDownloadState(episodeId); await refreshNativeDownloads();
}
export async function resolveNativeOfflineEpisode(episodeId: string) {
  await installNativeDownloads();
  const resolved = await plugin.resolvePlayback({ episodeId });
  const base = await ensureNativeProxy();
  if (!base) throw new Error('The offline media server could not start. Reopen the app and retry.');
  const url = `${base}/offline/${resolved.folder}/${resolved.entry}`;
  const job = jobs.find((item) => item.episodeId === episodeId);
  return {
    url,
    subtitles: (job?.subtitles || []).filter((sub) => sub.file).map((sub) => ({
      lang: sub.lang || sub.language || 'Unknown', label: sub.label,
      url: `${base}/offline/${resolved.folder}/${sub.file}`,
    })),
  };
}
export function useNativeDownloadJobs() {
  const snapshot = useSyncExternalStore((subscriber) => {
    subscribers.add(subscriber); void installNativeDownloads();
    return () => { subscribers.delete(subscriber); };
  }, () => jobs, () => jobs);
  return { jobs: snapshot, legacyIssues, error: loadError, available: hasNativeDownloads(), ready };
}
