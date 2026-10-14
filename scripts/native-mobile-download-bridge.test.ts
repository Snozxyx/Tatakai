import { beforeEach, describe, expect, mock, test } from 'bun:test';

const nativeJobs: any[] = [];
const submissions: any[] = [];
const reconciled: any[] = [];
const removed: string[] = [];
const playbackRequests: string[] = [];
let nativeListener: ((event: any) => void) | undefined;
let resume: (() => void) | undefined;
const values = new Map<string, string>();
const target = new EventTarget();
Object.assign(globalThis, {
  window: target,
  localStorage: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) },
});
const native = {
  addListener: async (_name: string, listener: (event: any) => void) => { nativeListener = listener; return { remove: async () => {} }; },
  reconcile: async () => ({ jobs: [...nativeJobs] }),
  snapshot: async () => ({ jobs: [...nativeJobs] }),
  configure: async () => {},
  enqueue: async (input: any) => { submissions.push(input); return { success: true }; },
  cancel: async () => {}, retry: async () => {},
  remove: async ({ episodeId }: any) => { const index = nativeJobs.findIndex((job) => job.episodeId === episodeId); if (index >= 0) nativeJobs.splice(index, 1); },
  resolvePlayback: async ({ episodeId }: { episodeId: string }) => {
    playbackRequests.push(episodeId);
    if (!nativeJobs.some((job) => job.episodeId === episodeId && job.status === 'completed')) throw new Error('Episode is not downloaded');
    return { path: 'file:///private/offline-anime/abc/index.m3u8', folder: 'abc', entry: 'index.m3u8' };
  },
};
let refreshedSources: any[] = [];
mock.module('../src/core/extensions/mobile/mobileExtensionHost', () => ({ mobileExtensionDispatch: { resolveSources: async () => refreshedSources } }));
mock.module('@capacitor/core', () => ({ Capacitor: { isPluginAvailable: () => true }, registerPlugin: () => native }));
mock.module('@capacitor/app', () => ({ App: { addListener: async (_name: string, listener: () => void) => { resume = listener; } } }));
mock.module('@capacitor/filesystem', () => ({ Filesystem: { readdir: async () => { throw new Error('No legacy directory'); } }, Directory: { Documents: 'DOCUMENTS' } }));
mock.module('../src/lib/platform/platform', () => ({ isMobileNative: () => true }));
mock.module('../src/hooks/ui/useMobileConfig', () => ({ loadMobileConfig: () => ({ dataSaver: false }) }));
mock.module('../src/core/mobile/localProxyNative', () => ({ ensureNativeProxy: async () => 'http://127.0.0.1:43127' }));
mock.module('../src/core/download/download-monitor', () => ({ reconcileMobileDownloads: (jobs: any[]) => reconciled.push(jobs), removeMobileDownloadState: (id: string) => removed.push(id) }));
mock.module('../src/core/download/download-history-service', () => ({ getHistory: async () => [] }));
mock.module('../src/core/extensions/mobile/mobileProxy', () => ({
  isAnyProxyUrl: (url: string) => url.startsWith('mobile-proxy:') || url.includes('127.0.0.1'),
  resolveMobileProxy: (url: string) => url === 'mobile-proxy://stream/live' ? { url: 'https://cdn.example/ep.m3u8', headers: { Referer: 'https://provider.example' } }
    : url === 'mobile-proxy://stream/subtitle' ? { url: 'https://sub.example/en.vtt', headers: { referer: 'https://subtitle.example/' } } : null,
  normalizeMobileHeaders: (headers: any) => headers || {},
}));
mock.module('../src/lib/api/proxy-utils', () => ({ readProxyQuerySnapshot: (url: string) => {
  const parsed = new URL(url);
  return { streamUrl: parsed.searchParams.get('url') || undefined, referer: parsed.searchParams.get('referer') || undefined, userAgent: parsed.searchParams.get('userAgent') || undefined };
} }));
const bridge = await import('../src/core/download/mobile/nativeDownloads');
await bridge.installNativeDownloads();

