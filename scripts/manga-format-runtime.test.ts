import {expect,mock,test} from 'bun:test';
const source=(provider:string,format?:string)=>({provider,chapterKey:`${provider}:1`,providerChapterId:'1',language:'en',format});
mock.module('../src/hooks/media/useExtensionSourceStream',()=>({MOBILE_EXT_BASE:'mobile://extensions',resolveExtensionApiBase:async()=>({baseUrl:'mobile://extensions',namespaces:[{namespace:'toko',capabilities:['manga']}]})}));
mock.module('../src/core/extensions/remote/diagnostics',()=>({recordSourceReport:()=>{}}));
mock.module('../src/core/extensions/remote/manga',()=>({remoteMangaChapters:async()=>({chapters:[{number:9000,format:'NOVEL',sources:[source('remote')]}],providersAvailable:['remote'],failedProviders:[]}),remoteMangaPages:async()=>null}));
(globalThis as any).window={tatakaiMobileExtensions:{mangaChapters:async()=>({chapters:[
 {number:1000,format:'Light Novel',sources:[source('wrong-series')]},
 {number:1,sources:[source('comic'),source('prose','novel')]},
 {number:2,sources:[source('prose-only','web_novel')]},
]})}};
const {fetchExtensionMangaChapters}=await import('../src/core/content/manga-extension-runtime');
test('native and remote chapter merges discard novel rows and novel sources before counting chapters',async()=>{
 const result=await fetchExtensionMangaChapters({anilistId:42});
 expect(result.chapters.map(c=>c.number)).toEqual([1]);
 expect(result.chapters[0].sources.map(s=>s.provider)).toEqual(['comic']);
});
