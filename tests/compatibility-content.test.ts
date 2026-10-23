import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';
import { describe, it, expect } from 'bun:test';
import { mangaExtensionContext } from '../src/core/extensions/compatibility/title-context';
import { compatibilityMappedChapters, compatibilityMappedStreams } from '../src/core/extensions/compatibility/content';
Dexie.dependencies.indexedDB = indexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;

describe('native sources on catalog watch and read pages', () => {
  it('supplies title aliases alongside catalog identifiers', () => {
    expect(mangaExtensionContext('anilist:30013', { detail: { anilistId: 30013, malId: 13, canonicalTitle: 'English title', title: { english: 'English title', romaji: 'Romaji title', native: '原題', synonyms: ['Alias', 'Alias'] } } } as any)).toEqual({ anilistId: 30013, malId: 13, title: 'English title', titles: ['English title', 'Romaji title', '原題', 'Alias'] });
    expect(mangaExtensionContext('mal:13').anilistId).toBeUndefined();
    expect(mangaExtensionContext('anilist:30013').title).toBeUndefined();
  });
  it('maps aliases to original chapter IDs and attributes every source', async () => {
    const previous = globalThis.window;
    const sources = [{ id: 'compat-mihon-fixture', ecosystem: 'mihon', enabled: true, kind: 'read', extensionName: 'Fixture package', name: 'Fixture source', lang: 'en' }, { id: 'compat-mihon-disabled', enabled: false, kind: 'read' }];
    const calls: any[] = [];
    (globalThis as any).window = { dispatchEvent() {}, electron: { compatibilityRequest: async (p: any) => {
      calls.push(p); let result;
      if (p.op === 'sources') result = sources;
      else if (p.op === 'search') result = { results: p.query === 'Original title' ? [{ id: 'original-title-id', title: 'Original title' }] : [] };
      else if (p.op === 'chapters') { expect(p.id).toBe('original-title-id'); result = { entries: [{ id: '9223372036854775807', number: 1, label: 'Chapter 1' }] }; }
      else throw Error('Unexpected operation');
      return { ok: true, result };
    } } };
    try {
      const result = await compatibilityMappedChapters(mangaExtensionContext('30013', { detail: { canonicalTitle: 'English title', title: { romaji: 'Original title' } } } as any));
      expect(result.chapters[0].sources[0]).toMatchObject({ provider: sources[0].id, providerName: 'Mihon · Fixture package · Fixture source', language: 'en', providerChapterId: '9223372036854775807', chapterKey: 'compat-mihon-fixture:9223372036854775807' });
      expect(calls.filter(p => p.op === 'search').map(p => p.query)).toEqual(['English title', 'Original title']);
      expect(calls.some(p => p.sourceId === 'compat-mihon-disabled')).toBe(false);
    } finally { (globalThis as any).window = previous; }
  });
  it('isolates failed watch sources and rejects ambiguous episode matches', async () => {
    const previous = globalThis.window;
    const reports: any[] = [];
    const source = (id: string) => ({ id, ecosystem: 'cloudstream', enabled: true, kind: 'watch', extensionName: 'Package', name: id, lang: 'en' });
    (globalThis as any).window = { dispatchEvent() {}, electron: { compatibilityRequest: async (p: any) => {
      let result;
      if (p.op === 'sources') result = ['compat-cloudstream-failed', 'compat-cloudstream-good', 'compat-cloudstream-ambiguous'].map(source);
      else if (p.op === 'search') { if (p.sourceId.endsWith('failed')) return { ok: false, error: 'Source is unavailable' }; result = { results: [{ id: 'upstream-title', title: 'Example' }] }; }
      else if (p.op === 'info') result = { entries: p.sourceId.endsWith('ambiguous') ? [{ id: 'season1', number: 1 }, { id: 'season2', number: 1 }] : [{ id: 'original-episode', number: 1 }] };
      else if (p.op === 'resolve') { expect(p.episodeId).toBe('original-episode'); expect(p.sourceId.endsWith('good')).toBe(true); result = { sources: [{ url: 'https://media.test/video.mp4', sourceType: 'mp4' }] }; }
      else throw Error('Unexpected operation');
      return { ok: true, result };
    } } };
    try {
      const result = await compatibilityMappedStreams({ title: 'Example', episode: 1 }, undefined, report => reports.push(report));
      expect(result.length).toBe(1);
      expect(result[0]).toMatchObject({ compatibilitySourceId: 'compat-cloudstream-good', providerName: 'compat-cloudstream-good', extensionName: 'Package', ecosystem: 'cloudstream' });
      expect(reports.filter(r => r.status === 'error').length).toBe(1);
      expect(reports.filter(r => r.status === 'unmatched').length).toBe(1);
      expect(reports.some(r => r.error?.includes('ambiguous'))).toBe(true);
    } finally { (globalThis as any).window = previous; }
  });
  it('combines provider languages and carries extension provenance in progressive watch results', async () => {
    const previous = globalThis.window, reports: any[] = [], progress: number[] = [];
    const sources = ['en', 'fr'].map(lang => ({ id: 'compat-aniyomi-' + lang, packageId: 'original.apk', ecosystem: 'aniyomi', kind: 'watch', name: `Original (${lang})`, extensionName: 'Original extension', enabled: true, lang }));
    (globalThis as any).window = { dispatchEvent() {}, electron: { compatibilityRequest: async (p: any) => {
      const result = p.op === 'sources' ? sources : p.op === 'search' ? { results: [{ id: 'title', title: 'Example' }] } : p.op === 'info' ? { entries: [{ id: 'episode', number: 1 }] } : { sources: [{ url: `https://media.test/${p.sourceId}.mp4`, sourceType: 'mp4' }] };
      return { ok: true, result };
    } } };
    try {
      const result = await compatibilityMappedStreams({ title: 'Example', episode: 1 }, undefined, report => reports.push(report), rows => progress.push(rows.length));
      expect(result).toHaveLength(2); expect(new Set(result.map(row => row.providerKey)).size).toBe(1); expect(result.map(row => row.language)).toEqual(['en', 'fr']);
      expect(result[0]).toMatchObject({ extensionName: 'Original extension', extensionId: 'original.apk', ecosystem: 'aniyomi', providerName: 'Original' });
      expect(progress).toEqual([1, 2]); expect(reports.at(-1)).toMatchObject({ count: 2, status: 'ok' });
    } finally { (globalThis as any).window = previous; }
  });
  it('searches selected remaining sources without repeating completed or disabled sources', async () => {
    const previous = globalThis.window, calls: string[] = [];
    const sources = ['finished', 'pending', 'disabled'].map(id => ({ id: 'compat-aniyomi-' + id, packageId: id, ecosystem: 'aniyomi', kind: 'watch', name: id, extensionName: id, enabled: id !== 'disabled', lang: 'en' }));
    (globalThis as any).window = { dispatchEvent() {}, electron: { compatibilityRequest: async (p: any) => {
      if (p.op !== 'sources') calls.push(p.sourceId);
      return { ok: true, result: p.op === 'sources' ? sources : p.op === 'search' ? { results: [{ id: 'original-title', title: 'Example' }] } : p.op === 'info' ? { entries: [{ id: 'original-episode', number: 1 }] } : { sources: [{ url: 'https://media.test/resumed.mp4' }] } };
    } } };
    try {
      const result = await compatibilityMappedStreams({ title: 'Example', episode: 1, sourceIds: ['compat-aniyomi-pending', 'compat-aniyomi-disabled'] });
      expect(result).toHaveLength(1); expect(calls).toEqual(Array(3).fill('compat-aniyomi-pending'));
      expect(await compatibilityMappedStreams({ title: 'Example', episode: 1, sourceIds: [] })).toEqual([]);
    } finally { (globalThis as any).window = previous; }
  });
  it('reuses compact identities, resolves fresh streams and refreshes stale cached identities', async () => {
    const previous = globalThis.window, calls: string[] = []; let version = 1, expired = false, emptyCached = false;
    (globalThis as any).window = { dispatchEvent() {}, electron: { compatibilityRequest: async (p: any) => {
      calls.push(p.op);
      if (p.op === 'sources') return { ok: true, result: [{ id: 'compat-aniyomi-cache', packageId: 'cache', ecosystem: 'aniyomi', kind: 'watch', name: 'Cache', extensionName: 'Cache', enabled: true, lang: 'en' }] };
      if (p.op === 'search') return { ok: true, result: { results: [{ id: 'title-' + version, title: 'Example' }] } };
      if (p.op === 'info') return { ok: true, result: { entries: [{ id: 'episode-' + version, number: 1 }, { id: 'episode-two-' + version, number: 2 }] } };
      if (expired && p.id === 'title-1') return { ok: false, error: 'Upstream title moved' };
      if (emptyCached && p.id === 'title-2') return { ok: true, result: { sources: [] } };
      return { ok: true, result: { sources: [{ url: 'https://media.test/' + version + '-' + p.episodeId + '.mp4' }] } };
    } } };
    try {
      const initial = await compatibilityMappedStreams({ title: 'Example', episode: 1 });
      version = 2;
      const again = await compatibilityMappedStreams({ title: 'Example', episode: 1 });
      expect(calls.filter(op => op === 'search')).toHaveLength(1); expect(calls.filter(op => op === 'info')).toHaveLength(1);
      expect(again[0].url).not.toBe(initial[0].url);
      await compatibilityMappedStreams({ title: 'Example', episode: 2 });
      expect(calls.filter(op => op === 'info')).toHaveLength(1);
      expired = true;
      const refreshed = await compatibilityMappedStreams({ title: 'Example', episode: 1 });
      expect(refreshed[0].url).toContain('episode-2');
      expect(calls.filter(op => op === 'search')).toHaveLength(2); expect(calls.filter(op => op === 'info')).toHaveLength(2);
      version = 3; emptyCached = true;
      const recovered = await compatibilityMappedStreams({ title: 'Example', episode: 1 });
      expect(recovered[0].url).toContain('episode-3');
      expect(calls.filter(op => op === 'search')).toHaveLength(3); expect(calls.filter(op => op === 'info')).toHaveLength(3);
    } finally { (globalThis as any).window = previous; }
  });
});
