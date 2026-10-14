import { expect, test, afterEach } from 'bun:test';
import { scraperNovelProviders } from '../toko/,/src/providers/novel/scraper-sites';
import { fetchNovelSearchHtml, clearNovelHttpCache } from '../toko/,/src/providers/novel/novel-http';
afterEach(clearNovelHttpCache);
import { clearSession, setCloudflareBrowserRuntime } from '../toko/,/src/utils/common/cf-bypass';
import { TokoBundleClass } from '../toko/,/src/core/bundle';
import { NOVEL_PROVIDERS } from '../toko/,/src/providers/registry';
import { fetchTextWithBypass } from '../toko/,/src/utils/common/fetch-bypass';

test('HTTP 200 challenge pages use the host browser without duplicating the failed fetch', async () => {
  const original = globalThis.fetch;
  let fetches = 0, closed = false;
  const url = 'https://novel-recovery.example/search';
  globalThis.fetch = (async () => { fetches++; return new Response('<title>Just a moment</title>'); }) as typeof fetch;
  setCloudflareBrowserRuntime({ newBrowser: async () => ({
    navigate: async () => {},
    evaluate: async () => ({ html: '<h1>Real catalogue</h1>', url, ua: 'Fixture UA' }),
    executeCDP: async () => ({ cookies: [{name:'cf_clearance',value:'fixture'}] }),
    sleep: async () => {}, close: async () => { closed = true; },
  }) });
  try { expect(await fetchNovelSearchHtml(url)).toContain('Real catalogue'); expect(fetches).toBe(1); expect(closed).toBe(true); }
  finally { globalThis.fetch = original; clearSession(url); setCloudflareBrowserRuntime(); }
});

test('mixed manga sources contribute text chapters and reject panel readers even with caption text', async () => {
  const original = globalThis.fetch;
  const source = scraperNovelProviders.find(p => p.name === 'onisaga')!;
  let comic = false;
  globalThis.fetch = (async (url: any) => {
    if (String(url).includes('chapter-1')) return new Response(`<div class="reading-content">${comic ? '<div class="page-break"><img src="panel.jpg"></div>' : ''}<p>The first story paragraph.</p><p>The second story paragraph.</p></div>`);
    return new Response('<li class="wp-manga-chapter"><a href="/novel/example/chapter-1">Chapter 1</a></li>');
  }) as typeof fetch;
  try {
    expect((await source.getChapters({seriesId:'https://onisaga.com/novel/example/'})).length).toBe(1);
    comic = true;
    clearNovelHttpCache();
    expect(await source.getChapters({seriesId:'https://onisaga.com/novel/example/'})).toEqual([]);
    expect(await source.getContent('onisaga:https%3A%2F%2Fonisaga.com%2Fnovel%2Fexample%2Fchapter-1')).toBeNull();
  } finally { globalThis.fetch = original; }
});

test('browser clearance replays POST catalogs with their method and body', async () => {
  const original = globalThis.fetch;
  const url = 'https://novel-post-recovery.example/ajax/chapters/';
  let calls = 0;
  globalThis.fetch = (async (_url: any, init: any) => {
    calls++;
    if (calls === 1) return new Response('Forbidden', {status:403});
    expect(init.method).toBe('POST'); expect(init.body).toBe('action=chapters');
    expect(new Headers(init.headers).get('Cookie')).toBe('cf_clearance=fixture');
    return new Response('<a>Chapter 1</a>');
  }) as typeof fetch;
  setCloudflareBrowserRuntime({newBrowser:async()=>({navigate:async()=>{},evaluate:async()=>({html:'<h1>GET page</h1>',url,ua:'Fixture UA'}),executeCDP:async()=>({cookies:[{name:'cf_clearance',value:'fixture'}]}),sleep:async()=>{},close:async()=>{}})});
  try { expect(await fetchTextWithBypass(url,{method:'POST',body:'action=chapters'})).toBe('<a>Chapter 1</a>'); expect(calls).toBe(2); }
  finally { globalThis.fetch=original;clearSession(url);setCloudflareBrowserRuntime(); }
});

