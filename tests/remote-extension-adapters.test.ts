import { languageLabel, streamMetadata } from '../src/core/extensions/remote/metadata';
import { getSimpleServerDisplayName, buildUniqueSimpleNameMap } from '../src/lib/serverNames';
import { describe, it, expect } from 'bun:test';
import { buildSeanimeBundle } from '../src/core/extensions/remote/seanime';
import { supportsResource, stremioResourceUrl, normalizeStremioStream } from '../src/core/extensions/remote/stremio';
import { detectEcosystem, normalizeManifestUrl } from '../src/core/extensions/ecosystems';
import { catalogCompatibility, isSourceManifest, mergeImportedMetadata, feedEntries, nextFeedPage, catalogPresentation } from '../tatakaiextension/supabase/functions/api/catalog';

async function provider(payload: string, language = 'javascript') {
  const module = { exports: {} as any };
  const bundle = await buildSeanimeBundle(payload, language);
  new Function('module', '__tatakai_parse_html__', '__tatakai_fetch__', bundle)(module, () => ({}), async () => ({ text: async () => 'fixture' }));
  return module.exports;
}
const fixture = `class Provider {
  search(opts) { return [{ id: 'title-1', title: opts.query + $getUserPreference('suffix') }]; }
  getSettings() { return { episodeServers: ['broken', 'working'] }; }
  findEpisodes(id) { return [{ id: id + '-ep', number: 2 }]; }
  findEpisodeServer(ep, server) { if (server === 'broken') throw Error('offline'); return { headers: { Referer: 'https://example.com' }, videoSources: [{ url: 'https://example.com/video.m3u8', type: 'm3u8', subtitles: [{ url: 'https://example.com/sub.vtt', language: 'en' }] }] }; }
  smartSearch(opts) { return [{ id: 'torrent', title: opts.query }]; }
  getTorrentMagnetLink() { return 'magnet:?xt=urn:btih:' + 'a'.repeat(40); }
  findChapters(id) { return [{ id: id + '-chapter', chapter: '3', index: 0 }]; }
  findChapterPages(id) { return [{ url: 'https://example.com/' + id + '.jpg' }]; }
}`;

describe('source ecosystem adapters', () => {
  it('detects manifests and accepts Stremio deep links', () => {
    expect(detectEcosystem({ resources: [], types: [] })).toBe('stremio');
    expect(detectEcosystem({ language: 'typescript', payload: 'class Provider {}' })).toBe('seanime');
    expect(normalizeManifestUrl('stremio://example.com/manifest.json')).toBe('https://example.com/manifest.json');
    expect(() => normalizeManifestUrl('file:///private.json')).toThrow();
  });
  it('honors resource-specific types and prefixes', () => {
    const m = { id: 'x', name: 'x', version: '1', types: ['series'], idPrefixes: ['custom:'], resources: [{ name: 'stream', types: ['movie'], idPrefixes: ['tt'] }] };
    expect(supportsResource(m, 'stream', 'movie', 'tt123')).toBe(true);
    expect(supportsResource(m, 'stream', 'series', 'tt123:1:2')).toBe(false);
  });
  it('preserves configured URL segments and query parameters', () => {
    expect(stremioResourceUrl('https://example.com/personal/manifest.json?key=value', 'stream', 'series', 'tt123:2:4')).toBe('https://example.com/personal/stream/series/tt123%3A2%3A4.json?key=value');
  });
  it('normalizes torrent file index, trackers, headers and subtitles', () => {
    const s = normalizeStremioStream({ infoHash: 'a'.repeat(40), fileIdx: 7, sources: ['tracker:udp://tracker.test'], behaviorHints: { proxyHeaders: { request: { Referer: 'x' } } }, subtitles: [{ url: 'https://example.com/sub.vtt', lang: 'en' }] }, 'x', 'x');
    expect(s.fileIndex).toBe(7); expect(s.url).toContain('&tr=udp%3A'); expect(s.headers.Referer).toBe('x'); expect(s.subtitles[0].lang).toBe('en');
    expect(normalizeStremioStream({ url: 'javascript:bad' }, 'x', 'x')).toBeNull();
  });
  for (const language of ['javascript', 'typescript']) it(`executes ${language} streaming, torrent and manga fixture`, async () => {
    const p = await provider(language === 'typescript' ? fixture.replace('search(opts)', 'search(opts: any)') : fixture, language);
    expect((await p.remoteSearch({ query: 'Title', preferences: { suffix: '!' } }))[0].title).toBe('Title!');
    const streams = await p.remoteResolve({ titleId: 'title-1', episode: 2 });
    expect(streams).toHaveLength(1); expect(streams[0].sourceType).toBe('hls'); expect(streams[0].headers.Referer).toContain('example.com');
    expect((await p.remoteResolve({ providerType: 'anime-torrent-provider', query: 'Title' }))[0].url).toContain('magnet:');
    expect((await p.remoteChapters({ titleId: 'title-1' }))[0].id).toBe('title-1-chapter');
    expect((await p.remotePages({ chapterId: 'chapter-3' }))[0].url).toContain('chapter-3.jpg');
  });
  it('rejects malformed payloads and unsupported languages/bindings', async () => {
    await expect(provider('class Provider {', 'javascript')).rejects.toThrow();
    await expect(provider('class Provider {}', 'go')).rejects.toThrow('JavaScript');
    await expect(provider('class Provider { search() { return ChromeDP.Navigate("x"); } }')).rejects.toThrow('ChromeDP');
  });
});

