import { expect, test } from 'bun:test';
import { scraperNovelProviders } from '../toko/,/src/providers/novel/scraper-sites';
import { setCloudflareBrowserRuntime } from '../toko/,/src/utils/common/cf-bypass';
import { clearNovelHttpCache } from '../toko/,/src/providers/novel/novel-http';
const provider = (name:string) => scraperNovelProviders.find(p=>p.name===name)!;
async function withFetch(respond:(url:string,init:any)=>Response, run:()=>Promise<void>) {
 clearNovelHttpCache();
 const original=globalThis.fetch;
 globalThis.fetch=(async (url:any,init:any)=>respond(String(url),init)) as typeof fetch;
 try{await run()}finally{globalThis.fetch=original;clearNovelHttpCache()}
}
test('NovelFull searches exact card titles and collects paginated chapters without duplicate next links',async()=>{
 const visited:string[]=[];
 await withFetch(url=>{visited.push(url);
  if(url.includes('/search?'))return new Response('<h3><a href="/example.html">Example Novel</a></h3><a href="https://foreign.example/test.html">Example Novel</a>');
  if(url.includes('chapter-1.html'))return new Response('<h1 class="chapter-title">Chapter 1</h1><div id="chapter-content">First paragraph.<br>Second paragraph.<script>advert</script></div>');
  if(url.includes('?page=2'))return new Response('<ul class="list-chapter"><li><a href="/example/chapter-2.html">Chapter 2: Next</a></li></ul><div class="pagination"><a href="/example.html?page=2">2</a></div>');
  return new Response('<ul class="list-chapter"><li><a href="/example/chapter-1.html">Chapter 1: Start</a></li></ul><div class="pagination"><a href="/example.html?page=2">2</a></div>');
 },async()=>{
  const source=provider('novelfull');const hits=await source.search!('Example Novel');expect(hits.length).toBe(1);expect(hits[0].title).toBe('Example Novel');
  const chapters=await source.getChapters({seriesId:hits[0].id});expect(chapters.map(c=>c.number)).toEqual([1,2]);
  const text=await source.getContent(chapters[0].sources[0].chapterKey);expect(text?.paragraphs.map(p=>p.text)).toEqual(['First paragraph.','Second paragraph.']);
  expect(visited.filter(url=>url.includes('?page=2')).length).toBe(1);
  const before=visited.length;await expect(source.getContent('novelfull:https%3A%2F%2Fforeign.example%2Fchapter')).rejects.toThrow('Invalid');expect(visited.length).toBe(before);
 });

});
test('NovelBin uses its full AJAX chapter archive',async()=>{
 const visited:string[]=[];
 await withFetch(url=>{visited.push(url);if(url.includes('/ajax/')||url.includes('/api/manga/'))return new Response('<ul class="list-chapter chapter-list"><li><a href="/novel/example/chapter-12">Chapter 12: Arrival</a></li></ul>');return new Response('<script>var manga_id = 456;</script>');},async()=>{
  for(const [name,id,endpoint] of [['novelbin','https://novelbin.com/b/example','/ajax/chapter-archive?novelId=example']]){
   const source = provider(name);
   const result=await source.getChapters({seriesId:id});expect(result[0].number).toBe(12);expect(visited.some(url=>url.includes(endpoint))).toBe(true);
  }
 });
});
test('NovelFire catalog route and RoyalRoad ordinal chapters are supported',async()=>{
 await withFetch(url=>new Response(url.includes('/chapters')?'<ul class="chapter-list"><li><a href="/book/example/chapter-4">Chapter 4: Arrival</a></li></ul>':url.includes('royalroad')?'<table><tr class="chapter-row"><td><a href="/fiction/123/example/chapter/999999/opening">Opening</a></td></tr></table>':'<h1>Novel</h1>'),async()=>{
  expect((await provider('novelfire').getChapters({seriesId:'https://novelfire.net/book/example'}))[0].number).toBe(4);
  expect((await provider('royalroad').getChapters({seriesId:'https://www.royalroad.com/fiction/123/example'}))[0].number).toBe(1);
 });
});
test('wuxiaworld.site uses its own Madara AJAX contract and surfaces unavailable upstreams',async()=>{
 let method='';
 await withFetch((url,init)=>{if(url.includes('/ajax/chapters')){method=init.method;return new Response('<li class="wp-manga-chapter"><a href="/novel/example/chapter-2">Chapter 2</a></li>')}return new Response('<h1>Example</h1>')},async()=>{
  const chapters=await provider('wuxiaworldsite').getChapters({seriesId:'https://wuxiaworld.site/novel/example'});expect(method).toBe('POST');expect(chapters[0].number).toBe(2);
 });
 setCloudflareBrowserRuntime({newBrowser:async()=>{throw new Error('Browser unavailable in fixture')}});
 try { await withFetch(()=>new Response('Blocked',{status:403}),async()=>{await expect(provider('royalroad').search!('Example')).rejects.toThrow('403 (access blocked)')}); }
 finally { setCloudflareBrowserRuntime(); }
});

 test('the wide-range novel registry exposes the five additional catalogues', () => {
   expect(['readnovelfull', 'novelcool', 'novgo', 'relibrary', 'woopread']
     .every((name) => Boolean(provider(name)))).toBe(true);
 });

 test('additional WordPress catalogues map series, chapters and content', async () => {
   await withFetch((url, init) => {
     if (url.includes('/?s=') || url.includes('/search/')) {
       return new Response('<a href="https://www.novelcool.com/novel/example/">Example Novel</a>');
     }
     if (url.includes('/ajax/chapters')) {
       expect(init.method).toBe('POST');
       return new Response('<li class="wp-manga-chapter"><a href="/novel/example/chapter-3">Chapter 3</a></li>');
     }
     return new Response('<div class="reading-content"><p>Chapter 3 text.</p></div>');
   }, async () => {
     const source = provider('novelcool');
     const hits = await source.search!('Example Novel');
     expect(hits.length).toBe(1);
     const chapters = await source.getChapters({ seriesId: hits[0].id });
     expect(chapters[0].number).toBe(3);
     const content = await source.getContent(chapters[0].sources[0].chapterKey);
     expect(content?.paragraphs[0].text).toBe('Chapter 3 text.');
   });
 });
