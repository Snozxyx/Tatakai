import { it, expect, mock, afterEach } from 'bun:test';

const rows: any[] = [];
let mode = 'subtitles';
let releaseMapping: (() => void) | undefined, releaseSlow: (() => void) | undefined;
mock.module('../src/core/extensions/remote/installed', () => ({
  listRemoteExtensions: async () => rows, invokeRemote: async () => [], updateRemoteExtension: async () => {},
}));
mock.module('../src/lib/mapping/anizip', () => ({ fetchAniZipMapping: async () => { if (mode === 'pending-metadata') await new Promise<void>(resolve => releaseMapping = resolve); return mode === 'fallback' ? null : ({ ids: { imdbId: 'tt0409591', type: 'TV' }, byNumber: new Map([[1, { seasonNumber: 2, seasonEpisodeNumber: 4 }]]) }); } }));
mock.module('../src/core/extensions/remote/media', () => ({ proxyRemoteUrl: async (url: string) => url, proxyRemoteSources: async (sources: any[]) => sources }));
mock.module('../src/core/extensions/remote/transport', () => ({ fetchExtensionJson: async (url: string) => {
  if (mode === 'progressive' && url.includes('slow.test/stream/')) await new Promise<void>(resolve => releaseSlow = resolve);
  if (mode === 'fallback' && url.includes('/catalog/')) return { metas: [{ id: url.includes('fixture.test') ? 'tt111' : 'tt222', name: 'Naruto', type: 'series' }] };
  if (mode === 'fallback' && url.includes('/meta/')) return { meta: { id: url.includes('tt111') ? 'tt111' : 'tt222', name: 'Naruto', type: 'series', videos: [{ id: url.includes('tt111') ? 'tt111:1:1' : 'tt222:1:1', season: 1, episode: 1 }] } };
  if (mode === 'fallback' && url.includes('/stream/') && url.includes('tt111')) throw Error('Unavailable first match');
  if (url.includes('/subtitles/')) return { subtitles: [{ url: 'https://fixture.test/sub.vtt', lang: 'en' }, { url: 'javascript:bad', lang: 'xx' }] };
  if (mode === 'failure') throw Error('Offline https://private.test/token');
  return { streams: [{ url: 'https://fixture.test/video.m3u8', name: 'Provider 1080p' }] };
} }));
const { resolveRemoteSources } = await import('../src/core/extensions/remote/resolve');
afterEach(() => { rows.length = 0; mode = 'subtitles'; });
const addon = (id: string, resources: string[]) => ({ id, enabled: true, ecosystem: 'stremio', manifestUrl: 'https://fixture.test/manifest.json', manifest: { id, name: 'Named addon', version: '1', resources, types: ['series'], idPrefixes: ['tt'] } });

it('delivers an original extension stream while optional metadata is still pending', async () => {
  mode = 'pending-metadata'; const previous = globalThis.window; let published = false;
  (globalThis as any).window = { dispatchEvent() {}, electron: { compatibilityRequest: async (p: any) => ({ ok: true, result: p.op === 'sources' ? p.ecosystem === 'cloudstream' ? [{ id: 'compat-cloudstream-fast', packageId: 'original', ecosystem: 'cloudstream', kind: 'watch', name: 'Fast', extensionName: 'Original', enabled: true, lang: 'en' }] : [] : p.op === 'search' ? { results: [{ id: 'title', title: 'Naruto' }] } : p.op === 'info' ? { entries: [{ id: 'episode', number: 1 }] } : { sources: [{ url: 'https://media.test/first.mp4' }] } }) } };
  let timer: ReturnType<typeof setTimeout>;
  try {
    const result = await Promise.race([resolveRemoteSources({ anilistId: 20, title: 'Naruto', episode: 1 }, undefined, value => { if (value.sources.length) published = true; }), new Promise<never>((_, reject) => timer = setTimeout(() => reject(Error('Original lookup waited for optional metadata')), 3000))]);
    expect(result.sources).toHaveLength(1); expect(published).toBe(true);
  } finally { clearTimeout(timer!); releaseMapping?.(); (globalThis as any).window = previous; }
});

it('publishes a ready addon before a slow addon completes', async () => {
  mode = 'progressive'; rows.push(addon('fast', ['stream']), { ...addon('slow', ['stream']), manifestUrl: 'https://slow.test/manifest.json' });
  let notify: () => void; const progress = new Promise<void>(resolve => notify = resolve);
  const result = resolveRemoteSources({ anilistId: 20, episode: 1 }, undefined, value => { if (value.sources.length) notify(); });
  try {
    await progress; expect(releaseSlow).toBeFunction();
  } finally { releaseSlow?.(); }
  expect((await result).sources).toHaveLength(2);
});

it('keeps standalone subtitles when an addon returns no video sources', async () => {
  rows.push(addon('stremio-sub', ['subtitles']));
  const result = await resolveRemoteSources({ anilistId: 20, episode: 1 });
  expect(result.sources).toHaveLength(0); expect(result.subtitles).toHaveLength(1);
  expect(result.subtitles[0].label).toBe('English · Named addon');
  expect(result.statuses[0]).toMatchObject({ name: 'Named addon', count: 0, subtitleCount: 1, status: 'ok' });
});
it('keeps independent subtitle results and reports a failed streaming addon', async () => {
  mode = 'failure'; rows.push(addon('stremio-stream', ['stream']), addon('stremio-sub', ['subtitles']));
  const result = await resolveRemoteSources({ anilistId: 20 });
  expect(result.subtitles).toHaveLength(1);
  expect(result.statuses.find(s => s.provider === 'stremio-stream')?.status).toBe('error');
});

it('tries searched IDs when IMDb mapping is unavailable and an earlier stream trial fails', async () => {
  mode = 'fallback';
  const row = addon('stremio-fallback', ['meta', 'stream']);
  (row.manifest as any).catalogs = [{ id: 'anime', type: 'series', extra: [{ name: 'search' }] }];
  rows.push(row);
  const result = await resolveRemoteSources({ anilistId: 20, title: 'Naruto', episode: 1 });
  expect(result.sources).toHaveLength(1);
  expect(result.statuses[0].status).toBe('ok');
});