describe('source catalogs', () => {
  it('excludes plugins and catalog-only addons', () => {
    expect(isSourceManifest('seanime', { type: 'plugin' })).toBe(false);
    expect(isSourceManifest('seanime', { type: 'manga-provider' })).toBe(true);
    expect(isSourceManifest('stremio', { resources: ['catalog'] })).toBe(false);
    expect(isSourceManifest('stremio', { resources: ['subtitles'] })).toBe(true);
    expect(catalogCompatibility('seanime', { type: 'manga-provider', language: 'go' }).compatibility).toBe('external');
  });
  it('preserves admin metadata and moderation during updates', () => {
    const existing = { name: 'Admin title', description: 'old', status: 'rejected', is_killed: true, imported_metadata: { name: 'upstream title', description: 'old' } };
    const patch = mergeImportedMetadata(existing, { name: 'new title', description: 'new' });
    expect(patch.name).toBeUndefined(); expect(patch.description).toBe('new'); expect(patch.status).toBeUndefined(); expect(patch.is_killed).toBeUndefined();
  });
  it('accepts both feed formats and rejects incomplete catalogs', () => {
    expect(feedEntries({ addons: [{ id: 'x' }] })).toHaveLength(1);
    expect(feedEntries([{ id: 'x' }])).toHaveLength(1);
    expect(() => feedEntries({})).toThrow();
  });
  it('includes hosted instances and follows all anime catalog pages', () => {
    const body = { addons: [{ manifestUrl: 'https://a.test/manifest.json', instances: [{ manifestUrl: 'https://b.test/manifest.json' }] }], pagination: { page: 1, hasNextPage: true } };
    expect(feedEntries(body)).toHaveLength(2);
    expect(nextFeedPage(body, 'https://stremio-addons.net/api/v0/addons?category=anime&limit=100&page=1')).toBe('https://stremio-addons.net/api/v0/addons?category=anime&limit=100&page=2');
    expect(nextFeedPage({ pagination: { page: 3, hasNextPage: false } }, 'https://example.com?page=3')).toBeNull();
    expect(() => nextFeedPage({ pagination: { hasNextPage: true } }, 'https://example.com')).toThrow();
  });
  it('imports real artwork and categories without unsafe image schemes', () => {
    const presentation = catalogPresentation({ background: './banner.jpg', logo: 'javascript:bad' }, { categories: [{ slug: 'anime' }] }, 'https://source.test/manifest.json');
    expect(presentation.banner_url).toBe('https://source.test/banner.jpg');
    expect(presentation.icon_url).toBeNull(); expect(presentation.categories).toEqual(['anime']);
    expect(mergeImportedMetadata({ banner_url: 'https://admin.test/banner.jpg', imported_metadata: { banner_url: 'https://old.test/banner.jpg' } }, presentation).banner_url).toBeUndefined();
  });
});


describe('source display metadata and provider cache', () => {
  it('uses extension names instead of UUIDs and numbers duplicate labels', () => {
    expect(getSimpleServerDisplayName('stremio-1a1a519c-5644#1', 'Anime Source')).toBe('Anime Source');
    const keys = ['seanime-uuid#1', 'seanime-uuid#2'];
    expect(buildUniqueSimpleNameMap(keys, Object.fromEntries(keys.map(k => [k, 'Source'])))).toEqual({ 'seanime-uuid#1': 'Source 1', 'seanime-uuid#2': 'Source 2' });
    const qualified = 'd72ece56-84cc-4dbc-81e7-b81c6af7b67f/041cc064-2e65-46b6-84eb-5de2e7dec187';
    expect(getSimpleServerDisplayName(qualified, 'QA Server')).toBe('QA Server');
    expect(buildUniqueSimpleNameMap([`${qualified}#1`, `${qualified}#2`], {
      [`${qualified}#1`]: 'QA Server', [`${qualified}#2`]: 'QA Server',
    })).toEqual({ [`${qualified}#1`]: 'QA Server 1', [`${qualified}#2`]: 'QA Server 2' });
  });
  it('normalizes languages and quality without treating unknown audio as sub', () => {
    expect(languageLabel('eng')).toBe('English'); expect(languageLabel('pt-BR')).toContain('Portuguese');
    expect(streamMetadata({ name: 'Addon 1080p', title: 'Dual Audio' })).toMatchObject({ quality: '1080p', language: 'Language not specified' });
    expect(streamMetadata({ description: 'English dub 720p' })).toMatchObject({ audioLanguage: 'en', isDub: true, quality: '720p' });
  });
  it('keeps dollar-prefixed local variables and isolates stores per provider', async () => {
    const code = 'class Provider { search() { const $doc = "local"; $store.set("count", ($store.get("count") || 0) + 1); return [$doc, $store.get("count")]; } }';
    const a = await provider(code); const b = await provider(code);
    expect(await a.remoteSearch({})).toEqual(['local', 1]); expect(await a.remoteSearch({})).toEqual(['local', 2]); expect(await b.remoteSearch({})).toEqual(['local', 1]);
    await expect(provider('class Provider { search() { return $scannerUtils.normalizeTitle("Naruto"); } }')).rejects.toThrow('$scannerUtils');
  });
  it('exposes Seanime custom media methods without assigning application IDs', async () => {
    const p = await provider('class Provider { getSettings() { return { supportsAnime: true }; } listAnime(q, page, perPage) { return { media: [{ id: 7, title: { english: q } }], page, totalPages: 2 }; } }');
    expect(await p.remoteCustom({ method: 'getSettings' })).toEqual({ supportsAnime: true });
    expect((await p.remoteCustom({ method: 'listAnime', args: ['Custom title', 1, 24] })).media[0].id).toBe(7);
    await expect(p.remoteCustom({ method: 'arbitraryCode' })).rejects.toThrow('Unsupported');
  });
});
