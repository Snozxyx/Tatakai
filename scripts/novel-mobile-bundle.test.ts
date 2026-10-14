import { expect, mock, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';

const requests: any[] = [];
let comic = false;
mock.module('@capacitor/core', () => ({CapacitorHttp:{request:async(options:any)=>{
 requests.push(options);
 let data: any;
 const url = options.url;
 if(url.includes('ncode.syosetu.com')) {
  if(url.includes('/461/')) data='<h1 class="p-novel__title--rensai">プロローグ</h1><div class="p-novel__text"><p>本を読む。</p></div>';
  else data=Array.from({length:217},(_,i)=>`<a class="p-eplist__subtitle" href="/n4830bu/${461+i}/">日本語 ${i+1}</a>`).join('');
 }
 else if(url.includes('novelbuddy.me/search')) data='<script src="/_next/static/mobile-fixture/_buildManifest.js"></script>';
 else if(url.includes('search.json')) data={pageProps:{ssrItems:[{slug:'example',name:'Example Novel'}]}};
 else if(url.includes('/titles/')) data={data:{chapters:[{url:'/example/chapter-1',name:'Chapter 1',number:2}]}};
 else if(url.includes('/example/chapter-1.json')) data={pageProps:{initialChapter:{name:'Chapter 1',number:2,content:'<p>Mobile story first.</p><p>Mobile story second.</p>'}}};
 else if(url.includes('/example.json')) data={pageProps:{initialManga:{id:'book123',chapters:[{url:'/example/chapter-2',name:'Chapter 2',number:3}]}}};
 else if(url.includes('/search/')) data='<div class="book-item"><a href="/novel/Example.html">Novel Fantasy Summary</a><div class="book-name">Example Novel</div></div>';
 else if(url.includes('/chapter/')) data=comic?'<div class="reading-content"><div class="page-break"><img src="panel.jpg"></div><p>Chapter caption</p></div>':'<div class="site-content"><div class="overflow-hidden"><p>Mobile text first.</p><p>Mobile text second.</p></div></div>';
 else data='<div class="chapter-item-list"><div class="chp-item"><a href="/chapter/Example-1/123/" title="Chapter 1">Chapter 1</a></div></div>';
 return {status:200,headers:{},data:typeof data==='string'?data:JSON.stringify(data)};
}}}));
mock.module('../src/core/mobile/localProxyNative',()=>({registerNativeSource:async()=>null,prepareNativeRequestHeaders:async(_url:string,headers:any)=>headers}));
mock.module('../src/hooks/ui/useMobileConfig',()=>({loadMobileConfig:()=>({cloudflareBypass:false})}));
mock.module('../src/lib/platform/platform',()=>({isCapacitor:()=>true}));
mock.module('../src/core/extensions/mobile/mobileProxy',()=>({applyMobileProxyToSource:(source:any)=>source,applyMobileProxyToPages:(pages:any)=>pages}));
const host = await import('../src/core/extensions/mobile/mobileExtensionHost');
const zip = await JSZip.loadAsync(readFileSync('toko/,/dist/toko.kai'));
const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
const code = await zip.file('bundle.js')!.async('string');

test('custom source bundles using ordinary fetch use native HTTP instead of WebView CORS', async () => {
 const customManifest = { id: 'custom-fixture', name: 'Custom', version: '1.0.0', permissions: ['network:domain:novelbuddy.me'] };
 const customCode = `module.exports = { async customHome(sourceId) {
   const response = await fetch('https://novelbuddy.me/search');
   return { sections: [{ title: sourceId, body: await response.text() }] };
 } };`;
 const originalFetch = globalThis.fetch;
 globalThis.fetch = (async () => { throw new Error('WebView fetch must not run'); }) as typeof fetch;
 try {
  expect((await host.registerMobileExtension(customManifest as any, customCode)).ok).toBe(true);
  const result = await host.mobileExtensionDispatch.custom('custom-fixture', 'Home', ['books']);
  expect(result.sections[0].body).toContain('_buildManifest.js');
  expect(requests.at(-1).url).toBe('https://novelbuddy.me/search');
 } finally { globalThis.fetch = originalFetch; host.unregisterMobileExtension('custom-fixture'); }
});

test('real packaged Toko loads in the mobile host with real Node shims and native HTTP',async()=>{
 expect(await host.registerMobileExtension(manifest,code)).toEqual({ok:true,namespace:'toko'});
 expect(host.listMobileNamespaces()[0].routes).toContain('novel/chapters');
 const rows = (await host.mobileExtensionDispatch.novelChapters('toko',{provider:'novelbuddy',title:'Example Novel'})).chapters;
 expect(rows.length).toBe(1);expect(rows[0].number).toBe(1);
 expect(requests.some(r=>r.url==='https://api.novelbuddy.me/titles/book123/chapters')).toBe(true);
 const content=await host.mobileExtensionDispatch.novelContent('toko',{provider:'novelbuddy',chapterKey:rows[0].sources[0].chapterKey});
 expect(content.paragraphs.map((p:any)=>p.text)).toEqual(['Mobile story first.','Mobile story second.']);
 expect(content.number).toBe(1);
});

test('real mobile bundle accepts NovelCool prose and rejects comics',async()=>{
 const rows=(await host.mobileExtensionDispatch.novelChapters('toko',{provider:'novelcool',title:'Example Novel'})).chapters;
 expect(rows.length).toBe(1);
 const content=await host.mobileExtensionDispatch.novelContent('toko',{provider:'novelcool',chapterKey:rows[0].sources[0].chapterKey});
 expect(content.paragraphs.map((p:any)=>p.text)).toEqual(['Mobile text first.','Mobile text second.']);
 comic=true;
 await host.registerMobileExtension(manifest,code);
 expect((await host.mobileExtensionDispatch.novelChapters('toko',{provider:'novelcool',title:'Example Novel'})).chapters).toEqual([]);
 host.unregisterMobileExtension('toko');
});

test('real mobile bundle loads all Japanese Part 5 chapters with the packaged domain permission',async()=>{
 await host.registerMobileExtension(manifest,code);
 const result=await host.mobileExtensionDispatch.novelChapters('toko',{provider:'syosetu',title:'Ascendance of a Bookworm: Part 5'});
 expect(result.chapters.length).toBe(217);expect(result.chapters[0].sources[0].language).toBe('ja');
 const content=await host.mobileExtensionDispatch.novelContent('toko',{provider:'syosetu',chapterKey:result.chapters[0].sources[0].chapterKey});
 expect(content.paragraphs[0].text).toBe('本を読む。');host.unregisterMobileExtension('toko');
});