describe('native mobile download bridge', () => {
  beforeEach(() => { submissions.length = 0; reconciled.length = 0; removed.length = 0; playbackRequests.length = 0; values.clear(); });
  test('hands native jobs original URLs and provider headers, never loopback tokens', async () => {
    values.set('tatakai:dl:meta:ep1', JSON.stringify({ animeId: 123, posterUrl: '/poster.png' }));
    await bridge.enqueueNativeDownload({ episodeId: 'ep1', animeName: 'Anime', episodeNumber: 1, url: 'mobile-proxy://stream/live', headers: { 'User-Agent': 'Tatakai' }, subtitles: [{ url: 'https://cdn.example/en.vtt', language: 'en' }] });
    expect(submissions[0].url).toBe('https://cdn.example/ep.m3u8');
    expect(submissions[0].headers).toEqual({ Referer: 'https://provider.example', 'User-Agent': 'Tatakai' });
    expect(submissions[0].animeId).toBe('123');
    expect(submissions[0].subtitles[0].lang).toBe('en');
    expect(submissions[0].subtitles[0].headers).toEqual({ Referer: 'https://provider.example', 'User-Agent': 'Tatakai' });
  });
  test('rejects expired proxy registrations instead of persisting a dead local endpoint', async () => {
    await expect(bridge.enqueueNativeDownload({ episodeId: 'ep1', animeName: 'Anime', episodeNumber: 1, url: 'http://127.0.0.1:5555/stream/expired' })).rejects.toThrow('expired');
    expect(submissions).toHaveLength(0);
  });
  test('subtitle-specific headers override inherited video headers without case duplicates', async () => {
    await bridge.enqueueNativeDownload({ episodeId: 'subs', animeName: 'Anime', episodeNumber: 1,
      url: 'https://cdn.example/video.m3u8', headers: { Referer: 'https://video.example/', 'User-Agent': 'VideoAgent' },
      subtitles: [{ url: 'https://sub.example/en.vtt', headers: { referer: 'https://subtitle.example/' } }] });
    expect(submissions[0].subtitles[0].headers.referer).toBe('https://subtitle.example/');
    expect(submissions[0].subtitles[0].headers.Referer).toBeUndefined();
    expect(submissions[0].subtitles[0].headers['User-Agent']).toBe('VideoAgent');
  });
  test('keeps a proxied subtitle own Referer instead of replacing it with the video Referer', async () => {
    await bridge.enqueueNativeDownload({ episodeId: 'subs', animeName: 'Anime', episodeNumber: 1,
      url: 'mobile-proxy://stream/live', subtitles: [{ url: 'mobile-proxy://stream/subtitle' }] });
    expect(submissions[0].subtitles[0].url).toBe('https://sub.example/en.vtt');
    expect(submissions[0].subtitles[0].headers.referer).toBe('https://subtitle.example/');
    expect(submissions[0].subtitles[0].headers.Referer).toBeUndefined();
  });
  test('unwraps a saved hosted proxy and preserves its provider Referer', async () => {
    await bridge.enqueueNativeDownload({ episodeId: 'ep-proxy', animeName: 'Anime', episodeNumber: 1,
      url: 'https://proxy.example/streamingProxy?url=https%3A%2F%2Fcdn.example%2Fep.m3u8&referer=https%3A%2F%2Fprovider.example%2F' });
    expect(submissions[0].url).toBe('https://cdn.example/ep.m3u8');
    expect(submissions[0].headers.Referer).toBe('https://provider.example/');
    expect(submissions[0].headers['User-Agent']).toContain('Mozilla');
  });
  test('restores a restarted proxy download from its original URL and headers', async () => {
    await bridge.enqueueNativeDownload({ episodeId: 'ep-restart', animeName: 'Anime', episodeNumber: 1,
      url: 'http://127.0.0.1:5555/stream/expired', originalUrl: 'https://cdn.example/ep.m3u8', headers: { Referer: 'https://provider.example/' } });
    expect(submissions[0].url).toBe('https://cdn.example/ep.m3u8');
    expect(submissions[0].headers.Referer).toBe('https://provider.example/');
  });
  test('restores native completion after resume and resolves media plus subtitles locally', async () => {
    nativeJobs.splice(0, nativeJobs.length, { episodeId: 'ep1', animeName: 'Anime', episodeNumber: 1, status: 'completed', progress: 100, folder: 'abc', entry: 'index.m3u8', subtitles: [{ lang: 'en', file: 'english.vtt' }] });
    resume?.(); await new Promise((resolve) => setTimeout(resolve, 0));
    expect(reconciled.at(-1)?.[0].localUri).toBe('native-offline://ep1');
    const playback = await bridge.resolveNativeOfflineEpisode('ep1');
    expect(playback.url).toBe('http://127.0.0.1:43127/offline/abc/index.m3u8');
    expect(playback.subtitles[0].url).toContain('/offline/abc/english.vtt');
  });
  test('older Downloads watch links resolve the saved episode instead of the synthetic route ID', async () => {
    nativeJobs.splice(0, nativeJobs.length, { episodeId: 'ep1', status: 'completed', subtitles: [{ lang: 'en', file: 'english.vtt' }] });
    await bridge.refreshNativeDownloads();
    const playback = await bridge.resolveNativeOfflineEpisode('mobile-123?ep=1', 'native-offline://ep1');
    expect(playbackRequests).toEqual(['ep1']);
    expect(playback.url).toBe('http://127.0.0.1:43127/offline/abc/index.m3u8');
    expect(playback.subtitles[0].url).toContain('/offline/abc/english.vtt');
  });
  test('native error events replace active UI state and deletion clears the monitor', async () => {
    nativeListener?.({ jobs: [{ ...nativeJobs[0], status: 'failed', error: 'HTTP 403', progress: 7 }] });
    expect(reconciled.at(-1)?.[0].error).toBe('HTTP 403');
    await bridge.deleteNativeDownload('ep1');
    expect(removed).toEqual(['ep1']);
    expect(reconciled.at(-1)).toEqual([]);
  });
  test('retry refreshes an expired signed link for the same resource', async () => {
    nativeListener?.({ jobs: [{ episodeId: 'signed', animeName: 'Anime', episodeNumber: 1, url: 'https://cdn.example/ep.m3u8?token=old', status: 'failed', error: 'HTTP 403' }] });
    refreshedSources = [{ url: 'https://cdn.example/ep.m3u8?token=new', sourceType: 'hls', headers: { Referer: 'https://provider.example/' } }];
    await bridge.retryNativeDownload('signed');
    expect(submissions[0].url).toBe('https://cdn.example/ep.m3u8?token=new');
    expect(submissions[0].headers.Referer).toBe('https://provider.example/');
  });
  test('retry never substitutes a different episode or language resource', async () => {
    nativeListener?.({ jobs: [{ episodeId: 'signed', animeName: 'Anime', episodeNumber: 1, url: 'https://cdn.example/ep.m3u8?token=old', status: 'failed', error: 'HTTP 403' }] });
    refreshedSources = [{ url: 'https://cdn.example/other-episode.m3u8', sourceType: 'hls' }];
    await expect(bridge.retryNativeDownload('signed')).rejects.toThrow('select another download server');
    expect(submissions).toHaveLength(0);
  });
});
