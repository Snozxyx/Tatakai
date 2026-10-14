import { expect, test, afterEach } from 'bun:test';
import { TokoBundleClass } from '../toko/,/src/core/bundle';
import { NOVEL_PROVIDERS } from '../toko/,/src/providers/registry';
import { fetchNovelSearchHtml, clearNovelHttpCache } from '../toko/,/src/providers/novel/novel-http';
import { buildNovelSearchQueries, pickBestNovelCandidate } from '../toko/,/src/utils/novel-title-match';
afterEach(clearNovelHttpCache);

test('novel queries preserve part identity even when metadata includes the base-series alias',()=>{
 expect(buildNovelSearchQueries(['Ascendance of a Bookworm: Part 5'])).toEqual(['Ascendance of a Bookworm: Part 5']);
 expect(pickBestNovelCandidate(['Ascendance of a Bookworm: Part 5','Ascendance of a Bookworm'],[{id:'earlier',title:'Ascendance of a Bookworm'}])).toBeNull();
});

test('novels become readable before slow providers finish, then retain later chapters without rescanning',async()=>{
 const saved=NOVEL_PROVIDERS.map(p=>({p,search:p.search,getChapters:p.getChapters}));
 let searches=0,release!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve});
 const chapter=(provider:string,number:number)=>({number,title:`Chapter ${number}`,volume:null,sources:[{provider,chapterKey:`${provider}:${number}`,providerChapterId:String(number),language:'en',translator:null,releaseDate:null}]});
 for(const p of NOVEL_PROVIDERS){p.search=async query=>{searches++;return[{id:'fixture',title:query}]};p.getChapters=async()=>[];}
 NOVEL_PROVIDERS.find(p=>p.name==='lightnovelto')!.getChapters=async()=>[chapter('lightnovelto',1)];
 NOVEL_PROVIDERS.find(p=>p.name==='novelbuddy')!.getChapters=async()=>{await gate;return[chapter('novelbuddy',2)]};
 try{
  const bundle=new TokoBundleClass();
  const first=await bundle.debugNovelChapters({title:'Fixture Novel'});
  expect(first.results.map(c=>c.number)).toEqual([1]);expect(first.complete).toBe(false);
  release();await new Promise(resolve=>setTimeout(resolve,0));
  const calls=searches;
  const final=await bundle.debugNovelChapters({title:'Fixture Novel',titles:['Fixture Novel','Additional Alias']});
  expect(final.results.map(c=>c.number)).toEqual([1,2]);expect(final.complete).toBe(true);expect(searches).toBe(calls);
 }finally{release();await new Promise(resolve=>setTimeout(resolve,0));for(const entry of saved){entry.p.search=entry.search;entry.p.getChapters=entry.getChapters;}}
});

test('concurrent aliases share a static catalog request and subsequent visits reuse it',async()=>{
 const original=globalThis.fetch;let calls=0,release!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve});
 globalThis.fetch=(async()=>{calls++;await gate;return new Response('<h1>Catalogue</h1>')}) as typeof fetch;
 try{
  const first=fetchNovelSearchHtml('https://catalog-dedup.example/translations/');
  const second=fetchNovelSearchHtml('https://catalog-dedup.example/translations/');
  release();expect(await first).toBe(await second);
  expect(await fetchNovelSearchHtml('https://catalog-dedup.example/translations/')).toContain('Catalogue');expect(calls).toBe(1);
 }finally{release();globalThis.fetch=original;}
});
