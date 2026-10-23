import { describe, expect, it } from 'bun:test';
import { getQuickJS } from 'quickjs-emscripten';
import { evaluateSora } from '../src/core/extensions/sora/vm';
import { isSoraRepositoryMetadata, sourceUrl } from '../src/core/extensions/sora/repository';

describe('original Sora JavaScript interpreter boundary', () => {
  it('executes async source HTTP without exposing the application realm', async () => {
    const engine = await getQuickJS();
    const query = "a'); globalThis.compromised = true; //";
    const code = `async function searchResults(query) {
      if (typeof window !== 'undefined' || typeof process !== 'undefined' || typeof indexedDB !== 'undefined' || typeof require !== 'undefined') throw Error('Application capability leaked');
      const response = await fetchv2('https://source.test/search', {Cookie:'fixture'}, 'POST', JSON.stringify({query}));
      return await response.json();
    }`;
    const calls: any[] = [];
    const result = await evaluateSora(engine, code, 'searchResults', [query], async request => {
      calls.push(request); return { status: 200, headers: {}, body: JSON.stringify([{ title: 'Fixture', href: 'https://source.test/title' }]) };
    });
    expect(result).toEqual([{ title: 'Fixture', href: 'https://source.test/title' }]);
    expect(calls[0].headers.Cookie).toBe('fixture'); expect(JSON.parse(calls[0].body).query).toBe(query);
    expect((globalThis as any).compromised).toBeUndefined();
  });
  it('reports missing APIs and HTTP errors without leaving a live guest context', async () => {
    const engine = await getQuickJS();
    const capabilities = await evaluateSora(engine, 'function searchResults() {}', 'probe', [], async () => { throw Error('Unexpected HTTP'); });
    expect(capabilities.searchResults).toBe(true); expect(capabilities.extractImages).toBe(false);
    expect(await evaluateSora(engine, 'function searchResults(){return atob(btoa("source-token"))}', 'searchResults', [], async () => { throw Error('Unexpected HTTP'); })).toBe('source-token');
    await expect(evaluateSora(engine, 'async function searchResults(){await fetchv2("https://source.test")}', 'searchResults', [], async () => { throw Error('Network failed'); })).rejects.toThrow('Network failed');
    await expect(evaluateSora(engine, 'window.localStorage.clear()', 'probe', [], async () => { throw Error('Unexpected HTTP'); })).rejects.toThrow();
  });
  it('recognizes original manifests and rejects invalid executable URLs', () => {
    expect(isSoraRepositoryMetadata({ sourceName: 'Original', scriptURL: 'https://repo.test/source.js' })).toBe(true);
    expect(isSoraRepositoryMetadata({ modules: [{ manifestUrl: 'https://repo.test/source.json' }] })).toBe(true);
    expect(isSoraRepositoryMetadata({ id: 'tatakai', name: 'Own extension' })).toBe(false);
    for (const value of ['', 'file:///private', 'https://user:secret@repo.test/script.js']) expect(() => sourceUrl(value)).toThrow();
    expect(sourceUrl('/image.jpg', 'https://source.test/title')).toBe('https://source.test/image.jpg');
  });
});