test('automatic matching survives an alias request error and preserves all-failed diagnostics', async () => {
  const source = NOVEL_PROVIDERS.find(p => p.name === 'wuxiaworld')!;
  const originalSearch = source.search, originalChapters = source.getChapters;
  source.search = async query => { if (query !== 'English Title') throw new Error('request failed'); return [{id:'matched',title:'English Title'}]; };
  source.getChapters = async () => [{number:1,title:'Chapter 1',volume:null,sources:[{provider:'wuxiaworld',chapterKey:'wuxiaworld:matched:1',providerChapterId:'matched:1',language:'en',translator:null,releaseDate:null}]}];
  try {
    expect((await new TokoBundleClass().getNovelChapters({provider:'wuxiaworld',titles:['Romaji Title','English Title']})).length).toBe(1);
    const failed = await new TokoBundleClass().debugNovelChapters({provider:'wuxiaworld',titles:['Failed Title']});
    expect(failed.diagnostics[0].status).toBe('error'); expect(failed.diagnostics[0].error).toContain('request failed');
  } finally { source.search = originalSearch; source.getChapters = originalChapters; }
});

test('WoopRead loads the full embedded chapter catalog rather than the twelve visible rows', async () => {
  const original = globalThis.fetch;
  const catalog = {chapters:[{slug:'chapter-1',title:'Chapter 1',number:1},{slug:'chapter-20',title:'Chapter 20',number:20}]};
  const flight = '0:' + JSON.stringify(catalog);
  globalThis.fetch = (async () => new Response(`<div id="chapter-list-container"><a href="/series/example/chapter-20">Chapter 20</a></div><script>self.__next_f.push(${JSON.stringify([1,flight])})</script>`)) as typeof fetch;
  try { expect((await scraperNovelProviders.find(p=>p.name==='woopread')!.getChapters({seriesId:'https://woopread.com/series/example'})).map(row=>row.number)).toEqual([1,20]); }
  finally { globalThis.fetch = original; }
});

test('search uses WoopRead headings and ReLibrary translation catalog entries', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: any) => new Response(String(url).includes('woopread')
    ? '<a href="/series/example"><img alt="Cover image for Example Novel"><h2>Example Novel</h2><span>4.8</span></a>'
    : '<div class="entry-content"><a href="/translations/dragon-princess/">Dragon Princess</a><a href="/translations/other/">Other Novel</a></div>')) as typeof fetch;
  try {
    expect((await scraperNovelProviders.find(p=>p.name==='woopread')!.search!('Example Novel'))[0].title).toBe('Example Novel');
    const matches = await scraperNovelProviders.find(p=>p.name==='relibrary')!.search!('Dragon Princess');
    expect(matches.map(row=>row.title)).toEqual(['Dragon Princess']);
  } finally { globalThis.fetch = original; }
});

test('NovelCool extracts the card title and reads its native prose container', async () => {
  const original = globalThis.fetch;
  const source = scraperNovelProviders.find(p=>p.name==='novelcool')!;
  globalThis.fetch = (async (url: any) => new Response(String(url).includes('/search/')
    ? '<div class="book-item"><a href="/novel/Example.html">Novel Fantasy Summary</a><div class="book-name">Example Novel</div></div>'
    : String(url).includes('/chapter/') ? '<div class="site-content"><div class="overflow-hidden"><p>First story paragraph.</p><p>Second story paragraph.</p></div></div>'
    : '<div class="chapter-item-list"><div class="chp-item"><a href="/chapter/Example-1/123/" title="Chapter 1">Chapter 1</a></div></div>')) as typeof fetch;
  try {
    const hits = await source.search!('Example Novel'); expect(hits[0].title).toBe('Example Novel');
    const rows = await source.getChapters({seriesId:hits[0].id}); expect(rows.length).toBe(1);
    expect((await source.getContent(rows[0].sources[0].chapterKey))?.paragraphs.length).toBe(2);
  } finally { globalThis.fetch = original; }
});
