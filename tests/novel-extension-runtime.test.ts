import { expect, mock, test } from 'bun:test';
mock.module('../src/hooks/media/useExtensionSourceStream',()=>({MOBILE_EXT_BASE:'mobile://extensions',resolveExtensionApiBase:async()=>({baseUrl:'http://127.0.0.1:8099',namespaces:[{namespace:'toko',capabilities:['novel']}]})}));
const {fetchExtensionNovelChapters}=await import('../src/core/content/novel-extension-runtime');
test('a successful empty HTTP catalog does not repeat the same scan over IPC',async()=>{
 const originalFetch=globalThis.fetch,originalWindow=(globalThis as any).window;let ipc=0;
 (globalThis as any).window={electron:{listInstalledExtensions:async()=>[{id:'toko',capabilities:['novel']}],invokeExtension:async()=>{ipc++;return{chapters:[]}}}};
 globalThis.fetch=(async()=>Response.json({chapters:[],partial:false})) as typeof fetch;
 try{expect((await fetchExtensionNovelChapters({title:'Missing Novel'})).chapters).toEqual([]);expect(ipc).toBe(0);}
 finally{globalThis.fetch=originalFetch;(globalThis as any).window=originalWindow;}
});
test('early chapters retain their language and advertise pending sources for backfill',async()=>{
 const originalFetch=globalThis.fetch;
 globalThis.fetch=(async()=>Response.json({chapters:[{number:1,provider:'syosetu',chapterKey:'syosetu:n4830bu:5:461',language:'ja'}],partial:true})) as typeof fetch;
 try{const result=await fetchExtensionNovelChapters({title:'Bookworm'});expect(result.pending).toBe(true);expect(result.chapters[0].sources[0].language).toBe('ja');}
 finally{globalThis.fetch=originalFetch;}
});
